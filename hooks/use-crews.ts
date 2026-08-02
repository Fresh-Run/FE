// Crew hooks — backed by /api/crews/* (lib/crews-api.ts) since the crew
// migration. Supabase is used for auth only (current user id), per the
// API guide's architecture rule. Types and mutation functions re-export
// from crews-api so screen imports stay unchanged.

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getCrew,
  getCrewMembers,
  getMyJoinRequestStatus,
  listCrews,
  listMyCrews,
  mapCrew,
  type Crew,
  type CrewMember,
  type CrewPermissions,
  type JoinRequestStatus,
  type ListCrewsParams,
} from '@/lib/crews-api';
import { errorMessage } from '@/lib/error-copy';
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

export function useBrowseCrews(params: ListCrewsParams = {}) {
  const [crews, setCrews]     = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [key, setKey]         = useState(0);
  // SWR-lite: spinner on first load only; param/focus refetches run silently
  const hasDataRef = useRef(false);

  // Primitive deps — object identity churn must not refetch
  const { sido, sigungu, lat, lng, includeFull } = params;

  useEffect(() => {
    let cancelled = false;
    if (!hasDataRef.current) setLoading(true);
    setError(null);

    listCrews({ sido, sigungu, lat, lng, includeFull })
      .then(rows => {
        if (cancelled) return;
        setCrews(rows.map(r => mapCrew(r)));
        hasDataRef.current = true;
      })
      .catch((e: unknown) => {
        if (!cancelled && !hasDataRef.current) setError(errorMessage(e));
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [key, sido, sigungu, lat, lng, includeFull]);

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
        if (!cancelled) setError(errorMessage(e));
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
  // v2 세부 권한 — my member row's permission set (owner arrives all-true
  // synthesized from the server, so gates read this uniformly; member/
  // non-member = null → every can() is false).
  const [myPerms, setMyPerms] = useState<CrewPermissions | null>(null);
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
    setMyPerms(null);
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
        // Server role is truth (3-valued since BE f68a48f admin v1);
        // owner_id check stays as the fallback for consistency.
        const myRow = memberRows.find(m => m.user_id === userId);
        const myRole = myRow?.role
          ?? (userId && crewRow.owner_id === userId ? 'owner' as const : undefined);

        setCrew(mapCrew(crewRow, myRole));
        setMembers(memberRows);
        setMyPerms(myRow?.permissions ?? null);

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
        if (!cancelled) setError(errorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [crewId, key]);

  const refetch = useCallback(() => setKey(k => k + 1), []);
  return { crew, members, myPerms, myRequestStatus, loading, error, refetch };
}
