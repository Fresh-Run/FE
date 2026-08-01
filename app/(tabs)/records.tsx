import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTabBarInset } from '@/components/fresh-tab-bar';
import { MiniMap } from '@/components/mini-map';
import { RealMap } from '@/components/real-map';
import { SafeImage } from '@/components/safe-image';
import { MonthPicker } from '@/components/month-picker';
import { Icon } from '@/components/ui';
import { useRuns, type Run } from '@/hooks/use-runs';
import { t, tf, useLang, useT, type StringKey } from '@/lib/i18n';
import { distUnit, fmtDate, fmtDist, fmtDuration, fmtPaceIn, fmtWhen, timeTitle } from '@/lib/run-format';
import { radius as R, shadows, spacing as S, type Tokens, DENSE_MAX_FONT_SCALE} from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { getMonthlyStats, type MonthlyStats } from '@/lib/stats-api';
import { useQuota } from '@/store/use-quota';
import { useSettings } from '@/store/use-settings';

// ─── Sparkline path ───────────────────────────────────────────────────────────

function sparkPaths(vals: readonly number[], W: number, H: number) {
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const range = max - min || 1; // guard: flat/all-zero data → horizontal line, no NaN
  const n = vals.length;
  const pts = vals.map((v, i): [number, number] => [
    (i / (n - 1)) * W,
    (H - 4) - ((v - min) / range) * (H - 12),
  ]);
  let line = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < n; i++) {
    const pr = pts[i - 1], cu = pts[i];
    const mx = (pr[0] + cu[0]) / 2;
    line += ` C ${mx.toFixed(1)} ${pr[1].toFixed(1)}, ${mx.toFixed(1)} ${cu[1].toFixed(1)}, ${cu[0].toFixed(1)} ${cu[1].toFixed(1)}`;
  }
  const area = `${line} L ${pts[n - 1][0].toFixed(1)} ${H} L ${pts[0][0].toFixed(1)} ${H} Z`;
  return { line, area };
}

// ─── MonthStats ───────────────────────────────────────────────────────────────
// All hooks are called unconditionally; early return is placed after the last hook.

