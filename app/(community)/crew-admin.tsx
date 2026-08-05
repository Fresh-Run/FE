/**
 * 크루 관리 — the management hub (canvas FrCrewAdmin, community-screen.jsx):
 * identity card + stats row + management rows. Opened by the hero's 크루
 * 관리 pill on crew-detail.
 *
 * Row gating = the v2 per-permission model (BE 28a5c25, guide §207): rows
 * key off MY member row's permission set (owner arrives all-true
 * synthesized) — 공지 관리 = announcements, 챌린지 관리 = challenges,
 * 크루 정보 편집 = edit_crew (owner-only until v2), 크루원·운영진 관리 =
 * every 운영진 (the screen self-scopes its actions). owner-only stays:
 * 가입 요청 · 초대 코드 (guide: 위임·삭제·초대코드·가입신청은 owner 전용).
 * Server 403s remain the real enforcement — the hub only hides doors
 * (the capability MAP with disabled-with-reason lives in 권한 설정).
 * Stats row consumes the server's admin_count (v2 field, EXCL. owner —
 * same semantic the hub displayed before, now server-sourced).
 *
 * Canvas parity notes: canvas splits 운영진 관리/크루원 관리 into two
 * screens — one consolidated crew-members screen here, so one row; canvas
 * hub has no 초대 코드 row — added per owner spec (the S-batch2 invite
 * card moved here from crew-detail's body); canvas stats count 운영진
 * owner-INclusive — the live hub has always shown admins-only, kept.
 */
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { errorMessage } from '@/lib/error-copy';
import { t, tf, tfIn, useLang } from '@/lib/i18n';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CrewDeleteModal } from '@/components/crew-delete-modal';
import { SafeImage } from '@/components/safe-image';
import { Icon } from '@/components/ui';
import { getCurrentChallenge, type Challenge } from '@/lib/challenges-api';
import {
  getCrew,
  getCrewMembers,
  getInviteCode,
  issueInviteCode,
  leaveCrew,
  listJoinRequests,
  mapCrew,
  type Crew,
  type CrewPermissions,
} from '@/lib/crews-api';
import { supabase } from '@/lib/supabase';
import { accentShadow, radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';

export default function CrewAdminScreen() {
  const lang = useLang(); // 8/6 back-sweep: render tfIn anchor
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  // role arrives from crew-detail (the only entry) — server 403s are the
  // real gate; a forged param only shows doors that won't open.
  const { crewId, role } = useLocalSearchParams<{ crewId: string; role: 'owner' | 'admin' }>();
  const isOwner = role === 'owner';

  const [crew, setCrew] = useState<Crew | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [adminCount, setAdminCount] = useState<number | null>(null);
  const [myPerms, setMyPerms] = useState<CrewPermissions | null>(null);
  const [permsLoaded, setPermsLoaded] = useState(false); // rows wait — no gate pop-in
  const [pending, setPending] = useState<number | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null | undefined>(undefined);

  useFocusEffect(useCallback(() => {
    if (!crewId) return;
    let cancelled = false;
    getCrew(crewId).then(row => {
      if (cancelled) return;
      setCrew(mapCrew(row, role));
      setAdminCount(row.admin_count ?? null); // v2 server field (EXCL. owner)
    }).catch(() => {});
    Promise.all([supabase.auth.getUser(), getCrewMembers(crewId)]).then(([{ data: { user } }, ms]) => {
      if (cancelled) return;
      setMemberCount(ms.length);
      setMyPerms(ms.find(m => m.user_id === user?.id)?.permissions ?? null);
      setPermsLoaded(true);
    }).catch(() => { if (!cancelled) setPermsLoaded(true); }); // fail-open to the hub shell; rows stay honest
    getCurrentChallenge(crewId).then(ch => { if (!cancelled) setChallenge(ch); }).catch(() => {});
    if (isOwner) {
      listJoinRequests(crewId).then(rows => { if (!cancelled) setPending(rows.length); }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [crewId, role, isOwner]));

  // ── 초대 코드 (moved from crew-detail; owner-only) ──────────────────────────
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  useFocusEffect(useCallback(() => {
    if (!crewId || !isOwner) return;
    let cancelled = false;
    getInviteCode(crewId).then(code => { if (!cancelled) setInviteCode(code); }).catch(() => {});
    return () => { cancelled = true; };
  }, [crewId, isOwner]));

  async function shareInvite() {
    if (!crewId || !crew || inviteBusy) return;
    setInviteBusy(true);
    try {
      const code = inviteCode ?? await issueInviteCode(crewId);
      setInviteCode(code);
      await Share.share({
        message: tfIn(lang, 'crw.inviteMsg', { name: crew.name, code }),
      });
    } catch (e: unknown) {
      Alert.alert(t('crw.inviteCodeErr'), errorMessage(e));
    } finally {
      setInviteBusy(false);
    }
  }

  function confirmRegenInvite() {
    if (!crewId) return;
    Alert.alert(
      t('crw.regenAsk'),
      t('crw.regenWarn'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('crw.regen'), style: 'destructive',
          onPress: async () => {
            setInviteBusy(true);
            try {
              setInviteCode(await issueInviteCode(crewId));
            } catch (e: unknown) {
              Alert.alert(t('crw.regenFail'), errorMessage(e));
            } finally {
              setInviteBusy(false);
            }
          },
        },
      ],
    );
  }

  const go = (pathname: string) =>
    router.push({ pathname: pathname as never, params: { crewId: crewId! } });

  const [leaving, setLeaving] = useState(false);
  const [dissolveOpen, setDissolveOpen] = useState(false);
  // Role-split leave action (지연 catch 2026-07-13): each role sees the action
  // it CAN take. OWNER → 크루 해체하기 (the shared delete modal; can't leave a
  // live crew — 양도 lives inside that modal now). ADMIN → 크루 나가기 with the
  // 권한 소멸 warning. (Plain members leave via the crew-detail hero icon.)
  function confirmLeaveAdmin() {
    if (!crew || leaving) return;
    Alert.alert(
      t('crw.leaveTitle'),
      tf('crw.leaveAdminAsk', { name: crew.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('crw.leave'), style: 'destructive',
          onPress: async () => {
            setLeaving(true);
            try {
              await leaveCrew(crewId!);
              router.dismissAll?.(); // pop hub + crew-detail → 커뮤니티 (focus-refetch drops the crew; crew-edit delete precedent)
            } catch (e: unknown) {
              Alert.alert(t('crw.leaveFailT'), errorMessage(e));
              setLeaving(false);
            }
          },
        },
      ],
    );
  }

  const can = (k: keyof CrewPermissions) => !!myPerms?.[k];

  type Row = { icon: string; label: string; sub: string; onPress: () => void; badge?: number };
  const rows: Row[] = [
    ...(can('announcements') ? [{
      icon: 'megaphone-outline', label: t('crw.hAnn'), sub: t('crw.hAnnSub'),
      onPress: () => router.push({ pathname: '/(community)/announcements' as never, params: { crewId: crewId!, canManage: '1' } }),
    }] : []),
    {
      icon: 'people-outline', label: t('crw.hMembers'),
      sub: memberCount != null ? tfIn(lang, 'crw.hMembersSub', { n: memberCount, m: adminCount ?? 0 }) : t('crw.hMembersSub2'),
      onPress: () => go('/(community)/crew-members'),
    },
    ...(isOwner ? [{
      icon: 'person-add-outline', label: t('crw.hRequests'),
      sub: pending != null ? (pending > 0 ? tfIn(lang, 'crw.hPending', { n: pending }) : t('crw.hNoPending')) : t('crw.hApprove'),
      onPress: () => go('/(community)/crew-requests'),
      badge: pending ?? 0,
    }] : []),
    ...(can('challenges') ? [{
      icon: 'trophy-outline', label: t('crw.hChallenge'),
      sub: challenge === undefined ? t('crw.sChallenge') : challenge === null ? t('crw.hChNone') : challenge.title,
      onPress: () => go('/(community)/challenge-create'),
    }] : []),
    ...(can('edit_crew') ? [{
      icon: 'create-outline', label: t('crw.hEdit'), sub: t('crw.hEditSub'),
      // owner param gates the 위험 구역 (크루 삭제 stays owner-only under v2)
      onPress: () => router.push({ pathname: '/(community)/crew-edit' as never, params: { crewId: crewId!, owner: isOwner ? '1' : '0' } }),
    }] : []),
  ];

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>{t('crw.manage')}</Text>
        <View style={{ width: 36 }} />
      </View>

      {!crew || !permsLoaded ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: S.gutter, paddingBottom: 40 }}>
          {/* Identity card + stats (canvas) */}
          <View style={[st.idCard, shadows.sm]}>
            <View style={st.idHead}>
              <SafeImage uri={crew.icon_url} style={[st.idTile, { overflow: 'hidden' }]} fallback={
                <View style={[st.idTile, { backgroundColor: crew.color ?? C.accent }]}>
                <Icon name="people" size={26} color={C.accentText} />
              </View>
              } />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={st.idName} numberOfLines={1}>{crew.name}</Text>
                  <View style={[st.roleBadge, { backgroundColor: isOwner ? C.crown : C.accent }]}>
                    <Text style={st.roleBadgeTxt}>{isOwner ? t('crw.roleOwner') : t('crw.roleAdmin')}</Text>
                  </View>
                </View>
                {crew.area ? <Text style={st.idArea} numberOfLines={1}>{crew.area}</Text> : null}
              </View>
            </View>
            <View style={st.statsRow}>
              {([
                [memberCount != null ? String(memberCount) : '–', t('crw.statMembers')],
                [adminCount != null ? String(adminCount) : '–', t('crw.statAdmins')],
                isOwner
                  ? [pending != null ? String(pending) : '–', t('crw.hRequests')]
                  : [crew.max_members != null ? `${crew.member_count}/${crew.max_members}` : String(crew.member_count), t('crw.statCapacity')],
              ] as [string, string][]).map(([v, l], i) => (
                <View key={l} style={[st.statCol, i > 0 && st.statColDivider]}>
                  <Text style={st.statVal}>{v}</Text>
                  <Text style={st.statLbl}>{l}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Management rows */}
          <View style={[st.rowsCard, shadows.sm]}>
            {rows.map((r, i) => (
              <React.Fragment key={r.label}>
                {i > 0 && <View style={st.divider} />}
                <Pressable onPress={r.onPress} style={({ pressed }) => [st.row, pressed && { opacity: 0.7 }]}>
                  <View style={st.rowIcon}><Icon name={r.icon} size={17} color={C.accentGrn} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.rowLbl}>{r.label}</Text>
                    <Text style={st.rowSub} numberOfLines={1}>{r.sub}</Text>
                  </View>
                  {(r.badge ?? 0) > 0 && (
                    <View style={st.rowBadge}><Text style={st.rowBadgeTxt}>{r.badge}</Text></View>
                  )}
                  <Icon name="chevron-forward" size={16} color={C.faint} />
                </Pressable>
              </React.Fragment>
            ))}
          </View>

          {/* 초대 코드 (owner-only — owner-spec addition to the canvas hub) */}
          {isOwner && (
            <>
              <Text style={st.sectionTitle}>{t('crw.sInvite')}</Text>
              <View style={[st.inviteCard, shadows.sm]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.inviteLbl}>{t('crw.inviteCode')}</Text>
                  <Text style={st.inviteCode}>{inviteCode ?? t('crw.notIssued')}</Text>
                </View>
                <Pressable onPress={shareInvite} disabled={inviteBusy} style={[st.inviteShareBtn, accentShadow(C.accent), inviteBusy && { opacity: 0.5 }]}>
                  <Icon name="share-outline" size={15} color={C.accentText} />
                  <Text style={st.inviteShareTxt}>{inviteCode ? t('crw.share') : t('crw.issueShare')}</Text>
                </Pressable>
                {inviteCode && (
                  <Pressable onPress={confirmRegenInvite} disabled={inviteBusy} hitSlop={8} style={st.inviteRegenBtn}>
                    <Icon name="refresh" size={16} color={C.sub} />
                  </Pressable>
                )}
              </View>
              {/* 이름 초대 — the in-app picker lane beside the share lane
                  (2026-07-20 discoverability slice; both lanes stay live) */}
              <Pressable
                onPress={() => router.push({ pathname: '/(community)/user-search' as never, params: { crewId: crewId!, crewName: crew.name } })}
                style={({ pressed }) => [st.inviteSearchRow, shadows.sm, pressed && { opacity: 0.7 }]}
              >
                <Icon name="person-add-outline" size={17} color={C.accentGrn} />
                <Text style={st.inviteSearchTxt}>{t('crw.inviteByName')}</Text>
                <View style={{ flex: 1 }} />
                <Icon name="chevron-forward" size={16} color={C.faint} />
              </Pressable>
            </>
          )}

          {/* Role-split danger action: OWNER → 크루 해체하기 (delete modal);
              ADMIN → 크루 나가기 (leave w/ 권한 소멸 warning). Each role sees
              only what it can actually do (지연 catch — no dead affordance). */}
          <Pressable
            onPress={isOwner ? () => setDissolveOpen(true) : confirmLeaveAdmin}
            disabled={leaving}
            style={({ pressed }) => [st.leaveBtn, pressed && { opacity: 0.75 }, leaving && { opacity: 0.5 }]}
          >
            {leaving
              ? <ActivityIndicator size="small" color={C.danger} />
              : (
                <>
                  <Icon name={isOwner ? 'trash-outline' : 'exit-outline'} size={17} color={C.danger} />
                  <Text style={st.leaveTxt}>{isOwner ? t('crw.disbandAction') : t('crw.leaveTitle')}</Text>
                </>
              )}
          </Pressable>
        </ScrollView>
      )}

      {/* Owner-only 해체 modal — the SAME modal as crew-edit's 위험 구역
          (honest consequences + 양도 tap-through). */}
      {crew && (
        <CrewDeleteModal
          visible={dissolveOpen}
          crewId={crew.id}
          crewName={crew.name}
          memberCount={crew.member_count}
          onClose={() => setDissolveOpen(false)}
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
  centered:    { paddingTop: 80, alignItems: 'center' },

  idCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 16 },
  idHead: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  idTile: { width: 52, height: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  idName: { fontSize: 16.5, fontWeight: '700', color: C.text, letterSpacing: -0.4, flexShrink: 1 },
  idArea: { fontSize: 12.5, color: C.faint, letterSpacing: -0.2, marginTop: 3 },
  roleBadge:    { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, flexShrink: 0 },
  roleBadgeTxt: { fontSize: 10, fontWeight: '800', color: C.accentText, letterSpacing: 0.2 },

  statsRow:       { flexDirection: 'row', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.border },
  statCol:        { flex: 1, alignItems: 'center' },
  statColDivider: { borderLeftWidth: 1, borderLeftColor: C.border },
  statVal:        { fontSize: 18, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  statLbl:        { fontSize: 11, color: C.faint, marginTop: 3 },

  rowsCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, marginTop: 14, overflow: 'hidden' },
  divider:  { height: 1, backgroundColor: C.border, marginLeft: 60 },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14 },
  rowIcon:  { width: 34, height: 34, borderRadius: 10, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  rowLbl:   { fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  rowSub:   { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },
  rowBadge:    { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  rowBadgeTxt: { fontSize: 12, fontWeight: '800', color: '#fff' },

  leaveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 52, borderRadius: 14, borderWidth: 1, borderColor: C.danger + '44', backgroundColor: 'transparent', marginTop: 28 },
  leaveTxt: { fontSize: 15, fontWeight: '700', color: C.danger, letterSpacing: -0.3 },

  sectionTitle: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, color: C.faint, textTransform: 'uppercase', paddingHorizontal: 4, paddingTop: 22, paddingBottom: 8 },
  inviteCard:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 14 },
  inviteSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 14, marginTop: 10 },
  inviteSearchTxt: { fontSize: 14, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  inviteLbl:      { fontSize: 11, fontWeight: '600', color: C.faint, letterSpacing: -0.1 },
  inviteCode:     { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: 2, marginTop: 2, fontVariant: ['tabular-nums'] },
  inviteShareBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.accent, borderRadius: R.pill, paddingHorizontal: 14, height: 38 },
  inviteShareTxt: { fontSize: 13, fontWeight: '800', color: C.accentText, letterSpacing: -0.2 },
  inviteRegenBtn: { width: 38, height: 38, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
});
