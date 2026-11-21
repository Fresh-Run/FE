// 배틀 API — server contract API_GUIDE §배틀 (BE 7bc2e4f, 2026-09-07; 8
// endpoints live; probed 2026-11-21). Mirrors app/models/schemas.py
// BattleResponse field-for-field. Redesign item 8b (2026-11-21) = the real
// wire-in (the 2026-08/09 mock store is retired with it).
import { apiFetch } from '@/lib/api';

export type BattleStatus = 'pending' | 'active' | 'ended' | 'cancelled' | 'forfeited';

/** = BattleRunItem.breakdown keys (API_GUIDE 점수식). */
export type BattleRunBreakdown = { base: number; completion: number; pace: number; early_bird: number; milestone: number };

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
  breakdown: Partial<BattleRunBreakdown> | null;
  attributed_at: string | null; // = runs.ran_at (design Q4)
  // NOTE: no distance_km on the server item (2026-11-21) — the run row shows
  // the score only; a km column = 지연 ask (ledgered, NOT DECIDED).
};

export type Battle = {
  id: string;
  created_by: string;
  opponent: string;        // user_id — nickname/avatar joined client-side (store)
  title: string;
  emoji: string | null;
  format: string;          // 'points' (the only format today — owner: points as the score)
  metric: string;          // 'distance_km'
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

/** 배틀 이모지 — 큐레이션 12종 (9/5 오너 룰링; no free input = moderation-free). */
export const BATTLE_EMOJIS = ['⚡', '🔥', '🏃', '💨', '🏆', '🎯', '👟', '💪', '🚀', '🌅', '⛰️', '🐢'] as const;
export const DEFAULT_BATTLE_EMOJI = '⚡';
export const BATTLE_DAYS_MIN = 1;
export const BATTLE_DAYS_MAX = 30; // server bound (duration_days 1~30)

// ─── endpoints ────────────────────────────────────────────────────────────────

/** My battles (participant only), newest first. */
export function listBattles(status?: 'active' | 'pending' | 'ended'): Promise<Battle[]> {
  return apiFetch<Battle[]>(`/api/battles${status ? `?status=${status}` : ''}`);
}
/** Detail — scores + runs (participant only; others 404). */
export function getBattle(id: string): Promise<Battle> {
  return apiFetch<Battle>(`/api/battles/${id}`);
}
/** Create + invite. 403 battle_free_limit · 409 battle_active_cap · 404 (blocked/private opponent, hidden). */
export function createBattle(input: { opponent_id: string; title: string; emoji?: string; duration_days: number }): Promise<Battle> {
  return apiFetch<Battle>('/api/battles', { method: 'POST', body: input });
}
/** Invitee only, before expiry. 410 battle_invite_expired. */
export function acceptBattle(id: string): Promise<Battle> {
  return apiFetch<Battle>(`/api/battles/${id}/accept`, { method: 'POST' });
}
export function declineBattle(id: string): Promise<void> {
  return apiFetch<void>(`/api/battles/${id}/decline`, { method: 'POST' });
}
/** Immediate loss; the opponent keeps their points. */
export function forfeitBattle(id: string): Promise<void> {
  return apiFetch<void>(`/api/battles/${id}/forfeit`, { method: 'POST' });
}
/** Mutual cancel (v0: the server cancels on one request — the agreement is app UX). */
export function cancelBattle(id: string): Promise<void> {
  return apiFetch<void>(`/api/battles/${id}/cancel`, { method: 'POST' });
}

// ─── derived views (client-side, never sent) ──────────────────────────────────

export const DAY_MS = 86_400_000;
/** Days left on an active battle (ceil; 0 once ended). */
export function battleDaysLeft(b: Battle, now = Date.now()): number {
  if (!b.ends_at) return 0;
  return Math.max(0, Math.ceil((Date.parse(b.ends_at) - now) / DAY_MS));
}
export const isDone = (b: Battle) => b.status === 'ended' || b.status === 'forfeited' || b.status === 'cancelled';
/** UI-only 정산 중: active past ends_at with no settled_at (settling is a timestamp, not a status). */
export const isSettling = (b: Battle, now = Date.now()) =>
  b.status === 'active' && !!b.ends_at && Date.parse(b.ends_at) <= now && !b.settled_at;
export const opponentIdOf = (b: Battle, me: string | undefined) => (b.created_by === me ? b.opponent : b.created_by);
export const scoreOf = (b: Battle, uid: string | undefined) => b.scores?.find(s => s.user_id === uid)?.score ?? 0;
export function outcomeOf(b: Battle, me: string | undefined): 'won' | 'lost' | 'draw' | null {
  if (!isDone(b)) return null;
  if (b.winner && b.winner === me) return 'won';
  if (b.winner && b.winner !== me) return 'lost';
  return 'draw';
}
/** KST date key (YYYY-MM-DD). */
export function kstDateKey(iso: string): string {
  return new Date(Date.parse(iso) + 9 * 3_600_000).toISOString().slice(0, 10);
}
/** KST M/D */
export function fmtKst(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(Date.parse(iso) + 9 * 3_600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}
export type DailyRow = { dateKey: string; dayIndex: number; me: { runs: number; pts: number }; opp: { runs: number; pts: number } };
/** Daily breakdown — runs grouped by attributed_at KST date (derived; the server has no daily field). */
export function dailyBreakdown(b: Battle, me: string | undefined): DailyRow[] {
  if (!b.started_at || !b.runs) return [];
  const startMs = Date.parse(kstDateKey(b.started_at) + 'T00:00:00+09:00');
  const map = new Map<string, DailyRow>();
  for (const r of b.runs) {
    if (!r.attributed_at) continue;
    const key = kstDateKey(r.attributed_at);
    const dayIndex = Math.floor((Date.parse(key + 'T00:00:00+09:00') - startMs) / DAY_MS) + 1;
    if (dayIndex < 1 || dayIndex > b.duration_days) continue;
    const row = map.get(key) ?? { dateKey: key, dayIndex, me: { runs: 0, pts: 0 }, opp: { runs: 0, pts: 0 } };
    const side = r.user_id === me ? row.me : row.opp;
    if (r.counted) { side.runs += 1; side.pts += r.run_score; }
    map.set(key, row);
  }
  return [...map.values()].sort((a, c) => a.dayIndex - c.dayIndex);
}
/** Pace-bonus total + benefiting run count (settle screen). */
export function paceBonusOf(b: Battle, uid: string | undefined): { pts: number; runs: number } {
  let pts = 0, runs = 0;
  for (const r of b.runs ?? []) {
    if (r.user_id !== uid || !r.counted) continue;
    const p = r.breakdown?.pace ?? 0;
    if (p > 0) { pts += p; runs += 1; }
  }
  return { pts, runs };
}
