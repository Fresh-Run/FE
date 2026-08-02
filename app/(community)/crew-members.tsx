/**
 * 크루원 — full roster per canvas FrCrewMembers (design-wave A), now the
 * member-visible door from crew-detail's 전체 보기 (was manage-hub-only).
 * Rows: avatar · name · 나/크루장/운영진 badges · "이번 챌린지 Nkm" —
 * SERVED per-member since BE 7ec4a96 (challenge_km on the members payload);
 * the client-side weekly-ranking join (and its honest 이번 주 relabel) died
 * with it — the canvas label is finally true.
 *
 * Manage actions re-housed per the new design: 내보내기 stays inline
 * (disabled = the 403 made visible); the per-member bottom sheet (⋯) holds
 * 운영진 지정/해제 · 권한 설정 · 크루장 양도. Self never shows actions.
 *
 * v2 permission gating (BE 28a5c25, guide §207): capabilities read MY
 * member row's permission set (owner arrives all-true synthesized) —
 * 내보내기 = kick_members, sheet(지정/해제·권한 설정) = manage_admins,
 * 양도 stays owner-only. Target rules keep the v1 conservative matrix
 * (admin targets kick-disabled unless I'm owner); server 403s enforce.
 */
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '@/lib/error-copy';
import { t, tf } from '@/lib/i18n';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/ui';
import { getCrewMembers, kickMember, setMemberRole, transferCrew, type CrewMember } from '@/lib/crews-api';
import { openProfile } from '@/lib/profile-nav';
import { supabase } from '@/lib/supabase';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';

const ROLE_ORDER: Record<CrewMember['role'], number> = { owner: 0, admin: 1, member: 2 };

