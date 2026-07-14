/**
 * 러닝 포스트 — social run detail (R3', canvas: FrRunPost).
 * Two modes at the entry point:
 *  - others' runs (user-profile RunCard, !is_mine): kudos toggle + comments.
 *  - OWN runs (`own=1` — 내 프로필 💬 target, owner directive 2026-07-12):
 *    author reads/replies to comments on their own run; ♥ is count-only →
 *    likers sheet (self-kudos is a server 400, no toggle); header inert
 *    (self-navigation loop). Card body stays → 활동 상세 (analysis view).
 * A mode flag, not a sibling: the skeleton (hero/stats/comments/composer)
 * is identical — a sibling would duplicate the screen to vary ~30 lines.
 *
 * Data: GET /runs/{id} (BE 4cd5685 — 타인 공개범위 내 정제 응답; this screen
 * never renders the sanitized fields notes/verification/visibility) +
 * GET /runs/{id}/track when has_track (RealMap hero) + run comments CRUD +
 * run kudos toggle. Photos ride the response as signed URLs (1h — used
 * directly, never cached, 계약). MediaCarousel's photo path wakes here.
 *
 * Entry params seed the first paint (nickname/kudos state — the sanitized
 * RunResponse carries no nickname). ♥ adopts the detail response's my_kudos
 * (BE 111a446) once the fetch lands, unless the user already toggled —
 * the seed is only the instant-paint value and may be stale.
 *
 * Parity note (TODO.md): the canvas 이 코스 달리기 CTA is omitted —
 * sanitized route_id is null unless the linked course is public, and the
 * public single-route GET is a standing 지연-ask; graduates when it lands.
 */
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { KudosSheet } from '@/components/kudos-sheet';
import { MediaCarousel } from '@/components/media-carousel';
import { setRouteMap } from '@/store/route-map';
import { Icon } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { openProfile } from '@/lib/profile-nav';
import {
  deleteRunComment,
  getRunComments,
  getRunTrack,
  kudosRun,
  postRunComment,
  unkudosRun,
  type RunComment,
} from '@/lib/run-social-api';
import {
  distUnit,
  fmtDist,
  fmtDuration,
  fmtPaceIn,
  fmtWhen,
  paceUnit,
  timeTitle,
} from '@/lib/run-format';
import { colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';
import { useRunDetail } from '@/hooks/use-runs';
import { useSettings } from '@/store/use-settings';
import { useStore } from '@/store/use-store';
import type { Coordinate } from '@/types';

const HERO_H = 210;

function StatTile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={[st.statTile, shadows.sm]}>
      <Text style={st.statVal} numberOfLines={1}>
        {value}{unit ? <Text style={st.statUnit}> {unit}</Text> : null}
      </Text>
      <Text style={st.statLabel}>{label}</Text>
    </View>
  );
}

