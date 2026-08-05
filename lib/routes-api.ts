// Public course feed + social actions — /feed, /routes/nearby, likes,
// bookmarks, comments. Shapes mirror the backend's PublicRouteResponse /
// CommentResponse (docs/API_GUIDE.md is the authoritative contract).

import { ApiError, apiFetch } from '@/lib/api';
import type { Coordinate } from '@/types';

export type PublicRoute = {
  id: string;
  created_at: string;
  owner_id: string | null;
  summary: string;
  total_distance_km: number;
  estimated_duration_min: number | null;
  start_lat: number | null;
  start_lng: number | null;
  polyline: Coordinate[] | null;
  is_mine: boolean;
  owner_nickname: string | null;
  owner_avatar_url: string | null; // BE 5009cbe+4b22103 (avatar wire-up)
  copy_count: number;
  like_count: number;
  is_liked: boolean;
  comment_count: number;
};

export type RouteComment = {
  id: string;
  route_id: string;
  user_id: string;
  nickname: string | null;
  avatar_url: string | null; // BE 5009cbe (avatar wire-up)
  content: string;
  created_at: string;
  /** 1-level replies (her route contract, deployed + probed 2026-08-05 —
      the run-comment 8/1 grammar verbatim): null/absent = top-level. */
  parent_comment_id?: string | null;
};

// getFeed retired 2026-07-17 (feed-triage slice): the 친구 tab now serves
// RUNS via GET /feed/activities (lib/feed-api.ts). GET /feed (followed
// users' courses) remains LIVE server-side — our client wrapper died, her
// endpoint didn't.

// getNearbyRoutes retired 2026-07-16 (전체 discovery slice): /routes/nearby's
// only consumer was the 전체 tab, which now serves RUNS via GET /feed/nearby.

// getBookmarkedRouteIds retired 2026-07-17 (feed-triage slice): it existed
// only to seed the course-feed bookmark ribbons, which left home with the
// course cards. GET /routes/bookmarked remains LIVE server-side and keeps a
// full-row consumer in lib/bookmarks-api.ts (저장된 코스).

export function likeRoute(id: string): Promise<void> {
  return apiFetch<void>(`/api/routes/${id}/like`, { method: 'POST' });
}
export function unlikeRoute(id: string): Promise<void> {
  return apiFetch<void>(`/api/routes/${id}/like`, { method: 'DELETE' });
}

export function bookmarkRoute(id: string): Promise<void> {
  return apiFetch<void>(`/api/routes/${id}/bookmark`, { method: 'POST' });
}
export function unbookmarkRoute(id: string): Promise<void> {
  return apiFetch<void>(`/api/routes/${id}/bookmark`, { method: 'DELETE' });
}

// ─── 내 코스 (owner view) — GET /routes · GET /routes/{id} · PATCH publish ────
// Mirrors the backend StoredRoute (includes private fields; owner-only reads).
// Wired 2026-07-20 (코스 공개 + 내 코스 slice — the locked-showroom supply valve).
export type StoredRoute = {
  id: string;
  created_at: string;
  user_id: string | null;
  target_distance_km: number | null;
  pitstop_keyword: string | null;
  notes: string | null;
  summary: string;
  total_distance_km: number;
  estimated_duration_min: number | null;
  waypoints: { name: string; coordinate: Coordinate; is_pitstop: boolean; description: string | null }[];
  polyline: Coordinate[] | null;
  is_public: boolean;
  /** v2.3+ (BE 리포트 D, 63/63 backfilled false): true = 편도 — pre-column
      one-way rows were NOT retro-flagged, so the badge is go-forward only. */
  is_one_way?: boolean;
  copied_from: string | null;
};

/** My routes, newest first (server clamps limit). */
export function getMyRoutes(): Promise<StoredRoute[]> {
  return apiFetch<StoredRoute[]>('/api/routes?limit=100');
}

/** Single-route reload — owner-only server-side (others' → 404). */
export function getMyRoute(id: string): Promise<StoredRoute> {
  return apiFetch<StoredRoute>(`/api/routes/${id}`);
}

/** 공개/비공개 토글 (owner-only; 404 otherwise). Returns the updated row. */
export function setRoutePublic(id: string, isPublic: boolean): Promise<StoredRoute> {
  return apiFetch<StoredRoute>(`/api/routes/${id}`, { method: 'PATCH', body: { is_public: isPublic } });
}

/** DELETE /routes/{id} — owner-only hard delete (guide 2026-07-21, probed
    live same day: 204 → re-DELETE 404 은닉). Cascade server-side: bookmarks/
    likes/comments/route notifications die; LINKED RUNS AND COPIES SURVIVE
    (runs.route_id · copied_from → null — independent assets). 404 resolves
    as SUCCESS — deleteRun's idempotent-delete transport twin. */
export async function deleteRoute(id: string): Promise<void> {
  try {
    await apiFetch<void>(`/api/routes/${id}`, { method: 'DELETE' });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return; // already gone
    throw e;
  }
}

/** Public course rows (PublicRouteResponse — REAL social fields, OWN rows
    included; probed 2026-07-21). #4 slice: the notification landing's
    hydration source for route_liked/route_commented — the owner read
    (GET /routes/{id}) is StoredRoute and has no social fields. */
export function getPublicRoutes(): Promise<PublicRoute[]> {
  return apiFetch<PublicRoute[]>('/api/routes/public?limit=100');
}

// My private copy of a route (StoredRoute) — subset we consume.
export type CopiedRoute = {
  id: string;
  summary: string;
  total_distance_km: number;
  estimated_duration_min: number | null;
  polyline: Coordinate[] | null;
  is_public: boolean;
  copied_from: string | null;
};

/** "이 코스 달리기" — copies a public route into my account; the copy's id
    is what runs.route_id links to (route reads are owner-only). */
export function copyRoute(id: string): Promise<CopiedRoute> {
  return apiFetch<CopiedRoute>(`/api/routes/${id}/copy`, { method: 'POST' });
}

export function getRouteComments(routeId: string): Promise<RouteComment[]> {
  return apiFetch<RouteComment[]>(`/api/routes/${routeId}/comments`);
}
export function postRouteComment(routeId: string, content: string, parentCommentId: string | null = null): Promise<RouteComment> {
  return apiFetch<RouteComment>(`/api/routes/${routeId}/comments`, {
    method: 'POST',
    body: { content, ...(parentCommentId ? { parent_comment_id: parentCommentId } : {}) },
  });
}
/** Own comments only (server-enforced; others' → 404). */
export function deleteRouteComment(routeId: string, commentId: string): Promise<void> {
  return apiFetch<void>(`/api/routes/${routeId}/comments/${commentId}`, { method: 'DELETE' });
}
