// 배틀 API — server contract API_GUIDE §배틀 (BE 7bc2e4f, 2026-09-07; 8
// endpoints live). Redesign item 8a (2026-11-21) wires the READ side (list +
// detail); create/accept/decline/forfeit/cancel ride 8b. Mirrors
// app/models/schemas.py BattleResponse field-for-field.
import { apiFetch } from '@/lib/api';

export type BattleStatus = 'pending' | 'active' | 'ended' | 'cancelled' | 'forfeited';

export type BattleParticipantScore = {
  user_id: string;
  score: number;
  streak_multiplier: number;
  breakdown: Record<string, number> | null;
};

export type BattleRunItem = {
  run_id: string;
  user_id: string;
  counted: boolean;
  run_score: number;
  breakdown: Record<string, number> | null;
  attributed_at: string | null;
};

export type Battle = {
  id: string;
  created_by: string;
  opponent: string;
  title: string;
  emoji: string | null;
  format: string;           // 'points' (only format today)
  metric: string;           // 'distance_km'
  duration_days: number;
  status: BattleStatus;
  started_at: string | null;
  ends_at: string | null;
  settled_at: string | null;
  winner: string | null;
  created_at: string | null;
  invite_expires_at?: string | null; // pending, detail
  scores?: BattleParticipantScore[] | null; // detail
  runs?: BattleRunItem[] | null;            // detail
};

/** My battles (participant only), newest first. Probed 2026-11-21 as test1: [] for all statuses. */
export function listBattles(status?: 'active' | 'pending' | 'ended'): Promise<Battle[]> {
  return apiFetch<Battle[]>(`/api/battles${status ? `?status=${status}` : ''}`);
}

/** Detail — scores + runs (participant only; others 404). */
export function getBattle(id: string): Promise<Battle> {
  return apiFetch<Battle>(`/api/battles/${id}`);
}

/** Days left on an active battle (ceil; 0 once ended). */
export function battleDaysLeft(b: Battle, now = Date.now()): number {
  if (!b.ends_at) return 0;
  return Math.max(0, Math.ceil((Date.parse(b.ends_at) - now) / 86_400_000));
}
