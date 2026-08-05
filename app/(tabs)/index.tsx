/**
 * Home screen — Layout B from the FrHomeB bundle spec.
 * Feed v2 (feed-triage slice 2026-07-17): BOTH tabs are RUN cards — 친구 =
 * followed users' + own runs (GET /feed/activities), 전체 = nearby discovery
 * (GET /feed/nearby). One RunCard render path; the course feed (GET /feed)
 * left home entirely (owner ruling — 코스 surfaces keep courses; the
 * canvas home-cards.jsx 친구 feed is run cards).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { KudosSheet } from '@/components/kudos-sheet';
import { SuggestedRunnersRow, useSuggestedRunners } from '@/components/suggested-runners';
import { tfIn, tIn, useLang, useT } from '@/lib/i18n';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useNavigation } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Linking,
  RefreshControl,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { useTabBarInset } from '@/components/fresh-tab-bar';
import { PendingRunRecovery } from '@/components/pending-run-recovery';
import { Icon } from '@/components/ui';
import * as Location from 'expo-location';

import { RunCard } from '@/components/run-card';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { useFeed, useNearbyFeed } from '@/hooks/use-feed';
import { LOOP_MIN_TARGET_KM } from '@/hooks/use-generate-route';
import { getUnreadCount } from '@/lib/notifications-api';
import { openProfile } from '@/lib/profile-nav';
import { type FeedRun } from '@/lib/feed-api';
import { kudosRun, unkudosRun } from '@/lib/run-social-api';
import { shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useQuota } from '@/store/use-quota';
import { getMyRecentRuns } from '@/lib/runs-api';
import { prewarmTracks } from '@/lib/track-cache';
import { useSettings } from '@/store/use-settings';
import { useStore } from '@/store/use-store';
import type { Coordinate } from '@/types';
import { useWeather } from '@/hooks/use-weather';
import { weatherIcon, weatherTone, type WeatherTone } from '@/lib/weather-api';

// friends v1.1 interleave interval — constant for later retune (owner spec)
const SUGGEST_EVERY_N = 3;

// ─── Constants / helpers ──────────────────────────────────────────────────────

// Plain helper — tokens passed in (hooks live in components only)
function verdictColor(C: Tokens, tone: WeatherTone): string {
  if (tone === 'good') return C.accent;
  if (tone === 'ok')   return C.sun;
  return C.danger;
}

const DAY_KEYS = ['day.sun', 'day.mon', 'day.tue', 'day.wed', 'day.thu', 'day.fri', 'day.sat'] as const;
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatDate(lang: 'ko' | 'en'): string {
  const d = new Date();
  const day = tIn(lang, DAY_KEYS[d.getDay()]);
  return lang === 'en'
    ? `${day}, ${MONTHS_EN[d.getMonth()]} ${d.getDate()}`
    : `${day}, ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// ─── Greeting header ──────────────────────────────────────────────────────────

function Greeting({ name, photoUrl, showBellDot, onBell }: { name: string; photoUrl: string | null; showBellDot: boolean; onBell: () => void }) {
  const C = useTokens();
  const gst = useStyles(makeGst);
  // own lang subscription (2026-08-03 formatter-cache fix): this component
  // renders under the header useMemo (no lang dep) — without subscribing it
  // never re-renders on a flip; with it, the memo's element-reference bailout
  // is irrelevant. lang passed into formatDate/tfIn keeps the compiler's
  // expression cache locale-keyed.
  const lang = useLang();
  return (
    <View style={gst.row}>
      <View style={{ minWidth: 0, flex: 1 }}>
        <RNText style={gst.date}>{formatDate(lang)}</RNText>
        <RNText style={gst.heading} numberOfLines={1}>{tfIn(lang, 'home.greeting', { name })}</RNText>
      </View>
      <View style={gst.actions}>
        <Pressable onPress={onBell} style={[gst.bellBtn, shadows.sm]}>
          <Icon name="notifications-outline" size={20} color={C.text} />
          {/* Truthful dot (S-cluster batch 2): real unread count on focus —
              the item-17-era hardcoded dot is retired */}
          {showBellDot && <View style={gst.notifDot} />}
        </Pressable>
        {/* Avatar → 내 프로필 (social profile; canvas 2026-07-07) */}
        <Pressable onPress={() => router.push('/my-profile' as any)} hitSlop={6}>
          <Avatar name={name} size={38} ring={C.border} photoUrl={photoUrl} letterSpacing={-0.3} />
        </Pressable>
      </View>
    </View>
  );
}

