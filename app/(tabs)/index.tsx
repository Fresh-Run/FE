/**
 * Home screen — Layout B from the FrHomeB bundle spec.
 * Feed v1: cards are real public courses (GET /feed for 친구, /routes/nearby
 * for 전체) with real likes / bookmarks / comments per docs/API_GUIDE.md.
 * Cards show estimates (예상 시간/페이스) — courses carry no run stats.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiniMap } from '@/components/mini-map';
import { PendingRunRecovery } from '@/components/pending-run-recovery';
import { Icon } from '@/components/ui';
import { useRouteComments } from '@/hooks/use-comments';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { useFeed, useNearbyRoutes } from '@/hooks/use-feed';
import { avatarBg } from '@/lib/fr-hash';
import { openProfile } from '@/lib/profile-nav';
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
import { FR_WEATHER, type WTone } from '@/lib/weather-mock';

// ─── Constants / helpers ──────────────────────────────────────────────────────

const FR_AQI_COLOR: Record<string, string> = {
  '좋음':    '#3BA7FF',
  '보통':    '#2FA866',
  '나쁨':    '#E8922E',
  '매우나쁨': '#D8463C',
};

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

function haversineKm(a: Coordinate, b: Coordinate): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function verdictColor(tone: WTone): string {
  if (tone === 'good') return C.accent;
  if (tone === 'ok')   return C.sun;
  return C.danger;
}

function formatDate(): string {
  const d = new Date();
  const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  return `${days[d.getDay()]}, ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 38, ring = false }: { name: string; size?: number; ring?: boolean }) {
  return (
    <View style={[
      { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarBg(name), flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
      ring && { borderWidth: 2, borderColor: C.border },
    ]}>
      <RNText style={{ fontWeight: '700', fontSize: Math.round(size * 0.42), color: '#fff', letterSpacing: -0.3 }}>
        {name[0]}
      </RNText>
    </View>
  );
}

// ─── Greeting header ──────────────────────────────────────────────────────────

function Greeting({ name, onBell }: { name: string; onBell: () => void }) {
  return (
    <View style={gst.row}>
      <View style={{ minWidth: 0, flex: 1 }}>
        <RNText style={gst.date}>{formatDate()}</RNText>
        <RNText style={gst.heading} numberOfLines={1}>안녕하세요, {name}님</RNText>
      </View>
      <View style={gst.actions}>
        <Pressable onPress={onBell} style={[gst.bellBtn, shadows.sm]}>
          <Icon name="notifications-outline" size={20} color={C.text} />
          <View style={gst.notifDot} />
        </Pressable>
        {/* Avatar → 내 프로필 (social profile; canvas 2026-07-07) */}
        <Pressable onPress={() => router.push('/my-profile' as any)} hitSlop={6}>
          <Avatar name={name} size={38} ring />
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
  const w = FR_WEATHER;
  const vc = verdictColor(w.verdict.tone);
  return (
    <Pressable onPress={onPress} style={[wst.strip, shadows.sm]}>
      <Icon name="sunny" size={26} color="#E8A23D" />
      <View style={wst.tempGroup}>
        <RNText style={wst.temp}>{w.temp}°</RNText>
        <RNText style={wst.area}>{w.area}</RNText>
      </View>
      <View style={wst.divider} />
      <View style={wst.metrics}>
        <View style={wst.metric}>
          <Icon name="water-outline" size={13} color={C.faint} />
          <RNText style={wst.metricTxt}>{w.humidity}%</RNText>
        </View>
        <View style={wst.metric}>
          <View style={[wst.aqiDot, { backgroundColor: FR_AQI_COLOR[w.pm10.label] }]} />
          <RNText style={wst.metricTxt}>미세 {w.pm10.label}</RNText>
        </View>
      </View>
      <View style={[wst.verdict, { backgroundColor: vc + '1A' }]}>
        <View style={[wst.verdictDot, { backgroundColor: vc }]} />
        <RNText style={wst.verdictTxt}>{w.verdict.short}</RNText>
      </View>
      <View style={{ marginLeft: 2 }}>
        <Icon name="chevron-forward" size={16} color={C.faint} />
      </View>
    </Pressable>
  );
}

