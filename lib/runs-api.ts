// Run save + feedback — POST /api/runs, POST /api/runs/{id}/feedback.
// Shapes mirror the backend's RunRequest / RunResponse / FeedbackRequest.

import { apiFetch } from '@/lib/api';

/** PB broken by this save — POST /runs response only; first run always []. */
export type NewRecord = {
  type: 'best_pace' | 'best_5k' | 'longest_distance' | 'longest_duration';
  previous: number;
  current: number;
  improvement_pct: number;
};

export type SavedRun = {
  id: string;
  created_at: string;
  ran_at: string;
  route_id: string | null;
  distance_km: number;
  duration_sec: number;
  avg_pace_sec_per_km: number | null;
  title: string | null;
  notes: string | null;
  visibility?: RunVisibility;
  liked: boolean | null;
  feedback_tags: string[];
  new_records?: NewRecord[];
};

export type RunVisibility = 'public' | 'followers' | 'private';

/** One raw GPS fix, per the guide's gps_track 규약 (batch upload at save). */
export type GpsPoint = {
  lat: number;
  lng: number;
  t: number;    // epoch ms
  acc?: number; // horizontalAccuracy m — "강력 권장"
  alt?: number; // altitude m — feeds the elevation chart
};

export type SaveRunInput = {
  distanceKm: number;
  durationSec: number;
  avgPaceSecPerKm: number | null;
  routeId?: string | null; // course runs link the copied route's id
  title?: string | null;      // ≤60 (BE 2af3715)
  notes?: string | null;      // 개인 메모, ≤2000
  visibility?: RunVisibility; // default public
  /** ≤50자 지역명 (guide §96, front-sent — Apple subLocality ⓑ verdict);
      best-effort: absent → 지역 라인 hidden, never blocks a save. */
  area?: string | null;
  /** RAW received fixes (owner decision 2026-07-08) — the server filters
      independently; layer attribution needs what the client filter saw. */
  gpsTrack?: GpsPoint[];
};

// Contract hard cap: >5,000 points → 422. Uniform stride keeps the shape
// without client-side distance math.
const GPS_TRACK_MAX_POINTS = 5000;
function thinTrack(track: GpsPoint[]): GpsPoint[] {
  if (track.length <= GPS_TRACK_MAX_POINTS) return track;
  const stride = Math.ceil(track.length / GPS_TRACK_MAX_POINTS);
  return track.filter((_, i) => i % stride === 0);
}

// Server FeedbackTag enum — the single source of truth for the vocabulary
// (backend schemas.py POSITIVE_TAGS / NEGATIVE_TAGS).
export const POSITIVE_TAGS = ['경치좋음', '노면좋음', '평탄함', '한적함', '적당한거리'] as const;
export const NEGATIVE_TAGS = ['오르막많음', '신호등많음', '노면나쁨', '사람많음', '너무김', '너무짧음'] as const;

/** 저장 후 편집 (BE RunUpdate, probed 2026-07-15): partial — sent fields
    only; 거리·시간 불변; non-owner → 404 (hidden). List rows reflect the
    edit server-side immediately (focus-refetch picks it up). photos paths
    must be {run_id}/-prefixed (422 otherwise); order = display order. */
export function updateRun(
  runId: string,
  patch: { title?: string; visibility?: RunVisibility; notes?: string | null; photos?: string[] },
): Promise<void> {
  return apiFetch<void>(`/api/runs/${runId}`, { method: 'PATCH', body: patch });
}

export function saveRun(input: SaveRunInput): Promise<SavedRun> {
  // Send-side t sanitizer: heals tracks persisted before the capture-side
  // round (pending-run disk copies) and any other float leakage — the
  // contract's t is integer epoch ms (422 int_from_float otherwise).
  const track = input.gpsTrack && input.gpsTrack.length >= 2
    ? thinTrack(input.gpsTrack).map(p => ({ ...p, t: Math.round(p.t) }))
    : null;
  return apiFetch<SavedRun>('/api/runs', {
    method: 'POST',
    body: {
      route_id: input.routeId ?? null,
      distance_km: Math.round(input.distanceKm * 100) / 100,
      duration_sec: input.durationSec,
      avg_pace_sec_per_km: input.avgPaceSecPerKm,
      title: input.title ?? null,
      notes: input.notes ?? null,
      visibility: input.visibility ?? 'public',
      ...(input.area ? { area: input.area.slice(0, 50) } : {}),
      // Track-less saves stay contract-identical to the old manual path
      ...(track ? { gps_track: track } : {}),
    },
  });
}

export function submitFeedback(runId: string, liked: boolean, tags: string[]): Promise<SavedRun> {
  return apiFetch<SavedRun>(`/api/runs/${runId}/feedback`, {
    method: 'PATCH', // per docs/API_GUIDE.md — was wrongly POST (405) until 2026-07-05
    body: { liked, tags },
  });
}
