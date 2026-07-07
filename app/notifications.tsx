/**
 * 알림 센터 — canvas shell (FrNotifications: app bar + ✓ read-all, card
 * anatomy) with owner-approved type mapping; the canvas mock rows predate
 * the backend's 9 types (parity-list entry — canvas refresh owed).
 *
 * Deep links: run_kudoed → activity detail; join_requested, join_approved,
 * crew_joined → crew detail.
 * Truthful interims (tap = mark-read only, no chevron, no alert):
 *  - route_liked/route_commented — owner GET /routes/{id} lacks the social
 *    fields preview renders (지연 ask extended);
 *  - user_followed — other-user profile unbuilt (queued item);
 *  - crew_announcement — tappable iff the row carries crew_id (shipping
 *    지연-side); old rows lack it and stay inert by contract;
 *  - challenge_completed — no challenges surface.
 * Read-marking is optimistic; single-row failures revert silently (the
 * row's nav already happened — an alert would be noise).
 */
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { avatarBg } from '@/lib/fr-hash';
import {
  deleteNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '@/lib/notifications-api';
import { fmtAgo } from '@/lib/run-format';
import { colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';

// ─── Type mapping (owner-approved 2026-07-07; no design source) ──────────────

const CREW_BLUE  = '#3D8BFF';
const TROPHY_ORG = '#E0703D';

type Meta = {
  tag: string;
  tone: string;
  icon: 'avatar' | { name: string; color: string; bg: string };
  /** copy after the bold actor name; null actorPrefix = actorless copy */
  copy: string;
  actorless?: boolean;
};

const TYPE_META: Record<string, Meta> = {
  route_liked:         { tag: '좋아요',   tone: C.accentGrn, icon: 'avatar', copy: '님이 내 코스를 좋아해요' },
  route_commented:     { tag: '댓글',     tone: C.accentGrn, icon: 'avatar', copy: '님이 내 코스에 댓글을 남겼어요' },
  run_kudoed:          { tag: '응원',     tone: C.accentGrn, icon: 'avatar', copy: '님이 내 러닝을 응원해요' },
  // 10th type, discovered live 2026-07-07 (ships with her run-comments batch)
  run_commented:       { tag: '댓글',     tone: C.accentGrn, icon: 'avatar', copy: '님이 내 러닝에 댓글을 남겼어요' },
  user_followed:       { tag: '팔로우',   tone: CREW_BLUE,   icon: 'avatar', copy: '님이 회원님을 팔로우하기 시작했어요' },
  crew_joined:         { tag: '크루',     tone: CREW_BLUE,   icon: { name: 'people-outline',    color: CREW_BLUE,  bg: CREW_BLUE + '22' },  copy: '님이 크루에 가입했어요' },
  join_requested:      { tag: '크루 신청', tone: CREW_BLUE,   icon: { name: 'people-outline',    color: CREW_BLUE,  bg: CREW_BLUE + '22' },  copy: '님이 크루 가입을 신청했어요' },
  join_approved:       { tag: '크루 승인', tone: CREW_BLUE,   icon: { name: 'people-outline',    color: CREW_BLUE,  bg: CREW_BLUE + '22' },  copy: '님이 크루 가입을 승인했어요' },
  crew_announcement:   { tag: '공지',     tone: CREW_BLUE,   icon: { name: 'megaphone-outline', color: CREW_BLUE,  bg: CREW_BLUE + '22' },  copy: '님이 크루에 새 공지를 올렸어요' },
  challenge_completed: { tag: '챌린지',   tone: TROPHY_ORG,  icon: { name: 'trophy-outline',    color: TROPHY_ORG, bg: TROPHY_ORG + '22' }, copy: '챌린지를 달성했어요. 축하해요!', actorless: true },
};

// Unknown future types still render, generically
const FALLBACK_META: Meta = { tag: '알림', tone: C.faint, icon: { name: 'notifications-outline', color: C.sub, bg: C.surfaceAlt }, copy: '새 소식이 있어요', actorless: true };

// ─── Tabs (owner UX calls 2026-07-07; underline pattern from the concept
//     canvas, membership over the REAL types) ────────────────────────────────
// 팔로우 is its own tab (follows, not friend-requests — the concept canvas's
// 수락/거절 buttons remain fiction). challenge_completed + unknown future
// types appear in 전체 only, until a 시스템 tab earns members. Filtering is
// client-side over the single fetch.

type TabKey = 'all' | 'follow' | 'social' | 'crew';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all',    label: '전체' },
  { key: 'follow', label: '팔로우' },
  { key: 'social', label: '소셜' },
  { key: 'crew',   label: '크루' },
];

const FOLLOW_TYPES = new Set(['user_followed']);
const SOCIAL_TYPES = new Set(['run_kudoed', 'run_commented', 'route_liked', 'route_commented']);
const CREW_TYPES   = new Set(['crew_joined', 'join_requested', 'join_approved', 'crew_announcement']);

function inTab(n: AppNotification, tab: TabKey): boolean {
  if (tab === 'all') return true;
  if (tab === 'follow') return FOLLOW_TYPES.has(n.type);
  if (tab === 'social') return SOCIAL_TYPES.has(n.type);
  return CREW_TYPES.has(n.type);
}

/** Where a tap navigates; null = truthful interim (mark-read only).
    Defensive on missing ids by contract (지연): old rows may lack the id a
    type needs — degrade to inert, never fake-nav or crash. */
function deepLink(n: AppNotification): (() => void) | null {
  switch (n.type) {
    case 'run_kudoed':
    case 'run_commented': // target_type "run", target_id = run id (probed)
      if (!n.target_id) return null;
      return () => router.push({ pathname: '/(records)/activity' as any, params: { runId: n.target_id! } });
    case 'crew_joined':
    case 'join_requested':
    case 'join_approved':
      if (!n.target_id) return null;
      return () => router.push({ pathname: '/(community)/crew-detail' as any, params: { crewId: n.target_id! } });
    case 'crew_announcement': {
      // Staging-probed 2026-07-07: new rows carry payload.crew_id; old rows
      // have payload:null and an ANNOUNCEMENT-id target_id — the announced
      // "target_id fallback" is contradicted by staging, so old rows stay
      // inert (navigating with an announcement id would break crew-detail).
      const crewId = n.payload?.crew_id;
      if (!crewId) return null;
      return () => router.push({ pathname: '/(community)/crew-detail' as any, params: { crewId } });
    }
    default:
      return null;
  }
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function NotifIcon({ meta, actor }: { meta: Meta; actor: string }) {
  if (meta.icon === 'avatar') {
    return (
      <View style={[st.avatar, { backgroundColor: avatarBg(actor) }]}>
        <Text style={st.avatarTxt}>{actor.trim()[0]?.toUpperCase() ?? '?'}</Text>
      </View>
    );
  }
  return (
    <View style={[st.iconTile, { backgroundColor: meta.icon.bg }]}>
      <Icon name={meta.icon.name as any} size={19} color={meta.icon.color} />
    </View>
  );
}

function NotifRow({ n, onPress, onDelete }: { n: AppNotification; onPress: () => void; onDelete: () => void }) {
  const meta = TYPE_META[n.type] ?? FALLBACK_META;
  const actor = n.actor_nickname ?? '러너';
  const linked = deepLink(n) !== null;
  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable onPress={onDelete} style={st.deleteAction}>
          <Icon name="trash-outline" size={19} color="#fff" />
          <Text style={st.deleteTxt}>삭제</Text>
        </Pressable>
      )}
    >
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        st.card, shadows.sm,
        !n.is_read && st.cardUnread,
        pressed && { opacity: 0.7 },
      ]}
    >
      <NotifIcon meta={meta} actor={actor} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={st.rowHead}>
          <Text style={[st.tag, { color: meta.tone }]}>{meta.tag}</Text>
          <Text style={st.ago}>{fmtAgo(n.created_at)}</Text>
        </View>
        <Text style={st.body}>
          {meta.actorless ? meta.copy : <><Text style={st.actor}>{actor}</Text>{meta.copy}</>}
        </Text>
      </View>
      {linked && (
        <View style={{ alignSelf: 'center' }}>
          <Icon name="chevron-forward" size={16} color={C.faint} />
        </View>
      )}
      {!n.is_read && <View style={st.unreadDot} />}
    </Pressable>
    </ReanimatedSwipeable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const [rows, setRows]           = useState<AppNotification[] | null>(null);
  const [error, setError]         = useState(false);
  const [refreshing, setRefresh]  = useState(false);
  const [tab, setTab]             = useState<TabKey>('all');

  const load = useCallback(async (asRefresh = false) => {
    if (asRefresh) setRefresh(true);
    setError(false);
    try {
      setRows(await getNotifications());
    } catch {
      setError(true);
    } finally {
      if (asRefresh) setRefresh(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function onRowPress(n: AppNotification) {
    if (!n.is_read) {
      // optimistic; silent revert — nav (if any) already happened
      setRows(rs => rs?.map(r => r.id === n.id ? { ...r, is_read: true } : r) ?? null);
      markNotificationRead(n.id).catch(() =>
        setRows(rs => rs?.map(r => r.id === n.id ? { ...r, is_read: false } : r) ?? null));
    }
    deepLink(n)?.();
  }

  function onRowDelete(n: AppNotification) {
    const prev = rows;
    if (!prev) return;
    setRows(prev.filter(r => r.id !== n.id)); // optimistic remove
    deleteNotification(n.id).catch(() => {
      setRows(prev); // rollback to the exact prior list (position preserved)
      Alert.alert('삭제 실패', '알림을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.');
    });
  }

  function onReadAll() {
    const prev = rows;
    if (!prev?.some(r => !r.is_read)) return;
    setRows(rs => rs?.map(r => ({ ...r, is_read: true })) ?? null);
    markAllNotificationsRead().catch(() => {
      setRows(prev);
      Alert.alert('저장 실패', '읽음 처리를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
    });
  }

  return (
    <GestureHandlerRootView style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.appBarBtn}>
          <Icon name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>알림</Text>
        {/* ✓ = mark-all-read (canvas affordance) */}
        <Pressable onPress={onReadAll} hitSlop={12} style={st.appBarBtn}>
          <Icon name="checkmark-done-outline" size={21} color={C.accentGrn} />
        </Pressable>
      </View>

      {/* Tab bar — concept-canvas underline pattern over the real types */}
      <View style={st.tabBar}>
        {TABS.map(t => {
          const on = tab === t.key;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} hitSlop={6} style={st.tabBtn}>
              <Text style={[st.tabLabel, on && st.tabLabelOn]}>{t.label}</Text>
              {on && <View style={st.tabUnderline} />}
            </Pressable>
          );
        })}
      </View>

      {rows === null && !error ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : error ? (
        <View style={st.centered}>
          <Icon name="warning-outline" size={36} color={C.faint} />
          <Text style={st.stateTxt}>알림을 불러올 수 없어요</Text>
          <Pressable onPress={() => load()} style={st.retryBtn}><Text style={st.retryTxt}>다시 시도</Text></Pressable>
        </View>
      ) : (
        <FlatList
          data={(rows ?? []).filter(n => inTab(n, tab))}
          keyExtractor={n => n.id}
          renderItem={({ item }) => <NotifRow n={item} onPress={() => onRowPress(item)} onDelete={() => onRowDelete(item)} />}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            <View style={st.centered}>
              <Icon name="notifications-off-outline" size={36} color={C.faint} />
              <Text style={st.stateTxt}>아직 알림이 없어요</Text>
            </View>
          }
          contentContainerStyle={{ padding: S.gutter, paddingTop: S.md, paddingBottom: 28 }}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={() => load(true)}
        />
      )}
    </GestureHandlerRootView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, paddingVertical: 10 },
  appBarBtn:   { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },

  // Tab bar (canvas: gap 8, 6/20/10 padding, hairline bottom, 2.5px underline)
  tabBar:       { flexDirection: 'row', gap: 8, paddingHorizontal: S.gutter, paddingTop: 6, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  tabBtn:       { paddingVertical: 6, paddingHorizontal: 2 },
  tabLabel:     { fontSize: 14, fontWeight: '600', color: C.faint, letterSpacing: -0.3 },
  tabLabelOn:   { fontWeight: '700', color: C.text },
  tabUnderline: { position: 'absolute', left: 2, right: 2, bottom: -2, height: 2.5, borderRadius: 99, backgroundColor: C.accent },

  // Card (canvas: gap 12, radius 18, padding 15) + unread treatment
  card:       { flexDirection: 'row', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 15 },
  cardUnread: { backgroundColor: C.accent + '0D', borderColor: C.accent + '2E' },
  unreadDot:  { position: 'absolute', top: 12, right: 12, width: 7, height: 7, borderRadius: 4, backgroundColor: C.accent },

  avatar:    { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarTxt: { fontWeight: '700', fontSize: 16, color: '#fff' },
  iconTile:  { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tag:     { fontSize: 12, fontWeight: '700', letterSpacing: 0.2, textTransform: 'uppercase' },
  ago:     { fontSize: 11.5, color: C.faint, marginRight: 10 },
  body:    { fontSize: 13.5, lineHeight: 20, color: C.sub, letterSpacing: -0.2, marginTop: 5 },
  actor:   { color: C.text, fontWeight: '700' },

  // Swipe-to-delete reveal
  deleteAction: { width: 84, marginLeft: 10, borderRadius: 18, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center', gap: 4 },
  deleteTxt:    { fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: -0.2 },

  centered: { alignItems: 'center', gap: 12, paddingVertical: 60 },
  stateTxt: { fontSize: 14, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: R.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  retryTxt: { fontSize: 14, fontWeight: '700', color: C.text },
});
