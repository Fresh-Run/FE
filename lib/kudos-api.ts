// Run kudos — who-liked list (GET /runs/{id}/kudos, probed 2026-07-07).
// Lives apart from lib/runs-api.ts on purpose: that file is item-17-locked
// uncommitted and this slice commits alone. Self-kudos is a server 400, so
// own-profile surfaces only ever read; POST/DELETE wiring belongs to the
// future other-user/feed contexts.
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
