/**
 * 그룹 tab — redesign item 8 (2026-11-21). Shell + 크루 view from canvas
 * CommV1.dc.html ("커뮤니티 · 크루 탭 (V1 확정 구조)"): 커뮤니티 title ·
 * search · 크루 / 배틀 text tabs · 내 크루 cover cards (이번 주 함께 달린
 * 거리) · 크루 둘러보기 (two cards + 전체 보기 ›). 배틀 view from BattleB1
 * (scoreboard) — 8a = READ-ONLY on the real list/detail endpoints (empty
 * state when none); creation · invites · 전적 ride 8b.
 *
 * Owner rulings (2026-11-21): 만들기 › link at the 내 크루 header · 초대 코드
 * row moved to the browse screen · 랜덤 매칭 omitted (no endpoint) · points
 * as the score. NOT REDESIGNED, kept behind the cards: crew-detail and every
 * inside-crew screen, crew-create, crew-browse (today's 둘러보기 verbatim),
 * user-search, the battle create/invite/detail/settle screens.
 */
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useNavigation } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { CrewGlyph } from '@/components/crew-glyph';
import { useTabBarInset } from '@/components/fresh-tab-bar';
import { SafeImage } from '@/components/safe-image';
import { Icon } from '@/components/ui';
import { useCrewWeeklyKm } from '@/hooks/use-crew-weekly-km';
import { joinCrew, useBrowseCrews, useMyCrews, type Crew } from '@/hooks/use-crews';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { apiFetch } from '@/lib/api';
import { battleDaysLeft, getBattle, listBattles, type Battle } from '@/lib/battles-api';
import { errorMessage } from '@/lib/error-copy';
import { t, tfIn, useLang, useT } from '@/lib/i18n';
import { spacing as S, type Tokens, DENSE_MAX_FONT_SCALE } from '@/lib/theme';
import { useJoinRequests } from '@/store/join-requests';
import { useQuota } from '@/store/use-quota';
import { useStore } from '@/store/use-store';

type Tab = 'crew' | 'battle';

function isFull(crew: Crew): boolean {
  return crew.max_members !== null && crew.member_count >= crew.max_members;
}
const fmtKm1 = (km: number) => (Math.round(km * 10) / 10).toFixed(1);

// ─── Tabs (board: 16px text, 3px ink underline over a hairline) ───────────────

function CommTabs({ active, onChange }: { active: Tab; onChange: (v: Tab) => void }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  return (
    <View style={st.tabRow}>
      {([['crew', 'com.tabCrew'], ['battle', 'com.tabBattle']] as const).map(([id, key]) => {
        const on = active === id;
        return (
          <Pressable key={id} onPress={() => onChange(id)} style={st.tabBtn} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <Text style={[st.tabTxt, on ? { color: C.text, fontWeight: '900' } : { color: C.faint, fontWeight: '700' }]}>{T(key)}</Text>
            {on && <View style={[st.tabUnderline, { backgroundColor: C.text }]} />}
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Shared states ────────────────────────────────────────────────────────────

function Centered({ children }: { children: React.ReactNode }) {
  const st = useStyles(makeSt);
  return <View style={st.centered}>{children}</View>;
}
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const T = useT();
  const C = useTokens();
  const st = useStyles(makeSt);
  return (
    <Centered>
      <Icon name="warning-outline" size={36} color={C.faint} />
      <Text style={st.stateTitle}>{T('com.loadFail')}</Text>
      <Text style={[st.stateSub, { marginTop: 2 }]}>{message}</Text>
      <Pressable onPress={onRetry} style={st.retryBtn}><Text style={st.retryTxt}>{T('common.retry')}</Text></Pressable>
    </Centered>
  );
}

// ─── 내 크루 cover card (board: 206, cover + gradient, 멤버 badge, weekly km) ──

function MyCrewHero({ crew, onPress }: { crew: Crew; onPress: () => void }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  const lang = useLang();
  const km = useCrewWeeklyKm(crew.id);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.hero, pressed && { opacity: 0.92 }]} accessibilityRole="button" accessibilityLabel={crew.name}>
      <SafeImage uri={crew.cover_url ?? crew.icon_url} style={StyleSheet.absoluteFillObject} resizeMode="cover"
        fallback={<View style={[StyleSheet.absoluteFillObject, { backgroundColor: crew.color ?? C.surfaceAlt }]}><CrewGlyph height={206} /></View>} />
      <LinearGradient colors={['rgba(18,23,18,0)', 'rgba(18,23,18,0.72)']} locations={[0.35, 1]} style={StyleSheet.absoluteFillObject} />
      <View style={[st.heroBadge, { backgroundColor: C.surface }]}>
        <Text style={[st.heroBadgeTxt, { color: C.text }]}>{tfIn(lang, 'com.memberBadge', { n: crew.member_count })}</Text>
      </View>
      <View style={st.heroBottom}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.heroName} numberOfLines={1}>{crew.name}</Text>
          <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.heroSub}>{T('com.weeklyTogether')}</Text>
        </View>
        <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.heroKm}>
          {km == null ? '–' : fmtKm1(km)}<Text style={st.heroKmUnit}> km</Text>
        </Text>
      </View>
    </Pressable>
  );
}