const makeGst = (C: Tokens) => StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  date:     { fontSize: 12.5, color: C.faint, letterSpacing: -0.2, fontWeight: '600' },
  heading:  { fontSize: 20, fontWeight: '700', letterSpacing: -0.7, color: C.text, marginTop: 3 },
  actions:  { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  bellBtn:  { width: 42, height: 42, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  notifDot: { position: 'absolute', top: 9, right: 10, width: 7, height: 7, borderRadius: 4, backgroundColor: C.danger, borderWidth: 1.5, borderColor: C.surface },
});

// ─── Weather strip ────────────────────────────────────────────────────────────

function WeatherStrip({ onPress }: { onPress: () => void }) {
  const C = useTokens();
  const wst = useStyles(makeWst);
  const wT = useT();
  // W2: live data (shared useWeather cache/TTL; quiet dashes; Seoul fallback).
  // SINGLE ROW, FIXED-SIZE (⑥ final, owner ruling 2026-07-16): every text
  // in THIS strip is allowFontScaling={false} — a deliberate one-component
  // design-control exception, sized at the written font sizes (the 1.0
  // render), pixel-identical across devices/OS text settings. The global
  // Dynamic Type question stays OPEN for a future ruling (ledgered).
  // Owner-ruled 7/29 (v3) + v4 (8/3, live screenshot — eyes overrule math):
  // divider fixed; right side never yields; name ellipsizes ONLY beyond the
  // 5-6-ko-char floor. v4 killed the AQI grade WORD (dot color carries it,
  // traffic-light C.aqi) to buy the name its room; 5-char domestic names
  // render WHOLE at 375pt — the binding constraint the layout solves for.
  const { weather: w, placeName } = useWeather();
  const tone = w ? weatherTone(w.running_index.score) : null;
  const vc = tone ? verdictColor(C, tone) : null;
  // T4 (phase-2 ruling): fallback sun color via token
  const icon = w ? weatherIcon(w.condition_code, w.is_day) : { name: 'sunny', color: C.sun };
  return (
    <Pressable onPress={onPress} style={[wst.strip, shadows.sm]}>
      <Icon name={icon.name as any} size={26} color={icon.color} />
      <View style={wst.tempGroup}>
        <RNText style={wst.temp} allowFontScaling={false}>{w ? `${Math.round(w.temp_c)}°` : '--°'}</RNText>
        <RNText style={wst.area} numberOfLines={1} ellipsizeMode="tail" allowFontScaling={false}>{placeName ?? wT('wx.locating')}</RNText>
      </View>
      <View style={wst.divider} />
      <View style={wst.metrics}>
        <View style={wst.metric}>
          <Icon name="water-outline" size={13} color={C.faint} />
          <RNText style={wst.metricTxt} allowFontScaling={false}>{w ? `${w.humidity_pct}%` : '—'}</RNText>
        </View>
        {/* pm10 nullable on upstream outage — hide, don't fake */}
        {w?.pm10 ? (
          <View style={wst.pmGroup}>
            <View style={[wst.aqiDot, { backgroundColor: C.aqi[w.pm10.grade] ?? C.faint }]} />
            {/* v4 (owner-ruled): the grade WORD is gone — the dot's traffic-
                light color carries it. Weather-detail keeps full grade words. */}
            <RNText style={wst.metricTxt} allowFontScaling={false}>
              미세먼지
            </RNText>
          </View>
        ) : null}
      </View>
      {w && vc ? (
        <View style={[wst.verdict, { backgroundColor: vc + '1A' }]}>
          <View style={[wst.verdictDot, { backgroundColor: vc }]} />
          <RNText style={wst.verdictTxt} allowFontScaling={false}>{w.running_index.label}</RNText>
        </View>
      ) : null}
      <View style={{ marginLeft: 2 }}>
        <Icon name="chevron-forward" size={16} color={C.faint} />
      </View>
    </Pressable>
  );
}

