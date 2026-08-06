import { getLang, tIn, tfIn, type StringKey } from '@/lib/i18n';

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
// formatter — formats are formatter business, words come from the dicts).
// 8/6 CONSOLIDATION (class audit #6): this file is THE date-words home —
// MONTHS_EN ×3 copies, weekday arrays ×5 files, and hand-rolled M월 D일
// formatting merged here. Two weekday key FAMILIES exist BY DESIGN (day.* =
// full 일요일, dayS.* = short 일 — granularities, not divergence).
export const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DAY_KEYS_FULL = ['day.sun', 'day.mon', 'day.tue', 'day.wed', 'day.thu', 'day.fri', 'day.sat'] as const;
export const DAY_KEYS_SHORT = ['dayS.sun', 'dayS.mon', 'dayS.tue', 'dayS.wed', 'dayS.thu', 'dayS.fri', 'dayS.sat'] as const;
/** Mon-first variant — weekly-chart order (monthly-insight), NOT getDay-indexed. */
export const DAY_KEYS_SHORT_MON = ['dayS.mon', 'dayS.tue', 'dayS.wed', 'dayS.thu', 'dayS.fri', 'dayS.sat', 'dayS.sun'] as const;
/** SERVER day values ('월'…) → short-key map (crew world's sentinel values). */
export const DAY_LABEL_KEY: Record<string, (typeof DAY_KEYS_SHORT)[number]> = {
  '월': 'dayS.mon', '화': 'dayS.tue', '수': 'dayS.wed', '목': 'dayS.thu', '금': 'dayS.fri', '토': 'dayS.sat', '일': 'dayS.sun',
};

/** M월 D일 / Mon D — the one month-day composer (Date-taking twin of
    fmtDateAbs; merged from index/announcements hand-rolls). */
export function fmtMonthDay(d: Date, lang: Lang = getLang(), style?: 'numeric'): string {
  if (lang === 'en') {
    return style === 'numeric' ? `${d.getMonth() + 1}/${d.getDate()}` : `${MONTHS_EN[d.getMonth()]} ${d.getDate()}`;
  }
  return `${d.getMonth() + 1}월 ${d.getDate()}일`; // ko: one shape, style-independent
}

/** M월 D일 [(요일)] HH:mm — the announcements-world stamp. weekday: 'short'
    adds the parenthesized short day (announcement-detail's shape);
    monthStyle: 'numeric' keeps the LIST's compact en `M/D` (merge finding:
    list and detail en shapes genuinely diverge — preserved, not unified). */
export function fmtMonthDayTime(d: Date, lang: Lang = getLang(), opts?: { weekday?: 'short'; monthStyle?: 'numeric' }): string {
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const md = fmtMonthDay(d, lang, opts?.monthStyle);
  const day = opts?.weekday === 'short' ? ` (${tIn(lang, DAY_KEYS_SHORT[d.getDay()])})` : '';
  return `${md}${day} ${hm}`;
}

/** Duration in WORDS with HOUR FOLDING (8/6 ruling — the TTS improvement
    candidate promoted app-wide): ≥60min renders 1시간 1분 / 1 hour 1 minute,
    never 61분. en singulars handled; zero-components omitted (120m = 2시간 /
    2 hours, no dangling 0분). withSeconds = the spoken-cue grain. */
export function durationWords(totalSec: number, lang: Lang = getLang(), withSeconds = false): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const sec = Math.round(totalSec % 60);
  const parts: string[] = [];
  if (lang === 'en') {
    if (h > 0) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`);
    if (m > 0) parts.push(`${m} ${m === 1 ? 'minute' : 'minutes'}`);
    if (withSeconds && sec > 0) parts.push(`${sec} ${sec === 1 ? 'second' : 'seconds'}`);
    return parts.join(' ') || (withSeconds ? '0 seconds' : '0 minutes');
  }
  if (h > 0) parts.push(`${h}시간`);
  if (m > 0) parts.push(`${m}분`);
  if (withSeconds && sec > 0) parts.push(`${sec}초`);
  return parts.join(' ') || (withSeconds ? '0초' : '0분');
}

/** Keyed hour-fold for MINUTE-valued visual surfaces: ONE fold algorithm,
    per-surface copy families (crt.* / cp.* / home.aiEst* keep their own
    words — surface copy, not divergence; merge finding 8/6). Placeholder
    aliases n/m/min cover the families' historical names. */
export function foldMinutes(min: number, lang: Lang, keys: { min: StringKey; h: StringKey; hm: StringKey }): string {
  if (min < 60) return tfIn(lang, keys.min, { n: min, m: min, min });
  const h = Math.floor(min / 60), m = min % 60;
  return m === 0 ? tfIn(lang, keys.h, { h }) : tfIn(lang, keys.hm, { h, m });
}

/** Absolute month-day — NO 오늘/어제 relatives. Extracted 8/5 (session-
    folder fix): a folder name can't age out of truth. fmtDate delegates
    its tail here; existing callers unchanged. */
export function fmtDateAbs(isoStr: string, lang: Lang = getLang()): string {
  return fmtMonthDay(new Date(isoStr), lang); // 8/6: the iso-taking face of the one composer
}

export function fmtDate(isoStr: string, lang: Lang = getLang()): string {
  const d = new Date(isoStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const runDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (runDay.getTime() === today.getTime()) return tIn(lang, 'date.today');
  if (runDay.getTime() === yesterday.getTime()) return tIn(lang, 'date.yesterday');
  return fmtDateAbs(isoStr, lang);
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

export function courseStats(item: CourseStatsInput, lang: Lang = getLang()) {
  const dist = Number(item.dist) || 0;
  const pace = item.pace ?? fmtPace(EST_PACE_SEC_PER_KM);
  const dur  = item.dur  ?? fmtDuration(Math.round(dist * EST_PACE_SEC_PER_KM));
  return {
    dist,
    pace,
    dur,
    area:  item.area ?? tIn(lang, 'fmt.seoulFallback'), // slice 7: the seam-noted 서울 fallback
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
