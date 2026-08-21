/**
 * 날씨 상세 분석 — Weather Detail screen.
 * Opened from the home screen weather strip via expo-router push.
 * Dismisses with the × button (router.back()).
 */
import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G } from 'react-native-svg';

import { Icon } from '@/components/ui';
import { useWeather } from '@/hooks/use-weather';
import { t, useT, type StringKey, tfIn, useLang } from '@/lib/i18n';
import { weatherIcon, weatherTone } from '@/lib/weather-api';
import { accentShadow,
  radius as R,
  shadows,
  spacing as S,
  type as T, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';

// Data contract: real weather via use-weather (W1, 2026-07-08) — the inline
// DEFAULT_DATA mock this screen shipped with is retired.

// ─── AI score ring ────────────────────────────────────────────────────────────
// SVG circle with strokeDasharray / strokeDashoffset for the fill percentage.
// r = 52, viewBox = 132 × 132, strokeWidth = 11 (matches design bundle).

const RING_SIZE = 132;
const RING_R    = 52;
const RING_SW   = 11;
const RING_CTR  = RING_SIZE / 2;
const CIRC      = 2 * Math.PI * RING_R;

function AiScoreRing({ score }: { score: number }) {
  const C = useTokens();
  const styles = useStyles(makeStyles);
  const offset = CIRC * (1 - Math.min(score, 100) / 100);
  return (
    <View style={styles.ringWrap}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        {/* Gray track */}
        <Circle
          cx={RING_CTR} cy={RING_CTR} r={RING_R}
          fill="none"
          stroke={C.surfaceAlt}
          strokeWidth={RING_SW}
        />
        {/* Lime progress arc, starts at 12 o'clock */}
        <G transform={`rotate(-90, ${RING_CTR}, ${RING_CTR})`}>
          <Circle
            cx={RING_CTR} cy={RING_CTR} r={RING_R}
            fill="none"
            stroke={C.accent}
            strokeWidth={RING_SW}
            strokeLinecap="round"
            strokeDasharray={String(CIRC)}
            strokeDashoffset={String(offset)}
          />
        </G>
      </Svg>
      {/* Centered score label — absolute overlay */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.ringCenter}>
          <Text style={styles.ringScore}>{score}</Text>
          <Text style={styles.ringDenom}>/ 100</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Metric tile ──────────────────────────────────────────────────────────────

interface MetricTileProps {
  iconName:  string;
  label:     string;
  value:     string;
  sub?:      string;
  subColor?: string;
}

function MetricTile({ iconName, label, value, sub, subColor }: MetricTileProps) {
  const C = useTokens();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.tile}>
      <View style={styles.tileHeader}>
        <Icon name={iconName} size={14} color={C.faint} />
        <Text style={styles.tileLabel}>{label}</Text>
      </View>
      <View style={styles.tileValueRow}>
        <Text style={styles.tileValue}>{value}</Text>
        {sub ? <Text style={[styles.tileSub, { color: subColor ?? C.faint }]}>{sub}</Text> : null}
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

// Score → title copy (client-derived; same thresholds as weatherTone)
function scoreTitle(score: number): string {
  if (score >= 70) return t('wx.scoreGood');
  if (score >= 40) return t('wx.scoreOk');
  return t('wx.scoreBad');
}
const BADGE_KEY: Record<ReturnType<typeof weatherTone>, StringKey> = {
  good: 'wx.badgeGood',
  ok:   'wx.badgeOk',
  bad:  'wx.badgeBad',
};
// 등급 표시 키맵 — 서버 enum 와이어(색 맵 키 포함)는 ko 그대로, 표시만 번역
const GRADE_KEY: Record<string, StringKey> = {
  '좋음': 'wx.gGood', '보통': 'wx.gModerate', '나쁨': 'wx.gPoor', '매우나쁨': 'wx.gVeryPoor',
  '낮음': 'wx.gLow', '높음': 'wx.gHigh', '매우높음': 'wx.gVeryHigh', '위험': 'wx.gDanger',
};
const gradeDisp = (g: string | undefined) => (g == null ? g : GRADE_KEY[g] ? t(GRADE_KEY[g]) : g);

export default function WeatherDetailScreen() {
  const lang = useLang(); // 8/6 back-sweep: render tfIn anchor
  const C = useTokens();
  const styles = useStyles(makeStyles);
  const T = useT();
  const insets = useSafeAreaInsets();
  // Real data (W1) — quiet-dashes contract while loading/offline-uncached
  const { weather: w, placeName } = useWeather();

  const score = w?.running_index.score ?? null;
  const tone = score != null ? weatherTone(score) : null;

  const metrics: MetricTileProps[] = [
    {
      iconName: 'water-outline',
      label:    T('wx.humidity'),
      value:    w ? `${w.humidity_pct}%` : '--%',
    },
    {
      iconName:  'cloud-outline',
      label:     T('wx.pm10'),
      value:     w?.pm10 ? String(Math.round(w.pm10.value)) : '—',
      sub:       gradeDisp(w?.pm10?.grade),
      subColor:  w?.pm10 ? C.aqi[w.pm10.grade] : undefined,
    },
    {
      iconName:  'cloud-outline',
      label:     T('wx.pm25'),
      value:     w?.pm25 ? String(Math.round(w.pm25.value)) : '—',
      sub:       gradeDisp(w?.pm25?.grade),
      subColor:  w?.pm25 ? C.aqi[w.pm25.grade] : undefined,
    },
    {
      iconName:  'reorder-three-outline',
      label:     T('wx.wind'),
      value:     w ? w.wind_ms.toFixed(1) : '—',
      sub:       '㎧',
    },
    // 자외선 — LIVE (기상청 5단계, C.uv map). Contract: null on partial
    // outage → tile hidden. SEMANTICS FLIPPED 8/21 (지연 8/17, One Call 4.0
    // 이행): the payload now carries a REAL-TIME uvi, not the old 2.5-era
    // daily solar-noon max — probed 2026-08-21 09:17 KST: value 1.9 (낮음),
    // a max reading would be ~7-9 in August. Label follows ('현재 자외선').
    // Night collapse (is_day, BE 2bd2855) kept — current UV after dark is
    // ~0 and the tile stays hidden as before.
    ...(w && (!w.uv || !w.is_day) ? [] : [{
      iconName:  'sunny-outline',
      label:     T('wx.uvNow'),
      value:     w?.uv ? String(w.uv.value) : '—',
      sub:       gradeDisp(w?.uv?.grade),
      subColor:  w?.uv ? C.uv[w.uv.grade] : undefined,
    }]),
    // 강수확률 repurposed to 강수량 (rain_1h_mm; owner call 2026-07-08)
    {
      iconName: 'rainy-outline',
      label:    T('wx.rain1h'),
      value:    w ? (w.rain_1h_mm != null ? `${w.rain_1h_mm}mm` : T('wx.none')) : '—',
    },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerBtn}>
          <Icon name="close" size={22} color={C.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{T('wx.title')}</Text>
        {/* Share — was a dead Pressable (no onPress) since the screen shipped;
            wired 2026-07-20 (#2b): the screen's own summary is the content.
            Disabled until weather data exists (nothing honest to share). */}
        <Pressable
          hitSlop={12}
          style={[styles.headerBtn, !w && { opacity: 0.35 }]}
          disabled={!w}
          onPress={() => {
            if (!w) return;
            Share.share({
              // server values pass through untouched: {cond} = w.condition (ko wire)
              message: tfIn(lang, 'wx.share', {
                place: placeName ?? t('wx.curLoc'),
                t: Math.round(w.temp_c),
                cond: w.condition,
                feels: Math.round(w.feels_like_c),
                score: w.running_index.score,
                verdict: scoreTitle(w.running_index.score),
              }),
            }).catch(() => {}); // user-cancelled share sheets throw on some platforms — quiet
          }}
        >
          <Icon name="share-outline" size={21} color={C.text} />
        </Pressable>
      </View>

      {/* ── Scrollable content ─────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: S.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Status badge — tone-derived; hidden until data exists */}
        {tone && (
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <View style={styles.badgeDot} />
              <Text style={styles.badgeText}>{T(BADGE_KEY[tone])}</Text>
            </View>
          </View>
        )}

        {/* Hero — temperature + sun icon */}
        <View style={styles.hero}>
          <View style={styles.heroRow}>
            <Text style={styles.heroTemp}>{w ? `${Math.round(w.temp_c)}°` : '--°'}</Text>
            {/* Real sky icon — same weatherIcon mapping as the home strip (W2) */}
            {(() => {
              const ic = w ? weatherIcon(w.condition_code, w.is_day) : { name: 'sunny', color: C.sun };
              return <Icon name={ic.name as any} size={48} color={ic.color} />;
            })()}
          </View>
          <Text style={styles.heroSub}>
            {w ? tfIn(lang, 'wx.feels', { cond: w.condition, n: Math.round(w.feels_like_c) }) : T('wx.loading')} · {placeName ?? T('wx.locating')}
          </Text>
        </View>

        {/* AI 러닝 지수 card — comment is the single advice source (the old
            separate AI 조언 card duplicated it verbatim → removed in W1) */}
        <View style={[styles.aiCard, shadows.md]}>
          <AiScoreRing score={score ?? 0} />
          <View style={styles.aiRight}>
            <View style={styles.aiLabelRow}>
              <Icon name="sparkles" size={13} color={C.accentGrn} />
              <Text style={styles.aiLabel}>{T('wx.aiLabel')}{w?.running_index.personalized ? T('wx.aiMine') : ''}</Text>
            </View>
            <Text style={styles.aiTitle}>{score != null ? scoreTitle(score) : '—'}</Text>
            <Text style={styles.aiDesc}>{w?.running_index.comment ?? T('wx.waiting')}</Text>
          </View>
        </View>

        {/* Metrics grid */}
        <View style={styles.grid}>
          {metrics.map((m) => (
            <MetricTile key={m.label} {...m} />
          ))}
        </View>
      </ScrollView>

      {/* ── Sticky CTA — outside ScrollView, above home indicator ── */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, S.lg) + S.sm }]}>
        <Pressable
          style={({ pressed }) => [styles.cta, accentShadow(C.accent), { opacity: pressed ? 0.88 : 1 }]}
          // Direct target — this used to push the (course) GROUP ROOT, which
          // resolved through the deleted index shim's Redirect to the chooser
          onPress={() => router.push('/(tabs)/create' as any)}
        >
          <Icon name="play-circle" size={20} color={C.accentText} />
          <Text style={styles.ctaLabel}>{T('wx.cta')}</Text>
        </Pressable>
      </View>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (C: Tokens) => StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },

  // Header bar
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    backgroundColor: C.surface,
    paddingHorizontal: S.lg,
    paddingVertical:   14,
  },
  headerBtn:   { width: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...T.headingMd, color: C.text },

  // Scroll
  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: S.gutter },

  // Status badge
  badgeRow: { alignItems: 'center', marginTop: S.xxl, marginBottom: S.sm },
  badge: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             7,
    backgroundColor: C.accentDim,
    borderWidth:     1,
    borderColor:     C.accent + '44',
    paddingHorizontal: 14,
    paddingVertical:   7,
    borderRadius:    R.pill,
  },
  badgeDot:  { width: 7, height: 7, borderRadius: 4, backgroundColor: C.accent },
  badgeText: { ...T.labelMd, color: C.accentGrn, textTransform: 'uppercase', letterSpacing: 0.2 },

  // Hero
  hero:     { alignItems: 'center', marginTop: S.lg, marginBottom: S.xl },
  heroRow:  { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroTemp: { ...T.heroTemp, color: C.text },
  heroSub:  { ...T.bodyMd, color: C.sub, marginTop: 10, textAlign: 'center' },

  // AI score card
  aiCard: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             S.lg,
    backgroundColor: C.surface,
    borderWidth:     1,
    borderColor:     C.border,
    borderRadius:    R.xl,
    padding:         18,
    marginBottom:    11,
  },
  ringWrap:   { width: RING_SIZE, height: RING_SIZE, flexShrink: 0 },
  ringCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ringScore:  { ...T.ringScore, color: C.text, lineHeight: 40 },
  ringDenom:  { ...T.labelSm,   color: C.faint, marginTop: 2 },
  aiRight:    { flex: 1, gap: 5 },
  aiLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  aiLabel:    { ...T.labelMd, color: C.accentGrn, textTransform: 'uppercase', letterSpacing: 0.2 },
  aiTitle:    { ...T.headingMd, color: C.text },
  aiDesc:     { ...T.labelMd, color: C.sub, lineHeight: 18 },

  // Metrics grid
  grid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           11,
    marginBottom:  11,
  },
  tile: {
    width:           '47%',
    flexGrow:        1,
    backgroundColor: C.surface,
    borderWidth:     1,
    borderColor:     C.border,
    borderRadius:    R.lg,
    padding:         14,
    gap:             8,
    // shadow via shadows.sm props spread below is unsupported in StyleSheet directly;
    // passed inline on the component when needed. Tile shadow via elevation only:
    elevation:       1,
    shadowColor:     '#000',
    shadowOpacity:   0.04,
    shadowRadius:    6,
    shadowOffset:    { width: 0, height: 2 },
  },
  tileHeader:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tileLabel:    { ...T.labelMd, color: C.faint },
  tileValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 1 },
  tileValue:    { ...T.metricLg, color: C.text },
  tileSub:      { ...T.metricSm },

  // AI advice card
  adviceCard: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    gap:             S.md,
    backgroundColor: C.blue + '14',
    borderWidth:     1,
    borderColor:     C.blue + '33',
    borderRadius:    R.lg,
    padding:         15,
  },
  adviceIcon: {
    width:           36,
    height:          36,
    borderRadius:    11,
    backgroundColor: C.blue + '22',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  adviceBody:  { flex: 1, gap: 4 },
  adviceTitle: { ...T.labelMd, color: C.blue, textTransform: 'uppercase', letterSpacing: 0.3 },
  adviceText:  { ...T.labelLg, color: C.text, lineHeight: 20 },

  // Sticky footer CTA
  footer: {
    paddingHorizontal: S.gutter,
    paddingTop:        S.md,
    backgroundColor:   C.bg,
  },
  cta: {
    height:          56,
    borderRadius:    R.lg,
    backgroundColor: C.accent,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             9,
  },
  ctaLabel: { ...T.ctaLabel, color: C.accentText },
});
