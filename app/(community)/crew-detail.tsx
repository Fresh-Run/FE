/**
 * 크루 상세 — redesign item 9 (2026-11-21), canvas CrewR1.dc.html (section ⑬
 * "크루 내부 R1"): cover hero (name · 멤버 N · area · 주 N회 · 이번 주 함께 km) ·
 * chat (unread dot) + ⋯ menu · 홈 / 랭킹 / 피드 / 멤버 text tabs. 홈 = 다음 크루
 * 러닝 (참여 = RSVP) · 공지 row · 이번 주 랭킹 top-3 · (+ today's challenge and
 * 집결 cards when they have data) · 크루 러닝 시작 (stated deviation — the one
 * function the board does not draw that cannot live in a menu).
 *
 * EVERY existing function is kept: the ⋯ menu holds 크루 관리 (staff, with the
 * pending-requests dot on the button), 공지 작성 / 챌린지 만들기 (permission-
 * gated), 커버·아이콘 변경 (edit_crew, crop stage unchanged), 나가기 (plain
 * members). Non-members: the sticky 가입 CTA footer, and only what the server
 * serves them (probed 2026-11-21 as test4: crew/members/ranking/challenge 200;
 * announcements/runs 403 → 피드 tab hidden, not faked).
 *
 * NOT REDESIGNED behind the doors: crew-chat, announcements (+detail/compose),
 * challenge-create, crew-admin, crew-edit, crew-members (manage), crew-requests,
 * crew-invite, crew-runs (full feed), meet-map, tracking hand-off.
 */
import { CrewDetailSkeleton } from '@/components/skeleton';
import { dcGet } from '@/lib/data-cache';
import { useScreenTiming } from '@/lib/screen-timing';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { AvatarCrop, type CropSource } from '@/components/avatar-crop';
import { CrewGlyph } from '@/components/crew-glyph';
import { MiniMap } from '@/components/mini-map';
import { RealMap } from '@/components/real-map';
import { SafeImage } from '@/components/safe-image';
import { Icon } from '@/components/ui';
import { useCrewWeeklyKm } from '@/hooks/use-crew-weekly-km';
import { cancelJoinRequest, joinCrew, leaveCrew, useCrewDetail, type Crew } from '@/hooks/use-crews';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { listAnnouncements, rsvpAnnouncement, type Announcement } from '@/lib/announcements-api';
import { getCurrentChallenge, type Challenge } from '@/lib/challenges-api';
import { getUnread } from '@/lib/chat-api';
import { getCrewRanking, getCrewRuns, groupCrewSessions, listJoinRequests, uploadCrewImage, type CrewRankingEntry, type CrewRunItem } from '@/lib/crews-api';
import { errorMessage } from '@/lib/error-copy';
import { t, tfIn, tIn, useLang, useT, type StringKey } from '@/lib/i18n';
import { openProfile } from '@/lib/profile-nav';
import { DAY_KEYS_SHORT, DAY_LABEL_KEY, distUnit, fmtAgo, fmtDist, fmtDuration, fmtPaceIn, paceUnit } from '@/lib/run-format';
import { radius as R, spacing as S, type Tokens, DENSE_MAX_FONT_SCALE } from '@/lib/theme';
import { isPlausibleTrack } from '@/lib/track-plausibility';
import { setActiveCourse } from '@/store/active-course';
import { useSettings } from '@/store/use-settings';

type Tab = 'home' | 'rank' | 'feed' | 'members';
const HERO_H = 270;
const FEED_PAGE = 20;

function isFull(crew: Crew): boolean {
  return crew.max_members !== null && crew.member_count >= crew.max_members;
}
const rankMedal = (C: Tokens): Record<number, string> => ({ 1: C.medalGold, 2: C.medalSilver, 3: C.medalBronze });
const fmtKm1 = (km: number) => (Math.round(km * 10) / 10).toFixed(1);
const hhmm = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

// ─── CTA footer (non-members; verbatim from the pre-redesign screen) ──────────

