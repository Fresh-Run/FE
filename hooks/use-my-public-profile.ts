// 내 프로필 (social, own-view) — parallel fetch of the three sources:
// profile fields, follow counts, 활동 count + the own-runs list.
//
// SWR-lite (#8): per-user AsyncStorage cache → instant paint on revisit →
// silent server refetch corrects. OWN data end-to-end (profile + own runs)
// — no privacy interaction; the account-switch purity rule rides via the
// per-uid cache key (the S2 bleed-fix precedent).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';
import { useStore } from '@/store/use-store';

const cacheKey = (uid: string) => `@fr_myprofile:${uid}`;

export type MyPublicProfile = {
  nickname: string;
  avatarUrl: string | null;
  bio: string | null;
  followingCount: number;
  followerCount: number;
  runCount: number;
};

export type MyRun = {
  /** 8/5 크루 배너 (그녀 ② 개인 리드) — null = 무배너, 이유 추론 금지 */
  crew_name?: string | null;
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
    setError(null);

    (async () => {
      // 1) instant paint from this user's cache (silent-refetch below wins)
      let painted = false;
      try {
        const raw = await AsyncStorage.getItem(cacheKey(uid));
        if (raw && !cancelled) {
          const c = JSON.parse(raw) as { profile: MyPublicProfile; runs: MyRun[] };
          if (c.profile) {
            setProfile(c.profile);
            setRuns(c.runs ?? []);
            setLoading(false);
            painted = true;
          }
        }
      } catch { /* unreadable cache — hard load below */ }
      if (!painted && !cancelled) setLoading(true);

      try {
        const [me, pub, stats, runRows] = await Promise.all([
          apiFetch<ProfileResp>('/api/me/profile'),
          apiFetch<PublicResp>(`/api/users/${uid}/profile`),
          apiFetch<StatsResp>('/api/me/stats'),
          apiFetch<MyRun[]>('/api/runs?limit=50'),
        ]);
        if (cancelled) return;
        const fresh: MyPublicProfile = {
          nickname:       me.nickname,
          avatarUrl:      me.avatar_url,
          bio:            me.bio,
          followingCount: pub.following_count,
          followerCount:  pub.follower_count,
          runCount:       stats.all_time.run_count,
        };
        setProfile(fresh);
        setRuns(runRows);
        AsyncStorage.setItem(cacheKey(uid), JSON.stringify({ profile: fresh, runs: runRows })).catch(() => {});
      } catch (e: unknown) {
        // cached paint stands on a refetch miss — error only on a blank screen
        if (!cancelled && !painted) setError(e instanceof Error ? e.message : '프로필을 불러올 수 없어요');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [session?.user.id, key]);

  const refetch = useCallback(() => setKey(k => k + 1), []);
  return { profile, runs, loading, error, refetch };
}
