// Public course feed + social actions — /feed, /routes/nearby, likes,
// bookmarks, comments. Shapes mirror the backend's PublicRouteResponse /
// CommentResponse (docs/API_GUIDE.md is the authoritative contract).

import { apiFetch } from '@/lib/api';
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
};

export const FEED_PAGE_SIZE = 20;

export function getFeed(offset = 0): Promise<PublicRoute[]> {
  return apiFetch<PublicRoute[]>(`/api/feed?limit=${FEED_PAGE_SIZE}&offset=${offset}`);
}

export function getNearbyRoutes(lat: number, lng: number, radiusKm = 10): Promise<PublicRoute[]> {
  return apiFetch<PublicRoute[]>(`/api/routes/nearby?lat=${lat}&lng=${lng}&radius_km=${radiusKm}`);
}

// PublicRouteResponse carries no is_bookmarked flag (raised as a backend
// follow-up) — seed card state by intersecting the bookmark list instead.
// Server caps limit at 100; users with more bookmarks may see stale icons
// past that — acceptable for v1.
export async function getBookmarkedRouteIds(): Promise<Set<string>> {
  const rows = await apiFetch<PublicRoute[]>('/api/routes/bookmarked?limit=100');
  return new Set(rows.map(r => r.id));
}

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
export function postRouteComment(routeId: string, content: string): Promise<RouteComment> {
  return apiFetch<RouteComment>(`/api/routes/${routeId}/comments`, {
    method: 'POST',
    body: { content },
  });
}
