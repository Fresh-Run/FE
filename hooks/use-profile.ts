// 프로필 tab data — migrated to the backend API (2026-07-08; was direct
// Supabase reads, the audit's grandfather exception #2). Signatures and
// consumer contracts unchanged. Auth stays Supabase (architecture rule).
//
// Accepted semantic delta (owner, 2026-07-08): bestPaceSec now comes from
// /me/stats records.best_pace (1km+ runs only, suspect-flagged excluded) —
// the legacy min(avg_pace) counted every run of any distance.

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, apiFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export type Profile = {
  nickname: string;
  avatar_url: string | null;
  bio: string | null;
};

export type RunStats = {
  totalRuns: number;
  totalDistKm: number;
  bestPaceSec: number | null;
};

type ProfileResp = { nickname: string | null; avatar_url: string | null; bio: string | null };
type StatsResp = {
  all_time: { run_count: number; total_distance_km: number };
  records: { best_pace: { value: number } | null };
};

const FALLBACK_PROFILE: Profile = { nickname: '사용자', avatar_url: null, bio: null };
const EMPTY_STATS: RunStats     = { totalRuns: 0, totalDistKm: 0, bestPaceSec: null };

export function useProfile() {
  const [profile, setProfile]     = useState<Profile | null>(null);
  const [stats, setStats]         = useState<RunStats>(EMPTY_STATS);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [key, setKey]             = useState(0);
  // SWR-lite (2026-07-08): true first load vs silent focus-refetch
  const hasDataRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const firstLoad = !hasDataRef.current;
    if (firstLoad) setLoading(true);
    setError(null);
    setSignedOut(false);

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setSignedOut(true);
        setLoading(false);
        return;
      }

      // Profile + stats in parallel (same shape as the legacy dual read).
      const [profileRes, statsRes] = await Promise.allSettled([
        apiFetch<ProfileResp | null>('/api/me/profile'),
        apiFetch<StatsResp>('/api/me/stats'),
      ]);
      if (cancelled) return;

      // Profile-less accounts come back TWO ways: 404 (rejection branch) OR
      // 200 with a null body (fulfilled — field bug ① 2026-07-11: testrun's
      // 프로필 tab crashed on p.nickname of null). Both land on the fallback.
      if (profileRes.status === 'fulfilled') {
        const p = profileRes.value;
        setProfile(p
          ? { nickname: p.nickname ?? '사용자', avatar_url: p.avatar_url, bio: p.bio }
          : FALLBACK_PROFILE);
        hasDataRef.current = true;
      } else if (profileRes.reason instanceof ApiError && profileRes.reason.status === 404) {
        setProfile(FALLBACK_PROFILE);
        hasDataRef.current = true;
      } else if (firstLoad) {
        const e = profileRes.reason;
        setError(e instanceof Error ? e.message : '프로필을 불러올 수 없어요');
        setLoading(false);
        return;
      }

      // Stats failure is non-fatal: zeroed stats on first load; a silent
      // refetch keeps the previous stats (no flash of zeros).
      if (statsRes.status === 'fulfilled') {
        const s = statsRes.value;
        setStats({
          totalRuns:   s.all_time.run_count,
          totalDistKm: s.all_time.total_distance_km,
          bestPaceSec: s.records.best_pace?.value ?? null,
        });
      } else if (firstLoad) {
        setStats(EMPTY_STATS);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [key]);

  const refetch = useCallback(() => setKey(k => k + 1), []);
  return { profile, stats, loading, error, signedOut, refetch };
}
