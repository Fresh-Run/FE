/**
 * AI 월간 분석 (프리미엄) — canvas FrMonthlyInsight MINUS the guide-line-132
 * cards (no backend data: HR zones, terrain, 고도/칼로리/심박 tiles, goal
 * ring). Locked decisions (owner 2026-07-08 + revision 07-09 — don't
 * re-litigate):
 *  - hero = 총 거리 + 전월 delta framing (stats.delta_distance_km);
 *  - metric grid = 러닝 횟수 / 총 시간 / 평균 페이스 / 최장 러닝;
 *  - AI coaching card + 추천 플랜 REMOVED (owner + backend, 07-09) — ai
 *    stays typed in insights-api.ts, deliberately unrendered; the
 *    replacement (꾸준함/패턴 심화) is slice I2;
 *  - empty state keys on stats.run_count === 0;
 *  - share → LIVE text share (PB pattern; the designed CARD stays docketed).
 * Entry: 기록 tab premium card. Free users never navigate here; the 403
 * premium_required path is handled defensively anyway.
 */
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line } from 'react-native-svg';

import { MonthPicker } from '@/components/month-picker';
import { Icon } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { getMonthlyInsight, type MonthlyInsight, type MonthRank, type PaceTrendPoint } from '@/lib/insights-api';
import { distUnit, fmtDist, fmtDuration, fmtPaceIn, paceUnit } from '@/lib/run-format';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useSettings } from '@/store/use-settings';

// ─── Maps ─────────────────────────────────────────────────────────────────────

const RECORD_LABEL: Record<string, string> = {
  best_pace: '최고 페이스',
  // 5K 환산 시간 (pace-equivalent, not an actual 5K distance) — phrasing aligned
  // with the month_rank tile so the screen never mixes "5K" and "5K 환산".
  best_5k: '최고 5K 환산',
  longest_distance: '최장 거리',
  longest_duration: '최장 러닝',
};

const TIME_OF_DAY_LABEL: Record<string, string> = {
  dawn: '새벽', morning: '아침', day: '낮', evening: '저녁', night: '밤',
};

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

// month_rank → honest copy (guide §137). rank==1 → "가장 …", else "{rank}번째로 …".
// best_5k is a PACE-EQUIVALENT — never imply a 5K distance was run; the axis
// says "5K 환산 페이스" and the sub reiterates 환산 기준.
function monthRankCopy(mr: MonthRank): { headline: string; sub: string } {
  const nth = mr.rank === 1 ? '가장' : `${mr.rank}번째로`;
  const AXIS: Record<MonthRank['type'], string> = {
    best_pace: `${nth} 빠른 페이스`,
    best_5k: `${nth} 빠른 5K 환산 페이스`,
    longest_distance: `${nth} 긴 거리`,
    longest_duration: `${nth} 긴 시간`,
  };
  const sub = mr.type === 'best_5k'
    ? `5K 환산 페이스 기준 · 이번 달 ${mr.total}회 중`
    : `이번 달 ${mr.total}회 중`;
  return { headline: `이번 달 ${AXIS[mr.type]}`, sub };
}

function fmtRecordValue(type: string, value: number, units: 'km' | 'mi'): string {
  if (type === 'best_pace') return fmtPaceIn(value, units);
  if (type === 'longest_distance') return `${fmtDist(value, units, 1)}${distUnit(units)}`;
  return fmtDuration(value); // best_5k, longest_duration are seconds
}

// ─── Cards ────────────────────────────────────────────────────────────────────

function SectionCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const st = useStyles(makeSt);
  return (
    <View style={{ paddingHorizontal: S.gutter, paddingTop: 24 }}>
      <Text style={st.sectionTitle}>{title}</Text>
      <View style={[st.card, shadows.sm]}>{children}</View>
      {hint ? <Text style={st.sectionHint}>{hint}</Text> : null}
    </View>
  );
}

// ─── 페이스 추이 (3-point line, gap on null months) ────────────────────────────

