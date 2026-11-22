// MY › 기록 탭 (redesign 2b, 2026-11-19) — canvas "MY 기록 — Figma 원본"
// (MyRecordOrig.dc.html): month header ("10월" · "6회 · 42.3 km") over a
// month-scoped card list (map thumb · title · date · 자유런/AI 코스 chip ·
// 거리/시간/페이스). Replaces the retired (tabs)/records screen.
//
// Month scoping is done honestly against the cursor-paginated list: the
// parent owns useRuns (shared with 게시물); this tab auto-pulls more pages
// until the oldest loaded run predates the selected month (or history ends),
// so a month is never half-shown from page one — the ledgered failure mode.
// Header numbers come from GET /me/stats/monthly (server truth), not from
// the list.
import { RouteMap } from '@/components/route-map';
import { dcGet } from '@/lib/data-cache';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { MonthPicker } from '@/components/month-picker';
import { SafeImage } from '@/components/safe-image';
import { Icon } from '@/components/ui';
import type { Run } from '@/hooks/use-runs';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { tfIn, useLang, useT, type StringKey } from '@/lib/i18n';
import { distUnit, fmtDist, fmtDuration, fmtMonthDayTime, fmtPaceIn, timeTitle } from '@/lib/run-format';
import { getMonthlyStats, type MonthlyStats } from '@/lib/stats-api';
import { isPlausibleTrack } from '@/lib/track-plausibility';
import { radius as R, shadows, spacing as S, type Tokens, DENSE_MAX_FONT_SCALE } from '@/lib/theme';
import { useSettings } from '@/store/use-settings';

const KST_OFFSET_MS = 9 * 3_600_000;
/** KST calendar (year, month) of an ISO instant — month buckets must match
    the server's KST monthly stats. */
export function kstYm(iso: string): { year: number; month: number } {
  const k = new Date(Date.parse(iso) + KST_OFFSET_MS);
  return { year: k.getUTCFullYear(), month: k.getUTCMonth() + 1 };
}

