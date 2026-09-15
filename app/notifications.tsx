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

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/ui';
import { deepLink } from '@/lib/notif-routing';
import { openProfile } from '@/lib/profile-nav';
import {
  deleteNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '@/lib/notifications-api';
import { fmtAgo } from '@/lib/run-format';
import { radius as R, shadows, spacing as S, type Tokens, DENSE_MAX_FONT_SCALE} from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { t as tx, useLang, useT, type StringKey, tfIn, getLang } from '@/lib/i18n';

// ─── Type mapping (owner-approved 2026-07-07; no design source) ──────────────

const CREW_BLUE  = '#3D8BFF';
const TROPHY_ORG = '#E0703D';

type Meta = {
  tag: string;
  tone: string;
  icon: 'avatar' | { name: string; color: string; bg: string };
  /** StringKey of a template with a {name} slot (actor types) or plain copy (actorless) */
  copy: string;
  actorless?: boolean;
};

const typeMeta = (C: Tokens): Record<string, Meta> => ({
  route_liked:         { tag: 'ntf.tagLike',    tone: C.accentGrn, icon: 'avatar', copy: 'ntf.routeLiked' },
  route_commented:     { tag: 'ntf.tagComment', tone: C.accentGrn, icon: 'avatar', copy: 'ntf.routeCommented' },
  run_kudoed:          { tag: 'ntf.tagKudos',   tone: C.accentGrn, icon: 'avatar', copy: 'ntf.runKudoed' },
  // 10th type, discovered live 2026-07-07 (ships with her run-comments batch)
  run_commented:       { tag: 'ntf.tagComment', tone: C.accentGrn, icon: 'avatar', copy: 'ntf.runCommented' },
  // 9/15 멘션 (지연 계약 — _commented 자매 쌍, 페이로드/딥링크 동일). 카피는
  // 소유 무주장 ("내 러닝" 금지 — 멘션은 제3자 런의 댓글에서도 온다).
  // 그녀 이미션 코드 미푸시 — 셰이프는 계약 락, 첫 라이브 행이 프로브 확인.
  run_mentioned:       { tag: 'ntf.tagMention', tone: C.accentGrn, icon: 'avatar', copy: 'ntf.runMentioned' },
  route_mentioned:     { tag: 'ntf.tagMention', tone: C.accentGrn, icon: 'avatar', copy: 'ntf.routeMentioned' },
  // 8/21 battle pre-wire (the reply_to_comment precedent): GUESSED type
  // strings — her real contract = one key rename per line; until then any
  // battle notification lands on fallbackMeta harmlessly. bt.ntfWon is
  // actorless (the battle ends; nobody "did" it to you).
  battle_invited:      { tag: 'bt.tagBattle', tone: C.accentGrn, icon: 'avatar', copy: 'bt.ntfInvited' },
  battle_overtaken:    { tag: 'bt.tagBattle', tone: C.sun,       icon: 'avatar', copy: 'bt.ntfOvertaken' },
  battle_won:          { tag: 'bt.tagBattle', tone: C.crown, icon: { name: 'trophy-outline', color: C.crown, bg: C.surfaceAlt }, copy: 'bt.ntfWon', actorless: true },
  // 8/4 forward-wire: IF 지연 ships a distinct type instead of a payload flag.
  // (We asked for the flag — a new type leaves every un-updated client on
  // FALLBACK_META with an INERT tap, since deepLink defaults to null. Wired
  // here + in notif-routing so either choice works the day it deploys.)
  reply_to_comment:    { tag: 'ntf.tagReply',   tone: C.accentGrn, icon: 'avatar', copy: 'ntf.runReplied' },
  user_followed:       { tag: 'ntf.tagFollow',  tone: CREW_BLUE,   icon: 'avatar', copy: 'ntf.userFollowed' },
  // v2 승인제 (BE 610c7f3) — was falling through to FALLBACK_META, generic
  // and inert (the dropped-type bug, 2026-07-13). payload is null by
  // contract → the deep-link target is the 팔로우 요청 inbox LIST.
  follow_requested:    { tag: 'ntf.tagFollowReq', tone: CREW_BLUE, icon: 'avatar', copy: 'ntf.followRequested' },
  // v2 승인제 (지연 QA find 2026-07-14 — added 07-12, was falling to
  // FALLBACK_META): target_id = the APPROVER's uid, payload null (probed).
  follow_request_approved: { tag: 'ntf.tagFollow', tone: CREW_BLUE, icon: 'avatar', copy: 'ntf.followApproved' },
  crew_joined:         { tag: 'ntf.tagCrew',    tone: CREW_BLUE,   icon: { name: 'people-outline',    color: CREW_BLUE,  bg: CREW_BLUE + '22' },  copy: 'ntf.crewJoined' },
  join_requested:      { tag: 'ntf.tagCrewReq', tone: CREW_BLUE,   icon: { name: 'people-outline',    color: CREW_BLUE,  bg: CREW_BLUE + '22' },  copy: 'ntf.joinRequested' },
  join_approved:       { tag: 'ntf.tagCrewOk',  tone: CREW_BLUE,   icon: { name: 'people-outline',    color: CREW_BLUE,  bg: CREW_BLUE + '22' },  copy: 'ntf.joinApproved' },
  crew_announcement:   { tag: 'ntf.tagNotice',  tone: CREW_BLUE,   icon: { name: 'megaphone-outline', color: CREW_BLUE,  bg: CREW_BLUE + '22' },  copy: 'ntf.crewAnnounced' },
  // #4 slice (2026-07-21): was falling to FALLBACK_META (generic + inert);
  // actor = the sender (probed). Deep link → crew-chat (crewId-only entry).
  crew_chat:           { tag: 'ntf.tagCrewChat', tone: CREW_BLUE,   icon: 'avatar', copy: 'ntf.crewChatMsg' },
  challenge_completed: { tag: 'ntf.tagChallenge', tone: TROPHY_ORG, icon: { name: 'trophy-outline',    color: TROPHY_ORG, bg: TROPHY_ORG + '22' }, copy: 'ntf.challengeDone', actorless: true },
  // crew_invited (BE 23d2936) — a person invited you; actor avatar (like
  // user_followed), 크루 tab. Copy is dynamic (crew_name); row tap → the
  // crew-invite preview→join screen (payload.invite_code).
  crew_invited:        { tag: 'ntf.tagCrewInvite', tone: CREW_BLUE, icon: 'avatar', copy: 'ntf.crewInvited' },
  // pb_achieved (BE 8cee8d8) — SELF-targeted (수신자==행위자); actorless per
  // guide (actor is you). Copy is dynamic (record_types). Row tap → 활동 상세.
  pb_achieved:         { tag: 'ntf.tagRecord',  tone: TROPHY_ORG,  icon: { name: 'ribbon-outline',    color: TROPHY_ORG, bg: TROPHY_ORG + '22' }, copy: 'ntf.pbZero', actorless: true },
});

// pb_achieved record-type labels — "최고 5K 환산" aligned with the insights
// screen (pace-equivalent, never implies a 5K distance run).
const PB_LABEL: Record<string, string> = {
  best_pace: 'pb.bestPace',
  best_5k: 'pb.best5k',
  longest_distance: 'pb.longestDist',
  longest_duration: 'pb.longestDur',
};

/** Is this row a REPLY TO MY COMMENT rather than a comment on MY run?
    (owner finding 8/3): our own 8/1 reply contract sends the SAME
    run_commented type to the PARENT COMMENTER — for a run they don't own —
    so "…님이 내 러닝에 댓글을 남겼어요" is a lie on those rows.
    PROBED 2026-08-04 (cross-account, both rows dumped): today's payload
    carries NOTHING that separates the two cases — this returns false and the
    copy is unchanged until 지연's additive lands. It then lights up on ANY of
    the three shapes she might pick, no further FE change. */
function isReplyNotif(n: AppNotification): boolean {
  if (n.type === 'reply_to_comment') return true;
  return n.payload?.is_reply === true || n.payload?.parent_comment_id != null;
}

/** Dynamic per-row copy for types whose text depends on payload; else null. */
function dynamicCopy(n: AppNotification): string | null {
  // 8/5: her ROUTE reply contract deployed — same additive shape (probed:
  // reply rows carry {route_id, is_reply, parent_comment_id}; PLAIN route
  // comments have NO payload at all — absent-payload falls through
  // isReplyNotif's optional chain to false, handled by construction).
  if ((n.type === 'run_commented' || n.type === 'route_commented') && isReplyNotif(n)) return tx('ntf.runReplied');
  if (n.type === 'crew_invited') {
    const name = n.payload?.crew_name;
    // tf fills only {crew}; the {name} slot survives for the row's actor split
    return name ? tfIn(getLang(), 'ntf.crewInvitedTo', { crew: name }) : tx('ntf.crewInvited');
  }
  if (n.type === 'pb_achieved') {
    const types = n.payload?.record_types ?? [];
    if (types.length === 1) return tfIn(getLang(), 'ntf.pbOne', { label: PB_LABEL[types[0]] ? tx(PB_LABEL[types[0]] as StringKey) : tx('ntf.pbPersonal') });
    if (types.length > 1) return tfIn(getLang(), 'ntf.pbMany', { n: types.length });
    return tx('ntf.pbZero'); // defensive: missing/empty record_types
  }
  return null;
}

// Unknown future types still render, generically
const fallbackMeta = (C: Tokens): Meta => ({ tag: 'ntf.tagFallback', tone: C.faint, icon: { name: 'notifications-outline', color: C.sub, bg: C.surfaceAlt }, copy: 'ntf.fallbackCopy', actorless: true });

// ─── Tabs (owner UX calls 2026-07-07; underline pattern from the concept
//     canvas, membership over the REAL types) ────────────────────────────────
// 팔로우 is its own tab (follows, not friend-requests — the concept canvas's
// 수락/거절 buttons remain fiction). challenge_completed + unknown future
// types appear in 전체 only, until a 시스템 tab earns members. Filtering is
// client-side over the single fetch.

type TabKey = 'all' | 'follow' | 'social' | 'crew';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all',    label: 'ntf.fAll' },
  { key: 'follow', label: 'ntf.tagFollow' },
  { key: 'social', label: 'ntf.fSocial' },
  { key: 'crew',   label: 'ntf.tagCrew' },
];

