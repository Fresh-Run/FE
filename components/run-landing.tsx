// 런 랜딩 chrome (redesign ③ → ④a, 2026-11-19) — canvas FreeRunD1 (자유러닝
// 메인) + AICourse (C2 · AI 코스런, 스와이프). Since 4a this is NOT a screen:
// (course)/tracking mounts it over ITS OWN map in the free-run idle state, so
// 뛰러가기 starts the countdown on the same screen and this chrome unmounts
// on the state change (owner direction: no separate page). X → onClose (the
// tab you came from). Bottom content sits on the safe-area inset. Two-page
// pager:
//   page 0 자유러닝: 이번 주 km · 스트릭 chips + 뛰러가기 → onStart (tracker.start)
//   page 1 AI 코스런: quick-config sheet (거리 · 3K/5K/10K · 원점 복귀/일방통행)
//     → 코스 생성하기 seeds the existing (course)/create form (seedKm +
//     seedOneWay). Generation fires ONLY from that form's CTA — the 8/28
//     auto-fire deletion stands (review-first ruling), so this sheet is a
//     hand-off, not a generator.
// Data: 이번 주 = server GET /me/stats `week` (the old tab summed page-one
// runs — corrected); 스트릭 = derived (currentStreakDays, 지연 ask ④); quota =
// weekly (owner ruling: "이번 주 무료 생성 N회 남음"). 저장된 코스 = small link
// in the sheet (owner ruling). Colors via tokens (Figma light-only).
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { SeededSlider } from '@/components/seeded-slider';
import { Icon } from '@/components/ui';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { useProfile } from '@/hooks/use-profile';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useWeather } from '@/hooks/use-weather';
import { currentStreakDays, useWeeklyDistance } from '@/hooks/use-weekly-distance';
import { t, tf, tfIn, useLang, useT } from '@/lib/i18n';
import { distUnit, fmtDist } from '@/lib/run-format';
import { getMyStats, type MyStats } from '@/lib/stats-api';
import { radius as R, shadows, type Tokens, DENSE_MAX_FONT_SCALE } from '@/lib/theme';
import { useQuota } from '@/store/use-quota';
import { useSettings } from '@/store/use-settings';

// C2 sheet range (km). The form's own floor/cap apply after hand-off.
const SHEET_MIN_KM = 2;
const SHEET_MAX_KM = 13;
const PRESETS_KM = [3, 5, 10];
const EST_MIN_PER_KM = 6.5; // same placeholder pace the form uses pre-generation

type Mode = 0 | 1; // 0 = 자유러닝, 1 = AI 코스런

