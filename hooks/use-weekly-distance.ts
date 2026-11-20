// 최근 N주 주간 거리 — MY › 통계 탭의 12주 바 차트 소스 (redesign 2a, 2026-11-19).
//
// The server has NO weekly series endpoint (probed 2026-11-19: /me/stats/weekly
// 404 — 지연 ask ② on the ledger). Derivation: GET /me/stats/monthly for every
// month the window touches (≤4 calls, parallel), then bucket its `days[]`
// (KST calendar dates, runs-only) into KST Monday-start weeks — the same week
// definition the server uses for `GET /me/stats` `week` and the insight
// `weeks[]`, so the last bucket agrees with the server's this-week number.
// When ask ② lands, swap the fetch and keep the `WeekBucket` shape.

import { useCallback, useEffect, useRef, useState } from 'react';

import { getMonthlyStats, type MonthlyStats } from '@/lib/stats-api';

export type WeekBucket = {
  /** Monday, KST calendar date (YYYY-MM-DD) */
  start: string;
  year: number;
  month: number; // 1-12, of the Monday
  distanceKm: number;
  runCount: number;
};

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3_600_000;

/** Today's KST calendar date as a UTC-midnight Date (calendar arithmetic only). */
export function kstTodayUtc(now = Date.now()): Date {
  const k = new Date(now + KST_OFFSET_MS);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()));
}

/** Monday on/before the given UTC-midnight calendar date. */
export function mondayOf(d: Date): Date {
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return new Date(d.getTime() - dow * DAY_MS);
}

export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Pure bucketing — exported for the desk proof. `days` are KST YYYY-MM-DD. */
export function bucketWeeks(
  days: { date: string; distance_km: number; run_count: number }[],
  weeks: number,
  now = Date.now(),
): WeekBucket[] {
  const currentStart = mondayOf(kstTodayUtc(now));
  const firstStart = new Date(currentStart.getTime() - (weeks - 1) * 7 * DAY_MS);
  const out: WeekBucket[] = [];
  for (let i = 0; i < weeks; i++) {
    const s = new Date(firstStart.getTime() + i * 7 * DAY_MS);
    out.push({ start: dateKey(s), year: s.getUTCFullYear(), month: s.getUTCMonth() + 1, distanceKm: 0, runCount: 0 });
  }
  for (const d of days) {
    const t = Date.UTC(Number(d.date.slice(0, 4)), Number(d.date.slice(5, 7)) - 1, Number(d.date.slice(8, 10)));
    const idx = Math.floor((t - firstStart.getTime()) / (7 * DAY_MS));
    if (idx < 0 || idx >= weeks) continue;
    out[idx].distanceKm += d.distance_km;
    out[idx].runCount += d.run_count;
  }
  return out;
}

/** (year, month) pairs the window touches, oldest first. */
export function monthsInWindow(weeks: number, now = Date.now()): { year: number; month: number }[] {
  const currentStart = mondayOf(kstTodayUtc(now));
  const firstStart = new Date(currentStart.getTime() - (weeks - 1) * 7 * DAY_MS);
  const today = kstTodayUtc(now);
  const res: { year: number; month: number }[] = [];
  let y = firstStart.getUTCFullYear(), m = firstStart.getUTCMonth() + 1;
  while (y < today.getUTCFullYear() || (y === today.getUTCFullYear() && m <= today.getUTCMonth() + 1)) {
    res.push({ year: y, month: m });
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return res;
}

export function useWeeklyDistance(weeks = 12) {
  const [buckets, setBuckets] = useState<WeekBucket[]>(() => bucketWeeks([], weeks));
  const [monthly, setMonthly] = useState<Record<string, MonthlyStats>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<Record<string, MonthlyStats>>({});

  const refetch = useCallback(async () => {
    const months = monthsInWindow(weeks);
    try {
      const results = await Promise.all(months.map(({ year, month }) => getMonthlyStats(year, month)));
      const next: Record<string, MonthlyStats> = {};
      for (const r of results) next[`${r.year}-${r.month}`] = r;
      cacheRef.current = { ...cacheRef.current, ...next };
      setMonthly({ ...cacheRef.current });
      setBuckets(bucketWeeks(results.flatMap(r => r.days), weeks));
      setError(null);
    } catch (e) {
      // cached buckets stand (quiet) — same posture as records' month stats
      setError(e instanceof Error ? e.message : 'failed');
    } finally {
      setLoading(false);
    }
  }, [weeks]);

  useEffect(() => { void refetch(); }, [refetch]);

  return { buckets, monthly, loading, error, refetch };
}