type RunList = {
  runs: Run[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
};

function RunCard({ run }: { run: Run }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  const lang = useLang();
  const units = useSettings(s => s.settings.units);
  const hasTrack = !!run.polyline_thumb && run.polyline_thumb.length >= 2 && isPlausibleTrack(run.polyline_thumb, run.distance_km);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/(records)/activity', params: { runId: run.id } })}
      style={({ pressed }) => [st.card, shadows.md, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
    >
      <View style={st.thumb}>
        <SafeImage uri={run.photo_thumb} style={st.thumbImg}
          fallback={<RouteMap id={run.id} polyline={hasTrack ? run.polyline_thumb : null} height={THUMB} width={THUMB} borderRadius={R.lg} square />} />
      </View>
      <View style={{ flex: 1, minWidth: 0, justifyContent: 'center', gap: 6 }}>
        <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.title} numberOfLines={1}>{run.title ?? timeTitle(run.ran_at, lang)}</Text>
        <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.date}>{fmtMonthDayTime(new Date(run.ran_at), lang, { weekday: 'short', monthStyle: 'numeric' })}</Text>
        {/* Chip: route_id = a linked course (AI/코스런) per guide §108; null = 자유런 */}
        <View style={st.chip}><Text style={st.chipTxt}>{T(run.route_id ? 'my.chipCourse' : 'my.chipFree')}</Text></View>
        <View style={st.metrics}>
          {([
            [`${fmtDist(run.distance_km, units, 2)}`, `${T('my.mDist')} (${distUnit(units)})`],
            [fmtDuration(run.duration_sec), T('my.mTime')],
            [run.avg_pace_sec_per_km != null ? fmtPaceIn(run.avg_pace_sec_per_km, units) : '--', T('my.mPace')],
          ] as [string, string][]).map(([v, l]) => (
            <View key={l} style={{ minWidth: 0 }}>
              <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.mVal}>{v}</Text>
              <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.mLbl}>{l}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={{ alignSelf: 'center' }}><Icon name="chevron-forward" size={16} color={C.faint} /></View>
    </Pressable>
  );
}

export function MyRecordsTab({ runs, loading, loadingMore, hasMore, loadMore }: RunList) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  const lang = useLang();
  const units = useSettings(s => s.settings.units);
  const now = new Date();
  const [ym, setYm] = useState<{ year: number; month: number } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Default month = the newest run's KST month (Figma lands on a populated
  // month); falls back to the current month on an empty history.
  const shown = ym ?? (runs[0] ? kstYm(runs[0].ran_at) : { year: now.getFullYear(), month: now.getMonth() + 1 });

  const [stats, setStats] = useState<MonthlyStats | null>(() => dcGet<MonthlyStats>(`/api/me/stats/monthly?year=${shown.year}&month=${shown.month}`) ?? null); // item ⑩ seed
  const cacheRef = useRef<Record<string, MonthlyStats>>({});
  useFocusEffect(useCallback(() => {
    const key = `${shown.year}-${shown.month}`;
    if (cacheRef.current[key]) setStats(cacheRef.current[key]);
    let cancelled = false;
    getMonthlyStats(shown.year, shown.month)
      .then(res => { if (cancelled) return; cacheRef.current[key] = res; setStats(res); })
      .catch(() => { /* cached month stands */ });
    return () => { cancelled = true; };
  }, [shown.year, shown.month]));
  const monthStats = stats && stats.year === shown.year && stats.month === shown.month ? stats.stats : null;

  // Auto-fill: keep paging while the oldest loaded run is still inside (or
  // after) the selected month, so the month is complete before we claim it.
  const oldest = runs[runs.length - 1];
  const oldestYm = oldest ? kstYm(oldest.ran_at) : null;
  const monthCovered = !oldestYm || oldestYm.year < shown.year || (oldestYm.year === shown.year && oldestYm.month < shown.month);
  useEffect(() => {
    if (!loading && !loadingMore && hasMore && !monthCovered) loadMore();
  }, [loading, loadingMore, hasMore, monthCovered, loadMore]);

  const inMonth = runs.filter(r => { const k = kstYm(r.ran_at); return k.year === shown.year && k.month === shown.month; });
  const filling = !monthCovered && hasMore;

  return (
    <View style={{ paddingHorizontal: S.gutter, paddingTop: S.md }}>
      <View style={st.head}>
        <Pressable onPress={() => setPickerOpen(true)} hitSlop={8} style={st.monthBtn} accessibilityRole="button">
          <Text style={st.monthTxt}>{T(('date.m' + shown.month) as StringKey)}</Text>
          <Icon name="chevron-down" size={16} color={C.sub} />
        </Pressable>
        <Text style={st.headMeta}>
          {tfIn(lang, 'my.monthSummary', { n: monthStats?.run_count ?? 0, km: fmtDist(monthStats?.total_distance_km ?? 0, units, 1), u: distUnit(units) })}
        </Text>
      </View>
      <MonthPicker
        visible={pickerOpen}
        year={shown.year}
        month={shown.month}
        isEnabled={(y, m) => y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)}
        onSelect={(y, m) => setYm({ year: y, month: m })}
        onClose={() => setPickerOpen(false)}
      />

      {loading || (filling && inMonth.length === 0) ? (
        <ActivityIndicator size="small" color={C.faint} style={{ paddingVertical: 28 }} />
      ) : inMonth.length === 0 ? (
        <View style={st.empty}>
          <Icon name="footsteps-outline" size={30} color={C.faint} />
          <Text style={st.emptyTxt}>{T(runs.length === 0 ? 'rec.empty' : 'my.emptyMonth')}</Text>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {inMonth.map(r => <RunCard key={r.id} run={r} />)}
          {filling && <ActivityIndicator size="small" color={C.faint} style={{ paddingVertical: 12 }} />}
        </View>
      )}
    </View>
  );
}

const THUMB = 124;

const makeSt = (C: Tokens) => StyleSheet.create({
  head:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: S.md },
  monthBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  monthTxt:  { fontSize: 22, fontWeight: '800', letterSpacing: -0.5, color: C.text },
  headMeta:  { fontSize: 12.5, fontWeight: '600', color: C.sub },
  card:      { flexDirection: 'row', gap: 14, backgroundColor: C.surface, borderRadius: R.xl, padding: 14 },
  thumb:     { width: THUMB, height: THUMB, borderRadius: R.lg, overflow: 'hidden', backgroundColor: C.surfaceAlt },
  thumbImg:  { width: THUMB, height: THUMB },
  title:     { fontSize: 15, fontWeight: '700', color: C.text },
  date:      { fontSize: 11.5, color: C.sub },
  chip:      { alignSelf: 'flex-start', backgroundColor: C.surfaceAlt, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  chipTxt:   { fontSize: 10.5, fontWeight: '700', color: C.text },
  metrics:   { flexDirection: 'row', gap: 14, marginTop: 2 },
  mVal:      { fontSize: 15, fontWeight: '800', letterSpacing: -0.3, color: C.text },
  mLbl:      { fontSize: 10, color: C.sub, marginTop: 1 },
  empty:     { alignItems: 'center', gap: 8, paddingVertical: 36 },
  emptyTxt:  { fontSize: 13, color: C.sub },
});
