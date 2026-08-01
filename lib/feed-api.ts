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
  crew_name?: string | null; // 8/5 배너 (show_crew 게이트)
  /** Linked course's summary — non-null ONLY for PUBLIC courses (server
      filters private ones out). NO CLIENT CONSUMER since the 2026-07-21
      owner step-back (feed course affordances removed; the CTA-gate logic
      that consumed this lives at commit 82c5bc9, returns post-launch). */
  route_summary?: string | null;
  photo_thumb?: string | null;
};

export type NearbyRun = UserRun & FeedRunExtras & { visibility: 'public' };

/** 친구 lane rows — visibility is null on others' runs (server privacy) and
    the raw value ('private' included) on own rows. */
export type ActivityRun = UserRun & FeedRunExtras & { visibility: string | null };

/** Either lane's row — the home screen renders both with one RunCard path. */
export type FeedRun = NearbyRun | ActivityRun;

/** 8/4 nationwide (owner ruling; her scope contract on record, deploy ~this
    weekend): scope=all opens the 전체 tab to every public run in Korea.
    radius_km=20 rides ALONGSIDE as the pre-deploy floor — her current server
    ignores the unknown scope param and clamps radius at 20, so the tab stays
    20km-bounded until her deploy flips it nationwide (zero coordination).
    limit/offset were already live server-side (≤100/offset) — consumed now. */
export function getNearbyFeed(lat: number, lng: number, limit: number, offset: number): Promise<NearbyRun[]> {
  return apiFetch<NearbyRun[]>(`/api/feed/nearby?lat=${lat}&lng=${lng}&scope=all&radius_km=20&limit=${limit}&offset=${offset}`);
}

export function getActivityFeed(offset = 0, limit = 20): Promise<ActivityRun[]> {
  return apiFetch<ActivityRun[]>(`/api/feed/activities?limit=${limit}&offset=${offset}`);
}
