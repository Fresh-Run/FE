// 전체 discovery feed — GET /feed/nearby (지연 contract, probed live
// 2026-07-16): lat/lng REQUIRED (400 "lat, lng are required"), Korea bbox
// validated (400 "lat/lng out of Korea bounds" — Tokyo-probed verbatim),
// radius_km default 10 / SILENTLY clamped at 20 (25-probed: 200 with rows,
// no error — the client never sends >20 anyway). Returns run items newest
// first, [] when empty (제주-probed at both radii). Server semantics:
// public runs only · excludes self, followed, blocked/private —
// 전체 = discovery, 친구 = followed. Course cards left 전체 entirely.
import { apiFetch } from '@/lib/api';
import type { UserRun } from '@/hooks/use-user-profile';

/** The nearby payload is a superset of UserRun (probed key list) — the
    shared RunCard consumes it as-is; extras typed for future use. */
export type NearbyRun = UserRun & {
  area: string | null;
  visibility: 'public';
  allow_likes?: boolean | null;
  allow_comments?: boolean | null;
  is_crew_session?: boolean;
  route_id?: string | null;
  photo_thumb?: string | null;
};

export function getNearbyFeed(lat: number, lng: number, radiusKm: number): Promise<NearbyRun[]> {
  return apiFetch<NearbyRun[]>(`/api/feed/nearby?lat=${lat}&lng=${lng}&radius_km=${radiusKm}`);
}
