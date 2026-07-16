// Home run feeds — 전체 (GET /feed/nearby) + 친구 (GET /feed/activities).
//
// /feed/nearby (지연 contract, probed live 2026-07-16): lat/lng REQUIRED
// (400 "lat, lng are required"), Korea bbox validated (400 "lat/lng out of
// Korea bounds" — Tokyo-probed verbatim), radius_km default 10 / SILENTLY
// clamped at 20 (25-probed: 200 with rows, no error — the client never sends
// >20 anyway). Returns run items newest first, [] when empty (제주-probed at
// both radii). Server semantics: public runs only · excludes self, followed,
// blocked/private-account owners · trackless runs never appear (no start
// coords) — 전체 = discovery, 친구 = followed.
//
// /feed/activities (probed live 2026-07-17, feed-triage slice): runs by
// followed users PLUS my own, newest ran_at first, offset/limit paginated
// (limit≤100). Visibility: others' private runs excluded, own private runs
// included. Payload shape is IDENTICAL to /feed/nearby (same ActivityFeedItem
// model + _build_activity_items server-side; 23-key parity probed). Own fresh
// run appears at position 0 immediately after POST /runs.
import { apiFetch } from '@/lib/api';
import type { UserRun } from '@/hooks/use-user-profile';

/** Both feed payloads are the same superset of UserRun (probed key parity) —
    the shared RunCard consumes them as-is; extras typed for future use. */
type FeedRunExtras = {
  area: string | null;
  allow_likes?: boolean | null;
  allow_comments?: boolean | null;
  is_crew_session?: boolean;
  route_id?: string | null;
  photo_thumb?: string | null;
};

export type NearbyRun = UserRun & FeedRunExtras & { visibility: 'public' };

/** 친구 lane rows — visibility is null on others' runs (server privacy) and
    the raw value ('private' included) on own rows. */
export type ActivityRun = UserRun & FeedRunExtras & { visibility: string | null };

/** Either lane's row — the home screen renders both with one RunCard path. */
export type FeedRun = NearbyRun | ActivityRun;

export function getNearbyFeed(lat: number, lng: number, radiusKm: number): Promise<NearbyRun[]> {
  return apiFetch<NearbyRun[]>(`/api/feed/nearby?lat=${lat}&lng=${lng}&radius_km=${radiusKm}`);
}

export function getActivityFeed(offset = 0, limit = 20): Promise<ActivityRun[]> {
  return apiFetch<ActivityRun[]>(`/api/feed/activities?limit=${limit}&offset=${offset}`);
}
