// Home feed data — 친구 tab (GET /feed/activities, offset-paginated) and
// 전체 tab (GET /feed/nearby). Read-only: the optimistic kudos overlay lives
// in the screen so both tabs share one code path.
//
// 친구 = RUNS (feed-triage slice 2026-07-17, canvas-aligned): followed
// users' + own runs via /feed/activities. The course feed (GET /feed) left
// home entirely — owner ruling; 코스 surfaces keep their own consumers.

import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getActivityFeed,
  getNearbyFeed,
  type ActivityRun,
  type NearbyRun,
} from '@/lib/feed-api';
import { ApiError } from '@/lib/api';
import type { Coordinate } from '@/types';

const PAGE = 20; // server default page size (limit≤100)

// ─── useFeed — 친구 activity feed, paginated ─────────────────────────────────

export function useFeed() {
  const [items, setItems] = useState<ActivityRun[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const busyRef = useRef(false);
  // Mirrors items.length for the focus callback — written in an effect, never
  // during render (React Compiler purity contract, the frozen-clock lesson).
  const countRef = useRef(0);
  useEffect(() => { countRef.current = items.length; }, [items.length]);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (busyRef.current) return;
    busyRef.current = true;
    if (mode === 'initial') setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const page = await getActivityFeed(0);
      setItems(page);
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

  // Silent re-sync on every home focus (the save-a-run rider): a run saved on
  // run-save must appear on return without a pull. No spinner — the list just
  // updates. Skipped while a load is in flight (covers the mount double-fire:
  // load('initial') sets busyRef synchronously first) and once the user has
  // paginated past page 1 — a silent reset would truncate the list mid-scroll;
  // pull-to-refresh stays the explicit path there.
  useFocusEffect(useCallback(() => {
    if (busyRef.current || countRef.current > PAGE) return;
    getActivityFeed(0)
      .then(page => { setItems(page); setHasMore(page.length > 0); })
      .catch(() => {}); // quiet — the visible list is still valid
  }, []));

  const loadMore = useCallback(async () => {
    if (busyRef.current || !hasMore || items.length === 0) return;
    busyRef.current = true;
    setLoadingMore(true);
    try {
      const page = await getActivityFeed(items.length);
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

  return { items, loading, refreshing, loadingMore, error, refresh, loadMore };
}

// ─── useNearbyFeed — 전체 discovery tab (GET /feed/nearby), radius-machined ──
// Pass null coord to defer (tab unopened / permission not granted). radiusKm
// is caller-owned state (10 → one 20 retry → terminal; refresh resets to 10).
// Replaced useNearbyRoutes 2026-07-16 (전체 discovery slice) — course cards
// left 전체; /routes/nearby lost its only consumer and retired with it.

// Client mirror of her nearby-feed Korea bbox (routes.py: 400 "lat/lng out
// of Korea bounds") — same range the course-world guards mirror. Used only
// to DISCRIMINATE her 400, never to pre-block the fetch: if the server
// policy widens, no 400 arrives and this never fires.
const KOREA_BBOX = { latMin: 33, latMax: 39, lngMin: 124, lngMax: 132 };
const outsideKorea = (c: Coordinate) =>
  c.lat < KOREA_BBOX.latMin || c.lat > KOREA_BBOX.latMax || c.lng < KOREA_BBOX.lngMin || c.lng > KOREA_BBOX.lngMax;

export function useNearbyFeed(coord: Coordinate | null, radiusKm: number, refreshKey = 0) {
  const [items, setItems]     = useState<NearbyRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [fetched, setFetched] = useState(false); // distinguishes "not asked" from "[] answered"
  // Abroad: her 400 + our coords demonstrably outside the bbox → the
  // Korea-only state (no retry — retrying cannot succeed). Prose-free
  // discriminator: status + geometry, never the English detail string.
  const [koreaOnly, setKoreaOnly] = useState(false);

  useEffect(() => {
    if (!coord) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setKoreaOnly(false);
    getNearbyFeed(coord.lat, coord.lng, radiusKm)
      .then(rows => { if (!cancelled) { setItems(rows); setFetched(true); } })
      .catch((e: unknown) => {
        if (cancelled) return;
        // koreaOnly rides WITH error (the render chain enters on error, then
        // branches) — clearing error here would strand the UI on the spinner
        if (e instanceof ApiError && e.status === 400 && outsideKorea(coord)) setKoreaOnly(true);
        setError(e instanceof Error ? e.message : '주변 러닝을 불러올 수 없어요');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [coord, radiusKm, refreshKey]);

  return { items, loading, error, fetched, koreaOnly };
}
