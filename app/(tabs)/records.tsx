import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
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

import { MiniMap } from '@/components/mini-map';
import { Icon } from '@/components/ui';
import { useRuns, type Run } from '@/hooks/use-runs';
import { distUnit, fmtDate, fmtDist, fmtDuration, fmtPaceIn, fmtWhen, timeTitle } from '@/lib/run-format';
import { colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';
import { useQuota } from '@/store/use-quota';
import { useSettings } from '@/store/use-settings';

// ─── Month utilities ──────────────────────────────────────────────────────────

type MonthEntry = { year: number; month: number; key: string };

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

// Returns distinct months newest-first (runs must be ordered by ran_at desc).
function getDistinctMonths(runs: Run[]): MonthEntry[] {
  const seen = new Set<string>();
  const result: MonthEntry[] = [];
  for (const run of runs) {
    const d = new Date(run.ran_at);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const key = monthKey(year, month);
    if (!seen.has(key)) { seen.add(key); result.push({ year, month, key }); }
  }
  return result;
}

// Days 1-7, 8-14, 15-21, 22-end (handles 28/29/30/31-day months correctly).
function weekBuckets(runs: Run[], year: number, month: number): [number, number, number, number] {
  const b: [number, number, number, number] = [0, 0, 0, 0];
  for (const run of runs) {
    const d = new Date(run.ran_at);
    if (d.getFullYear() !== year || d.getMonth() + 1 !== month) continue;
    const day = d.getDate();
    const w = day <= 7 ? 0 : day <= 14 ? 1 : day <= 21 ? 2 : 3;
    b[w] += run.distance_km;
  }
  return b;
}

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

function MonthStats({ runs }: { runs: Run[] }) {
  const units = useSettings(s => s.settings.units);
  const months = useMemo(() => getDistinctMonths(runs), [runs]);
  const [idx, setIdx] = useState(0);

  // Clamp idx in case runs change and the months list shrinks.
  const safeIdx = months.length > 0 ? Math.min(idx, months.length - 1) : 0;
  const cur = months.length > 0 ? months[safeIdx] : null;

  const curRuns = useMemo(() => {
    if (!cur) return [] as Run[];
    return runs.filter(r => {
      const d = new Date(r.ran_at);
      return d.getFullYear() === cur.year && d.getMonth() + 1 === cur.month;
    });
  }, [runs, cur?.key]);

  // Calendar-previous month total distance — null means no data, hide delta chip.
  const prevDist = useMemo(() => {
    if (!cur) return null;
    const py = cur.month === 1 ? cur.year - 1 : cur.year;
    const pm = cur.month === 1 ? 12 : cur.month - 1;
    const pk = monthKey(py, pm);
    if (!months.some(m => m.key === pk)) return null;
    const dist = runs
      .filter(r => {
        const d = new Date(r.ran_at);
        return d.getFullYear() === py && d.getMonth() + 1 === pm;
      })
      .reduce((s, r) => s + r.distance_km, 0);
    return dist > 0 ? dist : null;
  }, [runs, cur?.key, months]);

  const buckets = useMemo((): [number, number, number, number] => {
    if (!cur) return [0, 0, 0, 0];
    return weekBuckets(runs, cur.year, cur.month);
  }, [runs, cur?.key]);

  // All hooks done — safe to early-return.
  if (!cur) return null;

  const totalDist = curRuns.reduce((s, r) => s + r.distance_km, 0);
  const sessions  = curRuns.length;
  const totalSec  = curRuns.reduce((s, r) => s + r.duration_sec, 0);
  const withPace  = curRuns.filter(r => r.avg_pace_sec_per_km != null);
  const avgPace   = withPace.length > 0
    ? withPace.reduce((s, r) => s + r.avg_pace_sec_per_km!, 0) / withPace.length
    : null;
  const totalH    = Math.floor(totalSec / 3600);
  const totalMRem = Math.floor((totalSec % 3600) / 60);
  const timeStr   = `${totalH}:${String(totalMRem).padStart(2, '0')}`;

  // Delta only shown when the calendar-previous month has run data.
  const delta = prevDist != null
    ? Math.round(((totalDist - prevDist) / prevDist) * 100)
    : null;

  const CHART_W = 340, CHART_H = 90;
  const { line, area } = sparkPaths(buckets, CHART_W, CHART_H);

  const stats: [string, string, string][] = [
    ['총 거리',     fmtDist(totalDist, units, 1),          distUnit(units)],
    ['세션',        String(sessions),                       '회'],
    ['평균 페이스', avgPace != null ? fmtPaceIn(avgPace, units) : '--', ''],
    ['총 시간',     timeStr,                                'h'],
  ];

  return (
    <View style={{ paddingTop: S.lg }}>

      {/* Month stepper — only steps between months that actually have runs */}
      <View style={st.monthRow}>
        <Pressable
          onPress={() => setIdx(i => Math.min(months.length - 1, i + 1))}
          disabled={safeIdx >= months.length - 1}
          hitSlop={10}
          style={[st.monthBtn, safeIdx >= months.length - 1 && st.btnDisabled]}
        >
          <Icon name="chevron-back" size={18} color={C.text} />
        </Pressable>
        <Text style={st.monthLabel}>{cur.year}년 {cur.month}월</Text>
        <Pressable
          onPress={() => setIdx(i => Math.max(0, i - 1))}
          disabled={safeIdx <= 0}
          hitSlop={10}
          style={[st.monthBtn, safeIdx <= 0 && st.btnDisabled]}
        >
          <Icon name="chevron-forward" size={18} color={C.text} />
        </Pressable>
      </View>

      {/* Hero card: big distance number + weekly sparkline */}
      <View style={[st.heroCard, shadows.md]}>
        <View style={st.heroTop}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text style={st.heroNum}>{fmtDist(totalDist, units, 1)}</Text>
            <Text style={st.heroUnit}>{distUnit(units)}</Text>
          </View>
          {delta !== null && (
            <View style={[st.deltaBadge, { backgroundColor: delta >= 0 ? C.accentDim : '#EF444416' }]}>
              <Text style={[st.deltaTxt, { color: delta >= 0 ? C.accentGrn : C.danger }]}>
                지난달 {delta >= 0 ? '+' : ''}{delta}%
              </Text>
            </View>
          )}
        </View>
        <Text style={st.heroSub}>이번 달 총 거리</Text>

        <View style={st.chartWrap}>
          <Svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            width="100%"
            height={CHART_H}
            preserveAspectRatio="none"
          >
            <Defs>
              <LinearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#34B85A" stopOpacity={0.3} />
                <Stop offset="1" stopColor="#34B85A" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={area} fill="url(#sparkGrad)" />
            <Path d={line} fill="none" stroke="#34B85A" strokeWidth={2.5} strokeLinecap="round" />
          </Svg>
        </View>
      </View>

      {/* Stat row */}
      <View style={st.statRow}>
        {stats.map(([label, value, unit], i) => (
          <View key={label} style={[st.statCell, i > 0 && st.statCellBorder]}>
            <Text style={st.statVal}>
              {value}
              {unit ? <Text style={st.statUnit}> {unit}</Text> : null}
            </Text>
            <Text style={st.statLabel}>{label}</Text>
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
  const onPress = premium
    ? () => router.push('/monthly-insight' as never)
    : () => Alert.alert('준비 중', '프리미엄 구독은 다음 업데이트에서 만나볼 수 있어요.');
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.upsellCard, pressed && { opacity: 0.85 }]}>
      <View style={st.upsellIcon}>
        <Icon name={premium ? 'sparkles' : 'lock-closed-outline'} size={19} color={C.accentGrn} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={st.upsellTitle}>{premium ? 'AI 월간 분석' : 'AI 월간 분석 잠금 해제'}</Text>
        <Text style={st.upsellSub}>{premium ? '이번 달 러닝 리포트가 준비됐어요' : '프리미엄으로 더 깊은 인사이트를'}</Text>
      </View>
      <View style={st.upsellBtn}>
        <Text style={st.upsellBtnTxt}>보기</Text>
      </View>
    </Pressable>
  );
}

// ─── RunRow ───────────────────────────────────────────────────────────────────

function MetricPill({ icon, value, color }: { icon: string; value: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Icon name={icon} size={12} color={color} />
      <Text style={[st.metricTxt, { color }]}>{value}</Text>
    </View>
  );
}

function RunRow({ run }: { run: Run }) {
  const units = useSettings(s => s.settings.units);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/(records)/activity', params: { runId: run.id } })}
      style={({ pressed }) => [st.runRow, shadows.sm, pressed && { opacity: 0.75 }]}
    >
      <View style={st.mapThumb}>
        <MiniMap seed={run.id} height={62} borderRadius={14} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={st.runRowTop}>
          <Text style={st.runTitle} numberOfLines={1}>{timeTitle(run.ran_at)}</Text>
          <Text style={st.runDate}>{fmtDate(run.ran_at)}</Text>
        </View>
        <Text style={st.runWhen} numberOfLines={1}>{fmtWhen(run.ran_at)}</Text>
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
  const insets = useSafeAreaInsets();
  const { runs, loading, error, signedOut, refetch } = useRuns();

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
        <Text style={[st.screenTitle, st.headerPad]}>기록</Text>
        <View style={st.centeredState}>
          <Icon name="person-outline" size={36} color={C.faint} />
          <Text style={st.stateTxt}>로그인이 필요해요</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[st.root, { paddingTop: insets.top }]}>
        <Text style={[st.screenTitle, st.headerPad]}>기록</Text>
        <View style={st.centeredState}>
          <Icon name="warning-outline" size={36} color={C.faint} />
          <Text style={st.stateTxt}>{error}</Text>
          <Pressable onPress={refetch} style={st.retryBtn}>
            <Text style={st.retryTxt}>다시 시도</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
      >
        <Text style={[st.screenTitle, st.headerPad]}>기록</Text>

        <View style={{ paddingHorizontal: S.gutter }}>
          <MonthStats runs={runs} />
        </View>

        <View style={{ paddingHorizontal: S.gutter, paddingTop: S.lg }}>
          <InsightUpsell premium={isPremium} />
        </View>

        {runs.length === 0 ? (
          <View style={st.centeredState}>
            <Icon name="footsteps-outline" size={36} color={C.faint} />
            <Text style={st.stateTxt}>아직 기록이 없어요</Text>
            <Text style={st.stateSub}>첫 번째 러닝을 시작해 보세요</Text>
          </View>
        ) : (
          <>
            <View style={st.sectionHead}>
              <Text style={st.sectionTitle}>활동 내역</Text>
            </View>
            <View style={{ paddingHorizontal: S.gutter, gap: 12 }}>
              {runs.map(run => <RunRow key={run.id} run={run} />)}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerPad:   { paddingTop: S.xl },
  screenTitle: { fontSize: 26, fontWeight: '700', letterSpacing: -0.8, color: C.text, paddingHorizontal: S.gutter },

  // Month stepper
  monthRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: S.md },
  monthBtn:   { width: 34, height: 34, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  btnDisabled:{ opacity: 0.3 },
  monthLabel: { fontSize: 16, fontWeight: '800', letterSpacing: -0.4, color: C.text },

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
  mapThumb:  { width: 62, flexShrink: 0 },
  runRowTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  runTitle:  { flex: 1, fontSize: 15, fontWeight: '700', letterSpacing: -0.4, color: C.text },
  runDate:   { fontSize: 11.5, color: C.faint, flexShrink: 0 },
  runWhen:   { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },
  runMetrics:{ flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: 8 },
  metricTxt: { fontSize: 13, fontWeight: '700', letterSpacing: -0.2 },

  // Empty / error states
  centeredState: { paddingTop: 60, alignItems: 'center', gap: 12 },
  stateTxt:      { fontSize: 14, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },
  stateSub:      { fontSize: 12, color: C.faint, letterSpacing: -0.2 },
  retryBtn:      { paddingHorizontal: 20, paddingVertical: 10, borderRadius: R.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  retryTxt:      { fontSize: 14, fontWeight: '700', color: C.text },
});
