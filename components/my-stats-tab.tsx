// MY › 통계 탭 (redesign 2a, 2026-11-19) — canvas "MY 통계 — Figma 원본"
// (MyStatsOrig.dc.html): weekly 12-week bars · streak calendar · PB tiles ·
// 월간 리포트 row. Light-only Figma → tokens (stated deviation, item 1 rule).
//
// Data: GET /me/stats (this-week hero + delta + PB records) · derived weekly
// buckets (use-weekly-distance) · GET /me/stats/monthly for the calendar month.
// 10K 최고 tile → 최고 페이스 INTERIM (owner-ruled 2026-11-19) until
// `records.best_10k` lands (지연 ask ①).
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MonthPicker } from '@/components/month-picker';
import { Icon } from '@/components/ui';
import { useWeeklyDistance, type WeekBucket } from '@/hooks/use-weekly-distance';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { tfIn, useLang, useT, type StringKey } from '@/lib/i18n';
import { distUnit, fmtDist, fmtDuration, fmtPaceIn } from '@/lib/run-format';
import { getMonthlyStats, getMyStats, type MonthlyStats, type MyStats } from '@/lib/stats-api';
import { radius as R, shadows, spacing as S, type Tokens, DENSE_MAX_FONT_SCALE } from '@/lib/theme';
import { useQuota } from '@/store/use-quota';
import { useSettings } from '@/store/use-settings';

const WEEKS = 12;
const BAR_H = 96;

// ─── Weekly bars ──────────────────────────────────────────────────────────────