const makeWst = (C: Tokens) => StyleSheet.create({
  strip:      { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingTop: 11, paddingBottom: 11, paddingLeft: 14, paddingRight: 12 },
  // Owner-ruled 7/29: divider fixed; right side never yields; name
  // ellipsizes. Supersedes v1 (all-rigid) and v2 (dual-floor flex).
  // Mechanics: metrics = natural width, shrink-0, AUTO basis (the v0
  // zero-box overlap lesson stands — never basis 0); tempGroup is the
  // ONLY flexible box (grows into slack, shrinks first and alone).
  tempGroup:  { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexGrow: 1, flexShrink: 1, minWidth: 0 },
  temp:       { fontSize: 22, fontWeight: '700', color: C.text, letterSpacing: -0.8, flexShrink: 0 },
  // v4: the v2 name floor RETURNS (binding constraint: 5-6 ko chars whole
  // at 375pt — the grade word died to buy this room); ellipsis is for
  // genuinely long names only.
  area:       { fontSize: 11.5, color: C.faint, letterSpacing: -0.2, flexShrink: 10, minWidth: 68 },
  divider:    { width: 1, height: 26, backgroundColor: C.border, flexShrink: 0 },
  metrics:    { flexDirection: 'row', gap: 8, flexShrink: 0, alignItems: 'center' },
  metric:     { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  // v3: the ⑥-r4 minWidth-floor/seam compact machinery is REMOVED — with a
  // shrink-0 right side the label can never compress, so the floor and the
  // ellipsis seam protect nothing. Natural box, full '미세먼지 {grade}'.
  pmGroup:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metricTxt:  { fontSize: 12.5, fontWeight: '600', color: C.text },
  aqiDot:     { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  verdict:    { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, flexShrink: 0 },
  verdictDot: { width: 7, height: 7, borderRadius: 4 },
  verdictTxt: { fontSize: 12, fontWeight: '700', color: C.text, letterSpacing: -0.2 },
});

// ─── Feed tabs ────────────────────────────────────────────────────────────────

function FeedTabs({ tab, setTab }: { tab: string; setTab: (v: string) => void }) {
  const C = useTokens();
  const ftt = useStyles(makeFtt);
  // 8/4 global (amended same-day: 전국 was FALSE — her scope=all includes
  // overseas runs, the SeYoon-NY example): scope-neutral label (hardcoded
  // ko, slice-7 file — census note). Content stays 20km-bounded until her
  // deploy (expected, ledgered).
  const T = useT();
  const radiusLabel = T('home.allRunners');
  return (
    <View style={ftt.row}>
      <View style={ftt.seg}>
        {/* ids = SENTINEL VALUES (~12 comparison sites key on them — the
            region-'전체' pattern); display resolves through keys */}
        {([['친구', 'home.tabFriends'], ['전체', 'home.tabAll']] as const).map(([id, labelKey]) => (
          <Pressable key={id} onPress={() => setTab(id)} style={[ftt.btn, tab === id && ftt.btnActive, tab === id && shadows.sm]}>
            <RNText style={[ftt.btnTxt, { color: tab === id ? C.text : C.faint }]}>{T(labelKey)}</RNText>
          </Pressable>
        ))}
      </View>
      <View style={ftt.loc}>
        <Icon name="location-outline" size={13} color={C.faint} />
        <RNText style={ftt.locTxt}>{tab === '전체' ? radiusLabel : T('home.followingLabel')}</RNText>
      </View>
    </View>
  );
}

const makeFtt = (C: Tokens) => StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  seg:      { flexDirection: 'row', gap: 3, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: 999, padding: 3 },
  btn:      { height: 32, borderRadius: 999, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  btnActive:{ backgroundColor: C.surface },
  btnTxt:   { fontSize: 13, fontWeight: '700', letterSpacing: -0.3 },
  loc:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locTxt:   { fontSize: 12, color: C.faint, letterSpacing: -0.2, fontWeight: '600' },
});

// ─── AI banner ────────────────────────────────────────────────────────────────

// Copy-truth fix (owner ruling + 지연 register, 2026-07-22): the old banner
// claimed a made course ("준비됐어요") with FICTIONAL stats (7.4km/43분 were
// hardcoded) and a weather-matching promise generate never had. Now: a
// PROMISE-to-make, personalized from the runner's real recent pattern
// (/me/stats — already-consumed endpoint; fetch failure/no history → the
// plain promise, never invented numbers). The M build (tap→derived-params
// generation, single round-trip, no cache — her veto) rides separately.
// Terrain labels = create.tsx's CANONICAL map (the stutter fix: my '균형
// 코스' deviation put 코스 inside a label the template also appends —
// "코스 코스를". Canonical labels carry no 코스; the template's own 코스
// composes clean with all three: 평지 우선/균형/언덕 훈련 + 코스를.)
const TERRAIN_BANNER_KEY = { flat: 'terrain.flat', mixed: 'terrain.mixed', hill: 'terrain.hill' } as const; // keys — resolved at render (static-capture rule)

// Banner distance = a VARIED BAND around the declared pref (owner amendment,
// 2026-07-22 — raw pref = repetitive wallpaper; history = second-guessing;
// the band = intent + freshness). Pool [pref−0.5, pref+1] in 0.5 steps —
// asymmetric BY SPEC: more upward room than down (a fitness nudge, never a
// big cut). Clamped to the generation slider's own range — the floor is the
// server's LOOP floor (error-lane sync 2026-07-23: banner asks are always
// loop-type, and sub-floor seeds now 422; the old presentability floor is
// dead), deduped after clamp. Rolled per home focus with an anti-repeat
// stamp; the rolled value IS the tap's seedKm (promise/action lock). Pace
// derivation (recent qualifying runs) STAYS — 예상 tracks rolled × real pace.
const BANNER_QUAL_KM = 1, SLIDER_MIN_KM = LOOP_MIN_TARGET_KM, SLIDER_MAX_KM = 30;
const BANNER_ROLL_KEY = '@fr_banner_roll';
function bannerPool(prefKm: number): number[] {
  const raw = [-0.5, 0, 0.5, 1].map(d => prefKm + d)
    .map(v => Math.min(SLIDER_MAX_KM, Math.max(SLIDER_MIN_KM, Math.round(v * 2) / 2)));
  return [...new Set(raw)].sort((a, b) => a - b);
}
function rollBanner(pool: number[], last: number | null): number {
  const candidates = pool.length > 1 && last != null ? pool.filter(v => v !== last) : pool;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
function derivePace(runs: { distance_km: number; avg_pace_sec_per_km: number | null }[]): number | null {
  const paces = runs
    .filter(r => r.distance_km >= BANNER_QUAL_KM && r.avg_pace_sec_per_km != null && r.avg_pace_sec_per_km > 0)
    .map(r => r.avg_pace_sec_per_km!);
  return paces.length ? paces.reduce((a, b) => a + b, 0) / paces.length : null;
}

// M build (2026-07-22, quota gate open — 지연 co-sign, both conditions HARD):
// one quota all doors; ① remaining VISIBLE before tap; ② exhaustion
// TRANSFORMS, never hides. Copy re-ruling rides here: direct invitation
// ("주변 Xkm ... 달려보세요!") — personalization lives in the derived
// params, not commentary. Free tier now gets the REAL banner (the old
// premium-locked variant died with the one-quota ruling).
function AIBanner({ onStart, onUpsell }: { onStart: (km: number) => void; onUpsell: () => void }) {
  const abt = useStyles(makeAbt);
  const T = useT(); // 8/5 stale-locale sweep: render-path t/tf froze on flip
  const bLang = useLang();
  const aiPrefs = useSettings(s => s.settings.ai_course);
  const quota = useQuota(s => s.aiGeneration);
  // pace rows — one-shot; failure = the 6.5 fallback, never blank
  const [rows, setRows] = useState<{ distance_km: number; avg_pace_sec_per_km: number | null }[]>([]);
  useEffect(() => {
    let alive = true;
    getMyRecentRuns()
      .then(r => { if (alive) setRows(r); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  // band roll — per home focus, anti-repeat stamped; stable between focuses
  // (no mid-session flicker: the state only moves on a focus event)
  const [km, setKm] = useState(() => bannerPool(aiPrefs.default_distance_km)[0]);
  useFocusEffect(useCallback(() => {
    let alive = true;
    const pool = bannerPool(useSettings.getState().settings.ai_course.default_distance_km);
    AsyncStorage.getItem(BANNER_ROLL_KEY)
      .then(raw => {
        if (!alive) return;
        const last = raw != null ? Number(raw) : null;
        const rolled = rollBanner(pool, Number.isFinite(last as number) ? last : null);
        setKm(rolled);
        AsyncStorage.setItem(BANNER_ROLL_KEY, String(rolled)).catch(() => {});
      })
      .catch(() => { if (alive) setKm(rollBanner(pool, null)); });
    return () => { alive = false; };
  }, []));
  const pace = derivePace(rows);
  const estMin = pace != null ? Math.round((km * pace) / 60) : Math.round(km * 6.5);
  const fmtBannerKm = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const exhausted = !quota.unlimited && (quota.remaining ?? 0) <= 0;
  // reset weekday from server truth; the quota copy's own promise ("월요일에
  // 초기화") is the fallback when reset_at is absent
  const resetDay = quota.reset_at
    ? T(DAY_KEYS[new Date(quota.reset_at).getDay()])
    : T('day.mon');
  return (
    <Pressable onPress={exhausted ? onUpsell : () => onStart(km)} style={abt.banner}>
      <LinearGradient
        colors={['#3BC55E', '#2BA94F']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={abt.circle1} />
      <View style={abt.circle2} />
      <View style={{ position: 'relative' }}>
        <View style={abt.badge}>
          <Icon name={exhausted ? 'lock-closed-outline' : 'sparkles'} size={13} color="#fff" />
          <RNText style={abt.badgeTxt}>{T('home.aiBadge')}</RNText>
        </View>
        <RNText style={abt.title}>
          {exhausted
            ? T('home.aiQuotaOut')
            : tfIn(bLang, 'home.aiPromo', { km: fmtBannerKm(km), terrain: T(TERRAIN_BANNER_KEY[aiPrefs.terrain]) })}
        </RNText>
        <View style={abt.sub}>
          <RNText style={abt.subTxt}>
            {exhausted
              ? tfIn(bLang, 'home.aiResetSub', { day: resetDay })
              : tfIn(bLang, 'home.aiEstMin', { min: estMin }) + (!quota.unlimited ? tfIn(bLang, 'home.aiRemaining', { n: quota.remaining ?? 0 }) : '')}
          </RNText>
          <View style={{ transform: [{ rotate: '-45deg' }] }}>
            <Icon name="arrow-forward-outline" size={15} color="#fff" />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const makeAbt = (C: Tokens) => StyleSheet.create({
  banner:   { position: 'relative', borderRadius: 22, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 22, overflow: 'hidden', shadowColor: '#2BA94F', shadowOpacity: 0.32, shadowRadius: 26, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  circle1:  { position: 'absolute', top: -30, right: -24, width: 152, height: 152, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)' },
  circle2:  { position: 'absolute', bottom: -52, right: 36, width: 96, height: 96, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.10)' },
  badge:    { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 },
  badgeTxt: { fontSize: 11.5, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  title:    { fontSize: 21, fontWeight: '700', color: '#fff', letterSpacing: -0.6, lineHeight: 28, marginTop: 13 },
  sub:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  subTxt:   { fontSize: 13.5, fontWeight: '600', color: 'rgba(255,255,255,0.92)', letterSpacing: -0.2 },
});

// ─── List states ──────────────────────────────────────────────────────────────

function ListState({ icon, title, sub, btn, onBtn }: { icon: string; title: string; sub?: string; btn?: string; onBtn?: () => void }) {
  const C = useTokens();
  const lst = useStyles(makeLst);
  return (
    <View style={lst.wrap}>
      <Icon name={icon} size={38} color={C.faint} />
      <RNText style={lst.title}>{title}</RNText>
      {sub ? <RNText style={lst.sub}>{sub}</RNText> : null}
      {btn && onBtn ? (
        <Pressable onPress={onBtn} style={({ pressed }) => [lst.btn, pressed && { opacity: 0.8 }]}>
          <RNText style={lst.btnTxt}>{btn}</RNText>
        </Pressable>
      ) : null}
    </View>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const C = useTokens();
  const lst = useStyles(makeLst);
  const T = useT();
  return (
    <View style={lst.wrap}>
      <Icon name="warning-outline" size={36} color={C.faint} />
      <RNText style={lst.title}>{message}</RNText>
      <Pressable onPress={onRetry} style={lst.retryBtn}>
        <RNText style={lst.retryTxt}>{T('common.retry')}</RNText>
      </Pressable>
    </View>
  );
}

const makeLst = (C: Tokens) => StyleSheet.create({
  wrap:     { alignItems: 'center', gap: 10, paddingVertical: 48, paddingHorizontal: S.gutter },
  title:    { fontSize: 14, color: C.faint, fontWeight: '600', letterSpacing: -0.2, textAlign: 'center' },
  sub:      { fontSize: 12.5, color: C.faint, letterSpacing: -0.2, textAlign: 'center', marginTop: -4 },
  btn:      { marginTop: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: C.accent },
  btnTxt:   { fontSize: 13.5, fontWeight: '800', color: C.accentText, letterSpacing: -0.2 },
  retryBtn: { marginTop: 4, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  retryTxt: { fontSize: 14, fontWeight: '700', color: C.text },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const C = useTokens();
  const lst = useStyles(makeLst);
  // reactive anchor — added with the Korea-only state (this screen had NONE:
  // the P2 bare-t class; home is THE long-lived mount, so new keys anchor)
  const T = useT();
  const insets      = useSafeAreaInsets();
  const tabBarInset = useTabBarInset(); // 홈 was the last clipper — floating pill overlap
  const displayName = useStore((s) => s.displayName);
  const photoUrl    = useStore((s) => s.photoUrl);
  const signOut     = useStore((s) => s.signOut);
  useEffect(() => { useQuota.getState().hydrate(); }, []); // banner quota truth

  // Bell dot = real unread count (GET /notifications/unread-count), refreshed
  // on every home focus (back from the notifications screen clears it).
  // Silent failure keeps the last known state — ambient, never an error.
  const [unread, setUnread] = useState(0);
  useFocusEffect(useCallback(() => {
    getUnreadCount().then(r => setUnread(r.count)).catch(() => {});
    // quota condition ① integrity: the banner's remaining count refreshes on
    // return (a banner generation just spent one — mount-only hydrate would
    // show it stale). Failed sync never silently downgrades (store rule).
    useQuota.getState().hydrate(true);
  }, []));

  const [tab, setTab]           = useState('친구');

  const feed = useFeed();
  const { coordinate, status: locStatus } = useCurrentLocation();
  // ── 전체 discovery (2026-07-16 → 8/4 NATIONWIDE): GET /feed/nearby with
  // scope=all + offset pagination. The R2 radius machine (10 → one 20km
  // retry) retired 8/4 — removed with all its consumers in this diff.
  const [freshCoord, setFreshCoord] = useState<Coordinate | null>(null);
  const [nearbyKey, setNearbyKey] = useState(0); // explicit refetch (error retry / refresh)
  const units = useSettings(s => s.settings.units); // RunCard stat formatting
  // Seoul-fallback class: never query "nearby" with the synchronous fallback
  const effCoord = freshCoord ?? coordinate;
  const nearby = useNearbyFeed(tab === '전체' && locStatus === 'granted' ? effCoord : null, nearbyKey);

  const refreshNearby = useCallback(async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setFreshCoord({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch { /* keep the last coord — the key bump below still refetches */ }
    setNearbyKey(k => k + 1);
  }, []);

  // Kudos overlay for run cards, BOTH tabs (the user-profile pattern verbatim)
  const [kudosOv, setKudosOv] = useState<Record<string, { on: boolean; delta: number }>>({});
  // RECONCILE ON ARRIVAL (8/1, the "2"-count fix): fresh rows already CONTAIN
  // landed likes — a surviving overlay double-counts them. Wholesale clear on
  // data arrival (over per-row matching): rows identity changes exactly at
  // server-truth arrival, and a lost mid-flight overlay just re-creates on
  // the next tap — simpler and correct.
  useEffect(() => { setKudosOv({}); }, [feed.items, nearby.items]);
  // K1: likers sheet target (my-profile's kudosRun pattern)
  const [kudosSheetRun, setKudosSheetRun] = useState<{ id: string; count: number } | null>(null);
  const toggleRunKudos = useCallback((run: FeedRun) => {
    const cur = kudosOv[run.run_id]?.on ?? run.my_kudos;
    const next = !cur;
    setKudosOv(p => ({ ...p, [run.run_id]: { on: next, delta: (next ? 1 : 0) - (run.my_kudos ? 1 : 0) } }));
    (next ? kudosRun(run.run_id) : unkudosRun(run.run_id))
      .catch(() => setKudosOv(p => ({ ...p, [run.run_id]: { on: run.my_kudos, delta: 0 } })));
  }, [kudosOv]);

  // Feed course affordances (Slice A: 이 코스 달리기 CTA + bookmark on run
  // cards) REMOVED 2026-07-21 — owner step-back ruling, returns post-launch.
  // The lane logic lives at commit 82c5bc9 (copyRoute → setActiveCourse →
  // tracking + optimistic bookmark set). route_summary still arrives on
  // feed rows; nothing renders from it here until the feature returns.

  // Maps slice 2 — real-map-only-for-viewable-cells. Stable refs (FlatList
  // forbids changing these props mid-list); 25% visibility flips a cell live.
  const [liveIds, setLiveIds] = useState<Set<string>>(new Set());
  // 홈 재탭 = 맨 위로 (owner-ruled 8/3): the tab bar emits tabPress
  // (fresh-tab-bar handlePress); this screen's listener receives its OWN
  // tab's presses only. isFocused() at emit time distinguishes the re-tap
  // (true → scroll) from arriving-from-another-tab (false — focus lands
  // AFTER the emit → position preserved, item-3 rule). SCROLL ONLY — no
  // refetch rides the tap (refresh stays pull-to-refresh's job); the one
  // FlatList serves BOTH feed tabs (전체/친구 swap data, not lists), so a
  // single ref covers whichever is showing.
  const feedListRef = useRef<FlatList<FeedRun | { __suggest: string }>>(null);
  const navigation = useNavigation();
  useEffect(() => {
    return navigation.addListener('tabPress' as never, () => {
      if (navigation.isFocused()) {
        feedListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }
    });
  }, [navigation]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 25 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: { key: string }[] }) => {
      setLiveIds(new Set(viewableItems.map(v => v.key)));
    },
  ).current;

  const name = displayName ?? T('home.runner');
  const list: FeedRun[] = tab === '전체' ? nearby.items : feed.items;

  // ── 추천 러너 (friends v1.1) — 친구 tab only, conditional placement.
  // COLD-START (fewer than 3 posts in the fetched page — which subsumes
  // "follows no one": an empty followed-feed IS the cold start; the page's
  // item count is the in-hand signal, no extra fetch): row renders ABOVE the
  // feed via the list header. RICH FEED: interleaved after every Nth card.
  // TRANSITION SEAM: placement derives from the fetched page and re-evaluates
  // ONLY when the list reference changes — the refresh boundary is the seam;
  // the row never relocates mid-scroll.
  const sr = useSuggestedRunners(); // ONE fetch; every rendered row shares state
  const coldStart = tab === '친구' && list.length < 3;
  const displayList: (FeedRun | { __suggest: string })[] = useMemo(() => {
    if (tab !== '친구' || !sr.available || list.length < 3) return list;
    const out: (FeedRun | { __suggest: string })[] = [];
    list.forEach((it, i) => {
      out.push(it);
      if ((i + 1) % SUGGEST_EVERY_N === 0) out.push({ __suggest: `suggest-${i}` });
    });
    return out;
     
  }, [tab, list, sr.available]);
  // No-swap pre-warm (ruling ③, 2026-07-23): fire track fetches at
  // data-arrival so cards are usually track-ready before the eye lands.
  useEffect(() => {
    prewarmTracks(list.filter(r => r.polyline_thumb && r.polyline_thumb.length >= 2).map(r => r.run_id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length, tab]);
  const loading = tab === '전체' ? nearby.loading || (locStatus === 'fetching' && nearby.items.length === 0) : feed.loading;
  const error = tab === '전체' ? nearby.error : feed.error;

  const header = useMemo(() => (
    <View>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: S.gutter }}>
        <Greeting name={name} photoUrl={photoUrl} showBellDot={unread > 0} onBell={() => router.push('/notifications' as any)} />
      </View>
      <View style={{ paddingTop: 14, paddingHorizontal: S.gutter }}>
        <WeatherStrip onPress={() => router.push('/weather-detail')} />
      </View>
      <View style={{ paddingTop: 22, paddingBottom: 14, paddingHorizontal: S.gutter }}>
        <FeedTabs tab={tab} setTab={setTab} />
      </View>
    </View>
  ), [insets.top, name, photoUrl, unread, tab]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Cold-start recovery of an unsaved run (crash safety, 러닝 저장 item) */}
      <PendingRunRecovery />
      <FlatList
        ref={feedListRef}
        data={displayList}
        keyExtractor={(r) => '__suggest' in r ? r.__suggest : r.run_id}
        showsVerticalScrollIndicator={false}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        ListHeaderComponent={
          <>
            {header}
            {/* cold-start slot — above the feed (and above the empty state),
                outside the data so ListEmptyComponent still renders */}
            {coldStart && <SuggestedRunnersRow sr={sr} />}
          </>
        }
        refreshControl={
          <RefreshControl
            refreshing={tab === '전체' ? nearby.loading && nearby.items.length > 0 : feed.refreshing}
            onRefresh={() => {
              useQuota.getState().hydrate(true); // recovery path for a failed tier sync
              if (tab === '전체') void refreshNearby(); else feed.refresh();
            }}
            tintColor={C.faint}
          />
        }
        onEndReached={tab === '친구' ? feed.loadMore : nearby.loadMore}
        onEndReachedThreshold={0.4}
        contentContainerStyle={{ paddingBottom: tabBarInset }}
        ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
        renderItem={({ item }) => {
          if ('__suggest' in item) return <SuggestedRunnersRow sr={sr} />; // interleave slot
          // ── ONE RunCard path, both tabs (payload shape parity, probed) ────
          const ov = kudosOv[item.run_id];
          const shown = ov ? { ...item, my_kudos: ov.on, kudos_count: item.kudos_count + ov.delta } : item;
          return (
            <View style={{ paddingHorizontal: S.gutter }}>
              <RunCard
                run={shown}
                units={units}
                mapLive={liveIds.has(item.run_id)}
                onKudos={() => toggleRunKudos(item)}
                kudosOff={item.allow_likes === false}
                // K1: count tap → likers sheet (my-profile pattern; shown =
                // overlay-adjusted so the sheet header count matches the card)
                onCountPress={() => setKudosSheetRun({ id: shown.run_id, count: shown.kudos_count })}
                onOpen={() => router.push({
                  pathname: '/run-post' as never,
                  params: {
                    runId: shown.run_id,
                    nickname: shown.nickname,
                    avatarUrl: shown.avatar_url ?? '',
                    myKudos: shown.my_kudos ? '1' : '0',
                    kudosCount: String(shown.kudos_count),
                  },
                })}
                // avatar → profile (openProfile self-routes own cards to 내 프로필)
                onAvatarPress={() => openProfile(item.user_id, item.nickname)}
              />
            </View>
          );
        }}
        ListEmptyComponent={
          loading
            ? <View style={lst.wrap}><ActivityIndicator size="large" color={C.accent} /></View>
            : error
              ? tab === '전체' && nearby.koreaOnly
                // abroad (her bbox 400 + our coords outside the mirror):
                // honest Korea-only state, NO retry — retrying cannot succeed;
                // the sub deliberately points at the tab that works anywhere
                ? <ListState icon="globe-outline" title={T('home.nearbyKoreaOnly')} sub={T('home.nearbyKoreaOnlySub')} />
                : <ErrorState message={error} onRetry={tab === '전체' ? () => setNearbyKey(k => k + 1) : feed.refresh} />
              : tab === '친구'
                ? <ListState icon="people-outline" title={T('home.friendsEmpty')} sub={T('home.friendsEmptySub')} />
                : locStatus === 'denied'
                  // the honest permission state — DISTINCT from genuine-empty
                  ? <ListState icon="location-outline" title={T('trk.locPermTitle')} sub={T('home.locPermSub')} btn={T('common.openSettings')} onBtn={() => Linking.openSettings()} />
                  : !nearby.fetched
                    ? <View style={lst.wrap}><ActivityIndicator size="large" color={C.accent} /></View>
                    // 8/4 nationwide: one honest empty state (the 10→20
                    // wider-retry pair died with the radius machine)
                    : <ListState icon="walk-outline" title={T('home.nearbyEmpty')} sub={T('home.nearbyEmptySub')} />
        }
        ListFooterComponent={
          <View>
            {((tab === '친구' && feed.loadingMore) || (tab === '전체' && nearby.loadingMore)) && (
              <ActivityIndicator size="small" color={C.faint} style={{ paddingVertical: 14 }} />
            )}
            <View style={{ paddingHorizontal: S.gutter, paddingTop: 26, paddingBottom: 26 }}>
              <AIBanner
                // tap-direct: single round-trip into generation, form skipped
                // (M build; quota gating + exhausted→premium live in the banner)
                onStart={km => router.push({ pathname: '/(course)/create', params: { auto: '1', seedKm: String(km) } } as never)}
                onUpsell={() => router.push('/premium' as never)}
              />
            </View>
            {__DEV__ && (
              <Pressable
                onPress={signOut}
                style={{ alignSelf: 'center', marginBottom: 16, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderRadius: 8, borderStyle: 'dashed', borderColor: C.border }}
              >
                <RNText style={{ fontSize: 12, color: C.faint }}>DEV: 로그아웃 →</RNText>
              </Pressable>
            )}
          </View>
        }
      />

      {/* K1: likers sheet from any card — my-profile pattern verbatim */}
      {kudosSheetRun && (
        <KudosSheet runId={kudosSheetRun.id} kudosCount={kudosSheetRun.count} onClose={() => setKudosSheetRun(null)} />
      )}
    </View>
  );
}
