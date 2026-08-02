// Run social surface — kudos toggle, comments CRUD, track fetch (R3').
// Historical split: lived apart from runs-api during the item-17 lock (long
// resolved; same note in kudos-api.ts) — kept separate as-is, merging is
// cosmetic.
// Endpoints probed live 2026-07-10/11: comments GET/POST visibility-gated
// (200 for a feed-visible run as non-owner), kudos POST/DELETE idempotent,
// GET /runs/{id}/track open per the 4cd5685 contract (public/followers;
// out-of-scope or trackless → 404).

import { apiFetch } from '@/lib/api';
import type { TrackPoint } from '@/types';

export type RunComment = {
  id: string;
  run_id: string;
  user_id: string;
  nickname: string | null;
  avatar_url: string | null; // BE 5009cbe (avatar wire-up)
  content: string;
  created_at: string;
  /** 답글 (her 8/4 additive, contract LOCKED): null = top-level; one-level
      enforced server-side (reply-to-reply → 422 reply_depth_exceeded). */
  parent_comment_id: string | null;
};

export type RunTrack = {
  /** carries alt (her ③, 0.1m rounds) — TrackPoint widening 8/8 */
  polyline: TrackPoint[];
  server_distance_km: number | null;
  elev_gain_m: number | null;
  point_count_raw: number | null;
  point_count_kept: number | null;
};

/** Flat list + parent refs (contract): limit/offset live server-side —
    consumed since the reply slice (page-1-only died with the thread hazard). */
export function getRunComments(runId: string, limit = 20, offset = 0): Promise<RunComment[]> {
  return apiFetch<RunComment[]>(`/api/runs/${runId}/comments?limit=${limit}&offset=${offset}`);
}

/** Own comments only (server-enforced; others' → 404). */
export function deleteRunComment(runId: string, commentId: string): Promise<void> {
  return apiFetch<void>(`/api/runs/${runId}/comments/${commentId}`, { method: 'DELETE' });
}

export function postRunComment(runId: string, content: string, parentCommentId: string | null = null): Promise<RunComment> {
  return apiFetch<RunComment>(`/api/runs/${runId}/comments`, {
    method: 'POST',
    body: { content, ...(parentCommentId ? { parent_comment_id: parentCommentId } : {}) },
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
