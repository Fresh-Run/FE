/**
 * Home screen — Layout B, rebuilt 1:1 from FrHomeB bundle spec.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui';
import { MiniMap } from '@/components/mini-map';
import { avatarBg } from '@/lib/fr-hash';
import { useComments, type LocalComment } from '@/hooks/use-comments';
import { useLikes } from '@/hooks/use-likes';
import { useStore } from '@/store/use-store';
import {
  colors as C,
  shadows,
  spacing as S,
} from '@/lib/theme';
import { FR_WEATHER, type WTone } from '@/lib/weather-mock';

type FeedItem = {
  id: string;
  name: string;
  area: string;
  title: string;
  dist: number;
  dur: string;
  pace: string;
  tags: string[];
  ago: string;
  kudos: number;
  comments: number;
  seed: string;
  away?: number;
};

// ─── Bundle data ──────────────────────────────────────────────────────────────

const FR_AQI_COLOR: Record<string, string> = {
  '좋음':    '#3BA7FF',
  '보통':    '#2FA866',
  '나쁨':    '#E8922E',
  '매우나쁨': '#D8463C',
};

const FR_FEED: FeedItem[] = [
  { id: 'r1', name: '김도현', area: '한강 · 뚝섬',  title: '한강 야경 러닝',    dist: 7.2, dur: '38:24', pace: "5'19\"", tags: ['야경', '도심'],   ago: '2시간 전', kudos: 24, comments: 3, seed: 'kim-hangang-night', away: 4.1 },
  { id: 'r2', name: '이서연', area: '남산',          title: '남산 언덕 코스',    dist: 5.4, dur: '31:50', pace: "5'53\"", tags: ['언덕', '경치'],  ago: '5시간 전', kudos: 41, comments: 7, seed: 'lee-namsan-hill',    away: 5.8 },
  { id: 'r3', name: '박지호', area: '올림픽공원',    title: '올림픽공원 둘레길', dist: 6.8, dur: '34:58', pace: "5'08\"", tags: ['공원', '평지'],  ago: '어제',    kudos: 18, comments: 1, seed: 'park-olympic-loop',  away: 8.7 },
  { id: 'r4', name: '최유진', area: '양재천',        title: '양재천 새벽 런',    dist: 8.1, dur: '44:06', pace: "5'26\"", tags: ['자연', '조용함'], ago: '어제',   kudos: 33, comments: 5, seed: 'choi-yangjae-dawn',  away: 9.2 },
  { id: 'r5', name: '정민수', area: '서울숲',        title: '서울숲 인터벌',     dist: 4.2, dur: '21:58', pace: "5'14\"", tags: ['공원'],          ago: '2일 전',  kudos: 12, comments: 0, seed: 'jung-seoulsup-int', away: 2.4 },
];

const FR_NEARBY: FeedItem[] = [
  { id: 'n1', name: '한도윤', area: '성수동',       title: '성수 카페거리 러닝', dist: 3.6, dur: '19:40', pace: "5'28\"", tags: ['도심'],          ago: '1시간 전', kudos: 6,  comments: 2, seed: 'han-seongsu-cafe', away: 0.6 },
  { id: 'n2', name: '서지안', area: '뚝섬한강공원', title: '뚝섬 강변 5K',      dist: 5.0, dur: '27:30', pace: "5'30\"", tags: ['강변', '평지'],  ago: '2시간 전', kudos: 9,  comments: 0, seed: 'seo-ttukseom-5k',  away: 1.3 },
  { id: 'n3', name: '문하늘', area: '응봉산',       title: '응봉산 언덕 훈련',   dist: 6.1, dur: '35:50', pace: "5'52\"", tags: ['언덕'],          ago: '3시간 전', kudos: 21, comments: 3, seed: 'moon-eungbong',     away: 3.0 },
  { id: 'n4', name: '오세훈', area: '중랑천',       title: '중랑천 LSD',         dist: 9.4, dur: '52:18', pace: "5'34\"", tags: ['강변', '평지'],  ago: '5시간 전', kudos: 14, comments: 1, seed: 'oh-jungnang-lsd',   away: 4.7 },
];

const FR_COMMENTS: Record<string, [string, string][]> = {
  r1: [['이서연', '야경 미쳤다 🔥 나도 담에 같이 가요'], ['박지호', '페이스 좋네요!'], ['최유진', '뚝섬 코스 저장!']],
  r2: [['김도현', '언덕 구간 힘들었죠 ㅋㅋ'], ['정민수', '경치값 함']],
  r3: [['최유진', '평지라 기록 잘 나오는 코스']],
  r5: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
        <Avatar name={name} size={38} ring />
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
        <RNText style={ftt.locTxt}>{tab === '전체' ? '성수동 10km 이내' : '성수동'}</RNText>
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
  item, liked, saved, showAway,
  onLike, onSave, onOpen, onRun,
}: {
  item: FeedItem; liked: boolean; saved: boolean; showAway: boolean;
  onLike: () => void; onSave: () => void; onOpen: () => void; onRun: () => void;
}) {
  return (
    <View style={[fct.card, shadows.sm]}>
      {/* Header */}
      <View style={fct.header}>
        <Avatar name={item.name} size={36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <RNText style={fct.name}>{item.name}</RNText>
          <View style={fct.subRow}>
            <Icon name="location-outline" size={11} color={C.faint} />
            <RNText style={fct.sub} numberOfLines={1}>
              {item.area} · {item.ago}
              {showAway && item.away != null
                ? <RNText style={fct.away}> · {item.away}km</RNText>
                : null}
            </RNText>
          </View>
        </View>
        <Pressable onPress={onSave} hitSlop={8}>
          <Icon name={saved ? 'bookmark' : 'bookmark-outline'} size={20} color={saved ? C.accent : C.faint} />
        </Pressable>
      </View>

      {/* Hero map */}
      <Pressable onPress={onOpen}>
        <View style={{ position: 'relative' }}>
          <MiniMap seed={item.seed} height={172} />
          <View style={fct.tagRow}>
            {item.tags.map((t) => (
              <View key={t} style={fct.tag}>
                <RNText style={fct.tagTxt}>{t}</RNText>
              </View>
            ))}
          </View>
        </View>
      </Pressable>

      {/* Title + stats */}
      <Pressable onPress={onOpen} style={fct.stats}>
        <RNText style={fct.title} numberOfLines={1}>{item.title}</RNText>
        <View style={fct.statsRow}>
          {([
            [String(item.dist), 'km',  '거리'],
            [item.dur,          '',    '시간'],
            [item.pace,         '/km', '페이스'],
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
          <RNText style={[fct.actionTxt, { color: liked ? C.danger : C.sub }]}>{item.kudos + (liked ? 1 : 0)}</RNText>
        </Pressable>
        <Pressable onPress={onOpen} style={fct.action}>
          <Icon name="chatbubble-outline" size={19} color={C.sub} />
          <RNText style={[fct.actionTxt, { color: C.sub }]}>{item.comments}</RNText>
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
  tagRow:    { position: 'absolute', bottom: 12, left: 12, flexDirection: 'row', gap: 7 },
  tag:       { backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tagTxt:    { fontSize: 11.5, fontWeight: '700', color: '#fff' },
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

// ─── Run detail bottom sheet ──────────────────────────────────────────────────

function RunDetailSheet({
  item, liked, currentUserName, onLike, onRun, onClose,
}: {
  item: FeedItem | null; liked: boolean; currentUserName: string;
  onLike: () => void; onRun: () => void; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');

  // Reset draft when switching to a different card.
  useEffect(() => { setDraft(''); }, [item?.id]);

  // Seed comments converted to the LocalComment shape the hook expects.
  const seedComments = useMemo<LocalComment[]>(() => {
    if (!item) return [];
    return (FR_COMMENTS[item.id] ?? []).map(([authorName, body], i) => ({
      id: `seed-${item.id}-${i}`,
      authorName,
      body,
      createdAt: '',
    }));
  }, [item?.id]);

  // useComments manages extra (locally-posted) comments.
  // TO SWAP: replace hook body with a Supabase query + insert — interface stays identical.
  const { comments, post } = useComments(item?.id ?? null, seedComments);

  const send = () => {
    const t = draft.trim();
    if (!t) return;
    post(t, currentUserName);
    setDraft('');
  };

  return (
    <Modal visible={!!item} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={rdt.overlay} onPress={onClose}>
        <Pressable style={[rdt.sheet, { paddingBottom: Math.max(insets.bottom, S.md) }]} onPress={() => {}}>
          <View style={rdt.handleRow}><View style={rdt.handle} /></View>

          {item && (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={rdt.scrollContent} keyboardShouldPersistTaps="handled">
              {/* User header */}
              <View style={rdt.userRow}>
                <Avatar name={item.name} size={42} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <RNText style={rdt.userName}>{item.name}</RNText>
                  <RNText style={rdt.userSub}>{item.area} · {item.ago}</RNText>
                </View>
                <Pressable onPress={onClose} style={rdt.closeBtn}>
                  <Icon name="close" size={17} color={C.sub} />
                </Pressable>
              </View>

              <MiniMap seed={item.seed} height={188} borderRadius={18} />

              <RNText style={rdt.title}>{item.title}</RNText>
              <View style={rdt.tags}>
                {item.tags.map((t) => (
                  <View key={t} style={rdt.tag}><RNText style={rdt.tagTxt}>{t}</RNText></View>
                ))}
              </View>

              {/* Stats tiles */}
              <View style={rdt.statsRow}>
                {([
                  [`${item.dist} km`, '거리'],
                  [item.dur,          '시간'],
                  [`${item.pace} /km`, '평균 페이스'],
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
                  <RNText style={[rdt.likeTxt, { color: liked ? C.danger : C.sub }]}>{item.kudos + (liked ? 1 : 0)}</RNText>
                </Pressable>
                <Pressable onPress={onRun} style={rdt.runBtn}>
                  <Icon name="navigate-outline" size={17} color={C.accentText} />
                  <RNText style={rdt.runBtnTxt}>이 코스 달리기</RNText>
                </Pressable>
              </View>

              {/* Comments */}
              <RNText style={rdt.commentsHdr}>댓글 {comments.length}</RNText>
              {comments.length === 0 && <RNText style={rdt.emptyTxt}>첫 댓글을 남겨보세요.</RNText>}
              {comments.map((c) => (
                <View key={c.id} style={rdt.comment}>
                  <Avatar name={c.authorName} size={30} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <RNText style={rdt.cName}>{c.authorName}</RNText>
                    <RNText style={rdt.cText}>{c.body}</RNText>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Comment input footer */}
          <View style={rdt.inputRow}>
            <Avatar name="지윤" size={32} />
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={send}
              placeholder="댓글 달기..."
              placeholderTextColor={C.faint}
              returnKeyType="send"
              style={rdt.input}
            />
            <Pressable onPress={send} disabled={!draft.trim()} style={[rdt.sendBtn, { backgroundColor: draft.trim() ? C.accent : C.border }]}>
              <RNText style={[rdt.sendTxt, { color: draft.trim() ? C.accentText : C.faint }]}>게시</RNText>
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
  tags:        { flexDirection: 'row', gap: 8, marginTop: 9 },
  tag:         { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  tagTxt:      { fontSize: 11.5, fontWeight: '600', color: C.sub },
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

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets       = useSafeAreaInsets();
  const displayName  = useStore((s) => s.displayName);
  const signOut      = useStore((s) => s.signOut);
  const premium      = false; // TODO: wire from subscription store

  const { isLiked, toggle: toggleLike } = useLikes();

  const [tab,      setTab]      = useState('친구');
  const [saved,    setSaved]    = useState<Record<string, boolean>>({});
  const [openItem, setOpenItem] = useState<FeedItem | null>(null);

  const name = displayName ?? '지윤';
  const list = tab === '전체'
    ? [...FR_NEARBY, ...FR_FEED].sort((a, b) => (a.away ?? 99) - (b.away ?? 99))
    : FR_FEED;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>

        {/* Greeting — padding: '62px 20px 0' from bundle, adjusted for insets */}
        <View style={{ paddingTop: insets.top + 12, paddingHorizontal: S.gutter }}>
          <Greeting name={name} onBell={() => router.push('/notifications' as any)} />
        </View>

        {/* Weather strip — padding: '14px 20px 0' */}
        <View style={{ paddingTop: 14, paddingHorizontal: S.gutter }}>
          <WeatherStrip onPress={() => router.push('/weather-detail')} />
        </View>

        {/* Feed tabs — padding: '22px 20px 12px' */}
        <View style={{ paddingTop: 22, paddingBottom: 12, paddingHorizontal: S.gutter }}>
          <FeedTabs tab={tab} setTab={setTab} />
        </View>

        {/* Feed cards — gap:16, padding: '2px 20px 24px' */}
        <View style={{ gap: 16, paddingTop: 2, paddingHorizontal: S.gutter, paddingBottom: 24 }}>
          {list.map((item) => (
            <FeedCard
              key={item.id}
              item={item}
              liked={isLiked(item.id)}
              saved={!!saved[item.id]}
              showAway={tab === '전체'}
              onLike={() => toggleLike(item.id)}
              onSave={() => setSaved((p) => ({ ...p, [item.id]: !p[item.id] }))}
              onOpen={() => setOpenItem(item)}
              onRun={() => router.push({ pathname: '/(course)/preview' as any, params: { item: JSON.stringify(item) } })}
            />
          ))}
        </View>

        {/* AI Banner — padding: '0 20px 26px' */}
        <View style={{ paddingHorizontal: S.gutter, paddingBottom: 26 }}>
          <AIBanner
            locked={!premium}
            onPress={() => router.push(!premium ? ('/premium' as any) : '/(course)/create')}
          />
        </View>

        {__DEV__ && (
          <Pressable
            onPress={signOut}
            style={{ alignSelf: 'center', marginTop: 8, marginBottom: 16, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderRadius: 8, borderStyle: 'dashed', borderColor: C.border }}
          >
            <RNText style={{ fontSize: 12, color: C.faint }}>DEV: 로그아웃 →</RNText>
          </Pressable>
        )}
      </ScrollView>

      {/* Run detail bottom sheet — always rendered for smooth animation */}
      <RunDetailSheet
        item={openItem}
        liked={openItem ? isLiked(openItem.id) : false}
        currentUserName={name}
        onLike={() => openItem && toggleLike(openItem.id)}
        onRun={() => {
          if (!openItem) return;
          const item = openItem;
          setOpenItem(null);
          router.push({ pathname: '/(course)/preview' as any, params: { item: JSON.stringify(item) } });
        }}
        onClose={() => setOpenItem(null)}
      />
    </View>
  );
}
