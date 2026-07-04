import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CrewLevel = '무관' | '입문' | '중급' | '고급';

export type Crew = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  area: string | null;
  radius_km: number | null;
  sport: string | null;
  level: CrewLevel;
  max_members: number | null;
  is_public: boolean;
  active_days: string[] | null;
  active_time: string | null;
  color: string | null;
  member_count: number;
  myRole?: 'owner' | 'member';
};

export type CrewMember = {
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  nickname: string;
  avatar_url: string | null;
};

export type MutResult = { error: string | null; code: string | null };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapCrew(row: Record<string, unknown>, myRole?: 'owner' | 'member'): Crew {
  const memberRows = row.crew_members as { count: number }[] | null;
  return {
    id:          row.id as string,
    owner_id:    row.owner_id as string,
    name:        row.name as string,
    description: row.description as string | null,
    area:        row.area as string | null,
    radius_km:   row.radius_km as number | null,
    sport:       row.sport as string | null,
    level:       row.level as CrewLevel,
    max_members: row.max_members as number | null,
    is_public:   row.is_public as boolean,
    active_days: row.active_days as string[] | null,
    active_time: row.active_time as string | null,
    color:       row.color as string | null,
    member_count: memberRows?.[0]?.count ?? 0,
    myRole,
  };
}

// ─── useBrowseCrews — public crew list for the discover tab ──────────────────

export function useBrowseCrews() {
  const [crews, setCrews]   = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [key, setKey]       = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .from('crews')
      .select('*, crew_members(count)')
      .eq('is_public', true)
      .order('name')
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) { setError(err.message); setLoading(false); return; }
        setCrews((data ?? []).map(row => mapCrew(row as Record<string, unknown>)));
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [key]);

  const refetch = useCallback(() => setKey(k => k + 1), []);
  return { crews, loading, error, refetch };
}

// ─── useMyCrews — crews the signed-in user has joined ───────────────────────
// Validates the session via supabase.auth.getUser() so dev-mock sessions
// (non-UUID user ids) never reach the database query.

export function useMyCrews() {
  const [crews, setCrews]     = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [key, setKey]         = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSignedOut(false);

    (async () => {
      // getUser() hits the Supabase auth server — dev-mock tokens return null user
      const { data: { user } } = await supabase.auth.getUser();

      if (cancelled) return;
      if (!user) {
        setSignedOut(true);
        setCrews([]);
        setLoading(false);
        return;
      }

      const userId = user.id; // guaranteed real UUID

      const { data: memberships, error: mErr } = await supabase
        .from('crew_members')
        .select('crew_id, role')
        .eq('user_id', userId);

      if (cancelled) return;
      if (mErr) { setError(mErr.message); setLoading(false); return; }

      const crewIds = (memberships ?? []).map(m => m.crew_id as string);
      if (crewIds.length === 0) { setCrews([]); setLoading(false); return; }

      const myRoles: Record<string, 'owner' | 'member'> = {};
      (memberships ?? []).forEach(m => { myRoles[m.crew_id as string] = m.role as 'owner' | 'member'; });

      const { data, error: cErr } = await supabase
        .from('crews')
        .select('*, crew_members(count)')
        .in('id', crewIds)
        .order('name');

      if (cancelled) return;
      if (cErr) { setError(cErr.message); setLoading(false); return; }

      setCrews((data ?? []).map(row => mapCrew(row as Record<string, unknown>, myRoles[(row as Record<string, unknown>).id as string])));
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [key]);

  const refetch = useCallback(() => setKey(k => k + 1), []);
  return { crews, loading, error, signedOut, refetch };
}

// ─── useCrewDetail — single crew + member list + current user's role ─────────
// getUser() runs in parallel with the crew header fetch to determine myRole.

export function useCrewDetail(crewId: string | null) {
  const [crew, setCrew]     = useState<Crew | null>(null);
  const [members, setMembers] = useState<CrewMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [key, setKey]       = useState(0);

  useEffect(() => {
    if (!crewId) { setLoading(false); return; }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setCrew(null);
    setMembers([]);

    (async () => {
      // Q2 + auth in parallel — need both before we can set crew with myRole
      const [crewRes, authRes] = await Promise.all([
        supabase.from('crews').select('*, crew_members(count)').eq('id', crewId).single(),
        supabase.auth.getUser(),
      ]);

      if (cancelled) return;
      if (crewRes.error) { setError(crewRes.error.message); setLoading(false); return; }

      const userId = authRes.data.user?.id ?? null;

      // Q3 step 1: memberships (also used to derive myRole)
      const { data: memberRows, error: mErr } = await supabase
        .from('crew_members')
        .select('user_id, role, joined_at')
        .eq('crew_id', crewId)
        .order('joined_at', { ascending: true });

      if (cancelled) return;
      if (mErr) { setError(mErr.message); setLoading(false); return; }

      // Derive the signed-in user's role from the member list
      const myMember = userId ? (memberRows ?? []).find(m => m.user_id === userId) : undefined;
      const myRole   = myMember ? (myMember.role as 'owner' | 'member') : undefined;
      setCrew(mapCrew(crewRes.data as Record<string, unknown>, myRole));

      const userIds = (memberRows ?? []).map(m => m.user_id as string);
      if (userIds.length === 0) { setMembers([]); setLoading(false); return; }

      // Q3 step 2: profiles (no direct FK — manual join)
      const { data: profileRows, error: pErr } = await supabase
        .from('profiles')
        .select('user_id, nickname, avatar_url')
        .in('user_id', userIds);

      if (cancelled) return;
      if (pErr) { setError(pErr.message); setLoading(false); return; }

      const profileMap: Record<string, { nickname: string; avatar_url: string | null }> = {};
      (profileRows ?? []).forEach(p => {
        profileMap[p.user_id as string] = { nickname: p.nickname as string, avatar_url: p.avatar_url as string | null };
      });

      setMembers((memberRows ?? []).map(m => ({
        user_id:    m.user_id as string,
        role:       m.role as 'owner' | 'member',
        joined_at:  m.joined_at as string,
        nickname:   profileMap[m.user_id as string]?.nickname ?? '알 수 없음',
        avatar_url: profileMap[m.user_id as string]?.avatar_url ?? null,
      })));
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [crewId, key]);

  const refetch = useCallback(() => setKey(k => k + 1), []);
  return { crew, members, loading, error, refetch };
}

// ─── joinCrew — insert crew_members row with role 'member' ───────────────────
// Client-side fullness check is done by the caller before calling this.
// Known limitation: two near-simultaneous joins can both succeed if the server
// has no CHECK constraint — server-side enforcement is a backend item.

export async function joinCrew(crewId: string): Promise<MutResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요해요', code: null };

  const { error } = await supabase
    .from('crew_members')
    .insert({ crew_id: crewId, user_id: user.id, role: 'member' });

  return { error: error?.message ?? null, code: error?.code ?? null };
}

// ─── leaveCrew — delete own crew_members row ─────────────────────────────────
// Owner-cannot-leave is enforced by the caller (crew.myRole === 'owner' check),
// not by RLS — so the policy only needs to allow delete where user_id = auth.uid().

export async function leaveCrew(crewId: string): Promise<MutResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요해요', code: null };

  const { error } = await supabase
    .from('crew_members')
    .delete()
    .eq('crew_id', crewId)
    .eq('user_id', user.id);

  return { error: error?.message ?? null, code: error?.code ?? null };
}