// ─── 둘러보기 mini card (board: cover 92, name, 멤버 N · 주간 X km, 가입) ────────

function BrowseMini({ crew, pending, isMember, onPress, onJoin }: {
  crew: Crew; pending: boolean; isMember: boolean; onPress: () => void; onJoin: () => void;
}) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  const lang = useLang();
  const km = useCrewWeeklyKm(crew.id);
  const full = isFull(crew);
  const label = isMember ? T('com.joined') : pending ? T('com.pending') : full ? T('com.closed') : crew.join_policy === 'approval' ? T('com.apply') : T('com.join');
  const disabled = isMember || pending || full;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.mini, pressed && { opacity: 0.92 }]} accessibilityRole="button" accessibilityLabel={crew.name}>
      <View style={st.miniCover}>
        <SafeImage uri={crew.cover_url ?? crew.icon_url} style={{ width: '100%', height: 92 }} resizeMode="cover" fallback={<CrewGlyph height={92} />} />
      </View>
      <View style={st.miniBody}>
        <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.miniName} numberOfLines={1}>{crew.name}</Text>
        <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.miniMeta} numberOfLines={1}>
          {tfIn(lang, 'com.membersWeekly', { n: crew.member_count, km: km == null ? '–' : fmtKm1(km) })}
        </Text>
        <Pressable onPress={disabled ? undefined : onJoin} disabled={disabled} style={[st.miniBtn, { borderColor: disabled ? C.border : C.text }]} hitSlop={4} accessibilityRole="button">
          <Text style={[st.miniBtnTxt, { color: disabled ? C.faint : C.text }]}>{label}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

// ─── 크루 view ────────────────────────────────────────────────────────────────