function MonthStats() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT(); // tab root world — long-lived mount
  const units = useSettings(s => s.settings.units);
  // Server month stats (stats-api swap): client aggregation over fetched
  // runs went quietly wrong once cursor pagination landed (only page one
  // in memory) — GET /me/stats/monthly is the authoritative source.
  // Stepper is now free-calendar (any past month; forward capped at the
  // current month) like the 월간 리포트 — empty months render zeros.
  const now = new Date();
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [pickerOpen, setPickerOpen] = useState(false);
  const isCurrentMonth = ym.year === now.getFullYear() && ym.month === now.getMonth() + 1;

  const [data, setData] = useState<MonthlyStats | null>(null);
  const cacheRef = useRef<Record<string, MonthlyStats>>({});
  useFocusEffect(useCallback(() => {
    const key = `${ym.year}-${ym.month}`;
    // Cached month paints instantly; the fetch corrects it silently
    if (cacheRef.current[key]) setData(cacheRef.current[key]);
    let cancelled = false;
    getMonthlyStats(ym.year, ym.month)
      .then(res => {
        if (cancelled) return;
        cacheRef.current[key] = res;
        setData(res);
      })
      .catch(() => { /* offline — cached/last data stands (quiet) */ });
    return () => { cancelled = true; };
  }, [ym.year, ym.month]));

  const step = (dir: -1 | 1) => {
    setYm(({ year, month }) => {
      const m = month + dir;
      if (m < 1) return { year: year - 1, month: 12 };
      if (m > 12) return { year: year + 1, month: 1 };
      return { year, month: m };
    });
  };

  const showing = data && data.year === ym.year && data.month === ym.month ? data : null;
  const s = showing?.stats ?? null;

  // Weekly sparkline buckets from the server's per-day breakdown (KST days
  // 1-7 / 8-14 / 15-21 / 22+ — same buckets as the old client math)
  const buckets: [number, number, number, number] = [0, 0, 0, 0];
  for (const d of showing?.days ?? []) {
    const day = Number(d.date.slice(8, 10));
    const w = day <= 7 ? 0 : day <= 14 ? 1 : day <= 21 ? 2 : 3;
    buckets[w] += d.distance_km;
  }

  const totalDist = s?.total_distance_km ?? 0;
  const totalSec  = s?.total_duration_sec ?? 0;
  const totalH    = Math.floor(totalSec / 3600);
  const totalMRem = Math.floor((totalSec % 3600) / 60);
  const timeStr   = `${totalH}:${String(totalMRem).padStart(2, '0')}`;

  // Server delta is km vs previous month → % against the derived prev total
  const prevTotal = s?.delta_distance_km != null ? totalDist - s.delta_distance_km : null;
  const delta = prevTotal != null && prevTotal > 0
    ? Math.round(((totalDist - prevTotal) / prevTotal) * 100)
    : null;

  const CHART_W = 340, CHART_H = 90;
  const { line, area } = sparkPaths(buckets, CHART_W, CHART_H);

  const stats: [string, string, string][] = [
    [T('res.totalDist'), fmtDist(totalDist, units, 1),          distUnit(units)],
    [T('rec.sessions'),  String(s?.run_count ?? 0),              T('mi.unitRuns')],
    [T('res.avgPace'),   s?.avg_pace_sec_per_km != null ? fmtPaceIn(s.avg_pace_sec_per_km, units) : '--', ''],
    [T('act.totalTime'), timeStr,                                'h'],
  ];

  return (
    <View style={{ paddingTop: S.lg }}>

      {/* Month stepper — free calendar, forward capped at the current month */}
      <View style={st.monthRow}>
        <Pressable onPress={() => step(-1)} hitSlop={10} style={st.monthBtn}>
          <Icon name="chevron-back" size={18} color={C.text} />
        </Pressable>
        <Pressable onPress={() => setPickerOpen(true)} hitSlop={8} style={st.monthLabelBtn}>
          <Text style={st.monthLabel}>{tf('date.ym', { y: ym.year, m: ym.month, mon: T(('date.m' + ym.month) as StringKey) })}</Text>
          <Icon name="chevron-down" size={15} color={C.sub} />
        </Pressable>
        <Pressable
          onPress={() => step(1)}
          disabled={isCurrentMonth}
          hitSlop={10}
          style={[st.monthBtn, isCurrentMonth && st.btnDisabled]}
        >
          <Icon name="chevron-forward" size={18} color={C.text} />
        </Pressable>
      </View>

      <MonthPicker
        visible={pickerOpen}
        year={ym.year}
        month={ym.month}
        // Server stats exist for any month — non-future is the only gate
        isEnabled={(y, m) =>
          y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)}
        onSelect={(y, m) => setYm({ year: y, month: m })}
        onClose={() => setPickerOpen(false)}
      />

      {/* Hero card: big distance number + weekly sparkline */}
      <View style={[st.heroCard, shadows.md]}>
        <View style={st.heroTop}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text style={st.heroNum}>{fmtDist(totalDist, units, 1)}</Text>
            <Text style={st.heroUnit}>{distUnit(units)}</Text>
          </View>
          {delta !== null && (
            <View style={[st.deltaBadge, { backgroundColor: delta >= 0 ? C.accentDim : C.danger + '16' }]}>
              <Text style={[st.deltaTxt, { color: delta >= 0 ? C.accentGrn : C.danger }]}>
                {tf('rec.lastMonth', { v: `${delta >= 0 ? '+' : ''}${delta}` })}
              </Text>
            </View>
          )}
        </View>
        <Text style={st.heroSub}>{T('rec.monthTotal')}</Text>

        <View style={st.chartWrap}>
          <Svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            width="100%"
            height={CHART_H}
            preserveAspectRatio="none"
          >
            <Defs>
              <LinearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={C.chart} stopOpacity={0.3} />
                <Stop offset="1" stopColor={C.chart} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={area} fill="url(#sparkGrad)" />
            <Path d={line} fill="none" stroke={C.chart} strokeWidth={2.5} strokeLinecap="round" />
          </Svg>
        </View>
      </View>

      {/* Stat row */}
      <View style={st.statRow}>
        {stats.map(([label, value, unit], i) => (
          <View key={label} style={[st.statCell, i > 0 && st.statCellBorder]}>
            <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.statVal}>
              {value}
              {unit ? <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.statUnit}> {unit}</Text> : null}
            </Text>
            <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.statLabel}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── InsightUpsell — tier-aware (I1, 2026-07-08) ─────────────────────────────
