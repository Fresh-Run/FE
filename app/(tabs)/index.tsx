/**
 * Home screen — Layout B from the FrHomeB bundle spec.
 * Feed v1: cards are real public courses (GET /feed for 친구, /routes/nearby
 * for 전체) with real likes / bookmarks / comments per docs/API_GUIDE.md.
 * Cards show estimates (예상 시간/페이스) — courses carry no run stats.
 */
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { MiniMap } from '@/components/mini-map';
import { RealMap } from '@/components/real-map';
import { PendingRunRecovery } from '@/components/pending-run-recovery';
import { Icon } from '@/components/ui';
import * as Location from 'expo-location';

import { RunCard } from '@/components/run-card';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { useFeed, useNearbyFeed } from '@/hooks/use-feed';
import { getUnreadCount } from '@/lib/notifications-api';
import { openProfile } from '@/lib/profile-nav';
import { type NearbyRun } from '@/lib/feed-api';
import { kudosRun, unkudosRun } from '@/lib/run-social-api';
import {
  bookmarkRoute,
  likeRoute,
  unbookmarkRoute,
  unlikeRoute,
  type PublicRoute,
} from '@/lib/routes-api';
import { distUnit, fmtAgo, fmtDist, fmtDuration, fmtPaceIn, paceUnit, type Units } from '@/lib/run-format';
import { colors as C, shadows, spacing as S } from '@/lib/theme';
import { setPendingCourse } from '@/store/pending-course';
import { setPendingPost } from '@/store/pending-post';
import { useQuota } from '@/store/use-quota';
import { useSettings } from '@/store/use-settings';
import { useStore } from '@/store/use-store';
import type { Coordinate } from '@/types';
import { useWeather } from '@/hooks/use-weather';
import { weatherIcon, weatherTone, type WeatherTone } from '@/lib/weather-api';

// ─── Constants / helpers ──────────────────────────────────────────────────────

const EST_PACE_SEC_PER_KM = 320; // same assumption as courseStats

/** Display fields the design shows that courses don't carry directly.
    All math stays km; `units` affects formatting only. */
function courseDisplay(r: PublicRoute, units: Units) {
  const dist = r.total_distance_km;
  const estMin = r.estimated_duration_min ?? (dist * EST_PACE_SEC_PER_KM) / 60;
  const durSec = Math.round(estMin * 60);
  const paceSec = dist > 0 ? Math.round(durSec / dist) : EST_PACE_SEC_PER_KM;
  return {
    name: r.owner_nickname ?? '러너',
    ago:  fmtAgo(r.created_at),
    dur:  fmtDuration(durSec),
    pace: fmtPaceIn(paceSec, units),
  };
}


function verdictColor(tone: WeatherTone): string {
  if (tone === 'good') return C.accent;
  if (tone === 'ok')   return C.sun;
  return C.danger;
}