const FOLLOW_TYPES = new Set(['user_followed', 'follow_requested', 'follow_request_approved']);
const SOCIAL_TYPES = new Set(['run_kudoed', 'run_commented', 'run_mentioned', 'reply_to_comment', 'route_liked', 'route_commented', 'route_mentioned']);
const CREW_TYPES   = new Set(['crew_joined', 'join_requested', 'join_approved', 'crew_announcement', 'crew_invited']);
// pb_achieved: 전체-only, mirroring challenge_completed (both self-achievements,
// actorless). The rider said "러닝 tab" — no such tab exists; owner ruling
// pending on whether to add a 기록 tab or fold into 소셜.

function inTab(n: AppNotification, tab: TabKey): boolean {
  if (tab === 'all') return true;
  if (tab === 'follow') return FOLLOW_TYPES.has(n.type);
  if (tab === 'social') return SOCIAL_TYPES.has(n.type);
  return CREW_TYPES.has(n.type);
}

// deepLink() moved to lib/notif-routing.ts (2026-07-15, ②) — shared verbatim
// with the remote-push tap handler so the two routing paths never drift.

// ─── Row ──────────────────────────────────────────────────────────────────────

function NotifIcon({ meta, actor, photoUrl }: { meta: Meta; actor: string; photoUrl?: string | null }) {
  const st = useStyles(makeSt);
  if (meta.icon === 'avatar') {
    return <Avatar name={actor} size={42} photoUrl={photoUrl} initialsRatio={0.38} upper />;
  }
  return (
    <View style={[st.iconTile, { backgroundColor: meta.icon.bg }]}>
      <Icon name={meta.icon.name as any} size={19} color={meta.icon.color} />
    </View>
  );
}