export function RunLanding({ onStart, onClose }: { onStart: () => void; onClose: () => void }) {
  const T = useT();
  const lang = useLang();
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const bottomPad = insets.bottom + 14; // was the tab-bar inset; the bar is gone on this route
  const { width } = useWindowDimensions();
  const units = useSettings(s => s.settings.units);

  const { status: locStatus } = useCurrentLocation();
  const { weather } = useWeather();
  const { profile } = useProfile();

  // 이번 주 (server) + 스트릭 (derived from the monthly days the hook fetches)
  const [stats, setStats] = useState<MyStats | null>(null);
  const { monthly, refetch: refetchMonthly } = useWeeklyDistance(12);
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    getMyStats().then(res => { if (!cancelled) setStats(res); }).catch(() => { /* last value stands */ });
    void refetchMonthly();
    return () => { cancelled = true; };
  }, [refetchMonthly]));
  const streak = currentStreakDays(Object.values(monthly).flatMap(m => m.days));
  const weekKm = stats?.week.total_distance_km ?? 0;

  // Tier + weekly AI quota
  const isPremium = useQuota(s => s.isPremium);
  const quota     = useQuota(s => s.aiGeneration);
  useEffect(() => { useQuota.getState().hydrate(); }, []);
  const aiLocked = !isPremium && !quota.unlimited && (quota.remaining ?? 1) <= 0;

  // Pager — segment taps and horizontal swipes both switch mode
  const pagerRef = useRef<ScrollView>(null);
  const [mode, setMode] = useState<Mode>(0);
  const goTo = (m: Mode) => { setMode(m); pagerRef.current?.scrollTo({ x: m * width, animated: true }); };

  // Sheet state (quick config)
  const [distanceKm, setDistanceKm] = useState(5);
  const [oneWay, setOneWay] = useState(false);
  const [sliding, setSliding] = useState(false); // pager yields to the slider's drag
  const estMin = Math.round(distanceKm * EST_MIN_PER_KM);

  function handleGenerate() {
    if (aiLocked) {
      // eslint-disable-next-line no-restricted-syntax -- imperative fire-time read (Alert), not render-path
      Alert.alert(t('ct.quotaOutT'), tf('ct.quotaOutB', { n: quota.limit ?? 3 }));
      return;
    }
    router.push({ pathname: '/(course)/create', params: { seedKm: String(distanceKm), seedOneWay: oneWay ? '1' : '0' } } as never);
  }

  const quotaLine = isPremium || quota.unlimited
    ? T('rt.quotaUnlimited')
    : tfIn(lang, 'rt.quotaWeekly', { n: quota.remaining ?? 0 });

  return (
    <View style={st.root} pointerEvents="box-none">
      {/* The map is the host screen's (tracking's MapView) — nothing here */}
      {/* Top fade so the segment reads over any map */}
      <View style={[st.topFade, { height: insets.top + 90 }]} pointerEvents="none" />

      {/* Pager */}
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        scrollEnabled={!sliding}
        showsHorizontalScrollIndicator={false}
        style={StyleSheet.absoluteFill}
        contentContainerStyle={{ width: width * 2 }}
        onMomentumScrollEnd={e => setMode(Math.round(e.nativeEvent.contentOffset.x / width) as Mode)}
        scrollEventThrottle={16}
      >
        {/* Page 0 — 자유러닝 */}
        <View style={[st.page, { width, paddingBottom: bottomPad }]} pointerEvents="box-none">
          <View style={st.chipRow}>
            <View style={[st.chip, shadows.sm]}>
              <Text style={st.chipLbl}>{T('rt.weekChip')} </Text>
              <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.chipVal}>{fmtDist(weekKm, units, 1)} {distUnit(units)}</Text>
            </View>
            <View style={[st.chip, shadows.sm]}>
              <Text style={st.chipLbl}>{T('rt.streakChip')} </Text>
              <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.chipVal}>{tfIn(lang, 'rt.streakDays', { n: streak })}</Text>
            </View>
          </View>
          <Pressable
            onPress={onStart}
            style={({ pressed }) => [st.goBtn, { backgroundColor: C.neon }, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
            accessibilityRole="button"
            accessibilityLabel={T('rt.go')}
          >
            <Text style={st.goTxt}>{T('rt.go')}</Text>
          </Pressable>
        </View>

        {/* Page 1 — AI 코스런 sheet */}
        <View style={[st.page, { width, paddingHorizontal: 0 }]} pointerEvents="box-none">
          <View style={[st.sheet, { paddingBottom: bottomPad }]}>
            <View style={st.sheetTitleRow}>
              <Pressable onPress={() => goTo(0)} hitSlop={8} accessibilityRole="button" accessibilityLabel={T('rt.modeFree')}>
                <Text style={st.sheetBack}>‹ {T('rt.modeFree')}</Text>
              </Pressable>
              <Text style={st.sheetTitle}>{T('rt.modeAi')}</Text>
              <View style={st.premiumBadge}><Text style={st.premiumTxt}>{T('rt.premium')}</Text></View>
            </View>
            <View style={st.dots}>
              <View style={[st.dot, { backgroundColor: C.border }]} />
              <View style={[st.dot, { backgroundColor: C.text }]} />
            </View>

            <View style={{ alignItems: 'center', marginTop: 12 }}>
              <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.heroNum}>
                {fmtDist(distanceKm, units, 1)}<Text style={st.heroUnit}> {distUnit(units)}</Text>
              </Text>
              <Text style={st.heroSub}>{tfIn(lang, 'rt.estLine', { m: estMin })}</Text>
            </View>

            <View style={{ marginTop: 10, marginHorizontal: 6 }}>
              <SeededSlider
                siteId="run-tab-sheet"
                value={distanceKm}
                minimumValue={SHEET_MIN_KM}
                maximumValue={SHEET_MAX_KM}
                step={0.5}
                onValueChange={v => setDistanceKm(Math.round(v * 2) / 2)}
                onSlidingStart={() => setSliding(true)}
                onSlidingComplete={() => setSliding(false)}
                minimumTrackTintColor={C.accent}
                maximumTrackTintColor={C.surfaceAlt}
                thumbTintColor={C.surface}
              />
              <View style={st.rangeRow}>
                <Text style={st.rangeTxt}>{fmtDist(SHEET_MIN_KM, units, 0)} {distUnit(units)}</Text>
                <Text style={st.rangeTxt}>{fmtDist(SHEET_MAX_KM, units, 0)} {distUnit(units)}</Text>
              </View>
            </View>

            <View style={st.presetRow}>
              {PRESETS_KM.map(km => {
                const on = distanceKm === km;
                return (
                  <Pressable key={km} onPress={() => setDistanceKm(km)} style={[st.preset, on ? st.presetOn : st.presetOff]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                    <Text style={[st.presetTxt, { color: on ? C.text : C.sub, fontWeight: on ? '700' : '500' }]}>{km}K</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={st.typeRow}>
              {([[false, 'crt.loop'], [true, 'crt.oneWay']] as [boolean, 'crt.loop' | 'crt.oneWay'][]).map(([ow, key]) => {
                const on = oneWay === ow;
                return (
                  <Pressable key={key} onPress={() => setOneWay(ow)} style={[st.typeBtn, on ? st.presetOn : st.presetOff]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                    <Text style={[st.typeTxt, { color: on ? C.text : C.sub, fontWeight: on ? '700' : '500' }]}>{T(key)}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={handleGenerate}
              style={({ pressed }) => [st.genBtn, { backgroundColor: C.neon }, pressed && { opacity: 0.9 }]}
              accessibilityRole="button"
              accessibilityLabel={T('crt.generate')}
            >
              <Icon name="sparkles" size={15} color="#121712" />
              <Text style={st.genTxt}>{T('crt.generate')}</Text>
            </Pressable>
            <Text style={st.quotaTxt}>{quotaLine}</Text>
            <Pressable onPress={() => router.push('/saved-courses' as never)} hitSlop={8} style={st.savedLink} accessibilityRole="link">
              <Icon name="bookmark-outline" size={12} color={C.sub} />
              <Text style={st.savedLinkTxt}>{T('rt.savedLink')}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
      {/* Top row: close (left) · mode segment (center) · avatar (right).
          RENDERED AFTER the pager on purpose (fix 2026-11-19, owner report:
          the whole top of the landing ignored taps): the pager is a full-screen
          ScrollView, and a sibling drawn before it sits UNDER it — its taps
          went to the scroll view. 뛰러가기 lives inside the pager, which is why
          only the bottom worked. Later sibling = on top. */}
      <View style={[st.topRow, { top: insets.top + 12 }]} pointerEvents="box-none">
        <Pressable
          onPress={onClose}
          hitSlop={8}
          style={[st.closeBtn, shadows.sm]}
          accessibilityRole="button"
          accessibilityLabel={T('rt.close')}
        >
          <Icon name="close" size={20} color={C.text} />
        </Pressable>
        <View style={[st.segment, shadows.sm]}>
          {([0, 1] as Mode[]).map(m => {
            const on = mode === m;
            return (
              <Pressable
                key={m}
                onPress={() => goTo(m)}
                style={[st.segBtn, on && { backgroundColor: C.text }]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={T(m === 0 ? 'rt.modeFree' : 'rt.modeAi')}
              >
                <Text style={[st.segTxt, { color: on ? C.bg : C.sub, fontWeight: on ? '700' : '500' }]}>{T(m === 0 ? 'rt.modeFree' : 'rt.modeAi')}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          onPress={() => router.navigate('/(tabs)/my' as never)}
          style={st.avatarBtn}
          accessibilityRole="button"
          accessibilityLabel={T('tab.my')}
        >
          <Avatar name={profile?.nickname} size={38} photoUrl={profile?.avatar_url} ring={C.surface} pending={!profile} />
        </Pressable>
      </View>

      {/* Weather chip (C2) — AI mode only; quiet while loading */}
      {mode === 1 && weather && (
        <View style={[st.weatherChip, shadows.sm, { top: insets.top + 66 }]} pointerEvents="none">
          <Text style={st.weatherTxt}>{tfIn(lang, 'rt.weatherChip', { t: Math.round(weather.temp_c), label: weather.running_index.label })}</Text>
        </View>
      )}

      {/* Location state (not granted) — the only copy on the empty ground */}
      {locStatus !== 'granted' && (
        <View style={[st.locNote, { top: insets.top + 70 }]} pointerEvents="none">
          <Icon name="location-outline" size={13} color={C.sub} />
          <Text style={st.locNoteTxt}>{locStatus === 'denied' ? T('trk.locPermTitle') : T('wx.locating')}</Text>
        </View>
      )}

    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root:        { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent' },
  topFade:     { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: C.bg, opacity: 0.55 },
  topRow:      { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  segment:     { flexDirection: 'row', gap: 4, padding: 5, borderRadius: 14, backgroundColor: C.surface },
  segBtn:      { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 10 },
  segTxt:      { fontSize: 12.5 },
  avatarBtn:   { position: 'absolute', right: 22, top: 0 },
  closeBtn:    { position: 'absolute', left: 16, top: 0, width: 38, height: 38, borderRadius: 19, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  weatherChip: { position: 'absolute', left: 22, backgroundColor: C.surface, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 8 },
  weatherTxt:  { fontSize: 11.5, fontWeight: '700', color: C.text },
  locNote:     { position: 'absolute', left: 22, flexDirection: 'row', alignItems: 'center', gap: 4 },
  locNoteTxt:  { fontSize: 11.5, color: C.sub },
  page:        { height: '100%', justifyContent: 'flex-end', paddingHorizontal: 22 },
  chipRow:     { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 12 },
  chip:        { flexDirection: 'row', alignItems: 'baseline', backgroundColor: C.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 },
  chipLbl:     { fontSize: 12, color: C.sub },
  chipVal:     { fontSize: 12.5, fontWeight: '800', color: C.text },
  goBtn:       { height: 64, borderRadius: R.xl, alignItems: 'center', justifyContent: 'center', shadowColor: '#121712', shadowOpacity: 0.14, shadowRadius: 13, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  goTxt:       { fontSize: 17, fontWeight: '900', color: '#121712' },
  sheet:       { backgroundColor: C.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 22, paddingTop: 18 },
  sheetTitleRow:{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 18 },
  sheetBack:   { fontSize: 14, fontWeight: '500', color: C.sub },
  sheetTitle:  { fontSize: 16, fontWeight: '900', color: C.text },
  premiumBadge:{ backgroundColor: C.accent, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 3 },
  premiumTxt:  { fontSize: 9.5, fontWeight: '700', color: C.accentText },
  dots:        { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
  dot:         { width: 6, height: 6, borderRadius: 3 },
  heroNum:     { fontSize: 44, fontWeight: '800', letterSpacing: -1, color: C.text },
  heroUnit:    { fontSize: 17, fontWeight: '700', letterSpacing: 0 },
  heroSub:     { fontSize: 11, color: C.sub, marginTop: 2 },
  rangeRow:    { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  rangeTxt:    { fontSize: 10, color: C.sub },
  presetRow:   { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 12 },
  preset:      { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  presetOn:    { backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.text },
  presetOff:   { backgroundColor: C.surfaceAlt, borderWidth: 1.5, borderColor: 'transparent' },
  presetTxt:   { fontSize: 12 },
  typeRow:     { flexDirection: 'row', gap: 8, marginTop: 12 },
  typeBtn:     { flex: 1, paddingVertical: 11, borderRadius: 14, alignItems: 'center' },
  typeTxt:     { fontSize: 12.5 },
  genBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 56, borderRadius: R.xl, marginTop: 14 },
  genTxt:      { fontSize: 15, fontWeight: '900', color: '#121712' },
  quotaTxt:    { textAlign: 'center', fontSize: 10, color: C.sub, marginTop: 8 },
  savedLink:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 10, paddingVertical: 4 },
  savedLinkTxt:{ fontSize: 11.5, fontWeight: '600', color: C.sub, textDecorationLine: 'underline' },
});
