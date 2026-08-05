/**
 * 검색 — canvas FrUserSearch (community-screen.jsx): 유저/크루 세그먼트 검색.
 * Two modes, one screen:
 *   BROWSE (no crewId param, from the 커뮤니티 tab search icon): 유저/크루
 *     segments. 유저 rows → 프로필 (locked users show the 🔒 screen — A′
 *     holds; search returns them identity-only with bio=null). 크루 rows →
 *     크루 상세.
 *   INVITE (crewId param; entries: 크루원 앱바 아이콘 · 크루 생성 성공 모달 ·
 *     크루 관리 초대 카드 — the 2026-07-20 discoverability slice): 유저-only,
 *     each row carries an 초대 action → POST /crews/{id}/invitations. Any
 *     member can invite (probed — not a permission key). Honest per-row
 *     feedback from what the server actually returns: 초대됨 (204) / 이미
 *     멤버 (409) / 초대할 수 없어요 (404 은닉 — 차단·프로필 없음).
 *     A pinned "링크로 초대" row keeps the reach-anyone share lane inside the
 *     picker (GET-then-issue — never blind-issue, regeneration invalidates
 *     shared codes; code endpoints are 크루장-gated → honest fallback line
 *     for non-owner members).
 *
 * Search discipline (출발지-picker house pattern): 400ms debounce, 2-char
 * floor (server 422 below 2), monotonic seq stale-guard.
 */
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { SafeImage } from '@/components/safe-image';
import { Icon } from '@/components/ui';
import { getInviteCode, inviteToCrew, issueInviteCode, searchCrews, type Crew } from '@/lib/crews-api';
import { searchUsers, type UserSearchItem } from '@/lib/profile-api';
import { openProfile } from '@/lib/profile-nav';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { t, tf, tfIn, useLang } from '@/lib/i18n';

const MIN_Q = 2;
const DEBOUNCE_MS = 400;
type Seg = 'user' | 'crew';
type InviteState = 'idle' | 'sending' | 'sent' | 'member';

