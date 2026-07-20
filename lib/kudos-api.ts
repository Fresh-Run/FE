// Run kudos — who-liked list (GET /runs/{id}/kudos, probed 2026-07-07).
// Historical split: lived apart from runs-api during the item-17 lock (long
// resolved); kept separate as-is — merging is cosmetic. Self-kudos is a
// server 400, so own-profile surfaces only ever read; the feed/run-post
// contexts carry the POST/DELETE toggle (run-social-api).
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