const wst = StyleSheet.create({
  strip:      { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingTop: 11, paddingBottom: 11, paddingLeft: 14, paddingRight: 12 },
  tempGroup:  { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  temp:       { fontSize: 22, fontWeight: '700', color: C.text, letterSpacing: -0.8 },
  area:       { fontSize: 11.5, color: C.faint, letterSpacing: -0.2 },
  divider:    { width: 1, height: 26, backgroundColor: C.border },
  metrics:    { flexDirection: 'row', gap: 12, flex: 1, minWidth: 0 },
  metric:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metricTxt:  { fontSize: 12.5, fontWeight: '600', color: C.text },
  aqiDot:     { width: 6, height: 6, borderRadius: 3 },
  verdict:    { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  verdictDot: { width: 7, height: 7, borderRadius: 4 },
  verdictTxt: { fontSize: 12, fontWeight: '700', color: C.text, letterSpacing: -0.2 },
});

// ─── Feed tabs ────────────────────────────────────────────────────────────────

function FeedTabs({ tab, setTab }: { tab: string; setTab: (v: string) => void }) {
  // Query radius stays 10km — the label converts for display only
  const units = useSettings(s => s.settings.units);
  const radiusLabel = units === 'mi' ? `내 위치 ${fmtDist(10, 'mi', 1)}mi 이내` : '내 위치 10km 이내';
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
  item, liked, likeCount, commentCount, saved, awayKm,
  onLike, onSave, onOpen, onRun,
}: {
  item: PublicRoute; liked: boolean; likeCount: number; commentCount: number;
  saved: boolean; awayKm: number | null;
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
          <Avatar name={d.name} size={36} />
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
        <MiniMap seed={item.id} height={172} polyline={item.polyline ?? undefined} />
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

// ─── Course detail bottom sheet ───────────────────────────────────────────────

function CourseDetailSheet({
  item, liked, likeCount, onLike, onRun, onClose, onCommentPosted,
}: {
  item: PublicRoute | null; liked: boolean; likeCount: number;
  onLike: () => void; onRun: () => void; onClose: () => void;
  onCommentPosted: (routeId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const units = useSettings(s => s.settings.units);
  const { comments, loading, posting, error, post } = useRouteComments(item?.id ?? null);
  const d = item ? courseDisplay(item, units) : null;

  useEffect(() => { setDraft(''); }, [item?.id]);

  const send = async () => {
    const t = draft.trim();
    if (!t || !item) return;
    const ok = await post(t);
    if (ok) {
      setDraft('');
      onCommentPosted(item.id);
    }
  };

  return (
    <Modal visible={!!item} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={rdt.overlay} onPress={onClose}>
        <Pressable style={[rdt.sheet, { paddingBottom: Math.max(insets.bottom, S.md) }]} onPress={() => {}}>
          <View style={rdt.handleRow}><View style={rdt.handle} /></View>

          {item && d && (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={rdt.scrollContent} keyboardShouldPersistTaps="handled">
              {/* Owner header */}
              <View style={rdt.userRow}>
                <Avatar name={d.name} size={42} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <RNText style={rdt.userName}>{d.name}</RNText>
                  <RNText style={rdt.userSub}>{d.ago}</RNText>
                </View>
                <Pressable onPress={onClose} style={rdt.closeBtn}>
                  <Icon name="close" size={17} color={C.sub} />
                </Pressable>
              </View>

              <MiniMap seed={item.id} height={188} borderRadius={18} polyline={item.polyline ?? undefined} />

              <RNText style={rdt.title}>{item.summary}</RNText>

              {/* Stats tiles */}
              <View style={rdt.statsRow}>
                {([
                  [`${fmtDist(item.total_distance_km, units, 1)} ${distUnit(units)}`, '거리'],
                  [d.dur,                                                             '예상 시간'],
                  [`${d.pace} ${paceUnit(units)}`,                                    '예상 페이스'],
                ] as [string, string][]).map(([v, l], i) => (
                  <View key={i} style={rdt.statTile}>
                    <RNText style={rdt.statVal}>{v}</RNText>
                    <RNText style={rdt.statLbl}>{l}</RNText>
                  </View>
                ))}
              </View>

              {/* Actions */}
              <View style={rdt.actionRow}>
                <Pressable
                  onPress={onLike}
                  style={[rdt.likeBtn, { borderColor: liked ? C.danger : C.border, backgroundColor: liked ? C.danger + '14' : C.surface }]}
                >
                  <Icon name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? C.danger : C.sub} />
                  <RNText style={[rdt.likeTxt, { color: liked ? C.danger : C.sub }]}>{likeCount}</RNText>
                </Pressable>
                <Pressable onPress={onRun} style={rdt.runBtn}>
                  <Icon name="navigate-outline" size={17} color={C.accentText} />
                  <RNText style={rdt.runBtnTxt}>이 코스 달리기</RNText>
                </Pressable>
              </View>

              {/* Comments */}
              <RNText style={rdt.commentsHdr}>댓글 {comments.length}</RNText>
              {loading && <ActivityIndicator size="small" color={C.faint} style={{ paddingVertical: 10 }} />}
              {!loading && error && <RNText style={[rdt.emptyTxt, { color: C.danger }]}>{error}</RNText>}
              {!loading && !error && comments.length === 0 && <RNText style={rdt.emptyTxt}>첫 댓글을 남겨보세요.</RNText>}
              {/* Comment author zones → profile (routing-rule RIDER: commits
                  with the item-17 walk gate) */}
              {comments.map((c) => (
                <View key={c.id} style={rdt.comment}>
                  <Pressable onPress={() => openProfile(c.authorId, c.authorName)} disabled={!c.authorId} hitSlop={6}>
                    <Avatar name={c.authorName} size={30} />
                  </Pressable>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <RNText style={rdt.cName} onPress={c.authorId ? () => openProfile(c.authorId, c.authorName) : undefined}>{c.authorName}</RNText>
                    <RNText style={rdt.cText}>{c.body}</RNText>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Comment input footer */}
          <View style={rdt.inputRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={send}
              placeholder="댓글 달기..."
              placeholderTextColor={C.faint}
              returnKeyType="send"
              editable={!posting}
              style={rdt.input}
            />
            <Pressable onPress={send} disabled={!draft.trim() || posting} style={[rdt.sendBtn, { backgroundColor: draft.trim() && !posting ? C.accent : C.border }]}>
              {posting
                ? <ActivityIndicator size="small" color={C.faint} />
                : <RNText style={[rdt.sendTxt, { color: draft.trim() ? C.accentText : C.faint }]}>게시</RNText>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const rdt = StyleSheet.create({
  overlay:     { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.42)' },
  sheet:       { backgroundColor: C.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '88%' },
  handleRow:   { alignItems: 'center', paddingTop: 10, paddingBottom: 2 },
  handle:      { width: 38, height: 5, borderRadius: 99, backgroundColor: C.border },
  scrollContent:{ paddingHorizontal: S.gutter, paddingTop: S.sm, paddingBottom: S.lg },
  userRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 14 },
  userName:    { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  userSub:     { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },
  closeBtn:    { width: 34, height: 34, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  title:       { fontSize: 18, fontWeight: '700', color: C.text, letterSpacing: -0.5, marginTop: 14 },
  statsRow:    { flexDirection: 'row', gap: 10, marginTop: 14 },
  statTile:    { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center' },
  statVal:     { fontSize: 16.5, fontWeight: '700', color: C.text, letterSpacing: -0.4 },
  statLbl:     { fontSize: 11, color: C.faint, marginTop: 3 },
  actionRow:   { flexDirection: 'row', gap: 10, marginTop: 12 },
  likeBtn:     { flex: 1, height: 46, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  likeTxt:     { fontSize: 13.5, fontWeight: '700', letterSpacing: -0.2 },
  runBtn:      { flex: 2, height: 46, borderRadius: 13, backgroundColor: C.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, shadowColor: C.accent, shadowOpacity: 0.34, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 6 },
  runBtnTxt:   { fontSize: 14, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },
  commentsHdr: { fontSize: 13.5, fontWeight: '700', color: C.text, letterSpacing: -0.3, marginTop: 22, marginBottom: 4 },
  emptyTxt:    { fontSize: 13, color: C.faint, letterSpacing: -0.2, paddingVertical: 8 },
  comment:     { flexDirection: 'row', gap: 9, marginTop: 14 },
  cName:       { fontSize: 12.5, fontWeight: '700', color: C.text, letterSpacing: -0.2 },
  cText:       { fontSize: 13.5, color: C.sub, letterSpacing: -0.2, lineHeight: 19, marginTop: 2 },
  inputRow:    { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: S.gutter, paddingTop: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface },
  input:       { flex: 1, height: 42, borderRadius: 999, borderWidth: 1.5, borderColor: C.border, paddingHorizontal: 16, fontSize: 14, letterSpacing: -0.2, backgroundColor: C.surfaceAlt, color: C.text },
  sendBtn:     { height: 42, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  sendTxt:     { fontSize: 13.5, fontWeight: '700', letterSpacing: -0.2 },
});

// ─── List states ──────────────────────────────────────────────────────────────

function ListState({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <View style={lst.wrap}>
      <Icon name={icon} size={38} color={C.faint} />
      <RNText style={lst.title}>{title}</RNText>
      {sub ? <RNText style={lst.sub}>{sub}</RNText> : null}
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
  retryBtn: { marginTop: 4, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  retryTxt: { fontSize: 14, fontWeight: '700', color: C.text },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets      = useSafeAreaInsets();
  const displayName = useStore((s) => s.displayName);
  const signOut     = useStore((s) => s.signOut);
  const premium     = useQuota((s) => s.isPremium);
  useEffect(() => { useQuota.getState().hydrate(); }, []);

  const [tab, setTab]           = useState('친구');
  const [openItem, setOpenItem] = useState<PublicRoute | null>(null);

  const feed = useFeed();
  const { coordinate } = useCurrentLocation();
  const nearby = useNearbyRoutes(tab === '전체' ? coordinate : null);

  // Optimistic overlays (shared by both tabs + the sheet), rolled back on error
  const [likeOv, setLikeOv] = useState<Record<string, { liked: boolean; count: number }>>({});
  const [saveOv, setSaveOv] = useState<Record<string, boolean>>({});
  const [cmtOv, setCmtOv]   = useState<Record<string, number>>({});

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
    setOpenItem(null);
    setPendingCourse(r);
    router.push('/(course)/preview' as any);
  }, []);

  const name = displayName ?? '러너';
  const list = tab === '전체' ? nearby.items : feed.items;
  const loading = tab === '전체' ? nearby.loading || (!coordinate && nearby.items.length === 0) : feed.loading;
  const error = tab === '전체' ? nearby.error : feed.error;

  const header = useMemo(() => (
    <View>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: S.gutter }}>
        <Greeting name={name} onBell={() => router.push('/notifications' as any)} />
      </View>
      <View style={{ paddingTop: 14, paddingHorizontal: S.gutter }}>
        <WeatherStrip onPress={() => router.push('/weather-detail')} />
      </View>
      <View style={{ paddingTop: 22, paddingBottom: 14, paddingHorizontal: S.gutter }}>
        <FeedTabs tab={tab} setTab={setTab} />
      </View>
    </View>
  ), [insets.top, name, tab]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Cold-start recovery of an unsaved run (crash safety, 러닝 저장 item) */}
      <PendingRunRecovery />
      <FlatList
        data={list}
        keyExtractor={(r) => r.id}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl
            refreshing={tab === '전체' ? nearby.loading && nearby.items.length > 0 : feed.refreshing}
            onRefresh={() => {
              useQuota.getState().hydrate(true); // recovery path for a failed tier sync
              if (tab === '전체') nearby.refetch(); else feed.refresh();
            }}
            tintColor={C.faint}
          />
        }
        onEndReached={tab === '친구' ? feed.loadMore : undefined}
        onEndReachedThreshold={0.4}
        contentContainerStyle={{ paddingBottom: 8 }}
        ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
        renderItem={({ item }) => {
          const like = effLiked(item);
          const awayKm = tab === '전체' && coordinate && item.start_lat != null && item.start_lng != null
            ? haversineKm(coordinate, { lat: item.start_lat, lng: item.start_lng })
            : null;
          return (
            <View style={{ paddingHorizontal: S.gutter }}>
              <FeedCard
                item={item}
                liked={like.liked}
                likeCount={like.count}
                commentCount={item.comment_count + (cmtOv[item.id] ?? 0)}
                saved={effSaved(item)}
                awayKm={awayKm}
                onLike={() => toggleLike(item)}
                onSave={() => toggleSave(item)}
                // Rider ④ (owner directive 2026-07-10): card tap → 코스 포스트
                // full screen (canvas FrRunPost), superseding the comment
                // sheet below — the sheet + cmtOv are now unreachable; delete
                // them in the item-17 gate commit cleanup.
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
              ? <ErrorState message={error} onRetry={tab === '전체' ? nearby.refetch : feed.refresh} />
              : tab === '친구'
                ? <ListState icon="people-outline" title="팔로우한 러너의 코스가 여기에 보여요" sub="전체 탭에서 근처 코스를 둘러보세요" />
                : <ListState icon="map-outline" title="근처에 공개 코스가 없어요" />
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

      {/* Course detail bottom sheet — always rendered for smooth animation */}
      <CourseDetailSheet
        item={openItem}
        liked={openItem ? effLiked(openItem).liked : false}
        likeCount={openItem ? effLiked(openItem).count : 0}
        onLike={() => openItem && toggleLike(openItem)}
        onRun={() => openItem && runCourse(openItem)}
        onClose={() => setOpenItem(null)}
        onCommentPosted={(id) => setCmtOv(p => ({ ...p, [id]: (p[id] ?? 0) + 1 }))}
      />
    </View>
  );
}
