// AI 월간 인사이트 (프리미엄) — GET /me/insights/monthly?year&month.
// Staging-probed 2026-07-08: full shape below; free tier → 403
// {error: premium_required, feature: monthly_insight}; month outside
// 1–12 → 422 (guarded client-side too); zero-run month → ai: null.
// Premium-gated but UNMETERED (not in the ai_generation quota family);
// the ai block is server-cached and follows settings.lang.
import { apiFetch } from '@/lib/api';

export type InsightStats = {
  run_count: number;
  total_distance_km: number;
  total_duration_sec: number;
  avg_pace_sec_per_km: number | null;
  longest_run_km: number;
  delta_distance_km: number | null; // vs previous month; null = no prior data
};

export type InsightWeek = {
  index: number; // KST Monday weeks, empty weeks included
  distance_km: number;
  run_count: number;
  avg_pace_sec_per_km: number | null;
};

export type InsightRecord = {
  type: 'best_pace' | 'best_5k' | 'longest_distance' | 'longest_duration';
  value: number;
  ran_at: string;
  distance_km: number;
  all_time_best: boolean; // the 시안's up-arrow
};

export type InsightPattern = {
  weekday_counts: number[]; // 월~일
  time_of_day: 'dawn' | 'morning' | 'day' | 'evening' | 'night';
  time_of_day_pct: number;
  longest_streak_days: number;
};

export type InsightPlanItem = {
  slot: 'goal' | 'focus' | 'challenge';
  title: string;
  body: string;
};

export type PaceTrendPoint = {
  year: number;
  month: number;
  /** null = no runs that month → line GAP, never zero (guide §127). */
  avg_pace_sec_per_km: number | null;
};

export type MonthlyInsight = {
  year: number;
  month: number;
  stats: InsightStats;
  weeks: InsightWeek[];
  records: InsightRecord[];
  pattern: InsightPattern;
  /** 최근 3개월 (조회 월 포함, 오래된 달부터; BE 9e61bef) — last point ==
      stats.avg_pace_sec_per_km by contract. */
  pace_trend: PaceTrendPoint[];
  // NOTE (2026-07-09, owner + backend decision): the ai block is typed
  // because the server still sends it, but the app deliberately renders
  // NONE of it (coaching card + 추천 플랜 removed from the report screen;
  // replacement content is slice I2). null on a zero-run month.
  ai: {
    coaching: string;
    plan: InsightPlanItem[];
    from_cache: boolean;
    generated_at: string;
  } | null;
};

export function getMonthlyInsight(year: number, month: number): Promise<MonthlyInsight> {
  if (month < 1 || month > 12) {
    return Promise.reject(new Error('유효하지 않은 월이에요')); // server would 422
  }
  return apiFetch<MonthlyInsight>(`/api/me/insights/monthly?year=${year}&month=${month}`);
}
