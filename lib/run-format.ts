export function fmtPace(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}'${String(s).padStart(2, '0')}"`;
}

// ─── Unit-aware display formatting (단위 setting) ─────────────────────────────
// Pure and unit-parameterized: callers pass settings.units. Internal values
// stay km everywhere (backend fields, gates, aggregation) — conversion happens
// only at these format calls.

export type Units = 'km' | 'mi';

export const KM_PER_MI = 1.609344;
const MI_PER_KM = 0.621371;

/** Distance for display: km in → formatted number in the selected unit. */
export function fmtDist(km: number, units: Units, dp: number): string {
  return (units === 'mi' ? km * MI_PER_KM : km).toFixed(dp);
}

export function distUnit(units: Units): string {
  return units === 'mi' ? 'mi' : 'km';
}

/** Pace for display: sec/km in → 5'20" string in the selected unit. */
export function fmtPaceIn(secPerKm: number, units: Units): string {
  return fmtPace(units === 'mi' ? secPerKm / MI_PER_KM : secPerKm);
}

export function paceUnit(units: Units): string {
  return units === 'mi' ? '/mi' : '/km';
}

export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtDate(isoStr: string): string {
  const d = new Date(isoStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const runDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (runDay.getTime() === today.getTime()) return '오늘';
  if (runDay.getTime() === yesterday.getTime()) return '어제';
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function fmtAgo(isoStr: string): string {
  const min = Math.floor((Date.now() - new Date(isoStr).getTime()) / 60_000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  return fmtDate(isoStr);
}

export function fmtWhen(isoStr: string): string {
  const d = new Date(isoStr);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${fmtDate(isoStr)} · ${hh}:${mm}`;
}

// ─── Course preview stats (bundle: frCourseStats) ─────────────────────────────

export type CourseStatsInput = {
  dist?: number | string;
  pace?: string;
  dur?: string;
  area?: string;
  tags?: string[];
  title?: string;
  seed?: string;
  name?: string;
};

/** Assumed pace when a course card carries no pace/duration (e.g. 인기 코스). */
const EST_PACE_SEC_PER_KM = 320;

export function courseStats(item: CourseStatsInput) {
  const dist = Number(item.dist) || 0;
  const pace = item.pace ?? fmtPace(EST_PACE_SEC_PER_KM);
  const dur  = item.dur  ?? fmtDuration(Math.round(dist * EST_PACE_SEC_PER_KM));
  return {
    dist,
    pace,
    dur,
    area:  item.area ?? '서울',
    tags:  item.tags ?? [],
    title: item.title,
    seed:  item.seed,
    name:  item.name,
  };
}

export function timeTitle(isoStr: string): string {
  const h = new Date(isoStr).getHours();
  if (h >= 4  && h < 10) return '아침 러닝';
  if (h >= 10 && h < 12) return '오전 러닝';
  if (h >= 12 && h < 14) return '점심 러닝';
  if (h >= 14 && h < 18) return '오후 러닝';
  if (h >= 18 && h < 21) return '저녁 러닝';
  return '야간 러닝';
}