export default function UserSearchScreen() {
  const lang = useLang(); // 8/6 back-sweep: render tfIn anchor
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const { crewId, crewName } = useLocalSearchParams<{ crewId?: string; crewName?: string }>();
  const inviteMode = !!crewId;

  const [q, setQ] = useState('');
  const [seg, setSeg] = useState<Seg>('user');
  const [users, setUsers] = useState<UserSearchItem[] | null>(null);
  const [crews, setCrews] = useState<Crew[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [invite, setInvite] = useState<Record<string, InviteState>>({});
  const seqRef = useRef(0);

  const activeSeg: Seg = inviteMode ? 'user' : seg;
  const trimmed = q.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_Q;

  useEffect(() => {
    if (trimmed.length < MIN_Q) { seqRef.current++; setUsers(null); setCrews(null); setLoading(false); return; }
    const seq = ++seqRef.current;
    setLoading(true);
    const t = setTimeout(() => {
      const run = activeSeg === 'user'
        ? searchUsers(trimmed).then(r => { if (seqRef.current === seq) { setUsers(r); setLoading(false); } })
        : searchCrews(trimmed).then(r => { if (seqRef.current === seq) { setCrews(r); setLoading(false); } });
      run.catch(() => {
        if (seqRef.current !== seq) return;
        if (activeSeg === 'user') setUsers([]); else setCrews([]);
        setLoading(false);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [trimmed, activeSeg]);

  // 링크로 초대 — the reach-anyone lane, relocated INTO the picker (2026-07-20
  // slice: the crew-create modal's share moved here; crew-admin keeps its own
  // card). GET first, issue only on 미발급 — blind issuance would invalidate a
  // code the owner already shared. Code endpoints are 크루장-gated: non-owner
  // members get the honest line, direct row-invites stay their lane.
  const [shareBusy, setShareBusy] = useState(false);
  const shareInviteLink = useCallback(async () => {
    if (!crewId || shareBusy) return;
    setShareBusy(true);
    try {
      const code = (await getInviteCode(crewId)) ?? (await issueInviteCode(crewId));
      await Share.share({
        message: tf('usr.inviteMsgFlex', { name: crewName ? ` '${crewName}'` : '', code }), // imperative — share-sheet fire time
      }).catch(() => {}); // user-cancelled sheet — quiet
    } catch {
      Alert.alert(
        t('usr.linkFailTitle'),
        t('usr.linkFailBody'),
      );
    } finally {
      setShareBusy(false);
    }
  }, [crewId, crewName, shareBusy]);

  const sendInvite = useCallback(async (u: UserSearchItem) => {
    if (!crewId || invite[u.user_id] === 'sending' || invite[u.user_id] === 'sent' || invite[u.user_id] === 'member') return;
    setInvite(m => ({ ...m, [u.user_id]: 'sending' }));
    try {
      const res = await inviteToCrew(crewId, u.user_id);
      setInvite(m => ({ ...m, [u.user_id]: res === 'already_member' ? 'member' : 'sent' }));
    } catch {
      // 404 은닉 (차단·프로필 없음) or transient — honest, non-committal
      setInvite(m => ({ ...m, [u.user_id]: 'idle' }));
      Alert.alert(t('usr.inviteFailTitle'), tf('usr.inviteFailBody', { name: u.nickname }));
    }
  }, [crewId, invite]);

  function UserRow({ u }: { u: UserSearchItem }) {
    const state = invite[u.user_id] ?? 'idle';
    const body = (
      <View style={st.rowInner}>
        <Avatar name={u.nickname} size={44} photoUrl={u.avatar_url} initialsRatio={0.38} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.rowName} numberOfLines={1}>{u.nickname}</Text>
          {u.bio ? <Text style={st.rowSub} numberOfLines={1}>{u.bio}</Text> : null}
        </View>
        {inviteMode && (
          <View style={[
            st.inviteBtn,
            state === 'sent' && st.inviteBtnDone,
            state === 'member' && st.inviteBtnMuted,
          ]}>
            {state === 'sending'
              ? <ActivityIndicator size="small" color={C.accentGrn} />
              : <Text style={[st.inviteBtnTxt, state === 'member' && { color: C.faint }]}>
                  {state === 'sent' ? t('usr.invited') : state === 'member' ? t('usr.alreadyMember') : t('usr.invite')}
                </Text>}
          </View>
        )}
      </View>
    );
    // Invite mode: tap the row → invite. Browse mode: tap → profile.
    return (
      <Pressable
        onPress={inviteMode ? () => sendInvite(u) : () => openProfile(u.user_id, u.nickname)}
        disabled={inviteMode && (state === 'sent' || state === 'member' || state === 'sending')}
        style={({ pressed }) => [st.row, pressed && { opacity: 0.7 }]}
      >
        {body}
      </Pressable>
    );
  }

  function CrewRow({ c }: { c: Crew }) {
    return (
      <Pressable
        onPress={() => router.push({ pathname: '/(community)/crew-detail' as never, params: { crewId: c.id } })}
        style={({ pressed }) => [st.row, pressed && { opacity: 0.7 }]}
      >
        <View style={st.rowInner}>
          <SafeImage uri={c.icon_url} style={st.crewIcon} fallback={
            <View style={[st.crewIcon, { backgroundColor: c.color ?? C.accent, alignItems: 'center', justifyContent: 'center' }]}>
              <Icon name="people" size={22} color={C.accentText} />
            </View>
          } />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.rowName} numberOfLines={1}>{c.name}</Text>
            <Text style={st.rowSub} numberOfLines={1}>
              {tfIn(lang, 'crw.nMembers', { n: c.member_count })}{c.area ? ` · ${c.area}` : ''}
            </Text>
          </View>
          <Icon name="chevron-forward" size={16} color={C.faint} />
        </View>
      </Pressable>
    );
  }

  const list = activeSeg === 'user' ? users : crews;
  const showEmpty = !loading && !tooShort && trimmed.length >= MIN_Q && list !== null && list.length === 0;

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>{inviteMode ? t('usr.inviteTitle') : t('usr.searchTitle')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={{ paddingHorizontal: S.gutter }}>
        <View style={st.searchBar}>
          <Icon name="search" size={16} color={C.faint} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={inviteMode ? t('usr.invitePh') : t('usr.searchPh')}
            placeholderTextColor={C.faint}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            style={st.searchInput}
          />
          {q.length > 0 && (
            <Pressable onPress={() => setQ('')} hitSlop={8}><Icon name="close-circle" size={16} color={C.faint} /></Pressable>
          )}
        </View>

        {/* 유저/크루 segments — browse mode only (invite is user-scoped) */}
        {!inviteMode && (
          <View style={st.segRow}>
            {([['user', t('usr.segUser')], ['crew', t('usr.segCrew')]] as [Seg, string][]).map(([id, lbl]) => (
              <Pressable key={id} onPress={() => setSeg(id)} style={[st.segBtn, seg === id && st.segBtnOn]}>
                <Text style={[st.segTxt, seg === id && st.segTxtOn]}>{lbl}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* 링크로 초대 — pinned, query-independent (invite mode only) */}
        {inviteMode && (
          <Pressable onPress={shareInviteLink} disabled={shareBusy} style={({ pressed }) => [st.shareRow, pressed && { opacity: 0.7 }]}>
            <View style={st.shareIcon}>
              {shareBusy
                ? <ActivityIndicator size="small" color={C.accentGrn} />
                : <Icon name="share-outline" size={17} color={C.accentGrn} />}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.shareTitle}>{t('usr.shareLink')}</Text>
              <Text style={st.shareSub}>{t('usr.shareLinkSub')}</Text>
            </View>
            <Icon name="chevron-forward" size={16} color={C.faint} />
          </Pressable>
        )}
      </View>

      {trimmed.length < MIN_Q ? (
        <View style={st.centered}>
          <View style={st.hintIcon}><Icon name="search" size={24} color={C.faint} /></View>
          <Text style={st.hintTxt}>
            {tooShort ? t('usr.min2') : inviteMode ? t('usr.hintInvite') : t('usr.hintSearch')}
          </Text>
        </View>
      ) : loading && list === null ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : showEmpty ? (
        <View style={st.centered}>
          <View style={st.hintIcon}><Icon name={activeSeg === 'user' ? 'person-outline' : 'people-outline'} size={24} color={C.faint} /></View>
          <Text style={st.hintTxt}>{activeSeg === 'user' ? t('region.noResults') : t('usr.noCrews')}</Text>
        </View>
      ) : activeSeg === 'user' ? (
        <FlatList
          data={users ?? []}
          keyExtractor={u => u.user_id}
          renderItem={({ item }) => <UserRow u={item} />}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: S.gutter, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      ) : (
        <FlatList
          data={crews ?? []}
          keyExtractor={c => c.id}
          renderItem={({ item }) => <CrewRow c={item} />}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: S.gutter, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.gutter, paddingVertical: 10 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },

  searchBar:   { flexDirection: 'row', alignItems: 'center', gap: 9, height: 46, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface, paddingHorizontal: 14, marginTop: 4 },

  // 링크로 초대 pinned row (invite mode)
  shareRow:   { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 13 },
  shareIcon:  { width: 34, height: 34, borderRadius: 11, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  shareTitle: { fontSize: 14, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  shareSub:   { fontSize: 11.5, color: C.faint, letterSpacing: -0.2, marginTop: 1 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14.5, color: C.text, letterSpacing: -0.2, padding: 0 },

  segRow:   { flexDirection: 'row', alignSelf: 'flex-start', gap: 3, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: R.pill, padding: 3, marginTop: 12 },
  segBtn:   { height: 30, paddingHorizontal: 16, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center' },
  segBtnOn: { backgroundColor: C.surface, ...shadows.sm },
  segTxt:   { fontSize: 12.5, fontWeight: '700', color: C.faint, letterSpacing: -0.2 },
  segTxtOn: { color: C.text },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
  hintIcon: { width: 56, height: 56, borderRadius: 17, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  hintTxt:  { fontSize: 13.5, color: C.faint, letterSpacing: -0.2, textAlign: 'center' },

  row:      { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.xl, paddingVertical: 11, paddingHorizontal: 13 },
  rowInner: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowName:  { fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  rowSub:   { fontSize: 12.5, color: C.faint, letterSpacing: -0.2, marginTop: 2 },
  crewIcon: { width: 44, height: 44, borderRadius: 13, flexShrink: 0 },

  inviteBtn:      { minWidth: 58, height: 34, paddingHorizontal: 14, borderRadius: R.pill, borderWidth: 1, borderColor: C.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  inviteBtnDone:  { borderColor: C.accentGrn + '55', backgroundColor: C.accentDim },
  inviteBtnMuted: { borderColor: C.border, backgroundColor: C.surfaceAlt },
  inviteBtnTxt:   { fontSize: 13, fontWeight: '700', color: C.accentGrn, letterSpacing: -0.2 },
});
