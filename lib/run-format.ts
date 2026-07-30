import { getLang, tIn, tfIn } from '@/lib/i18n';

/** Locale-branching formatters take an explicit lang so render call sites can
    pass the reactive value (useLang) — the React Compiler caches expressions
    on visible args only, so an internal getLang() read is an invisible dep
    and the cached string survives a language flip (run-card bug, 2026-08-03).
    The default keeps imperative callers (alerts, share text, cues) fresh at
    event time with zero churn. */
export type Lang = 'ko' | 'en';

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

// i18n slice 1: locale-aware date words (en month names local to the
// formatter — formats are formatter business, words come from the dicts)
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(isoStr: string, lang: Lang = getLang()): string {
  const d = new Date(isoStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const runDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (runDay.getTime() === today.getTime()) return tIn(lang, 'date.today');
  if (runDay.getTime() === yesterday.getTime()) return tIn(lang, 'date.yesterday');
  return lang === 'en'
    ? `${MONTHS_EN[d.getMonth()]} ${d.getDate()}`
    : `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function fmtAgo(isoStr: string, lang: Lang = getLang()): string {
  // i18n 4d: locale-aware (fmtDate precedent) — this renders on FIVE
  // surfaces incl. four converted ones; words come from the dicts
  const min = Math.floor((Date.now() - new Date(isoStr).getTime()) / 60_000);
  if (min < 1) return tIn(lang, 'date.justNow');
  if (min < 60) return tfIn(lang, 'date.minAgo', { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return tfIn(lang, 'date.hourAgo', { n: h });
  return fmtDate(isoStr, lang);
}

export function fmtWhen(isoStr: string, lang: Lang = getLang()): string {
  const d = new Date(isoStr);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${fmtDate(isoStr, lang)} · ${hh}:${mm}`;
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

// Canvas verdict 2026-07-07: 야간 owns deep night (canvas renders 야간 at
// 03:23); 새벽 is the early-dawn slot 04:00–06:59.
export function timeTitle(isoStr: string, lang: Lang = getLang()): string {
  const h = new Date(isoStr).getHours();
  if (h >= 4  && h < 7)  return tIn(lang, 'title.dawn');
  if (h >= 7  && h < 10) return tIn(lang, 'title.morning');
  if (h >= 10 && h < 12) return tIn(lang, 'title.forenoon');
  if (h >= 12 && h < 14) return tIn(lang, 'title.lunch');
  if (h >= 14 && h < 18) return tIn(lang, 'title.afternoon');
  if (h >= 18 && h < 21) return tIn(lang, 'title.evening');
  return tIn(lang, 'title.night');
}