// Premium: entry card → 월간 리포트 screen. Free: upsell, tap → 구독 준비 중
// (6e2ddd7 pattern). The old always-locked card + dead 보기 button predated
// the quota store.

function InsightUpsell({ premium }: { premium: boolean }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  const onPress = premium
    ? () => router.push('/monthly-insight' as never)
    : () => Alert.alert(t('mp.comingSoon'), t('rec.soonBody'));
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.upsellCard, pressed && { opacity: 0.85 }]}>
      <View style={st.upsellIcon}>
        <Icon name={premium ? 'sparkles' : 'lock-closed-outline'} size={19} color={C.accentGrn} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={st.upsellTitle}>{premium ? T('rec.aiTitle') : T('rec.aiLocked')}</Text>
        <Text style={st.upsellSub}>{premium ? T('rec.aiReady') : T('rec.aiUpsell')}</Text>
      </View>
      <View style={st.upsellBtn}>
        <Text style={st.upsellBtnTxt}>{T('rec.view')}</Text>
      </View>
    </Pressable>
  );
}

// ─── RunRow ───────────────────────────────────────────────────────────────────

function MetricPill({ icon, value, color }: { icon: string; value: string; color: string }) {
  const st = useStyles(makeSt);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Icon name={icon} size={12} color={color} />
      <Text style={[st.metricTxt, { color }]}>{value}</Text>
    </View>
  );
}

