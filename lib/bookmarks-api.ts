// Full-row bookmarked-courses fetch (저장된 코스 list). Lives apart from
// lib/routes-api.ts — that file is item-17-locked uncommitted; its committed
// getBookmarkedRouteIds() only returns ids (the feed-ribbon workaround).
// Rows are PublicRouteResponse-shaped (staging-probed 2026-07-08); server
// caps limit at 100.
import { apiFetch } from '@/lib/api';
import type { PublicRoute } from '@/lib/routes-api';

export function getBookmarkedRoutes(): Promise<PublicRoute[]> {
  return apiFetch<PublicRoute[]>('/api/routes/bookmarked?limit=100');
}
