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
