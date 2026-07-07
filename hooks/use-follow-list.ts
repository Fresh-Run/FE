// 팔로잉/팔로워 lists — both fetched in parallel (the tab labels need both
// counts). Rows carry is_following for the per-row follow button.

import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';
import { useStore } from '@/store/use-store';

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

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      apiFetch<FollowUser[]>(`/api/users/${uid}/following`),
      apiFetch<FollowUser[]>(`/api/users/${uid}/followers`),
    ])
      .then(([fing, fers]) => {
        if (cancelled) return;
        setFollowing(fing);
        setFollowers(fers);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '목록을 불러올 수 없어요');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [overrideUid, session?.user.id, key]);

  const refetch = useCallback(() => setKey(k => k + 1), []);
  return { following, followers, loading, error, refetch };
}