function WeeklyCard({ buckets, week }: { buckets: WeekBucket[]; week: MyStats['week'] | null }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  const lang = useLang();
  const units = useSettings(s => s.settings.units);

  const max = Math.max(1, ...buckets.map(b => b.distanceKm));
  // Hero number = server truth (this week); bars = derived buckets.
  const thisWeek = week?.total_distance_km ?? buckets[buckets.length - 1]?.distanceKm ?? 0;
  const delta = week?.delta_distance_km ?? null;
  const deltaStr = delta != null ? `${delta >= 0 ? '+' : '-'}${fmtDist(Math.abs(delta), units, 1)} ${distUnit(units)}` : null;

  return (
    <View style={[st.card, shadows.md]}>
      <Text style={st.cardKicker}>{T('my.weeklyTitle')}</Text>
      <View style={st.heroRow}>
        <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.heroNum}>
          {fmtDist(thisWeek, units, 1)} <Text style={st.heroUnit}>{distUnit(units)}</Text>
        </Text>
        {deltaStr != null && (
          <Text style={st.heroDelta}>{tfIn(lang, 'my.vsLastWeek', { v: deltaStr })}</Text>
        )}
      </View>

      <View style={st.barsRow}>
        {buckets.map((b, i) => {
          const isCurrent = i === buckets.length - 1;
          const h = Math.max(6, Math.round((b.distanceKm / max) * BAR_H));
          return (
            <View key={b.start} style={st.barCol}>
              {isCurrent && (
                <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.barLabel}>{fmtDist(b.distanceKm, units, 1)}</Text>
              )}
              <View style={[st.bar, { height: h, backgroundColor: isCurrent ? C.accent : C.accentDim }]} />
            </View>
          );
        })}
      </View>
      <View style={st.barsRow}>
        {buckets.map((b, i) => {
          const newMonth = i === 0 || b.month !== buckets[i - 1].month;
          return (
            <View key={b.start} style={st.barCol}>
              <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.axisLabel}>
                {newMonth ? T(('date.m' + b.month) as StringKey) : ''}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Streak calendar ──────────────────────────────────────────────────────────

const DAY_KEYS: StringKey[] = ['my.d0', 'my.d1', 'my.d2', 'my.d3', 'my.d4', 'my.d5', 'my.d6'];

function intensity(km: number, C: Tokens): string {
  if (km <= 0) return C.surfaceAlt;
  if (km < 3) return C.accentDim;
  if (km < 6) return C.accent + '99';
  return C.accent;
}

function StreakCard() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  const lang = useLang();
  const now = new Date();
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [data, setData] = useState<MonthlyStats | null>(null);
  const cacheRef = useRef<Record<string, MonthlyStats>>({});

  useFocusEffect(useCallback(() => {
    const key = `${ym.year}-${ym.month}`;
    if (cacheRef.current[key]) setData(cacheRef.current[key]);
    let cancelled = false;
    getMonthlyStats(ym.year, ym.month)
      .then(res => { if (cancelled) return; cacheRef.current[key] = res; setData(res); })
      .catch(() => { /* offline — cached month stands */ });
    return () => { cancelled = true; };
  }, [ym.year, ym.month]));

  const showing = data && data.year === ym.year && data.month === ym.month ? data : null;
  const kmByDay: Record<number, number> = {};
  for (const d of showing?.days ?? []) kmByDay[Number(d.date.slice(8, 10))] = d.distance_km;

  // Sunday-start grid (Figma 일~토). Calendar math in local time is fine here:
  // only day-of-month layout depends on it, data keys are KST dates.
  const first = new Date(ym.year, ym.month - 1, 1);
  const daysInMonth = new Date(ym.year, ym.month, 0).getDate();
  const lead = first.getDay();
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  const monthName = T(('date.m' + ym.month) as StringKey);

  return (
    <View style={[st.card, shadows.md]}>
      <View style={st.cardHead}>
        <Text style={st.cardTitle}>{T('my.streakTitle')}</Text>
        <Pressable onPress={() => setPickerOpen(true)} hitSlop={8} style={st.monthBtn} accessibilityRole="button">
          <Text style={st.cardMeta}>{tfIn(lang, 'my.monthRuns', { mon: monthName, n: showing?.stats.run_count ?? 0 })}</Text>
          <Icon name="chevron-down" size={13} color={C.sub} />
        </Pressable>
      </View>
      <View style={st.gridRow}>
        {DAY_KEYS.map(k => <Text key={k} style={st.dow}>{T(k)}</Text>)}
      </View>
      {rows.map((row, ri) => (
        <View key={ri} style={st.gridRow}>
          {row.map((d, ci) => (
            <View key={ci} style={st.cellWrap}>
              {d != null && <View style={[st.cell, { backgroundColor: intensity(kmByDay[d] ?? 0, C) }]} />}
            </View>
          ))}
        </View>
      ))}
      <MonthPicker
        visible={pickerOpen}
        year={ym.year}
        month={ym.month}
        isEnabled={(y, m) => y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)}
        onSelect={(y, m) => setYm({ year: y, month: m })}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

// ─── PB tiles + report row ────────────────────────────────────────────────────

function PbTiles({ records }: { records: MyStats['records'] | null }) {
  const st = useStyles(makeSt);
  const T = useT();
  const units = useSettings(s => s.settings.units);
  const tiles: [string, string][] = [
    [T('my.pb5k'),      records?.best_5k ? fmtDuration(records.best_5k.value) : '--'],
    // INTERIM: 최고 페이스 in the Figma's 10K 최고 slot (owner 2026-11-19)
    [T('my.pbPace'),    records?.best_pace ? fmtPaceIn(records.best_pace.value, units) : '--'],
    [T('my.pbLongest'), records?.longest_distance ? `${fmtDist(records.longest_distance.value, units, 1)} ${distUnit(units)}` : '--'],
  ];
  return (
    <View style={st.tileRow}>
      {tiles.map(([label, value]) => (
        <View key={label} style={[st.tile, shadows.md]}>
          <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.tileLabel}>{label}</Text>
          <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.tileValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function ReportRow({ month }: { month: MonthlyStats | null }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  const lang = useLang();
  const units = useSettings(s => s.settings.units);
  const isPremium = useQuota(s => s.isPremium);
  const now = new Date();
  const monthName = T(('date.m' + (now.getMonth() + 1)) as StringKey);
  const km = `${fmtDist(month?.stats.total_distance_km ?? 0, units, 1)} ${distUnit(units)}`;
  return (
    <Pressable
      onPress={() => router.push((isPremium ? '/monthly-insight' : '/premium') as never)}
      style={({ pressed }) => [st.reportRow, shadows.md, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={T('my.report')}
    >
      <View style={st.reportIcon}><Icon name="bar-chart-outline" size={18} color={C.text} /></View>
      <Text style={st.reportTitle}>{T('my.report')}</Text>
      <View style={st.premiumBadge}><Text style={st.premiumTxt}>{T('my.premiumBadge')}</Text></View>
      <View style={{ flex: 1 }} />
      <Text style={st.cardMeta}>{tfIn(lang, 'my.reportSub', { mon: monthName, km })}</Text>
      <Icon name="chevron-forward" size={15} color={C.sub} />
    </Pressable>
  );
}

// ─── Tab root ─────────────────────────────────────────────────────────────────

export function MyStatsTab() {
  const { buckets, monthly } = useWeeklyDistance(WEEKS);
  const [stats, setStats] = useState<MyStats | null>(null);
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    getMyStats().then(res => { if (!cancelled) setStats(res); }).catch(() => { /* last data stands */ });
    return () => { cancelled = true; };
  }, []));
  const now = new Date();
  const currentMonth = monthly[`${now.getFullYear()}-${now.getMonth() + 1}`] ?? null;
  return (
    <View style={{ gap: S.md, paddingHorizontal: S.gutter, paddingTop: S.md }}>
      <WeeklyCard buckets={buckets} week={stats?.week ?? null} />
      <StreakCard />
      <PbTiles records={stats?.records ?? null} />
      <ReportRow month={currentMonth} />
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  card:        { backgroundColor: C.surface, borderRadius: R.xl, padding: 18 },
  cardKicker:  { fontSize: 11.5, color: C.sub },
  cardHead:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  cardTitle:   { fontSize: 14, fontWeight: '700', color: C.text },
  cardMeta:    { fontSize: 11.5, color: C.sub },
  monthBtn:    { flexDirection: 'row', alignItems: 'center', gap: 3 },
  heroRow:     { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 4, marginBottom: 14 },
  heroNum:     { fontSize: 26, fontWeight: '800', letterSpacing: -0.6, color: C.text },
  heroUnit:    { fontSize: 16, fontWeight: '700', color: C.text },
  heroDelta:   { fontSize: 11, color: C.sub, marginBottom: 4 },
  barsRow:     { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  barCol:      { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar:         { width: '100%', borderRadius: 6 },
  barLabel:    { fontSize: 10, fontWeight: '700', color: C.text, marginBottom: 3 },
  axisLabel:   { fontSize: 10, color: C.sub, marginTop: 6, height: 14 },
  gridRow:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  dow:         { width: 24, textAlign: 'center', fontSize: 10.5, color: C.sub, marginBottom: 2 },
  cellWrap:    { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  cell:        { width: 20, height: 20, borderRadius: 6 },
  tileRow:     { flexDirection: 'row', gap: S.sm },
  tile:        { flex: 1, backgroundColor: C.surface, borderRadius: R.lg, padding: 14, gap: 8 },
  tileLabel:   { fontSize: 11, color: C.sub },
  tileValue:   { fontSize: 18, fontWeight: '800', letterSpacing: -0.4, color: C.text },
  reportRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: R.lg, paddingHorizontal: 14, paddingVertical: 12 },
  reportIcon:  { width: 30, height: 30, borderRadius: 15, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginRight: 2 },
  reportTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  premiumBadge:{ backgroundColor: C.accent, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 },
  premiumTxt:  { fontSize: 10, fontWeight: '700', color: C.accentText },
});
