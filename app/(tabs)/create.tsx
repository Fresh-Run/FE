import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTabBarInset } from '@/components/fresh-tab-bar';
import { MiniMap } from '@/components/mini-map';
import { RealMap } from '@/components/real-map';
import { Icon } from '@/components/ui';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { useRuns } from '@/hooks/use-runs';
import { getBookmarkedRoutes } from '@/lib/bookmarks-api';
import { distUnit, fmtDist } from '@/lib/run-format';
import type { PublicRoute } from '@/lib/routes-api';
import { useQuota } from '@/store/use-quota';
import { useSettings } from '@/store/use-settings';
import { useWeather } from '@/hooks/use-weather';
import {
  colors as C,
  radius as R,
  shadows,
  spacing as S,
  type as T,
} from '@/lib/theme';

function getWeekBounds(): [Date, Date] {
  const now = new Date();
  const daysFromMon = (now.getDay() + 6) % 7;
  const mon = new Date(now);
  mon.setHours(0, 0, 0, 0);
  mon.setDate(mon.getDate() - daysFromMon);
  const sun = new Date(mon);
  sun.setDate(sun.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return [mon, sun];
}

export default function CreateTabScreen() {
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset();
  const { placeName, coordinate } = useCurrentLocation();
  const { weather } = useWeather();
  const { runs, signedOut } = useRuns();

  // Tier + weekly AI quota (design: PREMIUM badge for premium users; lock
  // the AI card only once a free user's weekly quota is exhausted)
  const isPremium = useQuota(s => s.isPremium);
  const quota     = useQuota(s => s.aiGeneration);
  const units     = useSettings(s => s.settings.units);
  useEffect(() => { useQuota.getState().hydrate(); }, []);
  const aiLocked = !isPremium && !quota.unlimited && (quota.remaining ?? 1) <= 0;

  function handleAiPress() {
    if (!aiLocked) { router.push('/(course)/create'); return; }
    // TODO(PR-2): push the premium upsell screen once it exists
    Alert.alert(
      '이번 주 무료 생성을 모두 사용했어요',
      `무료 플랜은 주 ${quota.limit ?? 3}회까지 AI 코스를 만들 수 있어요. 월요일에 초기화됩니다.`,
    );
  }

  // 저장된 코스 entry card — live count + recent titles (canvas: FrRunChoice
  // bottom card). Focus-refetch keeps it honest after unsaves elsewhere.
  const [saved, setSaved] = useState<PublicRoute[] | null>(null);
  const [savedError, setSavedError] = useState(false);
  useFocusEffect(useCallback(() => {
    getBookmarkedRoutes()
      .then(rows => { setSaved(rows); setSavedError(false); })
      // Honest failure sub (debt batch 1): the 북마크해보세요 hint on a
      // FAILED load was a lie — say it failed; every focus retries.
      .catch(() => setSavedError(true));
  }, []));
  const savedSub = savedError && !saved
    ? '불러오지 못했어요 · 다시 열면 재시도돼요'
    : !saved || saved.length === 0
      ? '피드에서 마음에 드는 코스를 북마크해보세요'
      : saved.slice(0, 2).map(r => r.summary).join(', ') || `${saved.length}개 코스`;

  const weeklyKm = useMemo(() => {
    if (signedOut) return 0;
    const [mon, sun] = getWeekBounds();
    return runs
      .filter(r => { const d = new Date(r.ran_at); return d >= mon && d <= sun; })
      .reduce((s, r) => s + r.distance_km, 0);
  }, [runs, signedOut]);

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <ScrollView
        style={st.scroll}
        contentContainerStyle={[st.content, { paddingBottom: tabBarInset }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Title ─────────────────────────────────────────────────── */}
        <Text style={st.title}>오늘 어떻게 달릴까요?</Text>
        <Text style={st.subtitle}>당신의 컨디션에 맞는 완벽한 코스를 선택하세요.</Text>

        {/* ── Card 1: AI course (PREMIUM badge for premium users; locked
               only when a free user's weekly quota is exhausted) ────── */}
        <Pressable
          onPress={handleAiPress}
          style={({ pressed }) => [st.card, st.cardAi, { opacity: pressed ? 0.92 : 1 }]}
        >
          <View style={st.cardCircle} pointerEvents="none" />
          {isPremium && (
            <View style={st.premiumBadge}>
              <Icon name="flash" size={11} color="#fff" />
              <Text style={st.premiumBadgeTxt}>PREMIUM</Text>
            </View>
          )}
          <View style={st.iconSq}>
            <Icon name="sparkles" size={26} color={C.accentText} />
          </View>
          <Text style={st.cardTitle}>AI 맞춤 코스로 시작</Text>
          <Text style={st.cardDesc}>
            현재 위치, 날씨, 개인 체력을 분석하여 가장 쾌적한 최적의 코스를 제안합니다.
          </Text>
          <View style={st.cardCta}>
            {aiLocked && <Icon name="lock-closed" size={13} color={C.accentGrn} />}
            <Text style={st.cardCtaTxt}>{aiLocked ? '프리미엄으로 잠금 해제' : '추천 코스 보기'}</Text>
            <Icon name="chevron-forward" size={14} color={C.accentGrn} />
          </View>
        </Pressable>

        {/* ── Card 2: Free running ─────────────────────────────────── */}
        <Pressable
          onPress={() => router.push('/(course)/tracking' as any)}
          style={({ pressed }) => [st.card, { opacity: pressed ? 0.88 : 1 }]}
        >
          <View style={st.iconSq}>
            <Icon name="walk" size={26} color={C.accentText} />
          </View>
          <Text style={st.cardTitle}>지금 바로 자유 러닝</Text>
          <Text style={st.cardDesc}>
            익숙한 나만의 경로를 따라 자유롭게 달리세요. 거리와 시간을 실시간으로 기록합니다.
          </Text>
          <View style={st.cardCta}>
            <Text style={st.cardCtaTxt}>트래킹 시작하기</Text>
            <Icon name="chevron-forward" size={14} color={C.accentGrn} />
          </View>
        </Pressable>

        {/* ── Stats row: two separate cards ────────────────────────── */}
        <View style={st.statsRow}>
          <View style={[st.statCard, shadows.sm]}>
            <Text style={st.statLabel}>주간 누적 거리</Text>
            <Text style={st.statVal}>
              {fmtDist(weeklyKm, units, 1)}<Text style={st.statUnit}> {distUnit(units)}</Text>
            </Text>
          </View>
          <View style={[st.statCard, shadows.sm]}>
            <Text style={st.statLabel}>현재 온도</Text>
            <View style={st.tempRow}>
              <Icon name="sunny" size={16} color={C.sun} />
              {/* Real weather (W1); quiet dashes while loading/offline */}
              <Text style={st.statVal}>{weather ? `${Math.round(weather.temp_c)}°` : '--°'}</Text>
            </View>
          </View>
        </View>

        {/* ── Location map card — real Apple map centered on the user
               (slice 1); stylized fallback while location resolves ──── */}
        <View style={[st.mapCard, shadows.sm]}>
          {coordinate ? (
            <RealMap height={164} borderRadius={R.xl} center={coordinate} />
          ) : (
            <MiniMap seed="chooser-map" height={164} borderRadius={R.xl} />
          )}
          <View style={st.locationPill}>
            <Icon name="location" size={13} color={C.accentGrn} />
            <Text style={st.locationTxt} numberOfLines={1}>
              현재 위치: {placeName ?? '위치 확인 중…'}
            </Text>
          </View>
        </View>

        {/* ── Saved courses row → 저장된 코스 list (canvas: savedCourses) ── */}
        <Pressable
          onPress={() => router.push('/saved-courses' as any)}
          style={({ pressed }) => [st.savedRow, shadows.sm, { opacity: pressed ? 0.85 : 1 }]}
        >
          <View style={st.savedIcon}>
            <Icon name={saved && saved.length > 0 ? 'bookmark' : 'bookmark-outline'} size={20} color={C.accentGrn} />
          </View>
          <View style={st.savedBody}>
            <Text style={st.savedTitle}>저장된 코스들</Text>
            <Text style={st.savedSub} numberOfLines={1}>{savedSub}</Text>
          </View>
          {saved !== null && saved.length > 0 && (
            <View style={st.savedCountPill}>
              <Text style={st.savedCountTxt}>{saved.length}개</Text>
            </View>
          )}
          <Icon name="chevron-forward" size={18} color={C.faint} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: S.gutter },

  // Title
  title:    { fontSize: 26, fontWeight: '800', letterSpacing: -0.8, color: C.text, marginTop: S.xl, marginBottom: 6 },
  subtitle: { ...T.bodyMd, color: C.sub, marginBottom: S.xl },

  // Option cards
  card: {
    backgroundColor: C.surface,
    borderRadius:    R.xl,
    borderWidth:     1,
    borderColor:     C.border,
    padding:         S.lg,
    marginBottom:    S.md,
    overflow:        'hidden',
  },
  cardAi: {
    borderColor: C.accent + '55',
  },
  premiumBadge: {
    position: 'absolute', top: 16, right: 16, zIndex: 1,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.accentGrn, borderRadius: R.pill,
    paddingLeft: 9, paddingRight: 11, paddingVertical: 5,
  },
  premiumBadgeTxt: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, color: '#fff' },
  cardCircle: {
    position:        'absolute',
    top:             -40,
    right:           -40,
    width:           130,
    height:          130,
    borderRadius:    65,
    backgroundColor: C.accentDim,
  },
  iconSq: {
    width:           52,
    height:          52,
    borderRadius:    R.lg,
    backgroundColor: C.accent,
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    S.md,
  },
  cardTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5, color: C.text, marginBottom: 6 },
  cardDesc:  { ...T.bodyMd, color: C.sub, marginBottom: S.md },
  cardCta:   { flexDirection: 'row', alignItems: 'center', gap: 3 },
  cardCtaTxt:{ ...T.labelLg, color: C.accentGrn, fontWeight: '700' },

  // Stats row
  statsRow: { flexDirection: 'row', gap: S.md, marginBottom: S.md },
  statCard: {
    flex:              1,
    backgroundColor:   C.surface,
    borderRadius:      R.xl,
    borderWidth:       1,
    borderColor:       C.border,
    paddingHorizontal: S.lg,
    paddingVertical:   S.md,
  },
  statLabel: { ...T.labelSm, color: C.sub, marginBottom: 5 },
  statVal:   { ...T.metricLg, color: C.text },
  statUnit:  { ...T.labelMd, color: C.sub },
  tempRow:   { flexDirection: 'row', alignItems: 'center', gap: 5 },

  // Map card
  mapCard: { height: 164, borderRadius: R.xl, overflow: 'hidden', marginBottom: S.md },
  locationPill: {
    position:          'absolute',
    top:               12,
    left:              12,
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    backgroundColor:   'rgba(255,255,255,0.92)',
    borderRadius:      R.pill,
    paddingHorizontal: 10,
    paddingVertical:   6,
  },
  locationTxt: { fontSize: 12, fontWeight: '600', color: C.text, letterSpacing: -0.2 },

  // Saved courses
  savedRow: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: C.surface,
    borderRadius:    R.xl,
    borderWidth:     1,
    borderColor:     C.border,
    padding:         S.md,
    gap:             S.md,
  },
  savedIcon: {
    width:           44,
    height:          44,
    borderRadius:    R.lg,
    backgroundColor: C.accentDim,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  savedBody:  { flex: 1, gap: 3 },
  savedTitle: { ...T.headingSm, color: C.text },
  savedSub:   { ...T.labelMd, color: C.sub },
  savedCountPill: { backgroundColor: C.accentDim, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4 },
  savedCountTxt:  { fontSize: 12.5, fontWeight: '700', color: C.accentGrn, letterSpacing: -0.2 },
});