function CrewTab({ scrollRef }: { scrollRef: React.RefObject<ScrollView | null> }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  const tabBarInset = useTabBarInset();
  const { crews, loading, error, signedOut, refetch } = useMyCrews();
  const { coordinate, status: locStatus } = useCurrentLocation();
  // 둘러보기: nearest first when location is granted (server distance order),
  // server order otherwise; full crews excluded server-side.
  const browse = useBrowseCrews(locStatus === 'granted' ? { lat: coordinate.lat, lng: coordinate.lng, includeFull: false } : { includeFull: false });
  const pendingMap = useJoinRequests(s => s.pendingByCrewId);
  const setPending = useJoinRequests(s => s.setPending);
  const isPremium = useQuota(s => s.isPremium);
  useEffect(() => { useQuota.getState().hydrate(); }, []);
  const browseRefetch = browse.refetch;
  useFocusEffect(useCallback(() => { refetch(); browseRefetch(); }, [refetch, browseRefetch]));

  const memberIds = new Set(crews.map(c => c.id));
  const owned = crews.filter(c => c.myRole === 'owner');
  const others = crews.filter(c => c.myRole !== 'owner');
  const mine = [...owned, ...others];
  const picks = browse.crews.filter(c => !memberIds.has(c.id)).slice(0, 2);
  const createLocked = !isPremium && owned.length >= 1;

  const openCrew = (c: Crew) => router.push({ pathname: '/(community)/crew-detail' as any, params: { crewId: c.id } });
  const create = () => createLocked
    ? Alert.alert(t('com.premiumTitle'), t('com.premiumBody'))
    : router.push('/(community)/crew-create' as any);
  async function handleJoin(crew: Crew) {
    try {
      const result = await joinCrew(crew.id);
      if (result === 'joined') { refetch(); openCrew(crew); }
      else if (result === 'pending') { setPending(crew.id, true); Alert.alert(t('crw.appliedDone'), t('crw.appliedDoneSub')); }
      else Alert.alert(t('com.joinFail'), t('crw.alreadyJoined'));
    } catch (e: unknown) {
      Alert.alert(t('com.joinFail'), errorMessage(e));
    }
  }

  if (loading) return <Centered><ActivityIndicator size="large" color={C.accent} /></Centered>;
  if (signedOut) return <Centered><Icon name="people-outline" size={42} color={C.faint} /><Text style={st.stateTitle}>{T('com.loginNeeded')}</Text></Centered>;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={{ paddingHorizontal: S.gutter + 2, paddingBottom: tabBarInset }} showsVerticalScrollIndicator={false}>
      {/* 내 크루 · 만들기 › (owner ruling: the create door lives here, free-tier lock kept) */}
      <View style={[st.secHead, { marginTop: 20 }]}>
        <Text style={st.secTitle}>{T('com.myCrewSection')}</Text>
        <Pressable onPress={create} hitSlop={8} style={({ pressed }) => pressed && { opacity: 0.6 }} accessibilityRole="button">
          <Text style={[st.secLink, createLocked && { opacity: 0.5 }]}>{T('com.createLink')} ›</Text>
        </Pressable>
      </View>
      {mine.length === 0 ? (
        <Pressable onPress={() => router.push('/(community)/crew-create' as any)} style={({ pressed }) => [st.emptyDashed, pressed && { opacity: 0.7 }]}>
          <View style={st.emptyDashedIcon}><Icon name="people-outline" size={20} color={C.accentGrn} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.emptyDashedTitle}>{T('com.makeCrew')}</Text>
            <Text style={st.emptyDashedSub}>{T('com.makeCrewSub')}</Text>
          </View>
          <Icon name="chevron-forward" size={16} color={C.faint} />
        </Pressable>
      ) : (
        <View style={{ gap: 10, marginTop: 8 }}>
          {mine.map(c => <MyCrewHero key={c.id} crew={c} onPress={() => openCrew(c)} />)}
        </View>
      )}

      {/* 크루 둘러보기 · 전체 보기 › → today's full browse (crew-browse) */}
      <View style={[st.secHead, { marginTop: 22 }]}>
        <Text style={st.secTitle}>{T('com.browseSection')}</Text>
        <Pressable onPress={() => router.push('/(community)/crew-browse' as any)} hitSlop={8} style={({ pressed }) => pressed && { opacity: 0.6 }} accessibilityRole="link">
          <Text style={st.secLink}>{T('com.seeAll')} ›</Text>
        </Pressable>
      </View>
      {browse.loading ? (
        <ActivityIndicator size="small" color={C.faint} style={{ paddingVertical: 28 }} />
      ) : browse.error ? (
        <Pressable onPress={browseRefetch} style={st.inlineRetry}><Text style={st.stateSub}>{T('com.loadFail')} · {T('common.retry')}</Text></Pressable>
      ) : picks.length === 0 ? (
        <Text style={[st.stateSub, { paddingVertical: 20 }]}>{T('com.noMatch')}</Text>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          {picks.map(c => (
            <BrowseMini key={c.id} crew={c} pending={!!pendingMap[c.id]} isMember={memberIds.has(c.id)} onPress={() => openCrew(c)} onJoin={() => handleJoin(c)} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ─── 배틀 view — B1 scoreboard, READ-ONLY in 8a ───────────────────────────────

type Profile = { nickname: string; avatar_url: string | null };

function ActiveBattleCard({ battle }: { battle: Battle }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  const lang = useLang();
  const myUid = useStore(s => s.session?.user.id);
  const myName = useStore(s => s.displayName);
  const myPhoto = useStore(s => s.photoUrl);
  const oppId = battle.created_by === myUid ? battle.opponent : battle.created_by;
  const [opp, setOpp] = useState<Profile | null>(null);
  const [detail, setDetail] = useState<Battle | null>(battle.scores ? battle : null);
  useEffect(() => {
    let alive = true;
    apiFetch<Profile>(`/api/users/${oppId}/profile`).then(p => { if (alive) setOpp(p); }).catch(() => {});
    if (!battle.scores) getBattle(battle.id).then(d => { if (alive) setDetail(d); }).catch(() => {});
    return () => { alive = false; };
  }, [battle.id, battle.scores, oppId]);
  const scoreOf = (uid: string | undefined) => detail?.scores?.find(s => s.user_id === uid)?.score ?? 0;
  const mine = scoreOf(myUid), theirs = scoreOf(oppId);
  const total = mine + theirs;
  const myShare = total > 0 ? mine / total : 0.5;
  const diff = Math.round(mine - theirs);
  const days = battleDaysLeft(battle);
  const oppName = opp?.nickname ?? T('bat.opponent');
  return (
    <View>
      <View style={[st.secHead, { marginTop: 20 }]}>
        <Text style={st.secTitle}>{T('bat.activeSection')}</Text>
        <Text style={st.secStrong}>{tfIn(lang, 'bat.daysLeft', { n: days })}</Text>
      </View>
      <View style={[st.battleCard, { backgroundColor: C.surface }]}>
        <Text style={st.battleSub} numberOfLines={1}>{battle.emoji ? `${battle.emoji} ` : ''}{battle.title} · {T('bat.standingNote')}</Text>
        <View style={st.vsRow}>
          <View style={st.vsSide}>
            <Avatar name={myName ?? T('bat.me')} size={60} photoUrl={myPhoto} ring={C.neon} />
            <Text style={st.vsName} numberOfLines={1}>{T('bat.me')}</Text>
            <Text style={[st.vsScore, { color: C.text }]}>{Math.round(mine)}</Text>
            <Text style={st.vsUnit}>{T('bat.ptUnit')}</Text>
          </View>
          <Text style={st.vs}>VS</Text>
          <View style={st.vsSide}>
            <Avatar name={oppName} size={60} photoUrl={opp?.avatar_url ?? null} ring={C.border} />
            <Text style={st.vsName} numberOfLines={1}>{oppName}</Text>
            <Text style={[st.vsScore, { color: C.sub }]}>{Math.round(theirs)}</Text>
            <Text style={st.vsUnit}>{T('bat.ptUnit')}</Text>
          </View>
        </View>
        <View style={st.bar}>
          <View style={[st.barFill, { flex: Math.max(myShare, 0.02), backgroundColor: C.neon }]} />
          <View style={[st.barFill, { flex: Math.max(1 - myShare, 0.02), backgroundColor: C.border }]} />
        </View>
        <Text style={st.standing}>
          {diff > 0 ? tfIn(lang, 'bat.leading', { n: diff }) : diff < 0 ? tfIn(lang, 'bat.trailing', { n: -diff }) : T('bat.tied')}
        </Text>
      </View>
    </View>
  );
}

function BattleTab({ scrollRef }: { scrollRef: React.RefObject<ScrollView | null> }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  const tabBarInset = useTabBarInset();
  const [battles, setBattles] = useState<Battle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    let alive = true;
    listBattles('active').then(rows => { if (alive) { setBattles(rows); setError(null); } })
      .catch((e: unknown) => { if (alive) setError(errorMessage(e)); });
    return () => { alive = false; };
  }, []);
  useFocusEffect(load);
  if (error && !battles) return <ErrorState message={error} onRetry={() => { load(); }} />;
  if (!battles) return <Centered><ActivityIndicator size="large" color={C.accent} /></Centered>;
  const active = battles.find(b => b.status === 'active') ?? null;
  return (
    <ScrollView ref={scrollRef} contentContainerStyle={{ paddingHorizontal: S.gutter + 2, paddingBottom: tabBarInset }} showsVerticalScrollIndicator={false}>
      {active ? <ActiveBattleCard battle={active} /> : (
        <Centered>
          <Icon name="flash-outline" size={42} color={C.faint} />
          <Text style={st.stateTitle}>{T('bat.emptyActive')}</Text>
        </Centered>
      )}
    </ScrollView>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CommunityScreen() {
  const C = useTokens();
  const T = useT();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('crew');
  // 재탭 = 맨 위로 (owner-ruled 8/5): own tabPress only; isFocused at emit
  // time = re-tap → scroll; arriving from another tab → position preserved.
  const crewScrollRef = useRef<ScrollView>(null);
  const battleScrollRef = useRef<ScrollView>(null);
  const navigation = useNavigation();
  useEffect(() => navigation.addListener('tabPress' as never, () => {
    if (navigation.isFocused()) (tab === 'crew' ? crewScrollRef : battleScrollRef).current?.scrollTo({ y: 0, animated: true });
  }), [navigation, tab]);
  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <Text style={st.title}>{T('com.title')}</Text>
        <Pressable onPress={() => router.push('/(community)/user-search' as never)} hitSlop={6} style={({ pressed }) => [st.searchBtn, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={T('com.searchA11y')}>
          <Icon name="search" size={21} color={C.text} />
        </Pressable>
      </View>
      <CommTabs active={tab} onChange={setTab} />
      <View style={{ flex: 1 }}>
        {tab === 'crew' ? <CrewTab scrollRef={crewScrollRef} /> : <BattleTab scrollRef={battleScrollRef} />}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeSt = (C: Tokens) => StyleSheet.create({
  root:      { flex: 1, backgroundColor: C.bg },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S.gutter + 2, paddingTop: 14 },
  title:     { fontSize: 26, fontWeight: '900', letterSpacing: -0.4, color: C.text },
  searchBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  tabRow:    { flexDirection: 'row', gap: 24, paddingHorizontal: S.gutter + 2, paddingTop: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  tabBtn:    { alignItems: 'center' },
  tabTxt:    { fontSize: 16, letterSpacing: -0.3, paddingBottom: 9 },
  tabUnderline: { height: 3, alignSelf: 'stretch', borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  secHead:   { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  secTitle:  { fontSize: 13, fontWeight: '700', color: C.sub },
  secLink:   { fontSize: 11.5, color: C.sub },
  secStrong: { fontSize: 11.5, fontWeight: '700', color: C.text },
  // 내 크루 hero
  hero:      { height: 206, borderRadius: 22, overflow: 'hidden', backgroundColor: C.surfaceAlt },
  heroBadge: { position: 'absolute', right: 14, top: 14, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  heroBadgeTxt: { fontSize: 10.5, fontWeight: '700' },
  heroBottom: { position: 'absolute', left: 18, right: 18, bottom: 16, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  heroName:  { fontSize: 21, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.2 },
  heroSub:   { fontSize: 11.5, color: 'rgba(255,255,255,0.9)', marginTop: 3 },
  heroKm:    { fontSize: 30, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  heroKmUnit:{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  emptyDashed: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.border, borderRadius: 22, padding: 16, backgroundColor: C.surface },
  emptyDashedIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  emptyDashedTitle: { fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  emptyDashedSub: { fontSize: 12, color: C.sub, marginTop: 2 },
  // 둘러보기 minis
  mini:      { flex: 1, backgroundColor: C.surface, borderRadius: 18, overflow: 'hidden' },
  miniCover: { height: 92, backgroundColor: C.surfaceAlt },
  miniBody:  { paddingTop: 10, paddingHorizontal: 12, paddingBottom: 12 },
  miniName:  { fontSize: 14, fontWeight: '900', color: C.text, letterSpacing: -0.2 },
  miniMeta:  { fontSize: 10.5, color: C.sub, marginTop: 2 },
  miniBtn:   { height: 32, marginTop: 10, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
  miniBtnTxt:{ fontSize: 12, fontWeight: '800' },
  inlineRetry: { paddingVertical: 20 },
  // 배틀 B1 (read-only)
  battleCard:{ borderRadius: 22, paddingTop: 20, paddingHorizontal: 18, paddingBottom: 18, marginTop: 8 },
  battleSub: { textAlign: 'center', fontSize: 11.5, fontWeight: '700', color: C.sub },
  vsRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  vsSide:    { width: 104, alignItems: 'center' },
  vsName:    { fontSize: 12.5, fontWeight: '700', color: C.text, marginTop: 12 },
  vsScore:   { fontSize: 30, fontWeight: '800', letterSpacing: -0.6, marginTop: 2, fontVariant: ['tabular-nums'] },
  vsUnit:    { fontSize: 10.5, color: C.sub },
  vs:        { fontSize: 17, fontWeight: '800', color: C.faint },
  bar:       { flexDirection: 'row', height: 10, gap: 3, marginTop: 16 },
  barFill:   { borderRadius: 5 },
  standing:  { textAlign: 'center', fontSize: 13, fontWeight: '900', color: C.text, marginTop: 12 },
  // states
  centered:  { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 48, paddingHorizontal: S.gutter },
  stateTitle:{ fontSize: 14, fontWeight: '600', color: C.faint, textAlign: 'center' },
  stateSub:  { fontSize: 12.5, color: C.faint, textAlign: 'center' },
  retryBtn:  { marginTop: 4, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  retryTxt:  { fontSize: 14, fontWeight: '700', color: C.text },
});
