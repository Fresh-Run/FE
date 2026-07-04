import { useCallback, useEffect, useState } from 'react';

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

const FALLBACK_PROFILE: Profile = { nickname: '사용자', avatar_url: null, bio: null };
const EMPTY_STATS: RunStats     = { totalRuns: 0, totalDistKm: 0, bestPaceSec: null };

export function useProfile() {
  const [profile, setProfile]     = useState<Profile | null>(null);
  const [stats, setStats]         = useState<RunStats>(EMPTY_STATS);
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
        setLoading(false);
        return;
      }

      // Fetch profile row + run stats in parallel.
      const [profileRes, runsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('nickname, avatar_url, bio')
          .eq('user_id', user.id)
          .single(),
        supabase
          .from('runs')
          .select('distance_km, avg_pace_sec_per_km')
          .eq('user_id', user.id),
      ]);

      if (cancelled) return;

      // PGRST116 = no row found — use fallback rather than propagating as error.
      if (profileRes.error && profileRes.error.code !== 'PGRST116') {
        setError(profileRes.error.message);
        setLoading(false);
        return;
      }
      const p = profileRes.data;
      setProfile(p
        ? { nickname: p.nickname ?? '사용자', avatar_url: p.avatar_url, bio: p.bio }
        : FALLBACK_PROFILE,
      );

      // Runs failure is non-fatal: show profile with zeroed stats.
      const runs = runsRes.data ?? [];
      const paces = runs
        .map(r => r.avg_pace_sec_per_km)
        .filter((v): v is number => v != null);
      setStats({
        totalRuns:    runs.length,
        totalDistKm:  runs.reduce((s, r) => s + (r.distance_km ?? 0), 0),
        bestPaceSec:  paces.length > 0 ? Math.min(...paces) : null,
      });
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [key]);

  const refetch = useCallback(() => setKey(k => k + 1), []);
  return { profile, stats, loading, error, signedOut, refetch };
}