function RunRow({ run }: { run: Run }) {
  const C = useTokens();
  const lang = useLang(); // compiler-visible locale for the date/title formatters (2026-08-03 formatter-cache fix)
  const st = useStyles(makeSt);
  const units = useSettings(s => s.settings.units);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/(records)/activity', params: { runId: run.id } })}
      style={({ pressed }) => [st.runRow, shadows.sm, pressed && { opacity: 0.75 }]}
    >
      <View style={st.mapThumb}>
        {/* photo_thumb (S-batch2 #6): the first photo takes the 62px tile
            when present (photo > map priority, photo_thumb↔polyline_thumb
            대칭 per guide §108; signed URL — used directly, never cached).
            INSTEAD-of choice: a second 62px tile beside the mini doesn't
            fit the current row; the ~110px redesign docket revisits.
            Otherwise: route-shaped mini (thumb) / seed art (trackless). */}
        <SafeImage uri={run.photo_thumb} style={st.photoThumb}
          fallback={run.polyline_thumb && run.polyline_thumb.length >= 2
            ? <RealMap height={62} borderRadius={14} polyline={run.polyline_thumb} />
            : <MiniMap seed={run.id} height={62} borderRadius={14} />} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={st.runRowTop}>
          <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.runTitle} numberOfLines={1}>{run.title ?? timeTitle(run.ran_at, lang)}</Text>
          <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.runDate}>{fmtDate(run.ran_at, lang)}</Text>
        </View>
        {/* 8/6 crew badge (her ② fields; null-safe by her all-null non-crew
            symmetry — nothing renders on non-crew runs). Interim 62px shape:
            glyph + name truncating BEFORE the date; the real treatment stays
            with the row-redesign docket. */}
        {run.crew_name ? (
          <View style={st.runWhenRow}>
            <Icon name="people" size={10} color={C.accentGrn} />
            <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={[st.runWhen, { color: C.accentGrn, flexShrink: 1 }]} numberOfLines={1}>{run.crew_name}</Text>
            <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.runWhen}>{fmtWhen(run.ran_at, lang)}</Text>
          </View>
        ) : (
          <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.runWhen} numberOfLines={1}>{fmtWhen(run.ran_at, lang)}</Text>
        )}
        <View style={st.runMetrics}>
          <MetricPill icon="location-outline"    value={`${fmtDist(run.distance_km, units, 2)} ${distUnit(units)}`}                            color={C.accentGrn} />
          <MetricPill icon="time-outline"        value={fmtDuration(run.duration_sec)}                                                         color={C.faint} />
          <MetricPill icon="speedometer-outline" value={run.avg_pace_sec_per_km != null ? fmtPaceIn(run.avg_pace_sec_per_km, units) : '--'} color={C.faint} />
        </View>
      </View>
      <Icon name="chevron-forward" size={17} color={C.faint} />
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RecordsScreen() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset();
  const { runs, loading, loadingMore, hasMore, loadMore, error, signedOut, refetch } = useRuns();

  // Tier for the AI 월간 분석 card (I1)
  const isPremium = useQuota(s => s.isPremium);
  React.useEffect(() => { useQuota.getState().hydrate(); }, []);

  // Refetch on focus so runs saved from the tracking flow appear immediately
  useFocusEffect(useCallback(() => {
    refetch();
  }, [refetch]));

  if (loading) {
    return (
      <View style={[st.root, { paddingTop: insets.top }]}>
        <View style={st.loadingWrap}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      </View>
    );
  }

  if (signedOut) {
    return (
      <View style={[st.root, { paddingTop: insets.top }]}>
        <Text style={[st.screenTitle, st.headerPad]}>{T('tab.records')}</Text>
        <View style={st.centeredState}>
          <Icon name="person-outline" size={36} color={C.faint} />
          <Text style={st.stateTxt}>{T('com.loginNeeded')}</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[st.root, { paddingTop: insets.top }]}>
        <Text style={[st.screenTitle, st.headerPad]}>{T('tab.records')}</Text>
        <View style={st.centeredState}>
          <Icon name="warning-outline" size={36} color={C.faint} />
          <Text style={st.stateTxt}>{error}</Text>
          <Pressable onPress={refetch} style={st.retryBtn}>
            <Text style={st.retryTxt}>{T('common.retry')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarInset }}
        // Infinite scroll (#9): near-bottom triggers the next cursor page
        onScroll={({ nativeEvent: e }) => {
          if (hasMore && e.contentOffset.y + e.layoutMeasurement.height > e.contentSize.height - 600) {
            loadMore();
          }
        }}
        scrollEventThrottle={120}
      >
        <Text style={[st.screenTitle, st.headerPad]}>{T('tab.records')}</Text>

        <View style={{ paddingHorizontal: S.gutter }}>
          <MonthStats />
        </View>

        <View style={{ paddingHorizontal: S.gutter, paddingTop: S.lg }}>
          <InsightUpsell premium={isPremium} />
        </View>

        {runs.length === 0 ? (
          <View style={st.centeredState}>
            <Icon name="footsteps-outline" size={36} color={C.faint} />
            <Text style={st.stateTxt}>{T('rec.empty')}</Text>
            <Text style={st.stateSub}>{T('rec.emptySub')}</Text>
          </View>
        ) : (
          <>
            <View style={st.sectionHead}>
              <Text style={st.sectionTitle}>{T('rec.sectionActivity')}</Text>
            </View>
            <View style={{ paddingHorizontal: S.gutter, gap: 12 }}>
              {runs.map(run => <RunRow key={run.id} run={run} />)}
            </View>
            {/* Pagination footer: loading spinner / end-of-history */}
            {loadingMore ? (
              <ActivityIndicator size="small" color={C.faint} style={{ paddingVertical: 18 }} />
            ) : !hasMore && runs.length > 0 ? (
              <Text style={st.endNote}>{T('rec.endNote')}</Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeSt = (C: Tokens) => StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerPad:   { paddingTop: S.xl },
  screenTitle: { fontSize: 26, fontWeight: '700', letterSpacing: -0.8, color: C.text, paddingHorizontal: S.gutter },

  // Month stepper
  monthRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: S.md },
  monthBtn:   { width: 34, height: 34, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  btnDisabled:{ opacity: 0.3 },
  monthLabel: { fontSize: 16, fontWeight: '800', letterSpacing: -0.4, color: C.text },
  monthLabelBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 6, paddingVertical: 4 },

  // Hero card
  heroCard:  { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.xl, padding: S.lg, overflow: 'hidden' },
  heroTop:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroNum:   { fontSize: 40, fontWeight: '800', letterSpacing: -1.6, color: C.text },
  heroUnit:  { fontSize: 16, fontWeight: '700', color: C.faint },
  heroSub:   { fontSize: 11.5, fontWeight: '600', letterSpacing: 0.2, color: C.faint, marginTop: 2 },
  chartWrap: { marginHorizontal: -S.lg, marginBottom: -1, marginTop: S.sm },
  deltaBadge:{ borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4 },
  deltaTxt:  { fontSize: 12.5, fontWeight: '700' },

  // Stat row
  statRow:        { flexDirection: 'row', marginTop: S.md },
  statCell:       { flex: 1, alignItems: 'center', paddingVertical: 4 },
  statCellBorder: { borderLeftWidth: 1, borderLeftColor: C.border },
  statVal:        { fontSize: 18, fontWeight: '800', letterSpacing: -0.4, color: C.text },
  statUnit:       { fontSize: 11, fontWeight: '600', color: C.faint },
  statLabel:      { fontSize: 11, color: C.faint, marginTop: 4 },

  // AI upsell
  upsellCard:   { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accent + '55', borderRadius: R.lg, padding: 12 },
  upsellIcon:   { width: 40, height: 40, borderRadius: R.md, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  upsellTitle:  { fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  upsellSub:    { fontSize: 12, color: C.accentGrn, letterSpacing: -0.2, marginTop: 2 },
  upsellBtn:    { height: 34, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  upsellBtnTxt: { fontSize: 13, fontWeight: '800', color: C.accentText, letterSpacing: -0.2 },

  // Section header
  sectionHead:  { flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: S.gutter, paddingTop: S.xl, paddingBottom: S.sm },
  sectionTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: C.text },

  // Run row
  runRow:    { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.xl, padding: 12 },
  mapThumb:   { width: 62, flexShrink: 0 },
  photoThumb: { width: 62, height: 62, borderRadius: 14 },
  endNote:    { textAlign: 'center', fontSize: 12, color: C.faint, letterSpacing: -0.2, paddingVertical: 18 },
  runRowTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  runTitle:  { flex: 1, fontSize: 15, fontWeight: '700', letterSpacing: -0.4, color: C.text },
  runDate:   { fontSize: 11.5, color: C.faint, flexShrink: 0 },
  runWhen:   { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },
  runWhenRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  runMetrics:{ flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: 8 },
  metricTxt: { fontSize: 13, fontWeight: '700', letterSpacing: -0.2 },

  // Empty / error states
  centeredState: { paddingTop: 60, alignItems: 'center', gap: 12 },
  stateTxt:      { fontSize: 14, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },
  stateSub:      { fontSize: 12, color: C.faint, letterSpacing: -0.2 },
  retryBtn:      { paddingHorizontal: 20, paddingVertical: 10, borderRadius: R.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  retryTxt:      { fontSize: 14, fontWeight: '700', color: C.text },
});