export default function RunPostScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    runId: string;
    nickname?: string;
    avatarUrl?: string; // entry seed, same channel as nickname ('' = none)
    myKudos?: string;   // '1' | '0' — viewer's state from the tapped row
    kudosCount?: string;
    own?: string;       // '1' = own-run social mode (♥ count-only → likers sheet)
    // pre-render hide-first seeds (crew-feed card forwards allow_*): '1'=on,
    // '0'=off/locked — hides the affordance BEFORE the detail lands (no flash);
    // the detail response is still the source of truth once it resolves.
    allowLikes?: string;
    allowComments?: string;
  }>();
  const isOwn = params.own === '1';
  const units = useSettings(s => s.settings.units);

  const { run, loading, error } = useRunDetail(params.runId ?? null);

  // ♥ — entry-row seed paints instantly; server my_kudos (BE 111a446) wins
  // once the fetch lands, unless the user already toggled mid-flight
  const [liked, setLiked] = useState(params.myKudos === '1');
  const [likeDelta, setLikeDelta] = useState(0);
  const touchedKudos = useRef(false);
  useEffect(() => {
    if (run?.my_kudos != null && !touchedKudos.current) {
      setLiked(run.my_kudos);
      setLikeDelta(0); // server count is the authoritative base
    }
  }, [run?.my_kudos]);
  const baseCount = run?.kudos_count ?? (Number(params.kudosCount) || 0);
  const likeCount = Math.max(0, baseCount + likeDelta);

  // Track hero — fetched only when the run reports has_track.
  // Retry-on-refocus (debt batch 1, the activity.tsx pattern): a transient
  // failure marks trackFailed; the next focus re-attempts — one bad fetch
  // no longer costs the whole visit. Expired-scope 404s simply fail again
  // quietly (the MiniMap fallback stands either way).
  const [track, setTrack] = useState<Coordinate[] | null>(null);
  const [trackFailed, setTrackFailed] = useState(false);
  const [trackAttempt, setTrackAttempt] = useState(0);
  useEffect(() => {
    if (!run?.has_track || !run.id) return;
    let cancelled = false;
    setTrackFailed(false);
    getRunTrack(run.id)
      .then(t => { if (!cancelled) setTrack(t.polyline); })
      .catch(() => { if (!cancelled) setTrackFailed(true); });
    return () => { cancelled = true; };
  }, [run?.has_track, run?.id, trackAttempt]);
  useFocusEffect(useCallback(() => {
    if (trackFailed) setTrackAttempt(a => a + 1);
  }, [trackFailed]));

  // Likers sheet (own mode — ♥ is count-only)
  const [likersOpen, setLikersOpen] = useState(false);

  // Comments
  const [comments, setComments]   = useState<RunComment[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft]         = useState('');
  const [posting, setPosting]     = useState(false);
  useEffect(() => {
    if (!params.runId) return;
    let cancelled = false;
    getRunComments(params.runId)
      .then(rows => { if (!cancelled) setComments(rows); })
      .catch(() => { if (!cancelled) { setComments([]); setLoadError(true); } });
    return () => { cancelled = true; };
  }, [params.runId]);

  // v1.5 피드 설정 강제 — HIDE-first (owner ruling): the allow_* flags don't
  // ride 타인 payloads yet (probed — 지연 ask ledgered), so the structured
  // 403 is the detector: first likes_disabled/comments_disabled HIDES the
  // affordance for the visit (count-only heart / quiet composer line), one
  // explanatory alert, never repeated. Screen state only — the next
  // encounter re-tries fresh (a re-enabled target self-corrects, no restart).
  const [kudosOff403, setKudosOff403] = useState(false);
  const [commentsOff403, setCommentsOff403] = useState(false);
  // pre-render seeds (her flags on the detail payload). NEVER in own mode:
  // the server allows own kudos-view/comments regardless, and own detail
  // serves the raw flag (deviation from her always-true contract — flagged).
  // Before the detail lands (run == null) fall back to the entry-param seed
  // (crew-feed forwards allow_*): '0' → hide-first; absent → shown (unchanged
  // for callers that don't seed). The detail truth wins the moment it resolves.
  const seedKudosOff = params.allowLikes === '0';
  const seedCommentsOff = params.allowComments === '0';
  const kudosOff = kudosOff403
    || (!isOwn && (run != null ? (run.allow_likes === false || run.allow_likes === null) : seedKudosOff));
  const commentsOff = commentsOff403
    || (!isOwn && (run != null ? (run.allow_comments === false || run.allow_comments === null) : seedCommentsOff));

  function toggleKudos() {
    if (!run || kudosOff) return;
    touchedKudos.current = true;
    const next = !liked;
    setLiked(next);
    setLikeDelta(d => d + (next ? 1 : -1));
    (next ? kudosRun(run.id) : unkudosRun(run.id)).catch((e: unknown) => {
      setLiked(!next); // rollback
      setLikeDelta(d => d + (next ? -1 : 1));
      if (e instanceof ApiError && e.code === 'likes_disabled') {
        setKudosOff403(true); // silent race net
      }
    });
  }

  async function send() {
    const content = draft.trim();
    if (!content || posting || !run) return;
    setPosting(true);
    try {
      const created = await postRunComment(run.id, content);
      setComments(prev => [...(prev ?? []), created]);
      setDraft('');
    } catch (e: unknown) {
      if (e instanceof ApiError && e.code === 'comments_disabled') {
        setCommentsOff403(true); // silent race net
      } else {
        Alert.alert('댓글 실패', '댓글을 게시하지 못했어요. 잠시 후 다시 시도해 주세요.');
      }
    } finally {
      setPosting(false);
    }
  }

  const nickname = params.nickname ?? '러너';
  // Author photo: own runs read the store (always fresh); others use the
  // entry seed from the tapped row (sanitized detail carries no identity)
  const ownPhotoUrl = useStore(s => s.photoUrl);
  const authorPhotoUrl = isOwn ? ownPhotoUrl : (params.avatarUrl || null);
  const myUid = useStore(s => s.session?.user.id);
  const commentCount = comments?.length ?? run?.comment_count ?? 0;

  // Own-comment delete (S-batch #2): long-press an own row → destructive
  // confirm → DELETE → local filter (counts derive from comments.length)
  function confirmDeleteComment(cm: RunComment) {
    Alert.alert('댓글 삭제', '이 댓글을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive',
        onPress: () => {
          deleteRunComment(params.runId!, cm.id)
            .then(() => setComments(prev => (prev ?? []).filter(c => c.id !== cm.id)))
            .catch(() => Alert.alert('삭제 실패', '잠시 후 다시 시도해 주세요'));
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView style={st.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[st.appBar, { marginTop: insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>러닝</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : error || !run ? (
        <Text style={st.emptyTxt}>{error ?? '기록을 찾을 수 없어요'}</Text>
      ) : (
        <>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
            {/* Author header — nickname from entry seed (sanitized detail has
                none); inert on own runs (self-navigation loop) */}
            <Pressable
              onPress={() => !isOwn && run.user_id && openProfile(run.user_id, nickname)}
              disabled={isOwn}
              style={({ pressed }) => [st.authorRow, pressed && !isOwn && { opacity: 0.7 }]}
            >
              <Avatar name={nickname} size={42} photoUrl={authorPhotoUrl} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.authorName} numberOfLines={1}>{nickname}</Text>
                <Text style={st.authorSub}>{fmtWhen(run.ran_at)}</Text>
              </View>
            </Pressable>

            {/* Hero — real track when served; photos are 1h signed URLs (no caching) */}
            <View style={st.hero}>
              <MediaCarousel
                // thumb-first + tap-to-enlarge (B7) — same grammar as 활동 상세
                polyline={track ?? run.polyline_thumb ?? null}
                seed={run.id}
                photos={run.photos ?? []}
                height={HERO_H}
                onMapPress={() => {
                  const line = track ?? run.polyline_thumb;
                  if (!line || line.length < 2) return;
                  setRouteMap({ title: run.title ?? timeTitle(run.ran_at), polyline: line, ...(track ? {} : { upgradeRunId: run.id }) });
                  router.push('/(course)/route-map' as never);
                }}
              />
            </View>

            <View style={{ paddingHorizontal: S.gutter }}>
              <Text style={st.title}>{run.title ?? timeTitle(run.ran_at)}</Text>

              {/* Run stats — canvas-exact tiles (unit-aware) */}
              <View style={st.statsRow}>
                <StatTile label="거리" value={fmtDist(run.distance_km, units, 2)} unit={distUnit(units)} />
                <StatTile label="시간" value={fmtDuration(run.duration_sec)} />
                <StatTile
                  label="평균 페이스"
                  value={run.avg_pace_sec_per_km != null ? fmtPaceIn(run.avg_pace_sec_per_km, units) : '--'}
                  unit={paceUnit(units)}
                />
              </View>

              {/* 분석 보기 — own mode: analysis stays one tap from social
                  (활동 상세's 내 프로필 entry moved here, owner correction) */}
              {isOwn && (
                <Pressable
                  onPress={() => router.push({ pathname: '/(records)/activity' as never, params: { runId: run.id } })}
                  hitSlop={6}
                  style={({ pressed }) => [st.analysisLink, pressed && { opacity: 0.6 }]}
                >
                  <Icon name="stats-chart-outline" size={13} color={C.accentGrn} />
                  <Text style={st.analysisLinkTxt}>분석 보기</Text>
                  <Icon name="chevron-forward" size={12} color={C.accentGrn} />
                </Pressable>
              )}

              {/* ♥ kudos — own mode: count-only → likers sheet (self-kudos
                  is a server 400); others: optimistic toggle */}
              {isOwn ? (
                <Pressable onPress={() => setLikersOpen(true)} style={({ pressed }) => [st.kudosBtn, pressed && { opacity: 0.8 }]}>
                  <Icon name="heart-outline" size={18} color={C.sub} />
                  <Text style={st.kudosTxt}>{likeCount}</Text>
                </Pressable>
              ) : kudosOff ? (
                /* likes_disabled — the read-only own-run idiom: count stays
                   honest, the press affordance is GONE */
                <View style={st.kudosBtn}>
                  <Icon name="heart-outline" size={18} color={C.sub} />
                  <Text style={st.kudosTxt}>{likeCount}</Text>
                </View>
              ) : (
                <Pressable onPress={toggleKudos} style={({ pressed }) => [st.kudosBtn, liked && st.kudosBtnActive, pressed && { opacity: 0.8 }]}>
                  <Icon name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? C.danger : C.sub} />
                  <Text style={[st.kudosTxt, liked && { color: C.danger }]}>{likeCount}</Text>
                </Pressable>
              )}

              {/* Comments */}
              <Text style={st.commentsHead}>댓글 {commentCount}</Text>
              {comments === null ? (
                <ActivityIndicator size="small" color={C.faint} style={{ paddingVertical: 16 }} />
              ) : comments.length === 0 ? (
                <Text style={st.commentsEmpty}>{loadError ? '댓글을 불러오지 못했어요' : '첫 댓글을 남겨보세요.'}</Text>
              ) : (
                <View style={{ gap: 14, paddingBottom: 8 }}>
                  {comments.map(cm => (
                    <Pressable
                      key={cm.id}
                      style={st.commentRow}
                      // Own rows only: long-press → destructive confirm
                      onLongPress={cm.user_id === myUid ? () => confirmDeleteComment(cm) : undefined}
                      delayLongPress={400}
                    >
                      <Pressable onPress={() => openProfile(cm.user_id, cm.nickname)} hitSlop={6}>
                        <Avatar name={cm.nickname} size={30} photoUrl={cm.avatar_url} />
                      </Pressable>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Pressable onPress={() => openProfile(cm.user_id, cm.nickname)} hitSlop={4}>
                          <Text style={st.commentAuthor}>{cm.nickname ?? '러너'}</Text>
                        </Pressable>
                        <Text style={st.commentBody}>{cm.content}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>

          {/* Likers sheet (own mode) */}
          {likersOpen && run && (
            <KudosSheet runId={run.id} kudosCount={likeCount} onClose={() => setLikersOpen(false)} />
          )}

          {/* Composer — v1.5 hide-first: comments_disabled replaces it with
              the quiet-state line for the visit */}
          {commentsOff ? (
            <View style={[st.composer, { paddingBottom: Math.max(insets.bottom, S.sm) + 6, justifyContent: 'center' }]}>
              <Text style={st.commentsOffTxt}>댓글을 받지 않는 러닝이에요</Text>
            </View>
          ) : (
            <View style={[st.composer, { paddingBottom: Math.max(insets.bottom, S.sm) + 6 }]}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="댓글 달기..."
                placeholderTextColor={C.faint}
                style={st.composerInput}
                maxLength={500}
                multiline
              />
              <Pressable
                onPress={send}
                disabled={!draft.trim() || posting}
                style={[st.sendBtn, (!draft.trim() || posting) && st.sendBtnDisabled]}
              >
                {posting
                  ? <ActivityIndicator size="small" color={C.accentText} />
                  : <Text style={[st.sendTxt, !draft.trim() && { color: C.faint }]}>게시</Text>}
              </Pressable>
            </View>
          )}
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.gutter, paddingVertical: 10 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTxt: { textAlign: 'center', paddingTop: 60, fontSize: 14, color: C.faint },

  authorRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: S.gutter, paddingBottom: 12 },
  authorName: { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  authorSub:  { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },

  hero: { marginHorizontal: S.gutter, borderRadius: R.xl, overflow: 'hidden' },

  title: { fontSize: 18, fontWeight: '700', color: C.text, letterSpacing: -0.5, marginTop: 14 },

  statsRow:  { flexDirection: 'row', gap: 10, marginTop: 14 },
  statTile:  { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center' },
  statVal:   { fontSize: 15.5, fontWeight: '700', color: C.text, letterSpacing: -0.4 },
  statUnit:  { fontSize: 11, fontWeight: '600', color: C.faint },
  statLabel: { fontSize: 11, color: C.faint, marginTop: 3 },

  analysisLink:    { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 10, paddingVertical: 2 },
  analysisLinkTxt: { fontSize: 13, fontWeight: '700', color: C.accentGrn, letterSpacing: -0.2 },

  kudosBtn:       { height: 46, borderRadius: R.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 12 },
  kudosBtnActive: { borderColor: C.danger, backgroundColor: '#EF444414' },
  kudosTxt:       { fontSize: 13.5, fontWeight: '700', color: C.sub, letterSpacing: -0.2 },

  commentsHead:  { fontSize: 13.5, fontWeight: '700', color: C.text, letterSpacing: -0.3, marginTop: 22, marginBottom: 10 },
  commentsEmpty: { fontSize: 13, color: C.faint, letterSpacing: -0.2, paddingVertical: 8 },
  commentRow:    { flexDirection: 'row', gap: 9 },
  commentAuthor: { fontSize: 12.5, fontWeight: '700', color: C.text, letterSpacing: -0.2 },
  commentBody:   { fontSize: 13.5, color: C.sub, letterSpacing: -0.2, lineHeight: 19, marginTop: 2 },

  composer:        { flexDirection: 'row', alignItems: 'flex-end', gap: 9, paddingHorizontal: S.gutter, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface },
  composerInput:   { flex: 1, minHeight: 42, maxHeight: 100, borderRadius: 21, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.bg, paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 11 : 8, paddingBottom: 8, fontSize: 14, color: C.text },
  sendBtn:         { height: 42, paddingHorizontal: 16, borderRadius: 21, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  commentsOffTxt: { flex: 1, textAlign: 'center', fontSize: 12.5, fontWeight: '600', color: C.faint, letterSpacing: -0.2, paddingVertical: 12 },
  sendBtnDisabled: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  sendTxt:         { fontSize: 13.5, fontWeight: '700', color: C.accentText, letterSpacing: -0.2 },
});
