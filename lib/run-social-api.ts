// Run social surface — kudos toggle, comments CRUD, track fetch (R3').
// Lives apart from lib/runs-api.ts on purpose (same rationale as
// kudos-api.ts): that file is item-17-locked uncommitted; this commits alone.
// Endpoints probed live 2026-07-10/11: comments GET/POST visibility-gated
// (200 for a feed-visible run as non-owner), kudos POST/DELETE idempotent,
// GET /runs/{id}/track open per the 4cd5685 contract (public/followers;
// out-of-scope or trackless → 404).

import { apiFetch } from '@/lib/api';
import type { Coordinate } from '@/types';

export type RunComment = {
  id: string;
  run_id: string;
  user_id: string;
  nickname: string | null;
  avatar_url: string | null; // BE 5009cbe (avatar wire-up)
  content: string;
  created_at: string;
};

export type RunTrack = {
  polyline: Coordinate[];
  server_distance_km: number | null;
  elev_gain_m: number | null;
  point_count_raw: number | null;
  point_count_kept: number | null;
};

export function getRunComments(runId: string): Promise<RunComment[]> {
  return apiFetch<RunComment[]>(`/api/runs/${runId}/comments`);
}

/** Own comments only (server-enforced; others' → 404). */
export function deleteRunComment(runId: string, commentId: string): Promise<void> {
  return apiFetch<void>(`/api/runs/${runId}/comments/${commentId}`, { method: 'DELETE' });
}

export function postRunComment(runId: string, content: string): Promise<RunComment> {
  return apiFetch<RunComment>(`/api/runs/${runId}/comments`, {
    method: 'POST',
    body: { content },
  });
}

export function kudosRun(runId: string): Promise<void> {
  return apiFetch<void>(`/api/runs/${runId}/kudos`, { method: 'POST' });
}

export function unkudosRun(runId: string): Promise<void> {
  return apiFetch<void>(`/api/runs/${runId}/kudos`, { method: 'DELETE' });
}

export function getRunTrack(runId: string): Promise<RunTrack> {
  return apiFetch<RunTrack>(`/api/runs/${runId}/track`);
}
