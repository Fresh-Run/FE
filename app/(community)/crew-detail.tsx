/**
 * 크루 상세 — Crew detail screen.
 * Pushed from the community tab.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiniMap } from '@/components/mini-map';
import { Icon } from '@/components/ui';
import {
  cancelJoinRequest,
  joinCrew,
  leaveCrew,
  useCrewDetail,
  type Crew,
  type CrewMember,
} from '@/hooks/use-crews';
import { avatarBg } from '@/lib/fr-hash';
import { colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isFull(crew: Crew): boolean {
  return crew.max_members !== null && crew.member_count >= crew.max_members;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: avatarBg(name), alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Text style={{ fontWeight: '700', fontSize: Math.round(size * 0.42), color: '#fff', letterSpacing: -0.3 }}>
        {name[0]}
      </Text>
    </View>
  );
}

// ─── Member row ───────────────────────────────────────────────────────────────

function MemberRow({ member, index }: { member: CrewMember; index: number }) {
  const isOwner = member.role === 'owner';
  return (
    <View style={[st.memberRow, isOwner && st.memberRowOwner]}>
      <Text style={st.memberRank}>{index + 1}</Text>
      <Avatar name={member.nickname} size={40} />
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={st.memberName} numberOfLines={1}>{member.nickname}</Text>
        {isOwner && (
          <View style={st.ownerBadge}><Text style={st.ownerTxt}>크루장</Text></View>
        )}
      </View>
    </View>
  );
}

// ─── CTA footer ───────────────────────────────────────────────────────────────

function CtaButton({
  crew, requestPending, busy,
  onJoin, onLeave, onCancelRequest,
}: {
  crew: Crew; requestPending: boolean; busy: boolean;
  onJoin: () => void; onLeave: () => void; onCancelRequest: () => void;
}) {
  if (crew.myRole === 'owner') {
    return (
      <View style={[st.ctaBtn, st.ctaDisabled]} pointerEvents="none">
        <Icon name="shield-checkmark-outline" size={18} color={C.sub} />
        <Text style={[st.ctaTxt, { color: C.sub }]}>크루장</Text>
      </View>
    );
  }

  if (crew.myRole === 'member') {
    return (
      <Pressable
        onPress={onLeave}
        disabled={busy}
        style={({ pressed }) => [st.ctaBtn, st.ctaDanger, pressed && { opacity: 0.75 }]}
      >
        {busy
          ? <ActivityIndicator size="small" color={C.danger} />
          : (
            <>
              <Icon name="exit-outline" size={18} color={C.danger} />
              <Text style={[st.ctaTxt, { color: C.danger }]}>탈퇴하기</Text>
            </>
          )
        }
      </Pressable>
    );
  }

  // Pending join request (approval crew) — cancellable
  if (requestPending) {
    return (
      <Pressable
        onPress={onCancelRequest}
        disabled={busy}
        style={({ pressed }) => [st.ctaBtn, st.ctaPending, pressed && { opacity: 0.75 }]}
      >
        {busy
          ? <ActivityIndicator size="small" color={C.accentGrn} />
          : (
            <>
              <Icon name="hourglass-outline" size={18} color={C.accentGrn} />
              <Text style={[st.ctaTxt, { color: C.accentGrn }]}>신청됨 · 취소</Text>
            </>
          )
        }
      </Pressable>
    );
  }

  if (isFull(crew)) {
    return (
      <View style={[st.ctaBtn, st.ctaDisabled]} pointerEvents="none">
        <Icon name="people-outline" size={18} color={C.faint} />
        <Text style={[st.ctaTxt, { color: C.faint }]}>정원 마감</Text>
      </View>
    );
  }

  // rejected (or no request) → apply-able again; label pre-set by join_policy
  return (
    <Pressable
      onPress={onJoin}
      disabled={busy}
      style={({ pressed }) => [st.ctaBtn, pressed && { opacity: 0.82 }]}
    >
      {busy
        ? <ActivityIndicator size="small" color={C.accentText} />
        : (
          <>
            <Icon name="people-outline" size={18} color={C.accentText} />
            <Text style={st.ctaTxt}>{crew.join_policy === 'approval' ? '가입 신청하기' : '가입하기'}</Text>
          </>
        )
      }
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

const HERO_H = 220;

export default function CrewDetailScreen() {
  const insets = useSafeAreaInsets();
  const { crewId } = useLocalSearchParams<{ crewId: string }>();
  const { crew, members, myRequestStatus, loading, error, refetch } = useCrewDetail(crewId ?? null);

  const [busy, setBusy]       = useState(false);
  const [mutErr, setMutErr]   = useState<string | null>(null);

  async function handleJoin() {
    if (!crew) return;
    setBusy(true);
    setMutErr(null);
    try {
      const result = await joinCrew(crew.id);
      if (result === 'pending') {
        Alert.alert('가입 신청 완료', '크루장이 승인하면 알려드릴게요.');
      } else if (result === 'already_member') {
        setMutErr('이미 가입한 크루예요');
      }
      refetch();
    } catch (e: unknown) {
      setMutErr(e instanceof Error ? e.message : '가입에 실패했어요');
    } finally {
      setBusy(false);
    }
  }

  function handleCancelRequest() {
    if (!crew) return;
    Alert.alert('가입 신청 취소', '이 크루 가입 신청을 취소할까요?', [
      { text: '아니요', style: 'cancel' },
      {
        text: '신청 취소',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          setMutErr(null);
          try {
            await cancelJoinRequest(crew.id);
            refetch();
          } catch (e: unknown) {
            setMutErr(e instanceof Error ? e.message : '취소에 실패했어요');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  function handleLeave() {
    if (!crew) return;
    Alert.alert(
      '크루 탈퇴',
      `'${crew.name}'에서 탈퇴하시겠어요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            setMutErr(null);
            try {
              await leaveCrew(crew.id);
              refetch();
            } catch (e: unknown) {
              setMutErr(e instanceof Error ? e.message : '탈퇴에 실패했어요');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[st.root, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  // ── Error / not found ──────────────────────────────────────────────────────
  if (error || !crew) {
    return (
      <View style={[st.root, { paddingTop: insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={[st.backBtnLight, { margin: S.lg }]}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Icon name="warning-outline" size={36} color={C.faint} />
          <Text style={st.errTxt}>{error ?? '크루를 찾을 수 없어요'}</Text>
          <Pressable onPress={refetch} style={st.retryBtn}>
            <Text style={st.retryTxt}>다시 시도</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const activeDays = crew.active_days ?? [];

  return (
    <View style={st.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>

        {/* ── Dark hero header ─────────────────────────────────────────── */}
        <View style={[st.hero, { height: HERO_H + insets.top }]}>
          <MiniMap seed={crew.id} height={HERO_H + insets.top} borderRadius={0} />
          <LinearGradient
            colors={['rgba(8,12,4,0.55)', 'rgba(8,12,4,0.92)']}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={[StyleSheet.absoluteFillObject, { paddingTop: insets.top + S.md, paddingHorizontal: S.lg, paddingBottom: S.lg }]}>
            {/* Top controls */}
            <View style={st.heroControls}>
              <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
                <Icon name="arrow-back" size={20} color="#fff" />
              </Pressable>
              {crew.color && <View style={[st.colorDot, { backgroundColor: crew.color }]} />}
            </View>

            {/* Crew info pinned to bottom */}
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
              <Text style={st.heroName}>{crew.name}</Text>
              <View style={st.heroMeta}>
                <View style={st.levelBadge}>
                  <Text style={st.levelTxt}>{crew.level}</Text>
                </View>
                <Icon name="people-outline" size={13} color="rgba(255,255,255,0.72)" />
                <Text style={st.heroMetaTxt}>
                  {crew.member_count}명{crew.max_members !== null ? ` · 최대 ${crew.max_members}명` : ''}
                </Text>
                {crew.area ? <Text style={st.heroMetaTxt}>· {crew.area}</Text> : null}
              </View>
              {crew.description ? <Text style={st.heroDesc} numberOfLines={2}>{crew.description}</Text> : null}
            </View>
          </View>
        </View>

        {/* ── Activity schedule ────────────────────────────────────────── */}
        {(activeDays.length > 0 || crew.active_time) && (
          <View style={[st.metaCard, shadows.sm]}>
            <Icon name="calendar-outline" size={15} color={C.faint} />
            <Text style={st.metaLabel}>정기 러닝</Text>
            <View style={st.metaDays}>
              {activeDays.map(d => (
                <View key={d} style={st.dayChip}>
                  <Text style={st.dayTxt}>{d}</Text>
                </View>
              ))}
              {crew.active_time && <Text style={st.metaTime}>{crew.active_time}</Text>}
            </View>
          </View>
        )}

        {/* ── Member list ──────────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: S.gutter, paddingTop: S.xl }}>
          <View style={st.sectionHead}>
            <Text style={st.sectionTitle}>크루원</Text>
            <Text style={st.memberCount}>{members.length}명</Text>
          </View>

          {members.length === 0 ? (
            <View style={st.emptyBox}>
              <Text style={st.emptyTxt}>크루원이 없어요</Text>
            </View>
          ) : (
            <View style={[st.memberList, shadows.sm]}>
              {members.map((m, i) => (
                <React.Fragment key={m.user_id}>
                  {i > 0 && <View style={st.divider} />}
                  <MemberRow member={m} index={i} />
                </React.Fragment>
              ))}
            </View>
          )}
        </View>

      </ScrollView>

      {/* ── Error banner ──────────────────────────────────────────────── */}
      {mutErr && (
        <View style={st.errBanner}>
          <Icon name="alert-circle-outline" size={14} color={C.danger} />
          <Text style={st.errBannerTxt} numberOfLines={2}>{mutErr}</Text>
          <Pressable onPress={() => setMutErr(null)} hitSlop={8}>
            <Icon name="close" size={14} color={C.danger} />
          </Pressable>
        </View>
      )}

      {/* ── Sticky CTA ────────────────────────────────────────────────── */}
      <View style={[st.footer, { paddingBottom: Math.max(insets.bottom, S.lg) + S.sm }]}>
        <CtaButton
          crew={crew}
          requestPending={myRequestStatus === 'pending'}
          busy={busy}
          onJoin={handleJoin}
          onLeave={handleLeave}
          onCancelRequest={handleCancelRequest}
        />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Hero
  hero:         { overflow: 'hidden' },
  heroControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:      { width: 40, height: 40, borderRadius: R.pill, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  backBtnLight: { width: 40, height: 40, borderRadius: R.pill, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  colorDot:     { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' },
  heroName:     { fontSize: 24, fontWeight: '700', color: '#fff', letterSpacing: -0.6 },
  heroMeta:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  heroMetaTxt:  { fontSize: 13, color: 'rgba(255,255,255,0.78)', letterSpacing: -0.2 },
  heroDesc:     { fontSize: 13.5, lineHeight: 20, color: 'rgba(255,255,255,0.88)', letterSpacing: -0.2, marginTop: 10 },
  levelBadge:   { backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  levelTxt:     { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: -0.1 },

  // Activity meta card
  metaCard:  { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginHorizontal: S.gutter, marginTop: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: 14 },
  metaLabel: { fontSize: 13, fontWeight: '700', color: C.sub, letterSpacing: -0.2 },
  metaDays:  { flexDirection: 'row', flexWrap: 'wrap', gap: 5, alignItems: 'center' },
  dayChip:   { backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accent + '44', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  dayTxt:    { fontSize: 11.5, fontWeight: '700', color: C.accentGrn },
  metaTime:  { fontSize: 12.5, fontWeight: '600', color: C.sub, letterSpacing: -0.2 },

  // Section
  sectionHead:  { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: C.text },
  memberCount:  { fontSize: 13, fontWeight: '600', color: C.faint },

  // Member list
  memberList:     { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, overflow: 'hidden' },
  memberRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  memberRowOwner: { backgroundColor: C.accentDim },
  memberRank:     { fontSize: 13, fontWeight: '700', color: C.faint, width: 22, textAlign: 'center', flexShrink: 0 },
  memberName:     { fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  divider:        { height: 1, backgroundColor: C.border, marginHorizontal: 14 },
  ownerBadge:     { backgroundColor: '#E8B53D', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  ownerTxt:       { fontSize: 10, fontWeight: '800', color: '#0D1A06', letterSpacing: 0.2 },

  // Empty / error states
  emptyBox: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, padding: 20, alignItems: 'center' },
  emptyTxt: { fontSize: 14, color: C.faint, letterSpacing: -0.2, fontWeight: '600' },
  errTxt:   { fontSize: 14, color: C.faint, letterSpacing: -0.2, fontWeight: '600', textAlign: 'center' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: R.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  retryTxt: { fontSize: 14, fontWeight: '700', color: C.text },

  // Error banner (above footer)
  errBanner:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: S.gutter, paddingVertical: 10, backgroundColor: '#EF444412', borderTopWidth: 1, borderTopColor: '#EF444430' },
  errBannerTxt: { flex: 1, fontSize: 13, color: C.danger, letterSpacing: -0.2 },

  // Footer CTA
  footer:      { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: S.gutter, paddingTop: S.md, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border },
  ctaBtn:      { height: 56, borderRadius: R.lg, backgroundColor: C.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  ctaTxt:      { fontSize: 16, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },
  ctaDisabled: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  ctaDanger:   { backgroundColor: '#EF444414', borderWidth: 1, borderColor: C.danger },
  ctaPending:  { backgroundColor: C.accentDim, borderWidth: 1.5, borderColor: C.accent + '77' },
});
