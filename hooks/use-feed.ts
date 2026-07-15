// Home feed data — 친구 tab (GET /feed, offset-paginated) and 전체 tab
// (GET /routes/nearby). Read-only: optimistic like/bookmark overlays live
// in the screen so both tabs share one code path.

import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getBookmarkedRouteIds,
  getFeed,
  type PublicRoute,
} from '@/lib/routes-api';
import { getNearbyFeed, type NearbyRun } from '@/lib/feed-api';
import type { Coordinate } from '@/types';

// ─── useFeed — following feed, paginated ─────────────────────────────────────

export function useFeed() {
  const [items, setItems] = useState<PublicRoute[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const busyRef = useRef(false);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (busyRef.current) return;
    busyRef.current = true;
    if (mode === 'initial') setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const [page, bookmarks] = await Promise.all([getFeed(0), getBookmarkedRouteIds()]);
      setItems(page);
      setBookmarkedIds(bookmarks);
      setHasMore(page.length > 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '피드를 불러올 수 없어요');
    } finally {
      busyRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load('initial'); }, [load]);

  // Re-sync ribbon state on every home focus — bookmark changes made
  // elsewhere (저장된 코스 unsave/undo) must reflect without a pull-refresh.
  useFocusEffect(useCallback(() => {
    getBookmarkedRouteIds().then(setBookmarkedIds).catch(() => {});
  }, []));

  const loadMore = useCallback(async () => {
    if (busyRef.current || !hasMore || items.length === 0) return;
    busyRef.current = true;
    setLoadingMore(true);
    try {
      const page = await getFeed(items.length);
      setItems(prev => [...prev, ...page]);
      if (page.length === 0) setHasMore(false); // empty page = end (guide §6)
    } catch {
      // silent — the next onEndReached retries
    } finally {
      busyRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, items.length]);

  const refresh = useCallback(() => load('refresh'), [load]);

  return { items, bookmarkedIds, loading, refreshing, loadingMore, error, refresh, loadMore };
}

// ─── useNearbyFeed — 전체 discovery tab (GET /feed/nearby), radius-machined ──
// Pass null coord to defer (tab unopened / permission not granted). radiusKm
// is caller-owned state (10 → one 20 retry → terminal; refresh resets to 10).
// Replaced useNearbyRoutes 2026-07-16 (전체 discovery slice) — course cards
// left 전체; /routes/nearby lost its only consumer and retired with it.

export function useNearbyFeed(coord: Coordinate | null, radiusKm: number, refreshKey = 0) {
  const [items, setItems]     = useState<NearbyRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [fetched, setFetched] = useState(false); // distinguishes "not asked" from "[] answered"

  useEffect(() => {
    if (!coord) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getNearbyFeed(coord.lat, coord.lng, radiusKm)
      .then(rows => { if (!cancelled) { setItems(rows); setFetched(true); } })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : '주변 러닝을 불러올 수 없어요'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [coord, radiusKm, refreshKey]);

  return { items, loading, error, fetched };
}
