// Crew hooks — backed by /api/crews/* (lib/crews-api.ts) since the crew
// migration. Supabase is used for auth only (current user id), per the
// API guide's architecture rule. Types and mutation functions re-export
// from crews-api so screen imports stay unchanged.

import { useCallback, useEffect, useState } from 'react';

import {
  getCrew,
  getCrewMembers,
  getMyJoinRequestStatus,
  listCrews,
  listMyCrews,
  mapCrew,
  type Crew,
  type CrewMember,
  type JoinRequestStatus,
} from '@/lib/crews-api';
import { supabase } from '@/lib/supabase';
import { useJoinRequests } from '@/store/join-requests';

export {
  cancelJoinRequest,
  joinCrew,
  joinCrewByCode,
  leaveCrew,
  previewCrewByCode,
  type Crew,
  type CrewLevel,
  type CrewMember,
  type JoinRequestStatus,
  type JoinResult,
} from '@/lib/crews-api';

// ─── useBrowseCrews — public crew list for the discover tab ──────────────────

export function useBrowseCrews() {
  const [crews, setCrews]     = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [key, setKey]         = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    listCrews()
      .then(rows => { if (!cancelled) setCrews(rows.map(r => mapCrew(r))); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : '크루를 불러올 수 없어요'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [key]);

  const refetch = useCallback(() => setKey(k => k + 1), []);
  return { crews, loading, error, refetch };
}

// ─── useMyCrews — crews the signed-in user belongs to ─────────────────────────
// Ownership truth is crews.owner_id (matches the backend's ensure_owner).

export function useMyCrews() {
  const [crews, setCrews]         = useState<Crew[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [key, setKey]             = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSignedOut(false);

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setSignedOut(true);
        setCrews([]);
        setLoading(false);
        return;
      }

      try {
        const rows = await listMyCrews();
        if (cancelled) return;
        setCrews(rows.map(r => mapCrew(r, r.owner_id === user.id ? 'owner' : 'member')));
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : '크루를 불러올 수 없어요');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [key]);

  const refetch = useCallback(() => setKey(k => k + 1), []);
  return { crews, loading, error, signedOut, refetch };
}

// ─── useCrewDetail — crew + members + viewer's role / request status ─────────

export function useCrewDetail(crewId: string | null) {
  const [crew, setCrew]       = useState<Crew | null>(null);
  const [members, setMembers] = useState<CrewMember[]>([]);
  const [myRequestStatus, setMyRequestStatus] = useState<JoinRequestStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [key, setKey]         = useState(0);

  useEffect(() => {
    if (!crewId) { setLoading(false); return; }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setCrew(null);
    setMembers([]);
    setMyRequestStatus(null);

    (async () => {
      try {
        const [{ data: { user } }, crewRow, memberRows] = await Promise.all([
          supabase.auth.getUser(),
          getCrew(crewId),
          getCrewMembers(crewId),
        ]);
        if (cancelled) return;

        const userId = user?.id ?? null;
        const myRole = userId && crewRow.owner_id === userId
          ? 'owner' as const
          : memberRows.some(m => m.user_id === userId) ? 'member' as const : undefined;

        setCrew(mapCrew(crewRow, myRole));
        setMembers(memberRows);

        // Non-members of approval crews: the authoritative pending/rejected
        // check (guide: rejection sends no notification — this IS the signal).
        // Every outcome also updates the shared store so browse badges stay
        // truthful (a detail visit corrects stale session-local state).
        if (!myRole && (crewRow.join_policy ?? 'open') === 'approval') {
          const status = await getMyJoinRequestStatus(crewId);
          if (!cancelled) {
            setMyRequestStatus(status);
            useJoinRequests.getState().setPending(crewId, status === 'pending');
          }
        } else {
          useJoinRequests.getState().setPending(crewId, false);
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : '크루를 찾을 수 없어요');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [crewId, key]);

  const refetch = useCallback(() => setKey(k => k + 1), []);
  return { crew, members, myRequestStatus, loading, error, refetch };
}
