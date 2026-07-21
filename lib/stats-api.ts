// 월 선택 통계 — GET /me/stats/monthly?year&month (guide §94, probed live
// 2026-07-15). Server-computed month aggregates + per-day breakdown; the
// authoritative source since cursor pagination made client aggregation
// quietly wrong past page one.

import { apiFetch } from '@/lib/api';

export type PeriodStats = {
  total_distance_km: number;
  run_count: number;
  total_duration_sec: number;
  avg_pace_sec_per_km: number | null;
  longest_run_km: number | null;
  /** km vs the previous month; null = no prior data. Previous month total
      = total_distance_km - delta (for % rendering). */
  delta_distance_km: number | null;
};

export type DailyRunStat = {
  date: string; // YYYY-MM-DD, KST
  distance_km: number;
  run_count: number;
};

export type MonthlyStats = {
  year: number;
  month: number;
  stats: PeriodStats;
  /** Days WITH runs only, ascending. */
  days: DailyRunStat[];
};

export function getMonthlyStats(year: number, month: number): Promise<MonthlyStats> {
  return apiFetch<MonthlyStats>(`/api/me/stats/monthly?year=${year}&month=${month}`);
}

// ─── 전체 통계 — GET /me/stats (B2, probed live 2026-07-14) ───────────────────
// week/month/all_time aggregates + records. 수고했어요's comparison rows:
// fetched AFTER the save lands, so counts include the run just saved.
export type StatsRecord = { value: number; run_id: string; ran_at: string; distance_km: number };
export type MyStats = {
  week: PeriodStats & { avg_pace_sec_per_km: number | null };
  month: PeriodStats & { avg_pace_sec_per_km: number | null };
  all_time: PeriodStats & { avg_pace_sec_per_km: number | null };
  records: {
    best_pace: StatsRecord | null;
    best_5k: StatsRecord | null;
    longest_distance: StatsRecord | null;
    longest_duration: StatsRecord | null;
  };
};

export function getMyStats(): Promise<MyStats> {
  return apiFetch<MyStats>('/api/me/stats');
}

// ─── 코스-런 비율 — GET /stats/course-run-share (funnel v1, 2026-07-21) ────────
// The endpoint DOES NOT EXIST YET — ask drafted, goes to 지연 verbatim on the
// owner's send (live-probed 404 at build time). Consumption built AHEAD per
// owner ruling: any failure/absence → null → the social-proof line renders
// NOTHING. No fake numbers, ever — the line appears when her endpoint lands.
export type CourseRunShare = {
  scope: 'global' | 'me';
  window_days: number;
  total_runs: number;
  course_runs: number;
  /** null when total_runs is below the server threshold (thin-window guard). */
  share: number | null;
};

/** Below this the line is anti-proof ("러너 12%가…" argues AGAINST courses) —
    hidden client-side even if the server ships a number. */
export const SHARE_FLOOR = 0.2;

/** Global course-run share for nudge copy — null means "render nothing"
    (endpoint absent, request failed, thin window, or below the floor). */
export async function getCourseRunShare(windowDays = 30): Promise<number | null> {
  try {
    const r = await apiFetch<CourseRunShare>(
      `/api/stats/course-run-share?window_days=${windowDays}&scope=global`,
    );
    return r.share != null && r.share >= SHARE_FLOOR ? r.share : null;
  } catch {
    return null;
  }
}
