// 팔로잉/팔로워 lists — both fetched in parallel (the tab labels need both
// counts). Rows carry is_following for the per-row follow button.
//
// SWR-lite (#8): cached instant paint for MY OWN lists ONLY (per-uid key —
// account-switch purity). Another user's lists are NEVER cached: they're
// privacy-gated territory (her lock 404s/sanitizes them; a cached copy
// would paint pre-lock rows after a visibility change).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import { t } from '@/lib/i18n';
import { apiFetch } from '@/lib/api';
import { errorMessage } from '@/lib/error-copy';
import { useStore } from '@/store/use-store';

const cacheKey = (uid: string) => `@fr_follows:${uid}`;

export type FollowUser = {
  user_id: string;
  nickname: string | null;
  avatar_url: string | null;
  followed_at: string;
  is_following: boolean;
};

// Server page contract (지연 proof 2026-08-02): limit default 20, offset
// pagination, clamp 100. A bare fetch gets exactly page 1 — the 28-follow
// truncation bug. PAGE stays at the server default; more pages, not a
// bigger cliff.
const PAGE = 20;

/** Own lists by default; pass overrideUid for another user's lists
    (endpoints are viewer-readable — probed 2026-07-08). */
export function useFollowList(overrideUid?: string | null) {
  const session = useStore(s => s.session);
  const [following, setFollowing] = useState<FollowUser[]>([]);
  const [followers, setFollowers] = useState<FollowUser[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [key, setKey]             = useState(0);
  // True totals from the profile response (counts are truth values even on
  // locked profiles — guide §197). Tab labels must not lie "20" at 28.
  const [counts, setCounts] = useState<{ following: number | null; followers: number | null }>({ following: null, followers: null });
  const [hasMore, setHasMore] = useState<{ following: boolean; followers: boolean }>({ following: false, followers: false });
  const [loadingMore, setLoadingMore] = useState<{ following: boolean; followers: boolean }>({ following: false, followers: false });
  const inFlight = useRef<{ following: boolean; followers: boolean }>({ following: false, followers: false });

  useEffect(() => {
    const uid = overrideUid ?? session?.user.id;
    if (!uid) { setLoading(false); setError(t('err.loginNeeded')); return; }

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

      // 2) server truth corrects — page 1 of each + true counts in parallel
      try {
        const [fing, fers, prof] = await Promise.all([
          apiFetch<FollowUser[]>(`/api/users/${uid}/following?limit=${PAGE}&offset=0`),
          apiFetch<FollowUser[]>(`/api/users/${uid}/followers?limit=${PAGE}&offset=0`),
          apiFetch<{ following_count: number; follower_count: number }>(`/api/users/${uid}/profile`).catch(() => null),
        ]);
        if (cancelled) return;
        setFollowing(fing);
        setFollowers(fers);
        setHasMore({ following: fing.length === PAGE, followers: fers.length === PAGE });
        if (prof) setCounts({ following: prof.following_count, followers: prof.follower_count });
        if (isOwn) {
          AsyncStorage.setItem(cacheKey(uid), JSON.stringify({ following: fing, followers: fers })).catch(() => {});
        }
      } catch (e: unknown) {
        if (!cancelled && !painted) setError(errorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [overrideUid, session?.user.id, key]);

  /** Infinite scroll: next offset = rows loaded. In-flight ref guards rapid
      onEndReached re-fires; append dedups by user_id (a follow landing
      between pages shifts offsets — belt against a duplicate row). */
  const loadMore = useCallback(async (kind: 'following' | 'followers') => {
    const uid = overrideUid ?? session?.user.id;
    if (!uid || inFlight.current[kind]) return;
    const rows = kind === 'following' ? following : followers;
    const more = kind === 'following' ? hasMore.following : hasMore.followers;
    if (!more) return;
    inFlight.current[kind] = true;
    setLoadingMore(p => ({ ...p, [kind]: true }));
    try {
      const batch = await apiFetch<FollowUser[]>(`/api/users/${uid}/${kind}?limit=${PAGE}&offset=${rows.length}`);
      const seen = new Set(rows.map(r => r.user_id));
      const fresh = batch.filter(r => !seen.has(r.user_id));
      const setRows = kind === 'following' ? setFollowing : setFollowers;
      setRows(prev => [...prev, ...fresh]);
      setHasMore(p => ({ ...p, [kind]: batch.length === PAGE }));
    } catch { /* quiet — next end-reach retries */ } finally {
      inFlight.current[kind] = false;
      setLoadingMore(p => ({ ...p, [kind]: false }));
    }
  }, [overrideUid, session?.user.id, following, followers, hasMore]);

  const refetch = useCallback(() => setKey(k => k + 1), []);
  return { following, followers, counts, loading, error, refetch, loadMore, loadingMore, hasMore };
}