function formatDate(): string {
  const d = new Date();
  const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  return `${days[d.getDay()]}, ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// ─── Greeting header ──────────────────────────────────────────────────────────

function Greeting({ name, photoUrl, showBellDot, onBell }: { name: string; photoUrl: string | null; showBellDot: boolean; onBell: () => void }) {
  return (
    <View style={gst.row}>
      <View style={{ minWidth: 0, flex: 1 }}>
        <RNText style={gst.date}>{formatDate()}</RNText>
        <RNText style={gst.heading} numberOfLines={1}>안녕하세요, {name}님</RNText>
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

const gst = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  date:     { fontSize: 12.5, color: C.faint, letterSpacing: -0.2, fontWeight: '600' },
  heading:  { fontSize: 20, fontWeight: '700', letterSpacing: -0.7, color: C.text, marginTop: 3 },
  actions:  { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  bellBtn:  { width: 42, height: 42, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  notifDot: { position: 'absolute', top: 9, right: 10, width: 7, height: 7, borderRadius: 4, backgroundColor: C.danger, borderWidth: 1.5, borderColor: C.surface },
});

// ─── Weather strip ────────────────────────────────────────────────────────────

function WeatherStrip({ onPress }: { onPress: () => void }) {
  // W2: live data (shared useWeather cache/TTL; quiet dashes; Seoul fallback).
  // SINGLE ROW, FIXED-SIZE (⑥ final, owner ruling 2026-07-16): every text
  // in THIS strip is allowFontScaling={false} — a deliberate one-component
  // design-control exception, sized at the written font sizes (the 1.0
  // render), pixel-identical across devices/OS text settings. The global
  // Dynamic Type question stays OPEN for a future ruling (ledgered).
  // Safety rails retained for long content: 미세group numberOfLines=1
  // tail-ellipsis + minWidth 48 floor + paddingRight 6 seam (flex can't eat
  // padding — the ellipsis never kisses the chip); yield order = place name
  // (flexShrink 10) → 미세 label to floor → nothing else; gaps 8. Fixed-size
  // worst case (375pt): 286 ≤ 309 — comfortable.
  const { weather: w, placeName } = useWeather();
  const tone = w ? weatherTone(w.running_index.score) : null;
  const vc = tone ? verdictColor(tone) : null;
  const icon = w ? weatherIcon(w.condition_code, w.is_day) : { name: 'sunny', color: '#E8A23D' };
  return (
    <Pressable onPress={onPress} style={[wst.strip, shadows.sm]}>
      <Icon name={icon.name as any} size={26} color={icon.color} />
      <View style={wst.tempGroup}>
        <RNText style={wst.temp} allowFontScaling={false}>{w ? `${Math.round(w.temp_c)}°` : '--°'}</RNText>
        <RNText style={wst.area} numberOfLines={1} allowFontScaling={false}>{placeName ?? '위치 확인 중'}</RNText>
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
            <RNText style={wst.metricTxt} numberOfLines={1} ellipsizeMode="tail" allowFontScaling={false}>
              미세먼지 {w.pm10.grade}
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

const wst = StyleSheet.create({
  strip:      { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingTop: 11, paddingBottom: 11, paddingLeft: 14, paddingRight: 12 },
  tempGroup:  { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 1, minWidth: 0 },
  temp:       { fontSize: 22, fontWeight: '700', color: C.text, letterSpacing: -0.8, flexShrink: 0 },
  area:       { fontSize: 11.5, color: C.faint, letterSpacing: -0.2, flexShrink: 10 },
  divider:    { width: 1, height: 26, backgroundColor: C.border, flexShrink: 0 },
  metrics:    { flexDirection: 'row', gap: 8, flex: 1, minWidth: 0, alignItems: 'center' },
  metric:     { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  // ⑥-r4 seam: paddingRight is box-owned — flex can't eat it, the ellipsis
  // never kisses the chip. Floor 52→48 (owner yield): "미…" binds ONLY at
  // the 375pt/1.35 corner (303 ≤ 309, 6px spare); everyday states never
  // touch the floor.
  pmGroup:    { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, minWidth: 48, paddingRight: 6 },
  metricTxt:  { fontSize: 12.5, fontWeight: '600', color: C.text },
  aqiDot:     { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  verdict:    { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, flexShrink: 0 },
  verdictDot: { width: 7, height: 7, borderRadius: 4 },
  verdictTxt: { fontSize: 12, fontWeight: '700', color: C.text, letterSpacing: -0.2 },
});

// ─── Feed tabs ────────────────────────────────────────────────────────────────

function FeedTabs({ tab, setTab, radiusKm }: { tab: string; setTab: (v: string) => void; radiusKm: number }) {
  // The label tracks the LIVE radius (10, or 20 after the one retry)
  const units = useSettings(s => s.settings.units);
  const radiusLabel = units === 'mi' ? `내 위치 ${fmtDist(radiusKm, 'mi', 1)}mi 이내` : `내 위치 ${radiusKm}km 이내`;
  return (
    <View style={ftt.row}>
      <View style={ftt.seg}>
        {['친구', '전체'].map((id) => (
          <Pressable key={id} onPress={() => setTab(id)} style={[ftt.btn, tab === id && ftt.btnActive, tab === id && shadows.sm]}>
            <RNText style={[ftt.btnTxt, { color: tab === id ? C.text : C.faint }]}>{id}</RNText>
          </Pressable>
        ))}
      </View>
      <View style={ftt.loc}>
        <Icon name="location-outline" size={13} color={C.faint} />
        <RNText style={ftt.locTxt}>{tab === '전체' ? radiusLabel : '팔로잉'}</RNText>
      </View>
    </View>
  );
}

const ftt = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  seg:      { flexDirection: 'row', gap: 3, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: 999, padding: 3 },
  btn:      { height: 32, borderRadius: 999, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  btnActive:{ backgroundColor: C.surface },
  btnTxt:   { fontSize: 13, fontWeight: '700', letterSpacing: -0.3 },
  loc:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locTxt:   { fontSize: 12, color: C.faint, letterSpacing: -0.2, fontWeight: '600' },
});

// ─── Feed card (Layout B — full-bleed hero map) ───────────────────────────────

function FeedCard({
  item, liked, likeCount, commentCount, saved, awayKm, mapLive,
  onLike, onSave, onOpen, onRun,
}: {
  item: PublicRoute; liked: boolean; likeCount: number; commentCount: number;
  saved: boolean; awayKm: number | null;
  /** Viewability gate (maps slice 2): real Apple map only while the cell is
      on screen — off-screen cells keep the cheap SVG so a 20-card feed never
      hosts more than the ~3 viewable MapViews at once. */
  mapLive: boolean;
  onLike: () => void; onSave: () => void; onOpen: () => void; onRun: () => void;
}) {
  const units = useSettings(s => s.settings.units);
  const d = courseDisplay(item, units);
  return (
    <View style={[fct.card, shadows.sm]}>
      {/* Header — author zone → profile (routing-rule RIDER: commits with
          the item-17 walk gate) */}
      <View style={fct.header}>
        <Pressable onPress={() => openProfile(item.owner_id, item.owner_nickname)} disabled={!item.owner_id} hitSlop={6}>
          <Avatar name={d.name} size={36} photoUrl={item.owner_avatar_url} letterSpacing={-0.3} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <RNText style={fct.name} onPress={item.owner_id ? () => openProfile(item.owner_id, item.owner_nickname) : undefined}>{d.name}</RNText>
          <View style={fct.subRow}>
            <Icon name="location-outline" size={11} color={C.faint} />
            <RNText style={fct.sub} numberOfLines={1}>
              {d.ago}
              {awayKm != null
                ? <RNText style={fct.away}> · {fmtDist(awayKm, units, 1)}{distUnit(units)}</RNText>
                : null}
            </RNText>
          </View>
        </View>
        <Pressable onPress={onSave} hitSlop={8}>
          <Icon name={saved ? 'bookmark' : 'bookmark-outline'} size={20} color={saved ? C.accent : C.faint} />
        </Pressable>
      </View>

      {/* Hero map — real course geometry */}
      <Pressable onPress={onOpen}>
        {mapLive && item.polyline && item.polyline.length >= 2 ? (
          <RealMap height={172} polyline={item.polyline} />
        ) : (
          // Off-screen placeholder + the permanent no-geometry fallback
          <MiniMap seed={item.id} height={172} polyline={item.polyline ?? undefined} />
        )}
      </Pressable>

      {/* Title + stats (예상 — courses carry no run stats) */}
      <Pressable onPress={onOpen} style={fct.stats}>
        <RNText style={fct.title} numberOfLines={1}>{item.summary}</RNText>
        <View style={fct.statsRow}>
          {([
            [fmtDist(item.total_distance_km, units, 1), distUnit(units), '거리'],
            [d.dur,                                     '',              '예상 시간'],
            [d.pace,                                    paceUnit(units), '예상 페이스'],
          ] as [string, string, string][]).map(([val, unit, label], i) => (
            <View key={i} style={{ flexDirection: 'column', gap: 2 }}>
              <RNText style={fct.statVal}>
                {val}{unit ? <RNText style={fct.statUnit}> {unit}</RNText> : null}
              </RNText>
              <RNText style={fct.statLbl}>{label}</RNText>
            </View>
          ))}
        </View>
      </Pressable>

      {/* Footer */}
      <View style={fct.footer}>
        <Pressable onPress={onLike} style={fct.action}>
          <Icon name={liked ? 'heart' : 'heart-outline'} size={19} color={liked ? C.danger : C.sub} />
          <RNText style={[fct.actionTxt, { color: liked ? C.danger : C.sub }]}>{likeCount}</RNText>
        </Pressable>
        <Pressable onPress={onOpen} style={fct.action}>
          <Icon name="chatbubble-outline" size={19} color={C.sub} />
          <RNText style={[fct.actionTxt, { color: C.sub }]}>{commentCount}</RNText>
        </Pressable>
        <Pressable onPress={onRun} style={fct.runBtn}>
          <Icon name="navigate-outline" size={15} color="#3F8E14" />
          <RNText style={fct.runBtnTxt}>이 코스 달리기</RNText>
        </Pressable>
      </View>
    </View>
  );
}

const fct = StyleSheet.create({
  card:      { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, overflow: 'hidden' },
  header:    { flexDirection: 'row', alignItems: 'center', gap: 9, paddingTop: 12, paddingBottom: 12, paddingHorizontal: 14 },
  name:      { fontSize: 14, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  subRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  sub:       { fontSize: 11.5, color: C.faint, letterSpacing: -0.2, flex: 1 },
  away:      { fontSize: 11.5, fontWeight: '700', color: C.accent },
  stats:     { paddingTop: 12, paddingBottom: 4, paddingHorizontal: 14 },
  title:     { fontSize: 15.5, fontWeight: '700', color: C.text, letterSpacing: -0.4, marginBottom: 9 },
  statsRow:  { flexDirection: 'row', gap: 18 },
  statVal:   { fontSize: 16, fontWeight: '700', color: C.text, letterSpacing: -0.4 },
  statUnit:  { fontSize: 11, color: C.faint, fontWeight: '600' },
  statLbl:   { fontSize: 10.5, color: C.faint, letterSpacing: -0.1 },
  footer:    { flexDirection: 'row', alignItems: 'center', gap: 18, paddingTop: 8, paddingHorizontal: 14, paddingBottom: 12, marginTop: 6, borderTopWidth: 1, borderTopColor: C.border },
  action:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionTxt: { fontSize: 13, fontWeight: '600', letterSpacing: -0.2 },
  runBtn:    { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accent, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 6 },
  runBtnTxt: { fontSize: 12.5, fontWeight: '700', color: '#3F8E14', letterSpacing: -0.2 },
});

// ─── AI banner ────────────────────────────────────────────────────────────────

function AIBanner({ locked, onPress }: { locked?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={abt.banner}>
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
          <Icon name={locked ? 'lock-closed-outline' : 'sparkles'} size={13} color="#fff" />
          <RNText style={abt.badgeTxt}>AI 추천 코스</RNText>
        </View>
        <RNText style={abt.title}>
          {locked
            ? '날씨·체력 맞춤 AI 코스를\n프리미엄에서 만나보세요'
            : '오늘 날씨에 딱 맞는\n새 코스가 준비됐어요'}
        </RNText>
        <View style={abt.sub}>
          <RNText style={abt.subTxt}>
            {locked ? '프리미엄으로 잠금 해제하기' : '7.4 km · 예상 43분 · 한적함'}
          </RNText>
          <View style={{ transform: [{ rotate: '-45deg' }] }}>
            <Icon name="arrow-forward-outline" size={15} color="#fff" />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const abt = StyleSheet.create({
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
  return (
    <View style={lst.wrap}>
      <Icon name="warning-outline" size={36} color={C.faint} />
      <RNText style={lst.title}>{message}</RNText>
      <Pressable onPress={onRetry} style={lst.retryBtn}>
        <RNText style={lst.retryTxt}>다시 시도</RNText>
      </Pressable>
    </View>
  );
}

const lst = StyleSheet.create({
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
  const insets      = useSafeAreaInsets();
  const tabBarInset = useTabBarInset(); // 홈 was the last clipper — floating pill overlap
  const displayName = useStore((s) => s.displayName);
  const photoUrl    = useStore((s) => s.photoUrl);
  const signOut     = useStore((s) => s.signOut);
  const premium     = useQuota((s) => s.isPremium);
  useEffect(() => { useQuota.getState().hydrate(); }, []);

  // Bell dot = real unread count (GET /notifications/unread-count), refreshed
  // on every home focus (back from the notifications screen clears it).
  // Silent failure keeps the last known state — ambient, never an error.
  const [unread, setUnread] = useState(0);
  useFocusEffect(useCallback(() => {
    getUnreadCount().then(r => setUnread(r.count)).catch(() => {});
  }, []));

  const [tab, setTab]           = useState('친구');

  const feed = useFeed();
  const { coordinate, status: locStatus } = useCurrentLocation();
  // ── 전체 discovery (2026-07-16): RUNS via GET /feed/nearby ────────────────
  // Radius machine (owner R2): 10 → ONE 20km retry → terminal; pull-to-
  // refresh RESETS to 10 and re-acquires a fresh fix. Tab-switch keeps state.
  const [radiusKm, setRadiusKm]   = useState(10);
  const [retried, setRetried]     = useState(false);
  const [freshCoord, setFreshCoord] = useState<Coordinate | null>(null);
  const [nearbyKey, setNearbyKey] = useState(0); // explicit refetch (error retry / refresh)
  const units = useSettings(s => s.settings.units);
  // Seoul-fallback class: never query "nearby" with the synchronous fallback
  const effCoord = freshCoord ?? coordinate;
  const nearby = useNearbyFeed(tab === '전체' && locStatus === 'granted' ? effCoord : null, radiusKm, nearbyKey);

  const retryWider = useCallback(() => { setRetried(true); setRadiusKm(20); }, []);
  const refreshNearby = useCallback(async () => {
    setRadiusKm(10);
    setRetried(false);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setFreshCoord({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch { /* keep the last coord — the key bump below still refetches */ }
    setNearbyKey(k => k + 1);
  }, []);

  // Kudos overlay for discovery cards (the user-profile pattern verbatim)
  const [kudosOv, setKudosOv] = useState<Record<string, { on: boolean; delta: number }>>({});
  const toggleRunKudos = useCallback((run: NearbyRun) => {
    const cur = kudosOv[run.run_id]?.on ?? run.my_kudos;
    const next = !cur;
    setKudosOv(p => ({ ...p, [run.run_id]: { on: next, delta: (next ? 1 : 0) - (run.my_kudos ? 1 : 0) } }));
    (next ? kudosRun(run.run_id) : unkudosRun(run.run_id))
      .catch(() => setKudosOv(p => ({ ...p, [run.run_id]: { on: run.my_kudos, delta: 0 } })));
  }, [kudosOv]);

  // Maps slice 2 — real-map-only-for-viewable-cells. Stable refs (FlatList
  // forbids changing these props mid-list); 25% visibility flips a cell live.
  const [liveIds, setLiveIds] = useState<Set<string>>(new Set());
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 25 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: { key: string }[] }) => {
      setLiveIds(new Set(viewableItems.map(v => v.key)));
    },
  ).current;

  // Optimistic overlays (shared by both tabs), rolled back on error.
  // (The old comment sheet + its cmtOv override were deleted 2026-07-12 —
  // the logged gate-cleanup debt; 코스 포스트 owns comments now.)
  const [likeOv, setLikeOv] = useState<Record<string, { liked: boolean; count: number }>>({});
  const [saveOv, setSaveOv] = useState<Record<string, boolean>>({});

  const effLiked = useCallback(
    (r: PublicRoute) => likeOv[r.id] ?? { liked: r.is_liked, count: r.like_count },
    [likeOv],
  );
  const effSaved = useCallback(
    (r: PublicRoute) => saveOv[r.id] ?? feed.bookmarkedIds.has(r.id),
    [saveOv, feed.bookmarkedIds],
  );

  const toggleLike = useCallback((r: PublicRoute) => {
    const cur = likeOv[r.id] ?? { liked: r.is_liked, count: r.like_count };
    const next = { liked: !cur.liked, count: cur.count + (cur.liked ? -1 : 1) };
    setLikeOv(p => ({ ...p, [r.id]: next }));
    (cur.liked ? unlikeRoute(r.id) : likeRoute(r.id))
      .catch(() => setLikeOv(p => ({ ...p, [r.id]: cur }))); // rollback
  }, [likeOv]);

  const toggleSave = useCallback((r: PublicRoute) => {
    const cur = saveOv[r.id] ?? feed.bookmarkedIds.has(r.id);
    setSaveOv(p => ({ ...p, [r.id]: !cur }));
    (cur ? unbookmarkRoute(r.id) : bookmarkRoute(r.id))
      .catch(() => setSaveOv(p => ({ ...p, [r.id]: cur }))); // rollback
  }, [saveOv, feed.bookmarkedIds]);

  const runCourse = useCallback((r: PublicRoute) => {
    setPendingCourse(r);
    router.push('/(course)/preview' as any);
  }, []);

  const name = displayName ?? '러너';
  const list: (PublicRoute | NearbyRun)[] = tab === '전체' ? nearby.items : feed.items;
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
        <FeedTabs tab={tab} setTab={setTab} radiusKm={radiusKm} />
      </View>
    </View>
  ), [insets.top, name, photoUrl, unread, tab, radiusKm]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Cold-start recovery of an unsaved run (crash safety, 러닝 저장 item) */}
      <PendingRunRecovery />
      <FlatList
        data={list}
        keyExtractor={(r) => ('run_id' in r ? r.run_id : r.id)}
        showsVerticalScrollIndicator={false}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        ListHeaderComponent={header}
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
        onEndReached={tab === '친구' ? feed.loadMore : undefined}
        onEndReachedThreshold={0.4}
        contentContainerStyle={{ paddingBottom: tabBarInset }}
        ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
        renderItem={({ item }) => {
          // ── 전체: discovery RUN cards (the shared RunCard) ────────────────
          if ('run_id' in item) {
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
                  // the discovery funnel: avatar → profile → 팔로우
                  onAvatarPress={() => openProfile(item.user_id, item.nickname)}
                />
              </View>
            );
          }
          const like = effLiked(item);
          // 친구 = the only FeedCard tab now (전체 renders RunCards above);
          // the near-you chip was 전체-only and retires with the swap
          const awayKm = null;
          return (
            <View style={{ paddingHorizontal: S.gutter }}>
              <FeedCard
                item={item}
                liked={like.liked}
                likeCount={like.count}
                commentCount={item.comment_count}
                saved={effSaved(item)}
                awayKm={awayKm}
                mapLive={liveIds.has(item.id)}
                onLike={() => toggleLike(item)}
                onSave={() => toggleSave(item)}
                // Card tap → 코스 포스트 full screen (canvas FrRunPost)
                onOpen={() => { setPendingPost(item); router.push('/(course)/course-post' as any); }}
                onRun={() => runCourse(item)}
              />
            </View>
          );
        }}
        ListEmptyComponent={
          loading
            ? <View style={lst.wrap}><ActivityIndicator size="large" color={C.accent} /></View>
            : error
              ? <ErrorState message={error} onRetry={tab === '전체' ? () => setNearbyKey(k => k + 1) : feed.refresh} />
              : tab === '친구'
                ? <ListState icon="people-outline" title="팔로우한 러너의 코스가 여기에 보여요" sub="전체 탭에서 주변 러닝을 둘러보세요" />
                : locStatus === 'denied'
                  // the honest permission state — DISTINCT from genuine-empty
                  ? <ListState icon="location-outline" title="위치 권한이 필요해요" sub="주변 러너들의 러닝을 보려면 위치 접근을 허용해 주세요." btn="설정 열기" onBtn={() => Linking.openSettings()} />
                  : !nearby.fetched
                    ? <View style={lst.wrap}><ActivityIndicator size="large" color={C.accent} /></View>
                    : !retried
                      // genuine empty @10km — ONE wider retry (server clamps at 20)
                      ? <ListState icon="walk-outline" title="주변에 러닝이 없어요" sub="반경 10km 안에 공개된 러닝이 아직 없어요." btn="반경 20km로 넓혀 보기" onBtn={retryWider} />
                      // terminal — refresh is the escape (owner R1)
                      : <ListState icon="walk-outline" title="반경 20km 안에도 아직 없어요" sub="당겨서 새로고침할 수 있어요" />
        }
        ListFooterComponent={
          <View>
            {feed.loadingMore && tab === '친구' && (
              <ActivityIndicator size="small" color={C.faint} style={{ paddingVertical: 14 }} />
            )}
            <View style={{ paddingHorizontal: S.gutter, paddingTop: 26, paddingBottom: 26 }}>
              <AIBanner
                locked={!premium}
                // TODO(PR-2): locked → push the premium upsell screen once it exists
                onPress={() => premium
                  ? router.push('/(course)/create')
                  : Alert.alert('준비 중', '프리미엄 안내는 다음 업데이트에서 지원됩니다.')}
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

    </View>
  );
}
