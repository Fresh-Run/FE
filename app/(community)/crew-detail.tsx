/**
 * 크루 상세 — Crew detail screen.
 * Pushed from the community tab.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useRef, useState } from 'react';
import { t, tf, useLang, type StringKey } from '@/lib/i18n';
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

import * as ImagePicker from 'expo-image-picker';

import { AvatarCrop, type CropSource } from '@/components/avatar-crop';
import { CrewGlyph } from '@/components/crew-glyph';
import { MiniMap } from '@/components/mini-map';
import { RealMap } from '@/components/real-map';
import { SafeImage } from '@/components/safe-image';
import { Icon } from '@/components/ui';
import {
  cancelJoinRequest,
  joinCrew,
  leaveCrew,
  useCrewDetail,
  type Crew,
} from '@/hooks/use-crews';
import { Avatar } from '@/components/avatar';
import { listAnnouncements, type Announcement } from '@/lib/announcements-api';
import { getCurrentChallenge, type Challenge } from '@/lib/challenges-api';
import { getUnread } from '@/lib/chat-api';
import { getCrewRanking, getCrewRuns, groupCrewSessions, listJoinRequests, uploadCrewImage, type CrewRankingEntry, type CrewRunItem } from '@/lib/crews-api';
import { distUnit, fmtAgo, fmtDist, fmtDuration, fmtPaceIn, paceUnit } from '@/lib/run-format';
import { accentShadow, radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { setActiveCourse } from '@/store/active-course';
import { useSettings } from '@/store/use-settings';

// server day chars → display keys (server-value enum class)
const DAY_LABEL_KEY: Record<string, StringKey> = { '월': 'dayS.mon', '화': 'dayS.tue', '수': 'dayS.wed', '목': 'dayS.thu', '금': 'dayS.fri', '토': 'dayS.sat', '일': 'dayS.sun' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isFull(crew: Crew): boolean {
  return crew.max_members !== null && crew.member_count >= crew.max_members;
}

// 랭킹 메달 — canvas FrRankMedal colors (gold = the 크루장 crown token)
const rankMedal = (C: Tokens): Record<number, string> => ({ 1: C.medalGold, 2: C.medalSilver, 3: C.medalBronze });

// ─── CTA footer ───────────────────────────────────────────────────────────────

// Non-member CTA only. Members have no bottom CTA — leaving moved to the
// hero-corner icon (plain members) / the manage hub (staff), per the canvas
// redesign (a joined member's primary action is never "leave").
function CtaButton({
  crew, requestPending, busy,
  onJoin, onCancelRequest,
}: {
  crew: Crew; requestPending: boolean; busy: boolean;
  onJoin: () => void; onCancelRequest: () => void;
}) {
  const C = useTokens();
  const st = useStyles(makeSt);
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
              <Text style={[st.ctaTxt, { color: C.accentGrn }]}>{t('crw.applied')}</Text>
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
        <Text style={[st.ctaTxt, { color: C.faint }]}>{t('crw.full')}</Text>
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
            <Text style={st.ctaTxt}>{crew.join_policy === 'approval' ? t('crw.joinApply') : t('crw.join')}</Text>
          </>
        )
      }
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

const HERO_H = 220;

export default function CrewDetailScreen() {
  const C = useTokens();
  const lang = useLang(); // compiler-visible locale for fmtAgo (2026-08-03 formatter-cache fix)
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const { crewId } = useLocalSearchParams<{ crewId: string }>();
  const { crew, members, myPerms, myRequestStatus, loading, error, refetch } = useCrewDetail(crewId ?? null);

  const [busy, setBusy]       = useState(false);
  const [mutErr, setMutErr]   = useState<string | null>(null);

  // ── 공지 preview (M1) — members only (server 403s outside) ──────────────────
  const isMember = crew?.myRole != null;
  // 관리 hub door stays ROLE-based (any 운영진 enters; rows self-gate inside);
  // ACTION gates read the v2 permission set (owner = all-true synthesized).
  const canManage = crew?.myRole === 'owner' || crew?.myRole === 'admin';
  const can = (k: keyof NonNullable<typeof myPerms>) => !!myPerms?.[k];
  // One fetch powers the 공지 preview (first 2) + the 크루 러닝 시작 meetup
  // window scan. (The 공지-derived 집결 카드 died — owner ruling B 2026-07-14.)
  const [anns, setAnns] = useState<Announcement[] | null>(null);
  useFocusEffect(useCallback(() => {
    if (!crewId || !isMember) { setAnns(null); return; }
    let cancelled = false;
    listAnnouncements(crewId, 20) // preview slices 2; the 크루 러닝 시작 window scan reads the rest
      .then(rows => { if (!cancelled) setAnns(rows); })
      .catch(() => { if (!cancelled) setAnns([]); });
    return () => { cancelled = true; };
  }, [crewId, isMember]));
  const annPreview = anns === null ? null : anns.slice(0, 2);

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

  // ── 크루 이미지 (⑤⑥) — edit_crew-gated since v2 (BE 28a5c25 moved 크루
  // 수정·이미지 from owner-only to the edit_crew key; the old admin
  // attach-PATCH 403 gap resolved by design). BOTH channels now route through
  // the avatar-crop framing stage: icon → 1:1 circle, cover → 16:9 rounded-rect
  // (matching the hero band). Crop output is re-encoded JPEG (EXIF-free) — the
  // PUBLIC-bucket rule holds without a separate reencodeForUpload pass.
  const canEditCrew = !!myPerms?.edit_crew;
  const [imgBusy, setImgBusy] = useState<'cover' | 'icon' | null>(null);
  const [cropSrc, setCropSrc] = useState<{ src: CropSource; kind: 'cover' | 'icon' } | null>(null);
  const lastCropKind = useRef<'cover' | 'icon'>('icon'); // survives onClose for retake

  async function pickCrewImage(kind: 'cover' | 'icon') {
    let res: ImagePicker.ImagePickerResult;
    try {
      res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 1 });
    } catch {
      Alert.alert(t('onb.photoFailTitle'), t('onb.photoFailBody'));
      return;
    }
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    lastCropKind.current = kind;
    setCropSrc({ src: { uri: a.uri, width: a.width ?? 1, height: a.height ?? 1 }, kind }); // upload continues in onCropped
  }

  async function onCropped(croppedUri: string) {
    const kind = cropSrc?.kind ?? lastCropKind.current;
    setCropSrc(null);
    setImgBusy(kind);
    try {
      await uploadCrewImage(crew!.id, kind, croppedUri); // crop output = re-encoded, EXIF-free
      refetch();
    } catch (e: unknown) {
      Alert.alert(kind === 'cover' ? t('crw.coverFail') : t('crw.iconFail'), e instanceof Error ? e.message : t('auth.tryLater'));
    } finally {
      setImgBusy(null);
    }
  }

  // ── 챌린지 + 랭킹 + 러닝 피드 (M2/M2b) — members only ─────────────────────────
  const units = useSettings(s => s.settings.units);
  const [challenge, setChallenge] = useState<Challenge | null | undefined>(undefined); // undefined = loading
  const [ranking, setRanking]     = useState<CrewRankingEntry[] | null>(null);
  const [feedPreview, setFeedPreview] = useState<CrewRunItem[] | null>(null);
  useFocusEffect(useCallback(() => {
    if (!crewId || !isMember) { setChallenge(undefined); setRanking(null); setFeedPreview(null); return; }
    let cancelled = false;
    getCurrentChallenge(crewId)
      .then(ch => { if (!cancelled) setChallenge(ch); })
      .catch(() => { if (!cancelled) setChallenge(null); });
    getCrewRanking(crewId)
      .then(rows => { if (!cancelled) setRanking(rows); })
      .catch(() => { if (!cancelled) setRanking([]); });
    getCrewRuns(crewId, 0, 3) // section preview — 전체 보기 opens the full feed
      .then(rows => { if (!cancelled) setFeedPreview(rows); })
      .catch(() => { if (!cancelled) setFeedPreview([]); });
    return () => { cancelled = true; };
  }, [crewId, isMember]));

  // ── 크루 러닝 시작 (L1) — ANY member (canvas gates can('crewRun'), but
  // crewRun is not a real server key [박제 금지]; contract = "크루원이면
  // 누구나"). Auto-suggest linking a 집결 공지 whose meetup is near now
  // (−6h early / +3h after — owner window): the sheet is the safety net,
  // a wrong guess costs one tap on 그냥 크루런. Non-member 400 is
  // unreachable — the button only renders for members. ─────────────────
  function beginCrewRun(announcementId: string | null, announcementTitle: string | null) {
    if (!crew) return;
    setActiveCourse({
      id: null, title: tf('crw.crewRunOf', { name: crew.name }), distanceKm: 0, polyline: null,
      crewSession: { crewId: crew.id, crewName: crew.name, announcementId, announcementTitle },
    });
    router.push('/(course)/tracking' as never);
  }

  function startCrewRun() {
    if (!crew) return;
    const H = 3600_000;
    const near = (anns ?? []) // full fetch — the window scan shouldn't miss a 공지 outside the top-2 preview
      .filter(a => {
        if (!a.run_at) return false;
        const ahead = new Date(a.run_at).getTime() - Date.now();
        return ahead >= -3 * H && ahead <= 6 * H; // ≤6h early, ≤3h after
      })
      .sort((a, b) =>
        Math.abs(new Date(a.run_at!).getTime() - Date.now()) - Math.abs(new Date(b.run_at!).getTime() - Date.now()))[0];
    if (near) {
      Alert.alert(
        t('crw.startTitle'),
        tf('crw.startAsk', { title: near.title }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('crw.plainRun'), onPress: () => beginCrewRun(null, null) },
          { text: t('crw.withMeet'), onPress: () => beginCrewRun(near.id, near.title) },
        ],
      );
    } else {
      beginCrewRun(null, null);
    }
  }

  function openCrewRun(run: CrewRunItem) {
    // Edge ⓑ: no lock pre-check — surfaced card's detail serves (probed 200
    // for a locked-profile member). Seed nickname/avatar + allow_* (hide-first).
    router.push({
      pathname: '/run-post' as never,
      params: {
        runId: run.run_id,
        nickname: run.nickname ?? t('home.runner'),
        avatarUrl: run.avatar_url ?? '',
        allowLikes: run.allow_likes === true ? '1' : '0',
        allowComments: run.allow_comments === true ? '1' : '0',
      },
    });
  }

  async function handleJoin() {
    if (!crew) return;
    setBusy(true);
    setMutErr(null);
    try {
      const result = await joinCrew(crew.id);
      if (result === 'pending') {
        Alert.alert(t('crw.appliedDone'), t('crw.appliedDoneSub'));
      } else if (result === 'already_member') {
        setMutErr(t('crw.alreadyJoined'));
      }
      refetch();
    } catch (e: unknown) {
      setMutErr(e instanceof Error ? e.message : t('crw.joinFail'));
    } finally {
      setBusy(false);
    }
  }

  function handleCancelRequest() {
    if (!crew) return;
    Alert.alert(t('crw.cancelApplyTitle'), t('crw.cancelApplyAsk'), [
      { text: t('crw.no'), style: 'cancel' },
      {
        text: t('crw.cancelApply'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          setMutErr(null);
          try {
            await cancelJoinRequest(crew.id);
            refetch();
          } catch (e: unknown) {
            setMutErr(e instanceof Error ? e.message : t('crw.cancelFail'));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  // Plain-member leave (hero-corner icon). Owner/admin leave lives in the
  // manage hub (crew-admin) with role-aware copy; a plain member is never an
  // owner, so no 양도 path is needed here. Pop out on success (canvas: nav.pop).
  function handleLeave() {
    if (!crew) return;
    Alert.alert(
      t('crw.leaveTitle'),
      tf('crw.leaveAsk', { name: crew.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('crw.leave'),
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            setMutErr(null);
            try {
              await leaveCrew(crew.id);
              router.back();
            } catch (e: unknown) {
              setMutErr(e instanceof Error ? e.message : t('crw.leaveFail'));
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
          <Text style={st.errTxt}>{error ?? t('crw.notFound')}</Text>
          <Pressable onPress={refetch} style={st.retryBtn}>
            <Text style={st.retryTxt}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const activeDays = crew.active_days ?? [];
  const hasSchedule = activeDays.length > 0 || !!crew.active_time;


  return (
    <View style={st.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: isMember ? 40 : 110 }}>

        {/* ── Dark hero header — cover photo (staff-set) or the canvas
            default-cover gradient wash (owner ruling 2026-07-14: crew
            identity ≠ map). SafeImage: a broken cover falls back to the
            wash, never a blank band. ── */}
        <View style={[st.hero, { height: HERO_H + insets.top }]}>
          <SafeImage
            uri={crew.cover_url}
            style={[StyleSheet.absoluteFillObject, { width: undefined, height: undefined }]}
            resizeMode="cover"
            fallback={<CrewGlyph height={HERO_H + insets.top} glyph={false} />}
          />
          <LinearGradient
            colors={['rgba(8,12,4,0.55)', 'rgba(8,12,4,0.92)']}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={[StyleSheet.absoluteFillObject, { paddingTop: insets.top + S.md, paddingHorizontal: S.lg, paddingBottom: S.lg }]}>
            {/* Top controls — 크루 관리 pill is THE management door (canvas
                FrCrewDetail redesign): owner + admin see it (hub role-gates
                its rows, incl. 크루 나가기). A PLAIN member gets the quiet
                leave icon here (canvas hero-corner) — their only leave path
                now that the prominent bottom 탈퇴 CTA is retired. Non-members
                see the color dot. */}
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
                  <Text style={st.managePillTxt}>{t('crw.manage')}</Text>
                  {crew.myRole === 'owner' && pendingReqCount > 0 && <View style={st.managePillDot} />}
                </Pressable>
              ) : isMember ? (
                <Pressable onPress={handleLeave} hitSlop={12} style={st.leaveIconBtn} disabled={busy}>
                  <Icon name="exit-outline" size={19} color="#fff" />
                </Pressable>
              ) : (
                crew.color ? <View style={[st.colorDot, { backgroundColor: crew.color }]} /> : null
              )}
            </View>

            {/* Crew info pinned to bottom */}
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
              {/* Ringed identity icon (canvas) — owner taps to change */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <Pressable
                  onPress={canEditCrew && !imgBusy ? () => pickCrewImage('icon') : undefined}
                  disabled={!canEditCrew || !!imgBusy}
                  style={st.heroIconWrap}
                >
                  {/* SafeImage: broken icon → color tile, not a blank square */}
                  <SafeImage uri={crew.icon_url} style={st.heroIconImg} fallback={
                    <View style={[st.heroIconImg, { backgroundColor: crew.color ?? C.accent, alignItems: 'center', justifyContent: 'center' }]}>
                      <Icon name="people" size={26} color={C.accentText} />
                    </View>
                  } />
                  {canEditCrew && (
                    <View style={st.heroIconEdit}>
                      {imgBusy === 'icon'
                        ? <ActivityIndicator size="small" color={C.accentText} />
                        : <Icon name="camera-outline" size={11} color={C.accentText} />}
                    </View>
                  )}
                </Pressable>
                {/* 커버 변경 chip — edit_crew (v2; the v1 attach-PATCH 403
                    gap resolved: 크루 수정·이미지 moved onto the key) */}
                {canEditCrew && (
                  <Pressable
                    onPress={!imgBusy ? () => pickCrewImage('cover') : undefined}
                    disabled={!!imgBusy}
                    style={({ pressed }) => [st.coverChip, pressed && { opacity: 0.75 }]}
                  >
                    {imgBusy === 'cover'
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Icon name="camera-outline" size={13} color="#fff" />}
                    <Text style={st.coverChipTxt}>{t('crw.coverChange')}</Text>
                  </Pressable>
                )}
              </View>
              <Text style={st.heroName}>{crew.name}</Text>
              <View style={st.heroMeta}>
                {/* Role badge (canvas: 크루장 amber / 운영진 accent) */}
                {crew.myRole === 'owner' && (
                  <View style={[st.roleBadge, { backgroundColor: C.crown }]}>
                    <Text style={st.roleBadgeTxt}>{t('crw.roleOwner')}</Text>
                  </View>
                )}
                {crew.myRole === 'admin' && (
                  <View style={[st.roleBadge, { backgroundColor: C.accent }]}>
                    <Text style={st.roleBadgeTxt}>{t('crw.roleAdmin')}</Text>
                  </View>
                )}
                <View style={st.levelBadge}>
                  <Text style={st.levelTxt}>{crew.level}</Text>
                </View>
                <Icon name="people-outline" size={13} color="rgba(255,255,255,0.72)" />
                <Text style={st.heroMetaTxt}>
                  {tf('crw.nMembers', { n: crew.member_count })}{crew.max_members !== null ? tf('crw.maxN', { n: crew.max_members }) : ''}
                </Text>
                {crew.area ? <Text style={st.heroMetaTxt}>· {crew.area}</Text> : null}
              </View>
              {crew.description ? <Text style={st.heroDesc} numberOfLines={2}>{crew.description}</Text> : null}
            </View>
          </View>
        </View>

        {/* ── Quick actions (canvas redesign ②) — shortcuts INTO existing
               flows, permission-keyed per v2 (guide §207): 공지 = announcements,
               운영진 관리 = manage_admins, 챌린지 = challenges. Un-permitted
               tiles HIDE here (shortcut row, not the capability map — the
               권한 설정 screen is where powers stay visible-but-locked). ── */}
        {(can('announcements') || can('manage_admins') || can('challenges')) && (
          <View style={st.quickRow}>
            {can('announcements') && (
              <Pressable
                onPress={() => router.push({
                  pathname: '/(community)/announcement-compose' as never,
                  params: { crewId: crew.id },
                })}
                style={({ pressed }) => [st.quickTile, shadows.sm, pressed && { opacity: 0.8 }]}
              >
                <Icon name="megaphone-outline" size={19} color={C.accentGrn} />
                <Text style={st.quickTxt}>{t('crw.qAnnounce')}</Text>
              </Pressable>
            )}
            {can('manage_admins') && (
              <Pressable
                onPress={() => router.push({
                  pathname: '/(community)/crew-members' as never,
                  params: { crewId: crew.id },
                })}
                style={({ pressed }) => [st.quickTile, shadows.sm, pressed && { opacity: 0.8 }]}
              >
                <Icon name="shield-outline" size={19} color={C.accentGrn} />
                <Text style={st.quickTxt}>{t('crw.qAdmins')}</Text>
              </Pressable>
            )}
            {can('challenges') && (
              <Pressable
                onPress={() => router.push({
                  pathname: '/(community)/challenge-create' as never,
                  params: { crewId: crew.id },
                })}
                style={({ pressed }) => [st.quickTile, shadows.sm, pressed && { opacity: 0.8 }]}
              >
                <Icon name="trophy-outline" size={19} color={C.accentGrn} />
                <Text style={st.quickTxt}>{t('crw.qChallenge')}</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* ── 공지 (M1) — members only. TOP of the section stack (owner ruling
               + canvas FrCrewDetail order): 공지 is the crew's most time-
               sensitive content; 챌린지/랭킹/피드 are browse-y and follow. ── */}
        {isMember && (
          <View style={{ paddingHorizontal: S.gutter, paddingTop: S.xl }}>
            <View style={st.sectionHead}>
              <Text style={st.sectionTitle}>{t('crw.sAnn')}</Text>
              <Pressable
                onPress={() => router.push({
                  pathname: '/(community)/announcements' as never,
                  params: { crewId: crew.id, canManage: can('announcements') ? '1' : '0' },
                })}
                hitSlop={8}
              >
                <Text style={st.annMoreTxt}>{t('crw.viewAll')}</Text>
              </Pressable>
            </View>

            {annPreview === null ? (
              <View style={st.emptyBox}><ActivityIndicator size="small" color={C.faint} /></View>
            ) : annPreview.length === 0 ? (
              <Pressable
                onPress={can('announcements') ? () => router.push({
                  pathname: '/(community)/announcement-compose' as never,
                  params: { crewId: crew.id },
                }) : undefined}
                style={st.emptyBox}
              >
                <Text style={st.emptyTxt}>
                  {can('announcements') ? t('crw.annEmptyCan') : t('crw.annEmpty')}
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
                        {a.run_at ? <Text style={st.annSub}>{tf('crw.annSub', { n: a.rsvp.going })}</Text> : null}
                      </View>
                      <Icon name="chevron-forward" size={15} color={C.faint} />
                    </Pressable>
                  </React.Fragment>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── 집결 장소 — crew-native (지연 meet_* LIVE, probed 2026-07-14;
            position beneath 공지 = owner-vs-canvas override). Canvas
            composition: place name / region · schedule — each line only when
            its data exists. Place half absent when meet_* null; schedule
            also absent → whole section hides. 지도 앱에서 보기 → OS maps at
            meet_lat/lng. ── */}
        {isMember && (crew.meet_place_name != null || hasSchedule) && (
          <View style={{ paddingHorizontal: S.gutter, paddingTop: S.xl }}>
            <View style={st.sectionHead}>
              <Text style={st.sectionTitle}>{t('crw.sMeet')}</Text>
            </View>
            <View style={[st.meetCard, shadows.sm]}>
              {crew.meet_lat != null && crew.meet_lng != null && (
                <RealMap height={150} center={{ lat: crew.meet_lat, lng: crew.meet_lng }} marker borderRadius={0} />
              )}
              <Pressable
                onPress={crew.meet_lat != null && crew.meet_lng != null ? () => router.push({
                  pathname: '/(community)/meet-map' as never,
                  // crewId + canEdit ride for the in-place 위치 수정 (the 커버
                  // 변경 chip's exact gate); server enforces the PATCH deep
                  params: {
                    name: crew.meet_place_name ?? '', lat: String(crew.meet_lat), lng: String(crew.meet_lng),
                    crewId: crew.id, canEdit: canEditCrew ? '1' : '0',
                  },
                }) : undefined}
                disabled={crew.meet_lat == null}
                style={({ pressed }) => [st.meetRow, pressed && crew.meet_lat != null && { opacity: 0.7 }]}
              >
                <View style={crew.meet_place_name != null ? st.meetPin : st.meetCal}>
                  <Icon
                    name={crew.meet_place_name != null ? 'location' : 'calendar-outline'}
                    size={17}
                    color={crew.meet_place_name != null ? C.danger : C.accentGrn}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  {crew.meet_place_name != null && (
                    <Text style={st.meetName} numberOfLines={1}>{crew.meet_place_name}</Text>
                  )}
                  {(crew.sigungu || hasSchedule) && (
                    <Text style={[st.meetSchedule, crew.meet_place_name == null && { marginTop: 0 }]} numberOfLines={1}>
                      {crew.sigungu ? `${crew.sigungu}` : ''}
                      {crew.sigungu && hasSchedule ? ' · ' : ''}
                      {activeDays.length > 0 ? tf('crw.weekly', { days: activeDays.map(d => t(DAY_LABEL_KEY[d] ?? 'dayS.mon')).join('·') }) : ''}
                      {activeDays.length > 0 && crew.active_time ? ' ' : ''}
                      {crew.active_time ?? ''}
                    </Text>
                  )}
                </View>
                {/* convention (공지 상세/course detail): tap → big in-app map;
                    지도 앱에서 보기 lives INSIDE that view now */}
                {crew.meet_lat != null && crew.meet_lng != null && (
                  <Icon name="chevron-forward" size={16} color={C.faint} />
                )}
              </Pressable>
            </View>
          </View>
        )}

        {/* ── 챌린지 (M2) — members only; FrActiveChallengeRow ─────────── */}
        {isMember && challenge !== undefined && (
          <View style={{ paddingHorizontal: S.gutter, paddingTop: S.xl }}>
            <View style={st.sectionHead}>
              <Text style={st.sectionTitle}>{t('crw.sChallenge')}</Text>
            </View>
            {challenge === null ? (
              can('challenges') ? (
                <Pressable
                  onPress={() => router.push({
                    pathname: '/(community)/challenge-create' as never,
                    params: { crewId: crew.id },
                  })}
                  style={({ pressed }) => [st.emptyBox, pressed && { opacity: 0.8 }]}
                >
                  <Text style={st.emptyTxt}>{t('crw.chEmpty')}</Text>
                </Pressable>
              ) : null
            ) : (
              <View style={[st.chCard, shadows.sm]}>
                <View style={st.chHead}>
                  <Text style={st.chTitle} numberOfLines={1}>{challenge.title}</Text>
                  <View style={[st.chPct, challenge.is_completed && { backgroundColor: C.crown }]}>
                    <Text style={st.chPctTxt}>
                      {challenge.is_completed ? t('crw.chDone') : `${Math.round(challenge.progress_pct)}%`}
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
                      ? tf('crw.chDaysLeft', { n: Math.max(0, Math.ceil((new Date(challenge.ends_at).getTime() - Date.now()) / 86400000)) })
                      : new Date(challenge.starts_at).getTime() > Date.now() ? t('crw.chUpcoming') : t('crw.chEnded')}
                  </Text>
                </View>
                <Text style={st.chCaption}>{t('crw.chGps')}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── 크루 러닝 시작 (L1, canvas FrCrewDetail) — any member; tags the
               saved run as this crew's 정기런. ───────────────────────────── */}
        {isMember && (
          <View style={{ paddingHorizontal: S.gutter, paddingTop: S.xl }}>
            <Pressable
              onPress={startCrewRun}
              style={({ pressed }) => [st.crewRunBtn, accentShadow(C.accent), pressed && { opacity: 0.9 }]}
            >
              <Icon name="walk-outline" size={20} color={C.accentText} />
              <Text style={st.crewRunTxt}>{t('crw.startTitle')}</Text>
            </Pressable>
          </View>
        )}

        {/* ── 크루 채팅 entry (chat v1) — canvas: right after the 챌린지
            section; unread badge on the icon, count line when unread ──── */}
        {isMember && (
          <View style={{ paddingHorizontal: S.gutter, paddingTop: S.md }}>
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
                <Text style={st.chatTitle}>{t('crw.chatTitle')}</Text>
                <Text style={st.chatSub} numberOfLines={1}>
                  {chatUnread > 0 ? tf('crw.chatNew', { n: chatUnread }) : t('crw.chatSub')}
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
            {/* Header shows once loaded (ranking !== null) so the section never
                silently vanishes on an empty week — the empty state carries the
                honest weekly-reset semantics (KST 월요일, verified-GPS only). */}
            {ranking !== null && (
              <View style={st.sectionHead}>
                <Text style={st.sectionTitle}>{t('crw.sRank')}</Text>
                <Text style={st.memberCount}>{t('crw.rankCaption')}</Text>
              </View>
            )}
            {ranking !== null && ranking.length === 0 && (
              <View style={[st.rankEmpty, shadows.sm]}>
                <View style={st.rankEmptyIcon}>
                  <Icon name="trophy-outline" size={22} color={C.faint} />
                </View>
                <Text style={st.rankEmptyTitle}>{t('crw.rankEmpty')}</Text>
                <Text style={st.rankEmptySub}>{t('crw.rankEmptySub')}</Text>
              </View>
            )}
            {ranking !== null && ranking.length > 0 && (
              <>
                <View style={[st.rankList, shadows.sm]}>
                  {ranking.slice(0, 3).map((r, i) => {
                    const role = members.find(m => m.user_id === r.user_id)?.role;
                    return (
                      <React.Fragment key={r.user_id}>
                        {i > 0 && <View style={st.divider} />}
                        <View style={[st.rankRow, r.me && st.rankRowMe]}>
                          <View style={[st.rankMedal, { backgroundColor: rankMedal(C)[r.rank] ?? C.faint }]}>
                            <Text style={st.rankMedalTxt}>{r.rank}</Text>
                          </View>
                          <Avatar name={r.nickname} size={30} photoUrl={r.avatar_url} letterSpacing={-0.3} />
                          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={[st.rankName, r.me && { fontWeight: '700' }]} numberOfLines={1}>
                              {r.nickname ?? t('home.runner')}
                            </Text>
                            {r.me && <View style={st.meBadge}><Text style={st.meBadgeTxt}>{t('crw.me')}</Text></View>}
                            {role === 'owner' && <View style={st.ownerBadge}><Text style={st.ownerTxt}>{t('crw.roleOwner')}</Text></View>}
                            {role === 'admin' && <View style={st.adminBadge}><Text style={st.adminTxt}>{t('crw.roleAdmin')}</Text></View>}
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
              <Text style={st.rosterTxt}>{t('crw.rosterAll')}</Text>
              <Text style={st.rosterCount}>{tf('crw.nMembers', { n: crew.member_count })}</Text>
              <Icon name="chevron-forward" size={16} color={C.faint} />
            </Pressable>
          </View>
        )}

        {/* ── 크루 러닝 피드 (canvas FrCrewDetail section) — members only.
               Compact preview cards (48px route-shaped mini) + 전체 보기 →
               full feed screen. Tap → run-post (edge ⓑ, no lock pre-check). ── */}
        {isMember && feedPreview !== null && (
          <View style={{ paddingHorizontal: S.gutter, paddingTop: S.xl }}>
            <View style={st.sectionHead}>
              <Text style={st.sectionTitle}>{t('crw.sFeed')}</Text>
              {feedPreview.length > 0 && (
                <Pressable
                  onPress={() => router.push({ pathname: '/(community)/crew-runs' as never, params: { crewId: crew.id, crewName: crew.name } })}
                  hitSlop={8}
                >
                  <Text style={st.annMoreTxt}>{t('crw.viewAll')}</Text>
                </Pressable>
              )}
            </View>
            {feedPreview.length === 0 ? (
              // Session-only feed's normal early state. No CTA button here —
              // the 크루 러닝 시작 primary button is on this same screen, above.
              <View style={st.emptyBox}>
                <Text style={st.emptyTxt}>{t('crw.feedEmpty')}</Text>
                <Text style={st.emptyBoxSub}>{t('crw.feedEmptySub')}</Text>
              </View>
            ) : (
              <View style={[st.feedList, shadows.sm]}>
                {/* 세션-콜랩스: 프리뷰도 그룹 디둡 (한 세션 = 한 로우, 앵커
                    렌더) — 48px 로우엔 배지 생략 (스페이스; 풀 카드가 배지 보유) */}
                {groupCrewSessions(feedPreview).map(g => g.anchor).map((run, i) => (
                  <React.Fragment key={run.run_id}>
                    {i > 0 && <View style={st.divider} />}
                    <Pressable onPress={() => openCrewRun(run)} style={({ pressed }) => [st.feedRow, pressed && { opacity: 0.7 }]}>
                      <View style={st.feedThumb}>
                        {/* 8/5 REWORK — the Korea map lived HERE. Root cause:
                            RealMap's fixed 24px onMapReady edgePadding is
                            DEGENERATE at 48px (24+24 ≥ the frame) → MapKit
                            fits the coords into non-positive space → extreme
                            zoom-out, snapshotted by cacheEnabled. Fix: the
                            기록-card cascade — photo first (SafeImage), else
                            the route-shaped MiniMap SVG (no MapKit at this
                            size = the degenerate-fit class dead), else seed. */}
                        <SafeImage uri={run.photo_thumb} style={st.feedThumbImg}
                          fallback={run.polyline_thumb && run.polyline_thumb.length >= 2
                            ? <MiniMap seed={run.run_id} height={48} borderRadius={13} polyline={run.polyline_thumb} />
                            : <MiniMap seed={run.run_id} height={48} borderRadius={13} />} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={st.feedHeadRow}>
                          <Avatar name={run.nickname} size={18} initialsRatio={0.5} />
                          <Text style={st.feedName} numberOfLines={1}>{run.nickname ?? t('home.runner')}</Text>
                          {/* Every card is a 정기런 now (session_only) — the word
                              is redundant; the 참여 count is the informative part. */}
                          {run.session_participant_count != null && (
                            <View style={st.feedSessionChip}>
                              <Text style={st.feedSessionTxt}>{tf('crw.nJoined', { n: run.session_participant_count })}</Text>
                            </View>
                          )}
                          <Text style={st.feedWhen}>{fmtAgo(run.ran_at, lang)}</Text>
                        </View>
                        <View style={st.feedStatsRow}>
                          <Text style={st.feedKm}>{fmtDist(run.distance_km, units, 1)}<Text style={st.feedKmUnit}> {distUnit(units)}</Text></Text>
                          <Text style={st.feedStat}>{fmtDuration(run.duration_sec)}</Text>
                          {run.avg_pace_sec_per_km != null && (
                            <Text style={st.feedStat}>{fmtPaceIn(run.avg_pace_sec_per_km, units)}{paceUnit(units)}</Text>
                          )}
                          {/* 8/5 crew-♥: COUNT-ONLY on the 48px preview rows —
                              stated divergence from the full K1 grammar (a
                              toggle doesn't fit the compact row; tap → run-post
                              carries the interaction; crew-runs = full grammar). */}
                          {run.kudos_count > 0 && (
                            <View style={st.feedKudos}>
                              <Icon name="heart" size={10} color={C.danger} />
                              <Text style={st.feedStat}>{run.kudos_count}</Text>
                            </View>
                          )}
                        </View>
                      </View>
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

      {/* ── 이미지 crop — 아이콘 1:1 원형 · 커버 16:9 (avatar-crop reuse) ── */}
      <AvatarCrop
        src={cropSrc?.src ?? null}
        aspect={cropSrc?.kind === 'cover' ? 16 / 9 : 1}
        onClose={() => setCropSrc(null)}
        onConfirm={onCropped}
        onRetake={() => { setCropSrc(null); pickCrewImage(lastCropKind.current); }}
      />

      {/* ── Sticky CTA — non-members only (join/request/full). Members leave
             via the hero icon / manage hub, so no bottom action remains. ── */}
      {!isMember && (
        <View style={[st.footer, { paddingBottom: Math.max(insets.bottom, S.lg) + S.sm }]}>
          <CtaButton
            crew={crew}
            requestPending={myRequestStatus === 'pending'}
            busy={busy}
            onJoin={handleJoin}
            onCancelRequest={handleCancelRequest}
          />
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeSt = (C: Tokens) => StyleSheet.create({
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
  leaveIconBtn:  { width: 40, height: 40, borderRadius: R.pill, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  roleBadge:     { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  roleBadgeTxt:  { fontSize: 10.5, fontWeight: '800', color: C.accentText, letterSpacing: 0.2 },
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
  ownerTxt:   { fontSize: 10, fontWeight: '800', color: C.accentText, letterSpacing: 0.2 },
  adminBadge: { backgroundColor: C.accentDim, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  adminTxt:   { fontSize: 10, fontWeight: '800', color: C.accentGrn, letterSpacing: 0.2 },
  meBadge:    { backgroundColor: C.accent, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  meBadgeTxt: { fontSize: 10, fontWeight: '800', color: C.accentText, letterSpacing: 0.2 },

  // Empty / error states
  emptyBox: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, padding: 20, alignItems: 'center' },

  // 집결 장소 — crew-native card (meet_* live 2026-07-14)
  meetCard:    { borderRadius: R.lg, borderWidth: 1, borderColor: C.border, overflow: 'hidden', backgroundColor: C.surface },
  meetRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 15 },
  meetCal:     { width: 36, height: 36, borderRadius: 11, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  meetPin:     { width: 36, height: 36, borderRadius: 11, backgroundColor: C.danger + '1A', alignItems: 'center', justifyContent: 'center' },
  meetName:    { fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  meetSub:     { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },
  meetOpenTxt: { fontSize: 12.5, fontWeight: '700', color: C.accentGrn, letterSpacing: -0.2 },
  meetSchedule: { fontSize: 13, fontWeight: '700', color: C.accentGrn, letterSpacing: -0.2, marginTop: 2 },
  emptyBoxSub: { fontSize: 12, color: C.faint, letterSpacing: -0.2, fontWeight: '500', marginTop: 5, textAlign: 'center' },

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

  // 크루 러닝 피드 preview (canvas compact card)
  feedList:     { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.xl, overflow: 'hidden' },
  feedRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  feedThumb:    { width: 48, height: 48, borderRadius: 13, overflow: 'hidden', flexShrink: 0 },
  feedThumbImg: { width: 48, height: 48, borderRadius: 13 }, // signed URL — direct, never cached (계약)
  feedHeadRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feedName:     { flexShrink: 1, fontSize: 13.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  feedSessionChip: { backgroundColor: C.accentDim, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1.5, flexShrink: 0 },
  feedSessionTxt:  { fontSize: 9.5, fontWeight: '800', color: C.accentGrn, letterSpacing: -0.2 },
  feedWhen:     { fontSize: 11.5, color: C.faint, flexShrink: 0, marginLeft: 'auto' },
  feedStatsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  feedKudos:    { flexDirection: 'row', alignItems: 'center', gap: 3 },
  feedKm:       { fontSize: 13, fontWeight: '700', color: C.accentGrn, letterSpacing: -0.2, fontVariant: ['tabular-nums'] },
  feedKmUnit:   { fontSize: 10, color: C.faint, fontWeight: '600' },
  feedStat:     { fontSize: 12.5, fontWeight: '600', color: C.sub, letterSpacing: -0.2, fontVariant: ['tabular-nums'] },

  rankEmpty:      { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.xl, alignItems: 'center', paddingVertical: 22, paddingHorizontal: 20, gap: 8 },
  rankEmptyIcon:  { width: 46, height: 46, borderRadius: 14, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  rankEmptyTitle: { fontSize: 14, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  rankEmptySub:   { fontSize: 12, color: C.faint, letterSpacing: -0.2, textAlign: 'center', lineHeight: 17 },
  rankRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14 },
  rankRowMe:    { backgroundColor: C.accentDim },
  rankMedal:    { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rankMedalTxt: { fontSize: 12.5, fontWeight: '800', color: '#fff', fontVariant: ['tabular-nums'] },
  rankName:     { flexShrink: 1, fontSize: 14, fontWeight: '600', color: C.text, letterSpacing: -0.3 },
  rankKm:       { fontSize: 13.5, fontWeight: '700', color: C.sub, fontVariant: ['tabular-nums'] },

  // 크루 이미지 (⑤⑥)
  heroIconWrap: { width: 64, height: 64, borderRadius: 17, borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)', overflow: 'hidden', marginBottom: 10 },
  heroIconImg:  { width: '100%', height: '100%' },
  heroIconEdit: { position: 'absolute', bottom: 0, right: 0, width: 20, height: 20, borderTopLeftRadius: 8, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  coverChip:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 10 },
  coverChipTxt: { fontSize: 11.5, fontWeight: '700', color: '#fff', letterSpacing: -0.2 },

  // 크루 채팅 entry (chat v1)
  crewRunBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 54, borderRadius: 16, backgroundColor: C.accent },
  crewRunTxt:   { fontSize: 15.5, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },
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
  errBanner:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: S.gutter, paddingVertical: 10, backgroundColor: C.danger + '12', borderTopWidth: 1, borderTopColor: C.danger + '30' },
  errBannerTxt: { flex: 1, fontSize: 13, color: C.danger, letterSpacing: -0.2 },

  // Footer CTA
  footer:      { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: S.gutter, paddingTop: S.md, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border },
  ctaBtn:      { height: 56, borderRadius: R.lg, backgroundColor: C.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  ctaTxt:      { fontSize: 16, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },
  ctaDisabled: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  ctaPending:  { backgroundColor: C.accentDim, borderWidth: 1.5, borderColor: C.accent + '77' },
});