export default function CrewMembersScreen() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const { crewId } = useLocalSearchParams<{ crewId: string }>();

  const [rows, setRows]       = useState<CrewMember[] | null>(null);
  const [myUid, setMyUid]     = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [sheetFor, setSheetFor] = useState<CrewMember | null>(null); // owner's per-member action sheet

  const load = useCallback(() => {
    if (!crewId) return;
    getCrewMembers(crewId).then(members => {
      // canvas: distance desc; ties settle by role then name (stable eyeballing)
      const sorted = [...members].sort((a, b) =>
        (b.challenge_km ?? 0) - (a.challenge_km ?? 0)
        || ROLE_ORDER[a.role] - ROLE_ORDER[b.role]
        || (a.nickname ?? '').localeCompare(b.nickname ?? ''));
      setRows(sorted);
    }).catch(() => setRows([]));
  }, [crewId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setMyUid(user?.id ?? null));
  }, []);

  const myRow = rows?.find(m => m.user_id === myUid);
  const iAmOwner = myRow?.role === 'owner';
  // v2: capabilities come from my permission set (owner = all-true synthesized)
  const canKick   = !!myRow?.permissions?.kick_members;
  const canManageAdmins = !!myRow?.permissions?.manage_admins;

  async function changeRole(m: CrewMember, role: 'admin' | 'member') {
    setBusyUid(m.user_id);
    try {
      await setMemberRole(crewId!, m.user_id, role);
      load();
    } catch (e: unknown) {
      Alert.alert(t('crw.changeFail'), errorMessage(e));
    } finally {
      setBusyUid(null);
    }
  }

  function confirmRole(m: CrewMember) {
    const promoting = m.role === 'member';
    Alert.alert(
      promoting ? t('crw.promoteAsk') : t('crw.demoteAsk'),
      promoting
        // v2 defaults (server-side: 공지·챌린지 ON, 나머지 OFF) — the promote
        // flow needs no FE change; 세부 조정은 권한 설정에서
        ? tf('crw.promoteSub', { name: m.nickname })
        : tf('crw.demoteSub', { name: m.nickname }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: promoting ? t('crw.promote') : t('crw.demote'), onPress: () => changeRole(m, promoting ? 'admin' : 'member') },
      ],
    );
  }

  // 크루 양도 (S-batch #4): owner-only, destructive-confirm — you stop
  // being owner (leave_after=false: you stay as a regular member).
  function confirmTransfer(m: CrewMember) {
    Alert.alert(
      t('crw.transferAsk'),
      tf('crw.transferSub', { name: m.nickname }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('crw.transfer'), style: 'destructive',
          onPress: async () => {
            setBusyUid(m.user_id);
            try {
              await transferCrew(crewId!, m.user_id);
              load(); // roles re-render from server truth; my actions vanish
            } catch (e: unknown) {
              Alert.alert(t('crw.transferFail'), errorMessage(e));
            } finally {
              setBusyUid(null);
            }
          },
        },
      ],
    );
  }

  function confirmKick(m: CrewMember) {
    Alert.alert(t('crw.kickAsk'), tf('crw.kickSub', { name: m.nickname }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('crw.kick'), style: 'destructive',
        onPress: async () => {
          setBusyUid(m.user_id);
          try {
            await kickMember(crewId!, m.user_id);
            load();
          } catch (e: unknown) {
            Alert.alert(t('crw.kickFail'), errorMessage(e));
          } finally {
            setBusyUid(null);
          }
        },
      },
    ]);
  }

  /** Authorization matrix → affordances. Disabled = visible but inert
      (the server's 403 semantics, surfaced honestly). v2: capability by
      permission key, target rules stay the conservative v1 matrix. */
  function actionsFor(m: CrewMember): { more?: boolean; kick?: 'enabled' | 'disabled' } {
    if (m.user_id === myUid) return {};              // self — never
    if (m.role === 'owner') return {};               // owner target — untouchable
    const kick = canKick
      ? ((m.role === 'member' || iAmOwner) ? 'enabled' as const : 'disabled' as const)
      : undefined;
    // sheet: 지정/해제 + 권한 설정 (manage_admins); 양도 rides for owner
    const more = canManageAdmins;
    return { more: more || undefined, kick };
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>{t('crw.membersTitle')}</Text>
        {/* 초대하기 — any member can invite (probed; not a permission key) */}
        <Pressable
          onPress={() => router.push({ pathname: '/(community)/user-search' as never, params: { crewId: crewId! } })}
          hitSlop={10}
          style={st.backBtn}
        >
          <Icon name="person-add-outline" size={20} color={C.accentGrn} />
        </Pressable>
      </View>

      {rows === null ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={m => m.user_id}
          renderItem={({ item: m }) => {
            const acts = actionsFor(m);
            const isMe = m.user_id === myUid;
            const busy = busyUid === m.user_id;
            return (
              <View style={[st.row, shadows.sm, isMe && { borderColor: C.accent + '66' }]}>
                <Pressable
                  onPress={() => openProfile(m.user_id, m.nickname)}
                  style={({ pressed }) => [st.rowBody, pressed && { opacity: 0.7 }]}
                >
                  <Avatar name={m.nickname} size={42} photoUrl={m.avatar_url} initialsRatio={0.38} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={st.name} numberOfLines={1}>{m.nickname}</Text>
                      {isMe && <View style={st.meBadge}><Text style={st.meBadgeTxt}>{t('crw.me')}</Text></View>}
                      {m.role === 'owner' && <View style={st.ownerBadge}><Text style={st.ownerTxt}>{t('crw.roleOwner')}</Text></View>}
                      {m.role === 'admin' && <View style={st.adminBadge}><Text style={st.adminTxt}>{t('crw.roleAdmin')}</Text></View>}
                    </View>
                    <Text style={st.kmSub}>{tf('crw.thisChKm', { km: (m.challenge_km ?? 0).toFixed(1) })}</Text>
                  </View>
                </Pressable>

                {busy ? (
                  <ActivityIndicator size="small" color={C.faint} />
                ) : (
                  <View style={st.actions}>
                    {acts.kick && (
                      <Pressable
                        onPress={acts.kick === 'enabled' ? () => confirmKick(m) : undefined}
                        disabled={acts.kick === 'disabled'}
                        hitSlop={6}
                        style={({ pressed }) => [
                          st.kickBtn,
                          acts.kick === 'disabled' && { opacity: 0.35 },
                          pressed && acts.kick === 'enabled' && { opacity: 0.7 },
                        ]}
                      >
                        <Text style={st.kickTxt}>{t('crw.kick')}</Text>
                      </Pressable>
                    )}
                    {acts.more && (
                      <Pressable onPress={() => setSheetFor(m)} hitSlop={8} style={({ pressed }) => [st.moreBtn, pressed && { opacity: 0.6 }]}>
                        <Icon name="ellipsis-horizontal" size={17} color={C.sub} />
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          contentContainerStyle={{ padding: S.gutter, paddingBottom: 40 }}
          ListFooterComponent={
            myRow?.role === 'admin' ? (
              <Text style={st.footNote}>{t('crw.membersFoot')}</Text>
            ) : null
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── per-member sheet (manage_admins holders) — 지정/해제 · 권한 설정
             (admin targets; member 대상은 서버 422라 문이 없음) · 양도 (owner) ── */}
      <Modal visible={!!sheetFor} transparent animationType="slide" onRequestClose={() => setSheetFor(null)}>
        <Pressable style={st.sheetOverlay} onPress={() => setSheetFor(null)}>
          <Pressable style={[st.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]} onPress={() => {}}>
            <View style={st.sheetHandleRow}><View style={st.sheetHandle} /></View>
            <Text style={st.sheetTitle}>{sheetFor?.nickname}</Text>
            <Pressable
              onPress={() => { const m = sheetFor!; setSheetFor(null); confirmRole(m); }}
              style={({ pressed }) => [st.sheetRow, pressed && { opacity: 0.7 }]}
            >
              <Icon name="shield-outline" size={19} color={C.text} />
              <Text style={st.sheetRowTxt}>{sheetFor?.role === 'admin' ? t('crw.demoteRow') : t('crw.promoteRow')}</Text>
            </Pressable>
            {sheetFor?.role === 'admin' && (
              <>
                <View style={st.sheetDivider} />
                <Pressable
                  onPress={() => {
                    const m = sheetFor!; setSheetFor(null);
                    router.push({
                      pathname: '/(community)/crew-perms' as never,
                      params: { crewId: crewId!, userId: m.user_id },
                    });
                  }}
                  style={({ pressed }) => [st.sheetRow, pressed && { opacity: 0.7 }]}
                >
                  <Icon name="options-outline" size={19} color={C.text} />
                  <Text style={st.sheetRowTxt}>{t('crw.permsRow')}</Text>
                </Pressable>
              </>
            )}
            {iAmOwner && (
              <>
                <View style={st.sheetDivider} />
                <Pressable
                  onPress={() => { const m = sheetFor!; setSheetFor(null); confirmTransfer(m); }}
                  style={({ pressed }) => [st.sheetRow, pressed && { opacity: 0.7 }]}
                >
                  <Icon name="swap-horizontal-outline" size={19} color={C.danger} />
                  <Text style={[st.sheetRowTxt, { color: C.danger }]}>{t('crw.transferRow')}</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.gutter, paddingVertical: 10 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },
  appBarCount: { width: 36, textAlign: 'right', fontSize: 12.5, fontWeight: '700', color: C.faint },

  centered: { paddingTop: 70, alignItems: 'center' },

  row:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.xl, paddingVertical: 11, paddingHorizontal: 13 },
  rowBody: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  name:      { flexShrink: 1, fontSize: 14.5, fontWeight: '600', color: C.text, letterSpacing: -0.3 },
  kmSub:     { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2, fontVariant: ['tabular-nums'] },

  meBadge:    { backgroundColor: C.accent, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  meBadgeTxt: { fontSize: 10, fontWeight: '800', color: C.accentText, letterSpacing: 0.2 },
  ownerBadge: { backgroundColor: C.crown, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  ownerTxt:   { fontSize: 10, fontWeight: '800', color: C.accentText, letterSpacing: 0.2 },
  adminBadge: { backgroundColor: C.accentDim, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  adminTxt:   { fontSize: 10, fontWeight: '800', color: C.accentGrn, letterSpacing: 0.2 },

  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kickBtn: { height: 32, paddingHorizontal: 13, borderRadius: R.pill, borderWidth: 1, borderColor: C.danger + '44', backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  kickTxt: { fontSize: 12, fontWeight: '700', color: C.danger, letterSpacing: -0.2 },
  moreBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },

  footNote: { textAlign: 'center', fontSize: 11.5, color: C.faint, letterSpacing: -0.2, paddingTop: 14 },

  sheetOverlay:   { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.42)' },
  sheet:          { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: S.gutter },
  sheetHandleRow: { alignItems: 'center', paddingTop: 10, paddingBottom: 2 },
  sheetHandle:    { width: 38, height: 5, borderRadius: 99, backgroundColor: C.border },
  sheetTitle:     { fontSize: 16, fontWeight: '700', color: C.text, letterSpacing: -0.4, paddingVertical: 12, textAlign: 'center' },
  sheetDivider:   { height: 1, backgroundColor: C.border },
  sheetRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, paddingHorizontal: 4 },
  sheetRowTxt:    { fontSize: 15, fontWeight: '600', color: C.text, letterSpacing: -0.3 },
});
