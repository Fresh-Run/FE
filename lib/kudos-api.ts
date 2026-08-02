// Run kudos — who-liked list (GET /runs/{id}/kudos, probed 2026-07-07).
// Historical split: lived apart from runs-api during the item-17 lock (long
// resolved); kept separate as-is — merging is cosmetic. Self-kudos is live
// (the 400 lifted server-side 7/30 v120; K2 restore 8/8) — every surface
// carries the POST/DELETE toggle; this module stays the read half.
import { apiFetch } from '@/lib/api';

export type RunKudoser = {
  user_id: string;
  nickname: string;
  avatar_url: string | null;
  created_at: string;
};

export function getRunKudos(runId: string): Promise<RunKudoser[]> {
  return apiFetch<RunKudoser[]>(`/api/runs/${runId}/kudos`);
}