function CtaButton({ crew, requestPending, busy, onJoin, onCancelRequest }: {
  crew: Crew; requestPending: boolean; busy: boolean; onJoin: () => void; onCancelRequest: () => void;
}) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  if (requestPending) {
    return (
      <Pressable onPress={onCancelRequest} disabled={busy} style={({ pressed }) => [st.ctaBtn, st.ctaPending, pressed && { opacity: 0.75 }]}>
        {busy ? <ActivityIndicator size="small" color={C.accentGrn} /> : (<>
          <Icon name="hourglass-outline" size={18} color={C.accentGrn} />
          <Text style={[st.ctaTxt, { color: C.accentGrn }]}>{T('crw.applied')}</Text>
        </>)}
      </Pressable>
    );
  }
  if (isFull(crew)) {
    return (
      <View style={[st.ctaBtn, st.ctaDisabled]} pointerEvents="none">
        <Icon name="people-outline" size={18} color={C.faint} />
        <Text style={[st.ctaTxt, { color: C.faint }]}>{T('crw.full')}</Text>
      </View>
    );
  }
  return (
    <Pressable onPress={onJoin} disabled={busy} style={({ pressed }) => [st.ctaBtn, pressed && { opacity: 0.82 }]}>
      {busy ? <ActivityIndicator size="small" color={C.accentText} /> : (<>
        <Icon name="people-outline" size={18} color={C.accentText} />
        <Text style={st.ctaTxt}>{crew.join_policy === 'approval' ? T('crw.joinApply') : T('crw.join')}</Text>
      </>)}
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CrewDetailScreen() {
  const T = useT();
  const C = useTokens();
  const lang = useLang();
  const Tf = (k: StringKey, v: Record<string, string | number>) => tfIn(lang, k, v);
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const units = useSettings(s => s.settings.units);
  const { crewId } = useLocalSearchParams<{ crewId: string }>();
  const { crew, members, myPerms, myRequestStatus, loading, error, refetch } = useCrewDetail(crewId ?? null);
  const weeklyKm = useCrewWeeklyKm(crewId ?? null);

  const [tab, setTab] = useState<Tab>('home');
  useScreenTiming('crew-detail', !loading && !!crew, !!(crewId && dcGet(`/api/crews/${crewId}`)));
  const [busy, setBusy] = useState(false);
  const [mutErr, setMutErr] = useState<string | null>(null);

  const isMember = crew?.myRole != null;
  const canManage = crew?.myRole === 'owner' || crew?.myRole === 'admin';
  const can = (k: keyof NonNullable<typeof myPerms>) => !!myPerms?.[k];
  const canEditCrew = !!myPerms?.edit_crew;

  // ── 공지 (members only; the next-run card + notice row + the 크루 러닝 시작 window scan) ──
  const [anns, setAnns] = useState<Announcement[] | null>(() => (crewId ? dcGet<Announcement[]>(`/api/crews/${crewId}/announcements?limit=20&offset=0`) : undefined) ?? null); // item ⑩ seed
  const loadAnns = useCallback(() => {
    if (!crewId || !isMember) { setAnns(null); return; }
    let cancelled = false;
    listAnnouncements(crewId, 20).then(rows => { if (!cancelled) setAnns(rows); }).catch(() => { if (!cancelled) setAnns([]); });
    return () => { cancelled = true; };
  }, [crewId, isMember]);
  useFocusEffect(loadAnns);
  const nextRun = (anns ?? []).filter(a => a.run_at && Date.parse(a.run_at) > Date.now()).sort((a, b) => Date.parse(a.run_at!) - Date.parse(b.run_at!))[0] ?? null;
  const latestNotice = anns?.[0] ?? null;
  const [rsvpBusy, setRsvpBusy] = useState(false);
  async function rsvpGoing(a: Announcement) {
    if (!crew || rsvpBusy) return;
    setRsvpBusy(true);
    try { await rsvpAnnouncement(crew.id, a.id, 'going'); loadAnns(); }
    catch (e: unknown) { setMutErr(errorMessage(e)); }
    finally { setRsvpBusy(false); }
  }

  // ── 가입 요청 count (owner) → dot on the ⋯ button ────────────────────────────
  const [pendingReqCount, setPendingReqCount] = useState(0);
  useFocusEffect(useCallback(() => {
    if (!crewId || crew?.myRole !== 'owner') { setPendingReqCount(0); return; }
    let cancelled = false;
    listJoinRequests(crewId).then(rows => { if (!cancelled) setPendingReqCount(rows.length); }).catch(() => {});
    return () => { cancelled = true; };
  }, [crewId, crew?.myRole]));

  // ── 채팅 unread (members) → dot on the chat button ────────────────────────────
  const [chatUnread, setChatUnread] = useState(() => (crewId ? dcGet<{ unread_count: number }>(`/api/crews/${crewId}/chat/unread`)?.unread_count : undefined) ?? 0);
  useFocusEffect(useCallback(() => {
    if (!crewId || !isMember) { setChatUnread(0); return; }
    let cancelled = false;
    getUnread(crewId).then(u => { if (!cancelled) setChatUnread(u.unread_count); }).catch(() => {});
    return () => { cancelled = true; };
  }, [crewId, isMember]));

  // ── 크루 이미지 (edit_crew) — picker + crop stage unchanged, now reached from the ⋯ menu ──
  const [imgBusy, setImgBusy] = useState<'cover' | 'icon' | null>(null);
  const [cropSrc, setCropSrc] = useState<{ src: CropSource; kind: 'cover' | 'icon' } | null>(null);
  const lastCropKind = useRef<'cover' | 'icon'>('icon');
  async function pickCrewImage(kind: 'cover' | 'icon') {
    let res: ImagePicker.ImagePickerResult;
    try { res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 1 }); }
    catch { Alert.alert(T('onb.photoFailTitle'), T('onb.photoFailBody')); return; }
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    lastCropKind.current = kind;
    setCropSrc({ src: { uri: a.uri, width: a.width ?? 1, height: a.height ?? 1 }, kind });
  }
  async function onCropped(croppedUri: string) {
    const kind = cropSrc?.kind ?? lastCropKind.current;
    setCropSrc(null);
    setImgBusy(kind);
    try { await uploadCrewImage(crew!.id, kind, croppedUri); refetch(); }
    catch (e: unknown) { Alert.alert(kind === 'cover' ? T('crw.coverFail') : T('crw.iconFail'), errorMessage(e)); }
    finally { setImgBusy(null); }
  }

  // ── 챌린지 + 랭킹 (readable by all, probed) · 피드 (members, paged) ─────────────
  const [challenge, setChallenge] = useState<Challenge | null | undefined>(() => (crewId ? dcGet<Challenge | null>(`/api/crews/${crewId}/challenges/current`) : undefined));
  const [ranking, setRanking] = useState<CrewRankingEntry[] | null>(() => (crewId ? dcGet<CrewRankingEntry[]>(`/api/crews/${crewId}/ranking`) : undefined) ?? null);
  useFocusEffect(useCallback(() => {
    if (!crewId) return;
    let cancelled = false;
    getCurrentChallenge(crewId).then(ch => { if (!cancelled) setChallenge(ch); }).catch(() => { if (!cancelled) setChallenge(null); });
    getCrewRanking(crewId).then(rows => { if (!cancelled) setRanking(rows); }).catch(() => { if (!cancelled) setRanking([]); });
    return () => { cancelled = true; };
  }, [crewId]));
  const [feed, setFeed] = useState<CrewRunItem[] | null>(() => (crewId ? dcGet<CrewRunItem[]>(`/api/crews/${crewId}/runs?limit=${FEED_PAGE}&offset=0&session_only=true`) : undefined) ?? null);
  const [feedMore, setFeedMore] = useState(true);
  const [feedBusy, setFeedBusy] = useState(false);
  useFocusEffect(useCallback(() => {
    if (!crewId || !isMember) { setFeed(null); return; }
    let cancelled = false;
    getCrewRuns(crewId, 0, FEED_PAGE).then(rows => { if (!cancelled) { setFeed(rows); setFeedMore(rows.length >= FEED_PAGE); } }).catch(() => { if (!cancelled) setFeed([]); });
    return () => { cancelled = true; };
  }, [crewId, isMember]));
  function loadMoreFeed() {
    if (!crewId || !feed || !feedMore || feedBusy) return;
    setFeedBusy(true);
    getCrewRuns(crewId, feed.length, FEED_PAGE)
      .then(rows => { setFeed(f => [...(f ?? []), ...rows]); setFeedMore(rows.length >= FEED_PAGE); })
      .catch(() => {})
      .finally(() => setFeedBusy(false));
  }

  // ── 크루 러닝 시작 (L1, any member) — meetup window suggestion unchanged ────────
  function beginCrewRun(announcementId: string | null, announcementTitle: string | null) {
    if (!crew) return;
    setActiveCourse({ id: null, title: Tf('crw.crewRunOf', { name: crew.name }), distanceKm: 0, polyline: null, crewSession: { crewId: crew.id, crewName: crew.name, announcementId, announcementTitle } });
    router.push('/(course)/tracking' as never);
  }
  function startCrewRun() {
    if (!crew) return;
    const H = 3600_000;
    const near = (anns ?? [])
      .filter(a => { if (!a.run_at) return false; const ahead = new Date(a.run_at).getTime() - Date.now(); return ahead >= -3 * H && ahead <= 6 * H; })
      .sort((a, b) => Math.abs(new Date(a.run_at!).getTime() - Date.now()) - Math.abs(new Date(b.run_at!).getTime() - Date.now()))[0];
    if (near) {
      Alert.alert(T('crw.startTitle'), Tf('crw.startAsk', { title: near.title }), [
        { text: T('common.cancel'), style: 'cancel' },
        { text: T('crw.plainRun'), onPress: () => beginCrewRun(null, null) },
        { text: T('crw.withMeet'), onPress: () => beginCrewRun(near.id, near.title) },
      ]);
    } else beginCrewRun(null, null);
  }
  function openCrewRun(run: CrewRunItem) {
    router.push({ pathname: '/run-post' as never, params: { runId: run.run_id, nickname: run.nickname ?? T('home.runner'), avatarUrl: run.avatar_url ?? '', allowLikes: run.allow_likes === true ? '1' : '0', allowComments: run.allow_comments === true ? '1' : '0' } });
  }

  // ── join / cancel request / leave (verbatim) ──────────────────────────────────
  async function handleJoin() {
    if (!crew) return;
    setBusy(true); setMutErr(null);
    try {
      const result = await joinCrew(crew.id);
      if (result === 'pending') Alert.alert(T('crw.appliedDone'), T('crw.appliedDoneSub'));
      else if (result === 'already_member') setMutErr(T('crw.alreadyJoined'));
      refetch();
    } catch (e: unknown) { setMutErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  function handleCancelRequest() {
    if (!crew) return;
    Alert.alert(T('crw.cancelApplyTitle'), T('crw.cancelApplyAsk'), [
      { text: T('crw.no'), style: 'cancel' },
      { text: T('crw.cancelApply'), style: 'destructive', onPress: async () => {
        setBusy(true); setMutErr(null);
        try { await cancelJoinRequest(crew.id); refetch(); } catch (e: unknown) { setMutErr(errorMessage(e)); } finally { setBusy(false); }
      } },
    ]);
  }
  function handleLeave() {
    if (!crew) return;
    Alert.alert(T('crw.leaveTitle'), Tf('crw.leaveAsk', { name: crew.name }), [
      { text: T('common.cancel'), style: 'cancel' },
      { text: T('crw.leave'), style: 'destructive', onPress: async () => {
        setBusy(true); setMutErr(null);
        try { await leaveCrew(crew.id); router.back(); } catch (e: unknown) { setMutErr(errorMessage(e)); setBusy(false); }
      } },
    ]);
  }

  // ── ⋯ menu — every door the board does not draw, each row permission-gated ──
  function openMenu() {
    if (!crew) return;
    const rows: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[] = [];
    if (canManage) rows.push({ text: T('crw.manage') + (crew.myRole === 'owner' && pendingReqCount > 0 ? ` (${pendingReqCount})` : ''), onPress: () => router.push({ pathname: '/(community)/crew-admin' as never, params: { crewId: crew.id, role: crew.myRole! } }) });
    if (can('announcements')) rows.push({ text: T('crw.qAnnounce'), onPress: () => router.push({ pathname: '/(community)/announcement-compose' as never, params: { crewId: crew.id } }) });
    if (can('challenges')) rows.push({ text: T('crw.qChallenge'), onPress: () => router.push({ pathname: '/(community)/challenge-create' as never, params: { crewId: crew.id } }) });
    if (canEditCrew) {
      rows.push({ text: T('crw.coverChange'), onPress: () => pickCrewImage('cover') });
      rows.push({ text: T('crw.iconChange'), onPress: () => pickCrewImage('icon') });
    }
    if (isMember && !canManage) rows.push({ text: T('crw.leave'), style: 'destructive', onPress: handleLeave });
    rows.push({ text: T('common.cancel'), style: 'cancel' });
    Alert.alert(crew.name, undefined, rows);
  }

  // ── Loading / error ───────────────────────────────────────────────────────────
  if (loading) {
    // item ⑩: first-ever open = the screen's shape, never a centered spinner
    return (
      <View style={st.root}>
        <CrewDetailSkeleton />
        <Pressable onPress={() => router.back()} hitSlop={8} style={[st.circle, { position: 'absolute', left: 16, top: insets.top + 10 }]} accessibilityRole="button" accessibilityLabel={T('common.back')}>
          <Icon name="chevron-back" size={22} color="#121712" />
        </Pressable>
      </View>
    );
  }
  if (error || !crew) {
    return (
      <View style={[st.root, { paddingTop: insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={[st.circleLight, { margin: S.lg }]}><Icon name="chevron-back" size={22} color={C.text} /></Pressable>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Icon name="warning-outline" size={36} color={C.faint} />
          <Text style={st.errTxt}>{error ?? T('crw.notFound')}</Text>
          <Pressable onPress={refetch} style={st.retryBtn}><Text style={st.retryTxt}>{T('common.retry')}</Text></Pressable>
        </View>
      </View>
    );
  }

  const activeDays = crew.active_days ?? [];
  const hasSchedule = activeDays.length > 0 || !!crew.active_time;
  const meta = [Tf('com.memberBadge', { n: crew.member_count }), crew.sigungu ?? crew.area ?? '', activeDays.length > 0 ? Tf('crw.weeklyTimes', { n: activeDays.length }) : ''].filter(Boolean).join(' · ');
  const tabs: [Tab, StringKey][] = [['home', 'crw.tabHome'], ['rank', 'crw.tabRank'], ...(isMember ? [['feed', 'crw.tabFeed'] as [Tab, StringKey]] : []), ['members', 'crw.tabMembers']];
  const menuDot = crew.myRole === 'owner' && pendingReqCount > 0;

  // ── Section pieces ───────────────────────────────────────────────────────────
  const rankRows = (rows: CrewRankingEntry[]) => rows.map((r, i) => {
    const role = members.find(m => m.user_id === r.user_id)?.role;
    return (
      <React.Fragment key={r.user_id}>
        {i > 0 && <View style={st.divider} />}
        <Pressable onPress={() => openProfile(r.user_id, r.nickname)} style={({ pressed }) => [st.rankRow, pressed && { opacity: 0.7 }]}>
          <Text style={[st.rankNum, i < 3 && { color: rankMedal(C)[r.rank] ?? C.text }]}>{r.rank}</Text>
          <Avatar name={r.nickname} size={34} photoUrl={r.avatar_url} letterSpacing={-0.3} />
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[st.rankName, r.me && { fontWeight: '900' }]} numberOfLines={1}>{r.nickname ?? T('home.runner')}</Text>
            {r.me && <View style={st.meBadge}><Text style={st.meBadgeTxt}>{T('crw.me')}</Text></View>}
            {role === 'owner' && <View style={st.ownerBadge}><Text style={st.ownerTxt}>{T('crw.roleOwner')}</Text></View>}
            {role === 'admin' && <View style={st.adminBadge}><Text style={st.adminTxt}>{T('crw.roleAdmin')}</Text></View>}
          </View>
          <Text style={st.rankKm}>{fmtKm1(r.distance_km)}<Text style={st.rankKmUnit}> km</Text></Text>
        </Pressable>
      </React.Fragment>
    );
  });
  const rankEmpty = (
    <View style={st.card}>
      <View style={st.rankEmptyInner}>
        <Icon name="trophy-outline" size={22} color={C.faint} />
        <Text style={st.emptyTitle}>{T('crw.rankEmpty')}</Text>
        <Text style={st.emptySub}>{T('crw.rankEmptySub')}</Text>
      </View>
    </View>
  );

  return (
    <View style={st.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: isMember ? 40 : 110 }}
        onScroll={tab === 'feed' ? ({ nativeEvent: e }) => { if (e.contentOffset.y + e.layoutMeasurement.height > e.contentSize.height - 500) loadMoreFeed(); } : undefined}
        scrollEventThrottle={120}>

        {/* ── Hero (board: cover 270, two-way gradient, circles, name · meta · weekly km) ── */}
        <View style={[st.hero, { height: HERO_H }]}>
          <SafeImage uri={crew.cover_url ?? crew.icon_url} style={[StyleSheet.absoluteFillObject, { width: undefined, height: undefined }]} resizeMode="cover"
            fallback={<View style={[StyleSheet.absoluteFillObject, { backgroundColor: crew.color ?? C.surfaceAlt }]}><CrewGlyph height={HERO_H} /></View>} />
          <LinearGradient colors={['rgba(18,23,18,0.25)', 'rgba(18,23,18,0)', 'rgba(18,23,18,0.78)']} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFillObject} />
          <View style={[st.heroControls, { top: insets.top + 10 }]}>
            <Pressable onPress={() => router.back()} hitSlop={8} style={st.circle} accessibilityRole="button" accessibilityLabel={T('common.back')}>
              <Icon name="chevron-back" size={22} color="#121712" />
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {isMember && (
                <Pressable onPress={() => router.push({ pathname: '/(community)/crew-chat' as never, params: { crewId: crew.id, crewName: crew.name, memberCount: String(crew.member_count), role: crew.myRole ?? '' } })} hitSlop={8} style={st.circle} accessibilityRole="button" accessibilityLabel={T('crw.chatTitle')}>
                  <Icon name="chatbubble-outline" size={20} color="#121712" />
                  {chatUnread > 0 && <View style={st.circleDot} />}
                </Pressable>
              )}
              {(isMember || canManage) && (
                <Pressable onPress={openMenu} hitSlop={8} style={st.circle} accessibilityRole="button" accessibilityLabel={T('bd.menu')}>
                  <Icon name="ellipsis-horizontal" size={20} color="#121712" />
                  {menuDot && <View style={st.circleDot} />}
                </Pressable>
              )}
            </View>
          </View>
          <View style={st.heroBottom}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.heroName} numberOfLines={1}>{crew.name}</Text>
              <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.heroMeta} numberOfLines={1}>{meta}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.heroKm}>{weeklyKm == null ? '–' : fmtKm1(weeklyKm)}<Text style={st.heroKmUnit}> km</Text></Text>
              <Text style={st.heroKmSub}>{T('crw.weekTogether')}</Text>
            </View>
          </View>
          {imgBusy && <View style={st.imgBusy}><ActivityIndicator size="small" color="#fff" /></View>}
        </View>

        {/* ── Tabs ── */}
        <View style={st.tabRow}>
          {tabs.map(([id, key]) => {
            const on = tab === id;
            return (
              <Pressable key={id} onPress={() => setTab(id)} style={st.tabBtn} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <Text style={[st.tabTxt, on ? { color: C.text, fontWeight: '800' } : { color: C.sub, fontWeight: '500' }]}>{T(key)}</Text>
                {on && <View style={[st.tabUnderline, { backgroundColor: C.text }]} />}
              </Pressable>
            );
          })}
        </View>

        <View style={{ paddingHorizontal: S.gutter + 2 }}>
          {/* ═══ 홈 ═══ */}
          {tab === 'home' && (<>
            {isMember && (<>
              <View style={st.secHead}>
                <Text style={st.secTitle}>{T('crw.nextRun')}</Text>
                <Pressable onPress={() => router.push({ pathname: '/(community)/announcements' as never, params: { crewId: crew.id, canManage: can('announcements') ? '1' : '0' } })} hitSlop={8}>
                  <Text style={st.secLink}>{T('crw.allSchedule')} ›</Text>
                </Pressable>
              </View>
              {anns === null ? (
                <View style={st.card}><ActivityIndicator size="small" color={C.faint} style={{ paddingVertical: 14 }} /></View>
              ) : nextRun ? (
                <Pressable onPress={() => router.push({ pathname: '/(community)/announcement-detail' as never, params: { crewId: crew.id, announcementId: nextRun.id } })} style={({ pressed }) => [st.card, st.nextCard, pressed && { opacity: 0.9 }]}>
                  <View style={st.dateTile}>
                    <Text style={st.dateDow}>{tIn(lang, DAY_KEYS_SHORT[new Date(nextRun.run_at!).getDay()])}</Text>
                    <Text style={st.dateNum}>{new Date(nextRun.run_at!).getDate()}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.nextTitle} numberOfLines={1}>{nextRun.title}</Text>
                    <Text style={st.nextMeta} numberOfLines={1}>{[hhmm(nextRun.run_at!), nextRun.place_name ?? '', Tf('crw.nJoined', { n: nextRun.rsvp.going })].filter(Boolean).join(' · ')}</Text>
                  </View>
                  {nextRun.my_rsvp === 'going' ? (
                    <View style={[st.goBtn, { backgroundColor: C.surfaceAlt }]}><Text style={[st.goTxt, { color: C.sub }]}>{T('crw.rsvpGoing')}</Text></View>
                  ) : (
                    <Pressable onPress={() => rsvpGoing(nextRun)} disabled={rsvpBusy || !nextRun.rsvp_open} hitSlop={6} style={({ pressed }) => [st.goBtn, { backgroundColor: C.neon }, (pressed || !nextRun.rsvp_open) && { opacity: 0.6 }]} accessibilityRole="button">
                      {rsvpBusy ? <ActivityIndicator size="small" color="#121712" /> : <Text style={st.goTxt}>{T('crw.rsvpGo')}</Text>}
                    </Pressable>
                  )}
                </Pressable>
              ) : (
                <Pressable onPress={can('announcements') ? () => router.push({ pathname: '/(community)/announcement-compose' as never, params: { crewId: crew.id } }) : undefined} style={[st.card, { padding: 18, alignItems: 'center' }]}>
                  <Text style={st.emptySub}>{can('announcements') ? T('crw.annEmptyCan') : T('crw.noNextRun')}</Text>
                </Pressable>
              )}
              {latestNotice && (
                <Pressable onPress={() => router.push({ pathname: '/(community)/announcement-detail' as never, params: { crewId: crew.id, announcementId: latestNotice.id } })} style={({ pressed }) => [st.noticeRow, { backgroundColor: C.surfaceAlt }, pressed && { opacity: 0.8 }]}>
                  <View style={[st.noticeTag, { backgroundColor: C.text }]}><Text style={[st.noticeTagTxt, { color: C.bg }]}>{T('crw.noticeTag')}</Text></View>
                  <Text style={st.noticeTxt} numberOfLines={1}>{latestNotice.title}</Text>
                  <Icon name="chevron-forward" size={14} color={C.sub} />
                </Pressable>
              )}
            </>)}

            {!isMember && crew.description ? <Text style={st.desc}>{crew.description}</Text> : null}

            {/* 이번 주 랭킹 top-3 → 전체 = the 랭킹 tab */}
            {ranking !== null && (<>
              <View style={[st.secHead, { marginTop: 22 }]}>
                <Text style={st.secTitle}>{T('crw.weekRank')}</Text>
                <Pressable onPress={() => setTab('rank')} hitSlop={8}><Text style={st.secLink}>{T('crw.all')} ›</Text></Pressable>
              </View>
              {ranking.length === 0 ? rankEmpty : <View style={[st.card, { paddingHorizontal: 18, paddingVertical: 4 }]}>{rankRows(ranking.slice(0, 3))}</View>}
            </>)}

            {/* 챌린지 (when one exists; staff see the create door when none) */}
            {challenge !== undefined && (challenge !== null || can('challenges')) && (
              <View style={{ marginTop: 22 }}>
                <View style={st.secHead}><Text style={st.secTitle}>{T('crw.sChallenge')}</Text></View>
                {challenge === null ? (
                  <Pressable onPress={() => router.push({ pathname: '/(community)/challenge-create' as never, params: { crewId: crew.id } })} style={({ pressed }) => [st.card, { padding: 18, alignItems: 'center' }, pressed && { opacity: 0.8 }]}>
                    <Text style={st.emptySub}>{T('crw.chEmpty')}</Text>
                  </Pressable>
                ) : (
                  <View style={[st.card, { padding: 15 }]}>
                    <View style={st.chHead}>
                      <Text style={st.chTitle} numberOfLines={1}>{challenge.title}</Text>
                      <View style={[st.chPct, { backgroundColor: challenge.is_completed ? C.crown : C.neon }]}>
                        <Text style={st.chPctTxt}>{challenge.is_completed ? T('crw.chDone') : `${Math.round(challenge.progress_pct)}%`}</Text>
                      </View>
                    </View>
                    <View style={st.chBarTrack}><View style={[st.chBar, { backgroundColor: C.neon, width: `${Math.min(100, Math.max(2, challenge.progress_pct))}%` as `${number}%` }]} /></View>
                    <View style={st.chMetaRow}>
                      <Text style={st.chMeta}>{challenge.achieved_km.toFixed(1)} / {challenge.goal_km} km</Text>
                      <Text style={st.chMeta}>
                        {challenge.is_active
                          ? Tf('crw.chDaysLeft', { n: Math.max(0, Math.ceil((new Date(challenge.ends_at).getTime() - Date.now()) / 86400000)) })
                          : new Date(challenge.starts_at).getTime() > Date.now() ? T('crw.chUpcoming') : T('crw.chEnded')}
                      </Text>
                    </View>
                    <Text style={st.chCaption}>{T('crw.chGps')}</Text>
                  </View>
                )}
              </View>
            )}

            {/* 집결 장소 · 일정 (crew-native meet_* / active_days — today's card, restyled) */}
            {(crew.meet_place_name != null || hasSchedule) && (
              <View style={{ marginTop: 22 }}>
                <View style={st.secHead}><Text style={st.secTitle}>{T('crw.sMeet')}</Text></View>
                <View style={[st.card, { overflow: 'hidden' }]}>
                  {crew.meet_lat != null && crew.meet_lng != null && <RealMap height={150} center={{ lat: crew.meet_lat, lng: crew.meet_lng }} marker borderRadius={0} />}
                  <Pressable
                    onPress={crew.meet_lat != null && crew.meet_lng != null ? () => router.push({ pathname: '/(community)/meet-map' as never, params: { name: crew.meet_place_name ?? '', lat: String(crew.meet_lat), lng: String(crew.meet_lng), crewId: crew.id, canEdit: canEditCrew ? '1' : '0' } }) : undefined}
                    disabled={crew.meet_lat == null}
                    style={({ pressed }) => [st.meetRow, pressed && crew.meet_lat != null && { opacity: 0.7 }]}
                  >
                    <Icon name={crew.meet_place_name != null ? 'location' : 'calendar-outline'} size={17} color={crew.meet_place_name != null ? C.danger : C.accentGrn} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      {crew.meet_place_name != null && <Text style={st.meetName} numberOfLines={1}>{crew.meet_place_name}</Text>}
                      {(crew.sigungu || hasSchedule) && (
                        <Text style={st.meetSchedule} numberOfLines={1}>
                          {crew.sigungu ? `${crew.sigungu}` : ''}{crew.sigungu && hasSchedule ? ' · ' : ''}
                          {activeDays.length > 0 ? Tf('crw.weekly', { days: activeDays.map(d => t(DAY_LABEL_KEY[d] ?? 'dayS.mon')).join('·') }) : ''}
                          {activeDays.length > 0 && crew.active_time ? ' ' : ''}{crew.active_time ?? ''}
                        </Text>
                      )}
                    </View>
                    {crew.meet_lat != null && crew.meet_lng != null && <Icon name="chevron-forward" size={16} color={C.faint} />}
                  </Pressable>
                </View>
              </View>
            )}

            {/* 크루 러닝 시작 — any member (stated deviation: not on the board, cannot live in a menu) */}
            {isMember && (
              <Pressable onPress={startCrewRun} style={({ pressed }) => [st.runBtn, { backgroundColor: C.neon }, pressed && { opacity: 0.9 }]} accessibilityRole="button">
                <Icon name="walk-outline" size={20} color="#121712" />
                <Text style={st.runTxt}>{T('crw.startTitle')}</Text>
              </Pressable>
            )}
          </>)}

          {/* ═══ 랭킹 ═══ */}
          {tab === 'rank' && (<>
            <View style={st.secHead}>
              <Text style={st.secTitle}>{T('crw.weekRank')}</Text>
              <Text style={st.secLink}>{T('crw.rankCaption')}</Text>
            </View>
            {ranking === null ? <ActivityIndicator size="small" color={C.faint} style={{ paddingVertical: 20 }} />
              : ranking.length === 0 ? rankEmpty
              : <View style={[st.card, { paddingHorizontal: 18, paddingVertical: 4 }]}>{rankRows(ranking)}</View>}
          </>)}

          {/* ═══ 피드 (members) — 정기런, session-collapsed, paged; 전체 보기 → crew-runs ═══ */}
          {tab === 'feed' && (<>
            <View style={st.secHead}>
              <Text style={st.secTitle}>{T('crw.sFeed')}</Text>
              <Pressable onPress={() => router.push({ pathname: '/(community)/crew-runs' as never, params: { crewId: crew.id, crewName: crew.name } })} hitSlop={8}>
                <Text style={st.secLink}>{T('crw.viewAll')} ›</Text>
              </Pressable>
            </View>
            {feed === null ? <ActivityIndicator size="small" color={C.faint} style={{ paddingVertical: 20 }} />
              : feed.length === 0 ? (
                <View style={[st.card, { padding: 18, alignItems: 'center' }]}>
                  <Text style={st.emptyTitle}>{T('crw.feedEmpty')}</Text>
                  <Text style={st.emptySub}>{T('crw.feedEmptySub')}</Text>
                </View>
              ) : (
                <View style={[st.card, { overflow: 'hidden' }]}>
                  {groupCrewSessions(feed).map(g => g.anchor).map((run, i) => (
                    <React.Fragment key={run.run_id}>
                      {i > 0 && <View style={st.divider} />}
                      <Pressable onPress={() => openCrewRun(run)} style={({ pressed }) => [st.feedRow, pressed && { opacity: 0.7 }]}>
                        <View style={st.feedThumb}>
                          <SafeImage uri={run.photo_thumb} style={st.feedThumbImg}
                            fallback={run.polyline_thumb && run.polyline_thumb.length >= 2 && isPlausibleTrack(run.polyline_thumb, run.distance_km)
                              ? <MiniMap seed={run.run_id} height={48} borderRadius={13} polyline={run.polyline_thumb} />
                              : <MiniMap seed={run.run_id} height={48} borderRadius={13} />} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={st.feedHeadRow}>
                            <Avatar name={run.nickname} size={18} initialsRatio={0.5} photoUrl={run.avatar_url} />
                            <Text style={st.feedName} numberOfLines={1}>{run.nickname ?? T('home.runner')}</Text>
                            {run.session_participant_count != null && <View style={st.feedChip}><Text style={st.feedChipTxt}>{Tf('crw.nJoined', { n: run.session_participant_count })}</Text></View>}
                            <Text style={st.feedWhen}>{fmtAgo(run.ran_at, lang)}</Text>
                          </View>
                          <View style={st.feedStatsRow}>
                            <Text style={st.feedKm}>{fmtDist(run.distance_km, units, 1)}<Text style={st.feedKmUnit}> {distUnit(units)}</Text></Text>
                            <Text style={st.feedStat}>{fmtDuration(run.duration_sec)}</Text>
                            {run.avg_pace_sec_per_km != null && <Text style={st.feedStat}>{fmtPaceIn(run.avg_pace_sec_per_km, units)}{paceUnit(units)}</Text>}
                            {run.kudos_count > 0 && <View style={st.feedKudos}><Icon name="heart" size={10} color={C.neon} /><Text style={st.feedStat}>{run.kudos_count}</Text></View>}
                          </View>
                        </View>
                      </Pressable>
                    </React.Fragment>
                  ))}
                  {feedBusy && <ActivityIndicator size="small" color={C.faint} style={{ paddingVertical: 12 }} />}
                </View>
              )}
          </>)}

          {/* ═══ 멤버 ═══ */}
          {tab === 'members' && (<>
            <View style={st.secHead}>
              <Text style={st.secTitle}>{Tf('crw.nMembers', { n: crew.member_count })}</Text>
              {isMember && (
                <Pressable onPress={() => router.push({ pathname: '/(community)/crew-members' as never, params: { crewId: crew.id } })} hitSlop={8}>
                  <Text style={st.secLink}>{canManage ? T('crw.manage') : T('crw.rosterAll')} ›</Text>
                </Pressable>
              )}
            </View>
            <View style={[st.card, { paddingHorizontal: 18, paddingVertical: 4 }]}>
              {members.map((m, i) => (
                <React.Fragment key={m.user_id}>
                  {i > 0 && <View style={st.divider} />}
                  <Pressable onPress={() => openProfile(m.user_id, m.nickname)} style={({ pressed }) => [st.rankRow, pressed && { opacity: 0.7 }]}>
                    <Avatar name={m.nickname} size={34} photoUrl={m.avatar_url} letterSpacing={-0.3} />
                    <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={st.rankName} numberOfLines={1}>{m.nickname}</Text>
                      {m.role === 'owner' && <View style={st.ownerBadge}><Text style={st.ownerTxt}>{T('crw.roleOwner')}</Text></View>}
                      {m.role === 'admin' && <View style={st.adminBadge}><Text style={st.adminTxt}>{T('crw.roleAdmin')}</Text></View>}
                    </View>
                    {m.challenge_km != null && <Text style={st.rankKm}>{fmtKm1(m.challenge_km)}<Text style={st.rankKmUnit}> km</Text></Text>}
                  </Pressable>
                </React.Fragment>
              ))}
            </View>
          </>)}
        </View>
      </ScrollView>

      {mutErr && (
        <View style={st.errBanner}>
          <Icon name="alert-circle-outline" size={14} color={C.danger} />
          <Text style={st.errBannerTxt} numberOfLines={2}>{mutErr}</Text>
          <Pressable onPress={() => setMutErr(null)} hitSlop={8}><Icon name="close" size={14} color={C.danger} /></Pressable>
        </View>
      )}
      <AvatarCrop src={cropSrc?.src ?? null} aspect={cropSrc?.kind === 'cover' ? 16 / 9 : 1} onClose={() => setCropSrc(null)} onConfirm={onCropped} onRetake={() => { setCropSrc(null); pickCrewImage(lastCropKind.current); }} />
      {!isMember && (
        <View style={[st.footer, { paddingBottom: Math.max(insets.bottom, S.lg) + S.sm }]}>
          <CtaButton crew={crew} requestPending={myRequestStatus === 'pending'} busy={busy} onJoin={handleJoin} onCancelRequest={handleCancelRequest} />
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeSt = (C: Tokens) => StyleSheet.create({
  root:         { flex: 1, backgroundColor: C.bg },
  hero:         { overflow: 'hidden', backgroundColor: C.surfaceAlt },
  heroControls: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  circle:       { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  circleDot:    { position: 'absolute', right: 1, top: 1, width: 9, height: 9, borderRadius: 5, backgroundColor: C.danger, borderWidth: 2, borderColor: '#fff' },
  circleLight:  { width: 40, height: 40, borderRadius: R.pill, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  heroBottom:   { position: 'absolute', left: 22, right: 22, bottom: 18, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  heroName:     { fontSize: 24, fontWeight: '900', color: '#fff', letterSpacing: -0.4 },
  heroMeta:     { fontSize: 11.5, color: 'rgba(255,255,255,0.85)', marginTop: 3 },
  heroKm:       { fontSize: 30, fontWeight: '800', color: '#fff', letterSpacing: -0.5, lineHeight: 32, fontVariant: ['tabular-nums'] },
  heroKmUnit:   { fontSize: 12, fontWeight: '700', color: '#fff' },
  heroKmSub:    { fontSize: 10.5, color: 'rgba(255,255,255,0.85)', marginTop: 3 },
  imgBusy:      { position: 'absolute', right: 16, bottom: 16, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  tabRow:       { flexDirection: 'row', gap: 20, paddingHorizontal: S.gutter + 2, paddingTop: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  tabBtn:       { alignItems: 'center' },
  tabTxt:       { fontSize: 14, letterSpacing: -0.2, paddingBottom: 9 },
  tabUnderline: { height: 2.5, alignSelf: 'stretch' },
  secHead:      { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 22, marginBottom: 10 },
  secTitle:     { fontSize: 15, fontWeight: '900', color: C.text, letterSpacing: -0.2 },
  secLink:      { fontSize: 11.5, color: C.sub },
  card:         { backgroundColor: C.surface, borderRadius: 20 },
  nextCard:     { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, paddingHorizontal: 18 },
  dateTile:     { width: 50, height: 54, borderRadius: 14, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  dateDow:      { fontSize: 10, fontWeight: '700', color: C.sub },
  dateNum:      { fontSize: 20, fontWeight: '800', color: C.text, lineHeight: 22, fontVariant: ['tabular-nums'] },
  nextTitle:    { fontSize: 14, fontWeight: '900', color: C.text },
  nextMeta:     { fontSize: 11, color: C.sub, marginTop: 2 },
  goBtn:        { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, minWidth: 54, alignItems: 'center' },
  goTxt:        { fontSize: 12.5, fontWeight: '900', color: '#121712' },
  noticeRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 16, borderRadius: 16, marginTop: 10 },
  noticeTag:    { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 },
  noticeTagTxt: { fontSize: 10.5, fontWeight: '900' },
  noticeTxt:    { flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: '500', color: C.text },
  desc:         { fontSize: 13.5, lineHeight: 20, color: C.sub, marginTop: 18 },
  divider:      { height: StyleSheet.hairlineWidth, backgroundColor: C.border },
  rankRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  rankNum:      { width: 18, fontSize: 14, fontWeight: '800', color: C.text, fontVariant: ['tabular-nums'] },
  rankName:     { flexShrink: 1, fontSize: 13.5, fontWeight: '700', color: C.text, letterSpacing: -0.2 },
  rankKm:       { fontSize: 15, fontWeight: '800', color: C.text, fontVariant: ['tabular-nums'] },
  rankKmUnit:   { fontSize: 10.5, fontWeight: '700', color: C.sub },
  rankEmptyInner: { alignItems: 'center', gap: 6, paddingVertical: 22, paddingHorizontal: 20 },
  meBadge:      { backgroundColor: C.neon, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  meBadgeTxt:   { fontSize: 10, fontWeight: '700', color: '#121712' },
  ownerBadge:   { backgroundColor: C.crown, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  ownerTxt:     { fontSize: 10, fontWeight: '800', color: C.accentText, letterSpacing: 0.2 },
  adminBadge:   { backgroundColor: C.accentDim, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  adminTxt:     { fontSize: 10, fontWeight: '800', color: C.accentGrn, letterSpacing: 0.2 },
  emptyTitle:   { fontSize: 14, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  emptySub:     { fontSize: 12, color: C.sub, letterSpacing: -0.2, textAlign: 'center', lineHeight: 17 },
  chHead:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chTitle:      { flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  chPct:        { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  chPctTxt:     { fontSize: 11.5, fontWeight: '800', color: '#121712', letterSpacing: -0.2 },
  chBarTrack:   { height: 8, borderRadius: 4, backgroundColor: C.surfaceAlt, marginTop: 12, overflow: 'hidden' },
  chBar:        { height: '100%', borderRadius: 4 },
  chMetaRow:    { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  chMeta:       { fontSize: 12.5, fontWeight: '600', color: C.sub, letterSpacing: -0.2 },
  chCaption:    { fontSize: 11, color: C.faint, letterSpacing: -0.2, marginTop: 6 },
  meetRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  meetName:     { fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  meetSchedule: { fontSize: 12.5, fontWeight: '600', color: C.sub, letterSpacing: -0.2, marginTop: 2 },
  runBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 54, borderRadius: 16, marginTop: 22 },
  runTxt:       { fontSize: 15, fontWeight: '900', color: '#121712', letterSpacing: -0.2 },
  feedRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  feedThumb:    { width: 48, height: 48, borderRadius: 13, overflow: 'hidden', flexShrink: 0 },
  feedThumbImg: { width: 48, height: 48, borderRadius: 13 },
  feedHeadRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feedName:     { flexShrink: 1, fontSize: 13.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  feedChip:     { backgroundColor: C.surfaceAlt, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1.5, flexShrink: 0 },
  feedChipTxt:  { fontSize: 9.5, fontWeight: '800', color: C.sub, letterSpacing: -0.2 },
  feedWhen:     { fontSize: 11.5, color: C.faint, flexShrink: 0, marginLeft: 'auto' },
  feedStatsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  feedKudos:    { flexDirection: 'row', alignItems: 'center', gap: 3 },
  feedKm:       { fontSize: 13, fontWeight: '800', color: C.text, letterSpacing: -0.2, fontVariant: ['tabular-nums'] },
  feedKmUnit:   { fontSize: 10, color: C.sub, fontWeight: '600' },
  feedStat:     { fontSize: 12.5, fontWeight: '600', color: C.sub, letterSpacing: -0.2, fontVariant: ['tabular-nums'] },
  errTxt:       { fontSize: 14, color: C.faint, letterSpacing: -0.2, fontWeight: '600', textAlign: 'center' },
  retryBtn:     { paddingHorizontal: 20, paddingVertical: 10, borderRadius: R.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  retryTxt:     { fontSize: 14, fontWeight: '700', color: C.text },
  errBanner:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: S.gutter, paddingVertical: 10, backgroundColor: C.danger + '12', borderTopWidth: 1, borderTopColor: C.danger + '30' },
  errBannerTxt: { flex: 1, fontSize: 13, color: C.danger, letterSpacing: -0.2 },
  footer:       { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: S.gutter, paddingTop: S.md, backgroundColor: C.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  ctaBtn:       { height: 56, borderRadius: R.lg, backgroundColor: C.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  ctaTxt:       { fontSize: 16, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },
  ctaDisabled:  { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  ctaPending:   { backgroundColor: C.accentDim, borderWidth: 1.5, borderColor: C.accent + '77' },
});
