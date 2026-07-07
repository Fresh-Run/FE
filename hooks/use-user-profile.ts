// 타인 프로필 — parallel fetch of the public profile + visibility-filtered
// runs (server filters by viewer; the 공개 framing is honest here).
// Shapes staging-probed 2026-07-08.

import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';

export type UserProfile = {
  user_id: string;
  nickname: string;
  avatar_url: string | null;
  bio: string | null;
  tier: string;
  follower_count: number;
  following_count: number;
  is_following: boolean;
  is_followed_by: boolean;
  public_run_count: number;
};

export type UserRun = {
  run_id: string;
  user_id: string;
  nickname: string;
  ran_at: string;
  title: string | null;
  distance_km: number;
  duration_sec: number;
  avg_pace_sec_per_km: number | null;
  kudos_count: number;
  my_kudos: boolean;
  comment_count: number;
  is_mine: boolean;
};

export function useUserProfile(uid: string | null) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [runs, setRuns]       = useState<UserRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [key, setKey]         = useState(0);

  useEffect(() => {
    if (!uid) { setLoading(false); setError('프로필을 찾을 수 없어요'); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      apiFetch<UserProfile>(`/api/users/${uid}/profile`),
      apiFetch<UserRun[]>(`/api/users/${uid}/runs?limit=50`),
    ])
      .then(([p, r]) => { if (!cancelled) { setProfile(p); setRuns(r); } })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '프로필을 불러올 수 없어요');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [uid, key]);

  const refetch = useCallback(() => setKey(k => k + 1), []);
  return { profile, runs, loading, error, refetch };
}
