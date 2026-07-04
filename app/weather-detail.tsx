/**
 * 날씨 상세 분석 — Weather Detail screen.
 * Opened from the home screen weather strip via expo-router push.
 * Dismisses with the × button (router.back()).
 */
import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G } from 'react-native-svg';

import { Icon } from '@/components/ui';
import {
  accentShadow,
  colors as C,
  radius as R,
  shadows,
  spacing as S,
  type as T,
} from '@/lib/theme';

// ─── Data contract ────────────────────────────────────────────────────────────

export interface WeatherDetail {
  temp:             number;   // °C displayed
  feelsLike:        number;   // °C
  condition:        string;   // e.g. '맑음'
  location:         string;   // e.g. '서울 성수동'
  runningScore:     number;   // 0–100
  scoreTitle:       string;   // e.g. '최적의 컨디션'
  scoreDescription: string;
  humidity:         number;   // %
  aqi:              { value: number; label: string };
  pm25:             { value: number; label: string };
  wind:             number;   // m/s
  uv:               { value: number; label: string };
  precipitation:    number;   // %
  aiAdvice:         string;
}

const DEFAULT_DATA: WeatherDetail = {
  temp:             18,
  feelsLike:        16,
  condition:        '맑음',
  location:         '서울 성수동',
  runningScore:     92,
  scoreTitle:       '최적의 컨디션',
  scoreDescription: '기온과 습도가 러닝에 매우 이상적이에요. 가볍게 한 바퀴 돌기 좋은 날입니다.',
  humidity:         45,
  aqi:              { value: 28, label: '좋음' },
  pm25:             { value: 19, label: '보통' },
  wind:             2.1,
  uv:               { value: 4,  label: '보통' },
  precipitation:    10,
  aiAdvice:         '미세먼지가 적고 바람이 시원해요. 한강변 5km 러닝은 어떠세요?',
};

// ─── AI score ring ────────────────────────────────────────────────────────────
// SVG circle with strokeDasharray / strokeDashoffset for the fill percentage.
// r = 52, viewBox = 132 × 132, strokeWidth = 11 (matches design bundle).

const RING_SIZE = 132;
const RING_R    = 52;
const RING_SW   = 11;
const RING_CTR  = RING_SIZE / 2;
const CIRC      = 2 * Math.PI * RING_R;

function AiScoreRing({ score }: { score: number }) {
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

function MetricTile({ iconName, label, value, sub, subColor = C.faint }: MetricTileProps) {
  return (
    <View style={styles.tile}>
      <View style={styles.tileHeader}>
        <Icon name={iconName} size={14} color={C.faint} />
        <Text style={styles.tileLabel}>{label}</Text>
      </View>
      <View style={styles.tileValueRow}>
        <Text style={styles.tileValue}>{value}</Text>
        {sub ? <Text style={[styles.tileSub, { color: subColor }]}>{sub}</Text> : null}
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

interface Props {
  data?: WeatherDetail;
}

export default function WeatherDetailScreen({ data = DEFAULT_DATA }: Props) {
  const insets = useSafeAreaInsets();

  const metrics: MetricTileProps[] = [
    {
      iconName: 'water-outline',
      label:    '습도',
      value:    `${data.humidity}%`,
    },
    {
      iconName:  'cloud-outline',
      label:     '미세먼지 (AQI)',
      value:     String(data.aqi.value),
      sub:       data.aqi.label,
      subColor:  C.aqi[data.aqi.label],
    },
    {
      iconName:  'cloud-outline',
      label:     '초미세 PM2.5',
      value:     String(data.pm25.value),
      sub:       data.pm25.label,
      subColor:  C.aqi[data.pm25.label],
    },
    {
      iconName:  'reorder-three-outline',
      label:     '바람',
      value:     String(data.wind),
      sub:       '㎧',
    },
    {
      iconName:  'sunny-outline',
      label:     '자외선',
      value:     data.uv.label,
      sub:       `지수 ${data.uv.value}`,
    },
    {
      iconName: 'rainy-outline',
      label:    '강수확률',
      value:    `${data.precipitation}%`,
    },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerBtn}>
          <Icon name="close" size={22} color={C.text} />
        </Pressable>
        <Text style={styles.headerTitle}>날씨 상세 분석</Text>
        <Pressable hitSlop={12} style={styles.headerBtn}>
          <Icon name="share-outline" size={21} color={C.text} />
        </Pressable>
      </View>

      {/* ── Scrollable content ─────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: S.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Status badge */}
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <View style={styles.badgeDot} />
            <Text style={styles.badgeText}>러닝하기 딱 좋아요</Text>
          </View>
        </View>

        {/* Hero — temperature + sun icon */}
        <View style={styles.hero}>
          <View style={styles.heroRow}>
            <Text style={styles.heroTemp}>{data.temp}°</Text>
            <Icon name="sunny" size={48} color={C.sun} />
          </View>
          <Text style={styles.heroSub}>
            {data.condition} · 체감 {data.feelsLike}° · {data.location}
          </Text>
        </View>

        {/* AI 러닝 지수 card */}
        <View style={[styles.aiCard, shadows.md]}>
          <AiScoreRing score={data.runningScore} />
          <View style={styles.aiRight}>
            <View style={styles.aiLabelRow}>
              <Icon name="sparkles" size={13} color={C.accentGrn} />
              <Text style={styles.aiLabel}>AI 러닝 지수</Text>
            </View>
            <Text style={styles.aiTitle}>{data.scoreTitle}</Text>
            <Text style={styles.aiDesc}>{data.scoreDescription}</Text>
          </View>
        </View>

        {/* Metrics 2 × 3 grid */}
        <View style={styles.grid}>
          {metrics.map((m) => (
            <MetricTile key={m.label} {...m} />
          ))}
        </View>

        {/* AI 조언 card */}
        <View style={styles.adviceCard}>
          <View style={styles.adviceIcon}>
            <Icon name="sparkles" size={18} color={C.blue} />
          </View>
          <View style={styles.adviceBody}>
            <Text style={styles.adviceTitle}>AI 조언</Text>
            <Text style={styles.adviceText}>{data.aiAdvice}</Text>
          </View>
        </View>
      </ScrollView>

      {/* ── Sticky CTA — outside ScrollView, above home indicator ── */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, S.lg) + S.sm }]}>
        <Pressable
          style={({ pressed }) => [styles.cta, accentShadow(C.accent), { opacity: pressed ? 0.88 : 1 }]}
          onPress={() => router.push('/(course)')}
        >
          <Icon name="play-circle" size={20} color={C.accentText} />
          <Text style={styles.ctaLabel}>러닝 시작하기</Text>
        </Pressable>
      </View>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
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
