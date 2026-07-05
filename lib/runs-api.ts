// Run save + feedback — POST /api/runs, POST /api/runs/{id}/feedback.
// Shapes mirror the backend's RunRequest / RunResponse / FeedbackRequest.

import { apiFetch } from '@/lib/api';

export type SavedRun = {
  id: string;
  created_at: string;
  ran_at: string;
  route_id: string | null;
  distance_km: number;
  duration_sec: number;
  avg_pace_sec_per_km: number | null;
  notes: string | null;
  liked: boolean | null;
  feedback_tags: string[];
};

export type SaveRunInput = {
  distanceKm: number;
  durationSec: number;
  avgPaceSecPerKm: number | null;
};

// Server FeedbackTag enum — the single source of truth for the vocabulary
// (backend schemas.py POSITIVE_TAGS / NEGATIVE_TAGS).
export const POSITIVE_TAGS = ['경치좋음', '노면좋음', '평탄함', '한적함', '적당한거리'] as const;
export const NEGATIVE_TAGS = ['오르막많음', '신호등많음', '노면나쁨', '사람많음', '너무김', '너무짧음'] as const;

export function saveRun(input: SaveRunInput): Promise<SavedRun> {
  // SEAM (path upload): when the backend's RunRequest grows a path/polyline
  // field, send the recorded path (store/pending-run.ts carries it) here.
  return apiFetch<SavedRun>('/api/runs', {
    method: 'POST',
    body: {
      route_id: null, // free run
      distance_km: Math.round(input.distanceKm * 100) / 100,
      duration_sec: input.durationSec,
      avg_pace_sec_per_km: input.avgPaceSecPerKm,
      notes: null,
    },
  });
}

export function submitFeedback(runId: string, liked: boolean, tags: string[]): Promise<SavedRun> {
  return apiFetch<SavedRun>(`/api/runs/${runId}/feedback`, {
    method: 'PATCH', // per docs/API_GUIDE.md — was wrongly POST (405) until 2026-07-05
    body: { liked, tags },
  });
}
