// Full-row bookmarked-courses fetch (저장된 코스 list). Historical split:
// this lived apart from routes-api during the item-17 lock (long resolved);
// the id-only getBookmarkedRouteIds it references was DELETED 2026-07-17
// (feed-triage). Kept separate as-is — merging into routes-api is cosmetic.
// Rows are PublicRouteResponse-shaped (staging-probed 2026-07-08); server
// caps limit at 100.
import { apiFetch } from '@/lib/api';
import type { PublicRoute } from '@/lib/routes-api';

export function getBookmarkedRoutes(): Promise<PublicRoute[]> {
  return apiFetch<PublicRoute[]>('/api/routes/bookmarked?limit=100');
}
