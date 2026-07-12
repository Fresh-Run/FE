/**
 * 크루 관리 — the management hub (canvas FrCrewAdmin, community-screen.jsx):
 * identity card + stats row + management rows. Opened by the hero's 크루
 * 관리 pill on crew-detail.
 *
 * Role gating = the LIVE admin-v1 permission table (guide §203), not the
 * canvas's v2 per-permission model: owner sees everything; admin sees
 * 공지 관리 / 크루원 관리(kick-only, screen self-scopes) / 챌린지 관리.
 * Server 403s remain the real enforcement — the hub only hides doors.
 *
 * Canvas parity notes: canvas splits 운영진 관리/크루원 관리 into two
 * screens — admin v1 has ONE crew-members screen, so one consolidated row;
 * canvas hub has no 초대 코드 row — added per owner spec (the S-batch2
 * invite card moved here from crew-detail's body).
 */
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
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

import { Icon } from '@/components/ui';
import { getCurrentChallenge, type Challenge } from '@/lib/challenges-api';
import {
  getCrew,
  getCrewMembers,
  getInviteCode,
  issueInviteCode,
  listJoinRequests,
  mapCrew,
  type Crew,
} from '@/lib/crews-api';
import { accentShadow, colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';

export default function CrewAdminScreen() {
  const insets = useSafeAreaInsets();
  // role arrives from crew-detail (the only entry) — server 403s are the
  // real gate; a forged param only shows doors that won't open.
  const { crewId, role } = useLocalSearchParams<{ crewId: string; role: 'owner' | 'admin' }>();
  const isOwner = role === 'owner';

  const [crew, setCrew] = useState<Crew | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [adminCount, setAdminCount] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null | undefined>(undefined);

  useFocusEffect(useCallback(() => {
    if (!crewId) return;
    let cancelled = false;
    getCrew(crewId).then(row => { if (!cancelled) setCrew(mapCrew(row, role)); }).catch(() => {});
    getCrewMembers(crewId).then(ms => {
      if (cancelled) return;
      setMemberCount(ms.length);
      setAdminCount(ms.filter(m => m.role === 'admin').length);
    }).catch(() => {});
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
        message: `FreshRun 크루 '${crew.name}'에 초대해요!\n초대 코드: ${code}\n앱 커뮤니티 탭의 '코드로 가입'에서 입력해 주세요.`,
      });
    } catch (e: unknown) {
      Alert.alert('초대 코드 오류', e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요');
    } finally {
      setInviteBusy(false);
    }
  }

  function confirmRegenInvite() {
    if (!crewId) return;
    Alert.alert(
      '초대 코드를 재생성할까요?',
      '기존 초대 링크가 무효화됩니다 — 이미 공유한 코드로는 더 이상 가입할 수 없어요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '재생성', style: 'destructive',
          onPress: async () => {
            setInviteBusy(true);
            try {
              setInviteCode(await issueInviteCode(crewId));
            } catch (e: unknown) {
              Alert.alert('재생성 실패', e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요');
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

  type Row = { icon: string; label: string; sub: string; onPress: () => void; badge?: number };
  const rows: Row[] = [
    {
      icon: 'megaphone-outline', label: '공지 관리', sub: '공지 목록·작성',
      onPress: () => router.push({ pathname: '/(community)/announcements' as never, params: { crewId: crewId!, canManage: '1' } }),
    },
    {
      icon: 'people-outline', label: '크루원·운영진 관리',
      sub: memberCount != null ? `크루원 ${memberCount}명 · 운영진 ${adminCount ?? 0}명` : '크루원·역할·내보내기',
      onPress: () => go('/(community)/crew-members'),
    },
    ...(isOwner ? [{
      icon: 'person-add-outline', label: '가입 요청',
      sub: pending != null ? (pending > 0 ? `${pending}건 대기 중` : '대기 없음') : '승인·거절',
      onPress: () => go('/(community)/crew-requests'),
      badge: pending ?? 0,
    }] : []),
    {
      icon: 'trophy-outline', label: '챌린지 관리',
      sub: challenge === undefined ? '챌린지' : challenge === null ? '챌린지 없음' : challenge.title,
      onPress: () => go('/(community)/challenge-create'),
    },
    ...(isOwner ? [{
      icon: 'create-outline', label: '크루 정보 편집', sub: '이름·지역·공개 범위',
      onPress: () => go('/(community)/crew-edit'),
    }] : []),
  ];

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>크루 관리</Text>
        <View style={{ width: 36 }} />
      </View>

      {!crew ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: S.gutter, paddingBottom: 40 }}>
          {/* Identity card + stats (canvas) */}
          <View style={[st.idCard, shadows.sm]}>
            <View style={st.idHead}>
              <View style={[st.idTile, { backgroundColor: crew.color ?? C.accent }]}>
                <Icon name="people" size={26} color="#0D1A06" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={st.idName} numberOfLines={1}>{crew.name}</Text>
                  <View style={[st.roleBadge, { backgroundColor: isOwner ? '#E8B53D' : C.accent }]}>
                    <Text style={st.roleBadgeTxt}>{isOwner ? '크루장' : '운영진'}</Text>
                  </View>
                </View>
                {crew.area ? <Text style={st.idArea} numberOfLines={1}>{crew.area}</Text> : null}
              </View>
            </View>
            <View style={st.statsRow}>
              {([
                [memberCount != null ? String(memberCount) : '–', '크루원'],
                [adminCount != null ? String(adminCount) : '–', '운영진'],
                isOwner
                  ? [pending != null ? String(pending) : '–', '가입 요청']
                  : [crew.max_members != null ? `${crew.member_count}/${crew.max_members}` : String(crew.member_count), '정원'],
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
              <Text style={st.sectionTitle}>초대</Text>
              <View style={[st.inviteCard, shadows.sm]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.inviteLbl}>초대 코드</Text>
                  <Text style={st.inviteCode}>{inviteCode ?? '미발급'}</Text>
                </View>
                <Pressable onPress={shareInvite} disabled={inviteBusy} style={[st.inviteShareBtn, accentShadow(C.accent), inviteBusy && { opacity: 0.5 }]}>
                  <Icon name="share-outline" size={15} color={C.accentText} />
                  <Text style={st.inviteShareTxt}>{inviteCode ? '공유' : '발급·공유'}</Text>
                </Pressable>
                {inviteCode && (
                  <Pressable onPress={confirmRegenInvite} disabled={inviteBusy} hitSlop={8} style={st.inviteRegenBtn}>
                    <Icon name="refresh" size={16} color={C.sub} />
                  </Pressable>
                )}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
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
  roleBadgeTxt: { fontSize: 10, fontWeight: '800', color: '#0D1A06', letterSpacing: 0.2 },

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

  sectionTitle: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, color: C.faint, textTransform: 'uppercase', paddingHorizontal: 4, paddingTop: 22, paddingBottom: 8 },
  inviteCard:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 14 },
  inviteLbl:      { fontSize: 11, fontWeight: '600', color: C.faint, letterSpacing: -0.1 },
  inviteCode:     { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: 2, marginTop: 2, fontVariant: ['tabular-nums'] },
  inviteShareBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.accent, borderRadius: R.pill, paddingHorizontal: 14, height: 38 },
  inviteShareTxt: { fontSize: 13, fontWeight: '800', color: C.accentText, letterSpacing: -0.2 },
  inviteRegenBtn: { width: 38, height: 38, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
});
