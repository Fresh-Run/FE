// 팔로잉/팔로워 lists — both fetched in parallel (the tab labels need both
// counts). Rows carry is_following for the per-row follow button.
//
// SWR-lite (#8): cached instant paint for MY OWN lists ONLY (per-uid key —
// account-switch purity). Another user's lists are NEVER cached: they're
// privacy-gated territory (her lock 404s/sanitizes them; a cached copy
// would paint pre-lock rows after a visibility change).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';
import { useStore } from '@/store/use-store';

const cacheKey = (uid: string) => `@fr_follows:${uid}`;

export type FollowUser = {
  user_id: string;
  nickname: string | null;
  avatar_url: string | null;
  followed_at: string;
  is_following: boolean;
};

/** Own lists by default; pass overrideUid for another user's lists
    (endpoints are viewer-readable — probed 2026-07-08). */
export function useFollowList(overrideUid?: string | null) {
  const session = useStore(s => s.session);
  const [following, setFollowing] = useState<FollowUser[]>([]);
  const [followers, setFollowers] = useState<FollowUser[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [key, setKey]             = useState(0);

  useEffect(() => {
    const uid = overrideUid ?? session?.user.id;
    if (!uid) { setLoading(false); setError('로그인이 필요해요'); return; }

    const isOwn = uid === session?.user.id;
    let cancelled = false;
    setError(null);

    let painted = false;
    (async () => {
      // 1) cache paint STRICTLY before the fetch starts — no stale-over-fresh race
      if (isOwn) {
        try {
          const raw = await AsyncStorage.getItem(cacheKey(uid));
          if (raw && !cancelled) {
            const c = JSON.parse(raw) as { following: FollowUser[]; followers: FollowUser[] };
            setFollowing(c.following ?? []);
            setFollowers(c.followers ?? []);
            setLoading(false);
            painted = true;
          }
        } catch { /* hard load below */ }
      }
      if (!painted && !cancelled) setLoading(true);

      // 2) server truth corrects
      try {
        const [fing, fers] = await Promise.all([
          apiFetch<FollowUser[]>(`/api/users/${uid}/following`),
          apiFetch<FollowUser[]>(`/api/users/${uid}/followers`),
        ]);
        if (cancelled) return;
        setFollowing(fing);
        setFollowers(fers);
        if (isOwn) {
          AsyncStorage.setItem(cacheKey(uid), JSON.stringify({ following: fing, followers: fers })).catch(() => {});
        }
      } catch (e: unknown) {
        if (!cancelled && !painted) setError(e instanceof Error ? e.message : '목록을 불러올 수 없어요');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [overrideUid, session?.user.id, key]);

  const refetch = useCallback(() => setKey(k => k + 1), []);
  return { following, followers, loading, error, refetch };
}
