// 내 프로필 (social, own-view) — parallel fetch of the three sources:
// profile fields, follow counts, 활동 count + the own-runs list.
// Runs are fetched via apiFetch directly (NOT lib/runs-api — that file is
// uncommitted item-17 territory; this hook must commit alone).

import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';
import { useStore } from '@/store/use-store';

export type MyPublicProfile = {
  nickname: string;
  avatarUrl: string | null;
  bio: string | null;
  followingCount: number;
  followerCount: number;
  runCount: number;
};

export type MyRun = {
  id: string;
  ran_at: string;
  title: string | null;
  distance_km: number;
  duration_sec: number;
  avg_pace_sec_per_km: number | null;
  kudos_count: number;
  comment_count: number;
  polyline_thumb: { lat: number; lng: number }[] | null; // BE 6baa192, ≤36pt
  // Never null on own list — legacy rows are 'followers' server-side (지연 확인)
  visibility: 'public' | 'followers' | 'private';
};

type ProfileResp = { nickname: string; avatar_url: string | null; bio: string | null };
type PublicResp  = { follower_count: number; following_count: number };
type StatsResp   = { all_time: { run_count: number } };

export function useMyPublicProfile() {
  const session = useStore(s => s.session);
  const [profile, setProfile] = useState<MyPublicProfile | null>(null);
  const [runs, setRuns]       = useState<MyRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [key, setKey]         = useState(0);

  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) { setLoading(false); setError('로그인이 필요해요'); return; }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const [me, pub, stats, runRows] = await Promise.all([
          apiFetch<ProfileResp>('/api/me/profile'),
          apiFetch<PublicResp>(`/api/users/${uid}/profile`),
          apiFetch<StatsResp>('/api/me/stats'),
          apiFetch<MyRun[]>('/api/runs?limit=50'),
        ]);
        if (cancelled) return;
        setProfile({
          nickname:       me.nickname,
          avatarUrl:      me.avatar_url,
          bio:            me.bio,
          followingCount: pub.following_count,
          followerCount:  pub.follower_count,
          runCount:       stats.all_time.run_count,
        });
        setRuns(runRows);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : '프로필을 불러올 수 없어요');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [session?.user.id, key]);

  const refetch = useCallback(() => setKey(k => k + 1), []);
  return { profile, runs, loading, error, refetch };
}