function NotifRow({ n, onPress, onDelete }: { n: AppNotification; onPress: () => void; onDelete: () => void }) {
  const T = useT(); // reactive anchor — the long-lived list's row
  const lang = useLang(); // compiler-visible locale for fmtAgo (2026-08-03 formatter-cache fix)
  const C = useTokens();
  const st = useStyles(makeSt);
  const meta = typeMeta(C)[n.type] ?? fallbackMeta(C);
  // the tag follows the copy: a reply row reads 답글, not 댓글
  const tagKey = isReplyNotif(n) ? 'ntf.tagReply' : meta.tag;
  // sentence-subject fallback (v114 ruling): "A runner liked your run", not
  // "Runner liked…" — home.runner stays the label-position fallback elsewhere
  const actor = n.actor_nickname ?? T('ntf.actorFallback');
  const linked = deepLink(n) !== null;
  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable onPress={onDelete} style={st.deleteAction}>
          <Icon name="trash-outline" size={19} color="#fff" />
          <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.deleteTxt}>{T('common.delete')}</Text>
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
      {/* Actor avatar/icon → actor profile (routing rule); row tap keeps
          its own deep-link. Actorless rows stay plain. */}
      {n.actor_id && !meta.actorless ? (
        <Pressable onPress={() => openProfile(n.actor_id, n.actor_nickname)} hitSlop={6}>
          <NotifIcon meta={meta} actor={actor} photoUrl={n.actor_avatar_url} />
        </Pressable>
      ) : (
        <NotifIcon meta={meta} actor={actor} photoUrl={n.actor_avatar_url} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={st.rowHead}>
          <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={[st.tag, { color: meta.tone }]}>{T(tagKey as StringKey)}</Text>
          <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.ago}>{fmtAgo(n.created_at, lang)}</Text>
        </View>
        <Text style={st.body}>
          {(() => {
            // Actor types: the copy is a template with a {name} slot — split
            // there so the bold actor renders in place (ko '{name}님이 …' →
            // ''+'님이 …' = today's visual; en reorders freely).
            const template = dynamicCopy(n) ?? T(meta.copy as StringKey);
            if (meta.actorless) return template;
            const [before, after] = template.split('{name}');
            return <>{before}<Text style={st.actor}>{actor}</Text>{after ?? ''}</>;
          })()}
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
  const T = useT(); // reactive anchor — long-lived list screen
  const C = useTokens();
  const st = useStyles(makeSt);
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
      Alert.alert(tx('annd.delFailT'), tx('ntf.delFailB'));
    });
  }

  function onReadAll() {
    const prev = rows;
    if (!prev?.some(r => !r.is_read)) return;
    setRows(rs => rs?.map(r => ({ ...r, is_read: true })) ?? null);
    markAllNotificationsRead().catch(() => {
      setRows(prev);
      Alert.alert(tx('runSave.saveFailTitle'), tx('ntf.readFailB'));
    });
  }

  return (
    <GestureHandlerRootView style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.appBarBtn}>
          <Icon name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>{T('ntf.title')}</Text>
        {/* ✓ = mark-all-read (canvas affordance) · gear → 알림 설정 */}
        <Pressable onPress={onReadAll} hitSlop={8} style={st.appBarBtn}>
          <Icon name="checkmark-done-outline" size={21} color={C.accentGrn} />
        </Pressable>
        <Pressable onPress={() => router.push('/notification-settings' as any)} hitSlop={8} style={st.appBarBtn}>
          <Icon name="settings-outline" size={19} color={C.text} />
        </Pressable>
      </View>

      {/* Tab bar — concept-canvas underline pattern over the real types */}
      <View style={st.tabBar}>
        {TABS.map(t => {
          const on = tab === t.key;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} hitSlop={6} style={st.tabBtn}>
              <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={[st.tabLabel, on && st.tabLabelOn]}>{T(t.label as StringKey)}</Text>
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
          <Text style={st.stateTxt}>{T('ntf.loadFail')}</Text>
          <Pressable onPress={() => load()} style={st.retryBtn}><Text style={st.retryTxt}>{T('common.retry')}</Text></Pressable>
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
              <Text style={st.stateTxt}>{T('ntf.empty')}</Text>
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

const makeSt = (C: Tokens) => StyleSheet.create({
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
