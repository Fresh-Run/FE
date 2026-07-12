/**
 * 크루 상세 — Crew detail screen.
 * Pushed from the community tab.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
} from '@/hooks/use-crews';
import { avatarBg } from '@/lib/fr-hash';
import { listAnnouncements, type Announcement } from '@/lib/announcements-api';
import { getCurrentChallenge, type Challenge } from '@/lib/challenges-api';
import { getUnread } from '@/lib/chat-api';
import { getCrewRanking, listJoinRequests, type CrewRankingEntry } from '@/lib/crews-api';
import { colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isFull(crew: Crew): boolean {
  return crew.max_members !== null && crew.member_count >= crew.max_members;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 40, photoUrl }: { name: string; size?: number; photoUrl?: string | null }) {
  // avatar wire-up (BE 5009cbe): photo wins over initials; load failure
  // falls back to initials — never a broken image.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  if (photoUrl && photoUrl !== brokenUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        onError={() => setBrokenUrl(photoUrl)}
        style={{ width: size, height: size, borderRadius: size / 2, flexShrink: 0 }}
      />
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: avatarBg(name), alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Text style={{ fontWeight: '700', fontSize: Math.round(size * 0.42), color: '#fff', letterSpacing: -0.3 }}>
        {name[0]}
      </Text>
    </View>
  );
}

// 랭킹 메달 — canvas FrRankMedal colors (gold = the 크루장 crown token)
const RANK_MEDAL: Record<number, string> = { 1: C.crown, 2: '#AEB6BE', 3: '#D08B4F' };

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

  if (crew.myRole === 'member' || crew.myRole === 'admin') {
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

  // ── 공지 preview (M1) — members only (server 403s outside) ──────────────────
  const isMember = crew?.myRole != null;
  const canManage = crew?.myRole === 'owner' || crew?.myRole === 'admin';
  const [annPreview, setAnnPreview] = useState<Announcement[] | null>(null);
  useFocusEffect(useCallback(() => {
    if (!crewId || !isMember) { setAnnPreview(null); return; }
    let cancelled = false;
    listAnnouncements(crewId, 2)
      .then(rows => { if (!cancelled) setAnnPreview(rows); })
      .catch(() => { if (!cancelled) setAnnPreview([]); });
    return () => { cancelled = true; };
  }, [crewId, isMember]));

  // ── 가입 요청 count (M-tier 신청 관리, owner-only) — badge on the entry ──────
  const [pendingReqCount, setPendingReqCount] = useState(0);
  useFocusEffect(useCallback(() => {
    if (!crewId || crew?.myRole !== 'owner') { setPendingReqCount(0); return; }
    let cancelled = false;
    listJoinRequests(crewId)
      .then(rows => { if (!cancelled) setPendingReqCount(rows.length); })
      .catch(() => { /* quiet — the screen itself surfaces errors */ });
    return () => { cancelled = true; };
  }, [crewId, crew?.myRole]));

  // ── 채팅 unread badge (chat v1) — focus-refetch clears it after a visit ────
  const [chatUnread, setChatUnread] = useState(0);
  useFocusEffect(useCallback(() => {
    if (!crewId || !isMember) { setChatUnread(0); return; }
    let cancelled = false;
    getUnread(crewId)
      .then(u => { if (!cancelled) setChatUnread(u.unread_count); })
      .catch(() => { /* quiet — the badge is garnish */ });
    return () => { cancelled = true; };
  }, [crewId, isMember]));

  // ── 챌린지 + 랭킹 (M2/M2b) — members only ───────────────────────────────────
  const [challenge, setChallenge] = useState<Challenge | null | undefined>(undefined); // undefined = loading
  const [ranking, setRanking]     = useState<CrewRankingEntry[] | null>(null);
  useFocusEffect(useCallback(() => {
    if (!crewId || !isMember) { setChallenge(undefined); setRanking(null); return; }
    let cancelled = false;
    getCurrentChallenge(crewId)
      .then(ch => { if (!cancelled) setChallenge(ch); })
      .catch(() => { if (!cancelled) setChallenge(null); });
    getCrewRanking(crewId)
      .then(rows => { if (!cancelled) setRanking(rows); })
      .catch(() => { if (!cancelled) setRanking([]); });
    return () => { cancelled = true; };
  }, [crewId, isMember]));

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
            {/* Top controls — 크루 관리 pill is THE management door (canvas
                FrCrewDetail redesign): owner + admin see it (hub role-gates
                its rows), members don't */}
            <View style={st.heroControls}>
              <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
                <Icon name="arrow-back" size={20} color="#fff" />
              </Pressable>
              {canManage ? (
                <Pressable
                  onPress={() => router.push({
                    pathname: '/(community)/crew-admin' as never,
                    params: { crewId: crew.id, role: crew.myRole! },
                  })}
                  hitSlop={8}
                  style={st.managePill}
                >
                  <Icon name="settings-outline" size={14} color="#fff" />
                  <Text style={st.managePillTxt}>크루 관리</Text>
                  {crew.myRole === 'owner' && pendingReqCount > 0 && <View style={st.managePillDot} />}
                </Pressable>
              ) : (
                crew.color ? <View style={[st.colorDot, { backgroundColor: crew.color }]} /> : null
              )}
            </View>

            {/* Crew info pinned to bottom */}
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
              <Text style={st.heroName}>{crew.name}</Text>
              <View style={st.heroMeta}>
                {/* Role badge (canvas: 크루장 amber / 운영진 accent) */}
                {crew.myRole === 'owner' && (
                  <View style={[st.roleBadge, { backgroundColor: C.crown }]}>
                    <Text style={st.roleBadgeTxt}>크루장</Text>
                  </View>
                )}
                {crew.myRole === 'admin' && (
                  <View style={[st.roleBadge, { backgroundColor: C.accent }]}>
                    <Text style={st.roleBadgeTxt}>운영진</Text>
                  </View>
                )}
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

        {/* ── Quick actions (canvas redesign ②) — shortcuts INTO existing
               flows, role-gated per admin v1: 공지·챌린지 = owner||admin,
               운영진 관리 = owner ── */}
        {canManage && (
          <View style={st.quickRow}>
            <Pressable
              onPress={() => router.push({
                pathname: '/(community)/announcement-compose' as never,
                params: { crewId: crew.id },
              })}
              style={({ pressed }) => [st.quickTile, shadows.sm, pressed && { opacity: 0.8 }]}
            >
              <Icon name="megaphone-outline" size={19} color={C.accentGrn} />
              <Text style={st.quickTxt}>공지 올리기</Text>
            </Pressable>
            {crew.myRole === 'owner' && (
              <Pressable
                onPress={() => router.push({
                  pathname: '/(community)/crew-members' as never,
                  params: { crewId: crew.id },
                })}
                style={({ pressed }) => [st.quickTile, shadows.sm, pressed && { opacity: 0.8 }]}
              >
                <Icon name="shield-outline" size={19} color={C.accentGrn} />
                <Text style={st.quickTxt}>운영진 관리</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => router.push({
                pathname: '/(community)/challenge-create' as never,
                params: { crewId: crew.id },
              })}
              style={({ pressed }) => [st.quickTile, shadows.sm, pressed && { opacity: 0.8 }]}
            >
              <Icon name="trophy-outline" size={19} color={C.accentGrn} />
              <Text style={st.quickTxt}>챌린지 생성</Text>
            </Pressable>
          </View>
        )}

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

        {/* ── 챌린지 (M2) — members only; FrActiveChallengeRow ─────────── */}
        {isMember && challenge !== undefined && (
          <View style={{ paddingHorizontal: S.gutter, paddingTop: S.xl }}>
            <View style={st.sectionHead}>
              <Text style={st.sectionTitle}>챌린지</Text>
            </View>
            {challenge === null ? (
              canManage ? (
                <Pressable
                  onPress={() => router.push({
                    pathname: '/(community)/challenge-create' as never,
                    params: { crewId: crew.id },
                  })}
                  style={({ pressed }) => [st.emptyBox, pressed && { opacity: 0.8 }]}
                >
                  <Text style={st.emptyTxt}>챌린지를 만들어 크루의 목표를 세워보세요 →</Text>
                </Pressable>
              ) : null
            ) : (
              <View style={[st.chCard, shadows.sm]}>
                <View style={st.chHead}>
                  <Text style={st.chTitle} numberOfLines={1}>{challenge.title}</Text>
                  <View style={[st.chPct, challenge.is_completed && { backgroundColor: C.crown }]}>
                    <Text style={st.chPctTxt}>
                      {challenge.is_completed ? '달성!' : `${Math.round(challenge.progress_pct)}%`}
                    </Text>
                  </View>
                </View>
                <View style={st.chBarTrack}>
                  <View style={[st.chBar, { width: `${Math.min(100, Math.max(2, challenge.progress_pct))}%` as `${number}%` }]} />
                </View>
                <View style={st.chMetaRow}>
                  <Text style={st.chMeta}>
                    {challenge.achieved_km.toFixed(1)} / {challenge.goal_km} km
                  </Text>
                  <Text style={st.chMeta}>
                    {challenge.is_active
                      ? `${Math.max(0, Math.ceil((new Date(challenge.ends_at).getTime() - Date.now()) / 86400000))}일 남음`
                      : new Date(challenge.starts_at).getTime() > Date.now() ? '시작 예정' : '종료'}
                  </Text>
                </View>
                <Text style={st.chCaption}>GPS 기록만 집계돼요</Text>
              </View>
            )}
          </View>
        )}

        {/* ── 크루 채팅 entry (chat v1) — canvas: right after the 챌린지
            section; unread badge on the icon, count line when unread ──── */}
        {isMember && (
          <View style={{ paddingHorizontal: S.gutter, paddingTop: S.xl }}>
            <Pressable
              onPress={() => router.push({
                pathname: '/(community)/crew-chat' as never,
                params: {
                  crewId: crew.id,
                  crewName: crew.name,
                  memberCount: String(crew.member_count),
                  role: crew.myRole ?? '',
                },
              })}
              style={({ pressed }) => [st.chatBtn, shadows.sm, pressed && { opacity: 0.8 }]}
            >
              <View style={st.chatIcon}>
                <Icon name="chatbubble-ellipses-outline" size={18} color={C.accentGrn} />
                {chatUnread > 0 && (
                  <View style={st.chatBadge}>
                    <Text style={st.chatBadgeTxt}>{chatUnread > 99 ? '99+' : chatUnread}</Text>
                  </View>
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.chatTitle}>크루 채팅</Text>
                <Text style={st.chatSub} numberOfLines={1}>
                  {chatUnread > 0 ? `새 메시지 ${chatUnread}개` : '크루원들과 이야기해 보세요'}
                </Text>
              </View>
              <Icon name="chevron-forward" size={16} color={C.faint} />
            </Pressable>
          </View>
        )}

        {/* ── 랭킹 (design-wave A) — canvas top-3 w/ medals + role badges;
            the full list moved to the 크루원 screen (door below). Server is
            이번 주 KST · GPS-verified — the caption keeps that truth next to
            the canvas's bare "크루 랭킹" title. ───────────────────────── */}
        {isMember && (
          <View style={{ paddingHorizontal: S.gutter, paddingTop: S.xl }}>
            {ranking !== null && ranking.length > 0 && (
              <>
                <View style={st.sectionHead}>
                  <Text style={st.sectionTitle}>크루 랭킹</Text>
                  <Text style={st.memberCount}>이번 주 · GPS 기준</Text>
                </View>
                <View style={[st.rankList, shadows.sm]}>
                  {ranking.slice(0, 3).map((r, i) => {
                    const role = members.find(m => m.user_id === r.user_id)?.role;
                    return (
                      <React.Fragment key={r.user_id}>
                        {i > 0 && <View style={st.divider} />}
                        <View style={[st.rankRow, r.me && st.rankRowMe]}>
                          <View style={[st.rankMedal, { backgroundColor: RANK_MEDAL[r.rank] ?? C.faint }]}>
                            <Text style={st.rankMedalTxt}>{r.rank}</Text>
                          </View>
                          <Avatar name={r.nickname ?? '러너'} size={30} photoUrl={r.avatar_url} />
                          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={[st.rankName, r.me && { fontWeight: '700' }]} numberOfLines={1}>
                              {r.nickname ?? '러너'}
                            </Text>
                            {r.me && <View style={st.meBadge}><Text style={st.meBadgeTxt}>나</Text></View>}
                            {role === 'owner' && <View style={st.ownerBadge}><Text style={st.ownerTxt}>크루장</Text></View>}
                            {role === 'admin' && <View style={st.adminBadge}><Text style={st.adminTxt}>운영진</Text></View>}
                          </View>
                          <Text style={st.rankKm}>{r.distance_km.toFixed(1)} km</Text>
                        </View>
                      </React.Fragment>
                    );
                  })}
                </View>
              </>
            )}

            {/* canvas: the full-roster door sits directly under the ranking card */}
            <Pressable
              onPress={() => router.push({
                pathname: '/(community)/crew-members' as never,
                params: { crewId: crew.id },
              })}
              style={({ pressed }) => [st.rosterBtn, shadows.sm, pressed && { opacity: 0.8 }]}
            >
              <View style={st.rosterIcon}><Icon name="people-outline" size={18} color={C.accentGrn} /></View>
              <Text style={st.rosterTxt}>크루원 전체 보기</Text>
              <Text style={st.rosterCount}>{crew.member_count}명</Text>
              <Icon name="chevron-forward" size={16} color={C.faint} />
            </Pressable>
          </View>
        )}

        {/* ── 공지 (M1) — members only ─────────────────────────────────── */}
        {isMember && (
          <View style={{ paddingHorizontal: S.gutter, paddingTop: S.xl }}>
            <View style={st.sectionHead}>
              <Text style={st.sectionTitle}>공지</Text>
              <Pressable
                onPress={() => router.push({
                  pathname: '/(community)/announcements' as never,
                  params: { crewId: crew.id, canManage: canManage ? '1' : '0' },
                })}
                hitSlop={8}
              >
                <Text style={st.annMoreTxt}>전체 보기</Text>
              </Pressable>
            </View>

            {annPreview === null ? (
              <View style={st.emptyBox}><ActivityIndicator size="small" color={C.faint} /></View>
            ) : annPreview.length === 0 ? (
              <Pressable
                onPress={canManage ? () => router.push({
                  pathname: '/(community)/announcement-compose' as never,
                  params: { crewId: crew.id },
                }) : undefined}
                style={st.emptyBox}
              >
                <Text style={st.emptyTxt}>
                  {canManage ? '공지를 올려 크루원에게 소식을 전해보세요 →' : '아직 공지가 없어요'}
                </Text>
              </Pressable>
            ) : (
              <View style={[st.annList, shadows.sm]}>
                {annPreview.map((a, i) => (
                  <React.Fragment key={a.id}>
                    {i > 0 && <View style={st.divider} />}
                    <Pressable
                      onPress={() => router.push({
                        pathname: '/(community)/announcement-detail' as never,
                        params: { crewId: crew.id, announcementId: a.id },
                      })}
                      style={({ pressed }) => [st.annRow, pressed && { opacity: 0.7 }]}
                    >
                      <Icon name="megaphone-outline" size={16} color={C.accentGrn} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={st.annTitle} numberOfLines={1}>{a.title}</Text>
                        {a.run_at ? <Text style={st.annSub}>참석 {a.rsvp.going} · 러닝 일정 있음</Text> : null}
                      </View>
                      <Icon name="chevron-forward" size={15} color={C.faint} />
                    </Pressable>
                  </React.Fragment>
                ))}
              </View>
            )}
          </View>
        )}

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
  managePill:    { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: 'rgba(255,255,255,0.16)' },
  managePillTxt: { fontSize: 13, fontWeight: '700', color: '#fff', letterSpacing: -0.2 },
  managePillDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.danger },
  roleBadge:     { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  roleBadgeTxt:  { fontSize: 10.5, fontWeight: '800', color: '#0D1A06', letterSpacing: 0.2 },
  quickRow:      { flexDirection: 'row', gap: 9, paddingHorizontal: S.gutter, paddingTop: 16 },
  quickTile:     { flex: 1, alignItems: 'center', gap: 6, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 4 },
  quickTxt:      { fontSize: 12, fontWeight: '700', color: C.text, letterSpacing: -0.2 },
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

  divider:    { height: 1, backgroundColor: C.border, marginHorizontal: 14 },
  ownerBadge: { backgroundColor: C.crown, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  ownerTxt:   { fontSize: 10, fontWeight: '800', color: '#0D1A06', letterSpacing: 0.2 },
  adminBadge: { backgroundColor: C.accentDim, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  adminTxt:   { fontSize: 10, fontWeight: '800', color: C.accentGrn, letterSpacing: 0.2 },
  meBadge:    { backgroundColor: C.accent, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  meBadgeTxt: { fontSize: 10, fontWeight: '800', color: C.accentText, letterSpacing: 0.2 },

  // Empty / error states
  emptyBox: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, padding: 20, alignItems: 'center' },

  // 챌린지 (M2)
  chCard:     { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.xl, padding: 15 },
  chHead:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chTitle:    { flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  chPct:      { backgroundColor: C.accent, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  chPctTxt:   { fontSize: 11.5, fontWeight: '800', color: C.accentText, letterSpacing: -0.2 },
  chBarTrack: { height: 8, borderRadius: 4, backgroundColor: C.surfaceAlt, marginTop: 12, overflow: 'hidden' },
  chBar:      { height: '100%', borderRadius: 4, backgroundColor: C.accent },
  chMetaRow:  { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  chMeta:     { fontSize: 12.5, fontWeight: '600', color: C.sub, letterSpacing: -0.2 },
  chCaption:  { fontSize: 11, color: C.faint, letterSpacing: -0.2, marginTop: 6 },

  // 랭킹 (design-wave A — canvas top-3)
  rankList:     { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.xl, overflow: 'hidden' },
  rankRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14 },
  rankRowMe:    { backgroundColor: C.accentDim },
  rankMedal:    { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rankMedalTxt: { fontSize: 12.5, fontWeight: '800', color: '#fff', fontVariant: ['tabular-nums'] },
  rankName:     { flexShrink: 1, fontSize: 14, fontWeight: '600', color: C.text, letterSpacing: -0.3 },
  rankKm:       { fontSize: 13.5, fontWeight: '700', color: C.sub, fontVariant: ['tabular-nums'] },

  // 크루 채팅 entry (chat v1)
  chatBtn:      { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, paddingVertical: 13, paddingHorizontal: 15 },
  chatIcon:     { width: 36, height: 36, borderRadius: 11, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  chatBadge:    { position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: C.danger, borderWidth: 1.5, borderColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  chatBadgeTxt: { fontSize: 9, fontWeight: '800', color: '#fff' },
  chatTitle:    { fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  chatSub:      { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },

  // 크루원 전체 보기 door (canvas)
  rosterBtn:   { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, paddingVertical: 13, paddingHorizontal: 15, marginTop: 10 },
  rosterIcon:  { width: 36, height: 36, borderRadius: 11, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  rosterTxt:   { flex: 1, fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  rosterCount: { fontSize: 13, fontWeight: '700', color: C.accentGrn },

  // 공지 preview (M1)
  annMoreTxt: { fontSize: 12.5, fontWeight: '700', color: C.accentGrn, letterSpacing: -0.2 },
  annList:    { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.xl, overflow: 'hidden' },
  annRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 14 },
  annTitle:   { fontSize: 14, fontWeight: '600', color: C.text, letterSpacing: -0.3 },
  annSub:     { fontSize: 11.5, color: C.faint, letterSpacing: -0.2, marginTop: 2 },
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