function PaceTrendChart({ points, units }: { points: PaceTrendPoint[]; units: 'km' | 'mi' }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const W = 300, H = 64, PAD = 12;
  const nums = points.map(p => p.avg_pace_sec_per_km).filter((v): v is number => v != null);
  const min = Math.min(...nums), max = Math.max(...nums);
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / Math.max(1, points.length - 1);
  // Faster pace (lower sec) draws LOWER — "아래일수록 빨라요" (hint copy)
  const y = (v: number) => (max === min ? H / 2 : PAD + ((v - min) / (max - min)) * (H - 2 * PAD));

  // Line segments only between ADJACENT non-null months (null = gap, §127)
  const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i].avg_pace_sec_per_km, b = points[i + 1].avg_pace_sec_per_km;
    if (a != null && b != null) segments.push({ x1: x(i), y1: y(a), x2: x(i + 1), y2: y(b) });
  }

  return (
    <View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {segments.map((s, i) => (
          <Line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={C.accent} strokeWidth={2.5} strokeLinecap="round" />
        ))}
        {points.map((p, i) => p.avg_pace_sec_per_km != null && (
          <Circle key={`d${i}`} cx={x(i)} cy={y(p.avg_pace_sec_per_km)} r={4}
            fill={i === points.length - 1 ? C.accent : C.surface}
            stroke={C.accent} strokeWidth={2} />
        ))}
      </Svg>
      <View style={st.trendLabels}>
        {points.map((p, i) => (
          <View key={i} style={{ flex: 1, alignItems: i === 0 ? 'flex-start' : i === points.length - 1 ? 'flex-end' : 'center' }}>
            <Text style={st.trendMonth}>{p.month}월</Text>
            <Text style={[st.trendPace, p.avg_pace_sec_per_km == null && { color: C.faint, fontWeight: '600' }]}>
              {p.avg_pace_sec_per_km != null ? fmtPaceIn(p.avg_pace_sec_per_km, units) : '—'}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MonthlyInsightScreen() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const units = useSettings(s => s.settings.units);

  const now = new Date();
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [data, setData] = useState<MonthlyInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const isCurrentMonth = ym.year === now.getFullYear() && ym.month === now.getMonth() + 1;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getMonthlyInsight(ym.year, ym.month));
    } catch (e: unknown) {
      setData(null);
      setError(e instanceof ApiError && e.status === 403
        ? 'AI 월간 분석은 프리미엄 전용이에요'
        : e instanceof Error ? e.message : '리포트를 불러올 수 없어요');
    } finally {
      setLoading(false);
    }
  }, [ym.year, ym.month]);

  useEffect(() => { load(); }, [load]);

  const step = (dir: -1 | 1) => {
    setYm(({ year, month }) => {
      const m = month + dir;
      if (m < 1) return { year: year - 1, month: 12 };
      if (m > 12) return { year: year + 1, month: 1 };
      return { year, month: m };
    });
  };

  const s = data?.stats;
  const emptyMonth = !!data && data.stats.run_count === 0;

  // 리포트 텍스트 공유 (debt top-10 #7) — the PB-share pattern: composed
  // from the report's LIVE fields, units-aware; the designed share CARD
  // stays on the design-session docket. Empty months: DISABLED (owner
  // lean — sharing a zero-run month is noise, not honesty).
  const canShare = !!s && !emptyMonth;
  function shareReport() {
    if (!s) return;
    const lines = [
      `FreshRun ${ym.month}월 리포트 🏃`,
      `총 ${fmtDist(s.total_distance_km, units, 1)}${distUnit(units)} · ${s.run_count}회 러닝`,
      `평균 페이스 ${s.avg_pace_sec_per_km != null ? `${fmtPaceIn(s.avg_pace_sec_per_km, units)}${paceUnit(units)}` : '—'} · 최장 ${fmtDist(s.longest_run_km, units, 1)}${distUnit(units)}`,
    ];
    if (s.delta_distance_km != null) {
      const d = s.delta_distance_km;
      lines.push(d === 0
        ? '지난달과 같은 거리를 달렸어요'
        : `지난달보다 ${d > 0 ? '+' : '−'}${fmtDist(Math.abs(d), units, 1)}${distUnit(units)}`);
    }
    Share.share({ message: lines.join('\n') }).catch(() => {}); // dismiss = clean
  }
  const wMax = data ? Math.max(...data.weeks.map(w => w.distance_km), 0.001) : 1;
  const wdMax = data ? Math.max(...data.pattern.weekday_counts, 1) : 1;

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      {/* App bar */}
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.appBarBtn}>
          <Icon name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>월간 리포트</Text>
        <Pressable
          onPress={canShare ? shareReport : undefined}
          disabled={!canShare}
          hitSlop={12}
          style={[st.appBarBtn, !canShare && { opacity: 0.35 }]}
        >
          <Icon name="share-outline" size={20} color={C.text} />
        </Pressable>
      </View>

      {/* Month stepper (기록-tab control shape; forward capped at current);
          label = 기간 선택 picker trigger (canvas FrMonthPicker) */}
      <View style={st.stepperRow}>
        <Pressable onPress={() => step(-1)} style={st.stepBtn}>
          <Icon name="chevron-back" size={18} color={C.text} />
        </Pressable>
        <Pressable onPress={() => setPickerOpen(true)} hitSlop={8} style={st.stepperLabelBtn}>
          <Text style={st.stepperLabel}>{ym.year} · {ym.month}월</Text>
          <Icon name="chevron-down" size={15} color={C.sub} />
        </Pressable>
        <Pressable
          onPress={() => step(1)}
          disabled={isCurrentMonth}
          style={[st.stepBtn, isCurrentMonth && { opacity: 0.35 }]}
        >
          <View style={{ transform: [{ scaleX: -1 }] }}>
            <Icon name="chevron-back" size={18} color={C.text} />
          </View>
        </Pressable>
      </View>

      <MonthPicker
        visible={pickerOpen}
        year={ym.year}
        month={ym.month}
        // Report fetches per-month server-side — any non-future month is
        // selectable (empty months render the existing empty state)
        isEnabled={(y, m) =>
          y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)}
        onSelect={(y, m) => setYm({ year: y, month: m })}
        onClose={() => setPickerOpen(false)}
      />

      {loading ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : error || !data ? (
        <View style={st.centered}>
          <Icon name="warning-outline" size={36} color={C.faint} />
          <Text style={st.stateTxt}>{error ?? '리포트를 불러올 수 없어요'}</Text>
          <Pressable onPress={load} style={st.retryBtn}><Text style={st.retryTxt}>다시 시도</Text></Pressable>
        </View>
      ) : emptyMonth ? (
        <View style={st.centered}>
          <View style={st.emptyIcon}><Icon name="walk-outline" size={26} color={C.faint} /></View>
          <Text style={st.stateTxt}>{ym.month}월엔 러닝 기록이 없어요</Text>
          <Text style={st.emptySub}>러닝을 기록하면 AI 리포트가 만들어져요</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 36 }}>
          {/* Hero — 총 거리 + 전월 delta (goal ring dropped: no backend goal) */}
          <View style={{ paddingHorizontal: S.gutter, paddingTop: 16 }}>
            <View style={st.hero}>
              <View style={st.heroCircle} pointerEvents="none" />
              <View style={st.heroPill}>
                <Icon name="sparkles" size={11} color={C.accent} />
                <Text style={st.heroPillTxt}>{ym.month}월 리포트</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Text style={st.heroDist}>{fmtDist(s!.total_distance_km, units, 1)}</Text>
                <Text style={st.heroUnit}>{distUnit(units)}</Text>
              </View>
              <Text style={st.heroSub}>
                {s!.delta_distance_km != null
                  ? `지난달 대비 ${s!.delta_distance_km >= 0 ? '+' : '−'}${fmtDist(Math.abs(s!.delta_distance_km), units, 1)}${distUnit(units)}`
                  : '이번 달의 누적 거리예요'}
              </Text>
            </View>
          </View>

          {/* 이번 달 순위 하이라이트 (month_rank, BE e422468) — null → HIDDEN
              (no "1st of 1" noise; the server omits sub-2-run dimensions). */}
          {data.month_rank && (() => {
            const { headline, sub } = monthRankCopy(data.month_rank);
            return (
              <View style={st.rankCard}>
                <View style={st.rankMedal}><Icon name="ribbon-outline" size={19} color={C.accentGrn} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.rankHeadline}>{headline}</Text>
                  <Text style={st.rankSub}>{sub}</Text>
                </View>
              </View>
            );
          })()}

          {/* 4-tile metric grid (locked recomposition) */}
          <View style={st.grid}>
            {([
              ['러닝 횟수', String(s!.run_count), '회'],
              ['총 시간', fmtDuration(s!.total_duration_sec), ''],
              ['평균 페이스', s!.avg_pace_sec_per_km != null ? fmtPaceIn(s!.avg_pace_sec_per_km, units) : '--', paceUnit(units)],
              ['최장 러닝', fmtDist(s!.longest_run_km, units, 1), distUnit(units)],
            ] as [string, string, string][]).map(([label, value, unit]) => (
              <View key={label} style={[st.metricTile, shadows.sm]}>
                <Text style={st.metricLabel}>{label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: 7 }}>
                  <Text style={st.metricVal}>{value}</Text>
                  {unit ? <Text style={st.metricUnit}>{unit}</Text> : null}
                </View>
              </View>
            ))}
          </View>

          {/* 이번 달 개인 기록 */}
          {data.records.length > 0 && (
            <SectionCard title="이번 달 개인 기록" hint="화살표는 역대 기록 경신을 뜻해요.">
              <View style={st.prGrid}>
                {data.records.map(r => (
                  <View key={r.type} style={{ gap: 3, width: '46%' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Text style={st.prLabel}>{RECORD_LABEL[r.type] ?? r.type}</Text>
                      {r.all_time_best && <Icon name="trending-up" size={12} color={C.accentGrn} />}
                    </View>
                    <Text style={st.prValue}>{fmtRecordValue(r.type, r.value, units)}</Text>
                    <Text style={st.prSub}>{new Date(r.ran_at).getMonth() + 1}월 {new Date(r.ran_at).getDate()}일 · {fmtDist(r.distance_km, units, 1)}{distUnit(units)}</Text>
                  </View>
                ))}
              </View>
            </SectionCard>
          )}

          {/* 주간 거리 */}
          <SectionCard title="주간 거리">
            <View style={st.weekRow}>
              {data.weeks.map(w => {
                const h = Math.round((w.distance_km / wMax) * 96) + 8;
                const last = w.index === data.weeks.length;
                return (
                  <View key={w.index} style={{ flex: 1, alignItems: 'center', gap: 7 }}>
                    <Text style={st.weekVal}>{fmtDist(w.distance_km, units, 1)}</Text>
                    <View style={[st.weekBar, { height: h }, last ? { backgroundColor: C.accent, borderWidth: 0 } : null]} />
                    <Text style={st.weekLbl}>{w.index}주</Text>
                  </View>
                );
              })}
            </View>
          </SectionCard>

          {/* 러닝 패턴 */}
          <SectionCard title="러닝 패턴">
            <View style={st.weekdayRow}>
              {data.pattern.weekday_counts.map((n, i) => {
                const peak = n === wdMax && n > 0;
                const h = Math.round((n / wdMax) * 56) + 6;
                return (
                  <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                    <View style={[st.weekdayBar, { height: h }, peak && { backgroundColor: C.accent }]} />
                    <Text style={[st.weekdayLbl, peak && { color: C.text, fontWeight: '700' }]}>{WEEKDAYS[i]}</Text>
                  </View>
                );
              })}
            </View>
            {/* run_days lead (꾸준함 지표) — served, probed 2026-07-13 */}
            <View style={st.runDaysRow}>
              <Icon name="calendar-outline" size={14} color={C.accentGrn} />
              <Text style={st.runDaysTxt}>이번 달 <Text style={st.runDaysNum}>{data.pattern.run_days}일</Text> 러닝했어요</Text>
            </View>
            <View style={st.patternFoot}>
              <View style={st.patternCell}>
                <View style={st.patternIcon}><Icon name="sparkles" size={15} color={C.accentGrn} /></View>
                <View style={{ minWidth: 0 }}>
                  <Text style={st.patternLbl}>주 활동 시간</Text>
                  <Text style={st.patternVal}>
                    {TIME_OF_DAY_LABEL[data.pattern.time_of_day] ?? data.pattern.time_of_day} {data.pattern.time_of_day_pct}%
                  </Text>
                </View>
              </View>
              <View style={st.patternDivider} />
              <View style={st.patternCell}>
                <View style={st.patternIcon}><Icon name="flame-outline" size={15} color={C.accentGrn} /></View>
                <View style={{ minWidth: 0 }}>
                  <Text style={st.patternLbl}>연속 러닝</Text>
                  <Text style={st.patternVal}>{data.pattern.longest_streak_days}일</Text>
                </View>
              </View>
            </View>
          </SectionCard>

          {/* 페이스 추이 (S-batch2 #5) — the payload IS the 시안's 라인 차트
              at 3-point resolution (최근 3개월, nullable per guide §127:
              null = line GAP, never zero). Line-with-labels chosen over a
              delta stat: a delta would drop the contract's gap semantics.
              Hidden when all three months are null. */}
          {(data.pace_trend ?? []).some(p => p.avg_pace_sec_per_km != null) && (
            <SectionCard title="페이스 추이" hint="최근 3개월 평균 페이스 — 아래일수록 빨라요.">
              <PaceTrendChart points={data.pace_trend} units={units} />
            </SectionCard>
          )}

          {/* AI 코칭/추천 플랜: REMOVED (owner + backend decision 2026-07-09).
              The server still sends the ai block (typed in insights-api.ts);
              we deliberately don't render it. Replacement content
              (꾸준함/패턴 심화) = future slice I2, TODO. */}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, paddingVertical: 10 },
  appBarBtn:   { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },

  stepperRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S.gutter, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  stepBtn:      { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  stepperLabel: { fontSize: 16, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  stepperLabelBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 6, paddingVertical: 4 },

  // FIXTURE (straggler fix 2026-07-22): the hero is the night-canvas card
  // family (run-result record card's #0C1206 twin) — the batch mis-tokenized
  // its dark-ink bg to C.text, which INVERTS in dark mode and strands the
  // fixture white text on a white card. Fixed dark both schemes, as designed.
  hero:       { backgroundColor: '#0C1206', borderRadius: 22, padding: 20, overflow: 'hidden' },
  heroCircle: { position: 'absolute', top: -40, right: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: C.accent, opacity: 0.16 },
  heroPill:   { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 3, marginBottom: 8 },
  heroPillTxt: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3, color: C.accent, textTransform: 'uppercase' },
  heroDist:   { fontSize: 34, fontWeight: '800', color: '#fff', letterSpacing: -1.2 },
  heroUnit:   { fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },
  heroSub:    { fontSize: 12.5, color: 'rgba(255,255,255,0.7)', letterSpacing: -0.2, marginTop: 5 },

  // month_rank highlight card
  rankCard:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: S.gutter, marginTop: 12, backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accent + '44', borderRadius: 16, paddingHorizontal: 15, paddingVertical: 13 },
  rankMedal:    { width: 38, height: 38, borderRadius: 12, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rankHeadline: { fontSize: 15, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  rankSub:      { fontSize: 12, color: C.sub, letterSpacing: -0.2, marginTop: 2 },

  runDaysRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, marginBottom: 2 },
  runDaysTxt:   { fontSize: 12.5, color: C.sub, letterSpacing: -0.2 },
  runDaysNum:   { fontWeight: '800', color: C.text },

  grid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: S.gutter, paddingTop: 14 },
  metricTile:  { width: '48%', flexGrow: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 13 },
  metricLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2, color: C.faint },
  metricVal:   { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, color: C.text },
  metricUnit:  { fontSize: 11.5, fontWeight: '600', color: C.faint },

  sectionTitle: { fontSize: 16.5, fontWeight: '800', letterSpacing: -0.4, color: C.text, paddingBottom: 12, paddingHorizontal: 2 },
  sectionHint:  { fontSize: 11.5, color: C.faint, letterSpacing: -0.2, lineHeight: 17, paddingTop: 9, paddingHorizontal: 6 },
  trendLabels:  { flexDirection: 'row', marginTop: 10 },
  trendMonth:   { fontSize: 11, color: C.faint, letterSpacing: -0.2 },
  trendPace:    { fontSize: 14, fontWeight: '700', color: C.text, letterSpacing: -0.3, marginTop: 2, fontVariant: ['tabular-nums'] },
  card:         { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 16 },

  prGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'space-between' },
  prLabel: { fontSize: 11.5, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },
  prValue: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.6 },
  prSub:   { fontSize: 11, color: C.faint, letterSpacing: -0.2 },

  weekRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, height: 140, paddingTop: 4 },
  weekVal: { fontSize: 11.5, fontWeight: '700', color: C.text },
  weekBar: { width: '100%', maxWidth: 40, borderRadius: 9, backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accent + '44' },
  weekLbl: { fontSize: 11, color: C.faint },

  weekdayRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 84 },
  weekdayBar: { width: '100%', maxWidth: 26, borderRadius: 7, backgroundColor: C.accentDim },
  weekdayLbl: { fontSize: 11, color: C.faint },

  patternFoot:    { flexDirection: 'row', gap: 10, marginTop: 16, paddingTop: 15, borderTopWidth: 1, borderTopColor: C.border },
  patternCell:    { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  patternIcon:    { width: 34, height: 34, borderRadius: 10, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  patternLbl:     { fontSize: 10.5, color: C.faint, fontWeight: '600' },
  patternVal:     { fontSize: 13, fontWeight: '700', color: C.text, letterSpacing: -0.2 },
  patternDivider: { width: 1, backgroundColor: C.border },

  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 60 },
  stateTxt:  { fontSize: 14, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },
  emptyIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  emptySub:  { fontSize: 12.5, color: C.faint, letterSpacing: -0.2 },
  retryBtn:  { paddingHorizontal: 20, paddingVertical: 10, borderRadius: R.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  retryTxt:  { fontSize: 14, fontWeight: '700', color: C.text },
});
