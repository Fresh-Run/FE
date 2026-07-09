/**
 * 러닝 포스트 — social run detail for OTHERS' runs (R3', canvas: FrRunPost).
 * Own runs keep app/(records)/activity.tsx (analysis view) — contexts split
 * by ownership at the entry point (user-profile RunCard, !is_mine).
 *
 * Data: GET /runs/{id} (BE 4cd5685 — 타인 공개범위 내 정제 응답; this screen
 * never renders the sanitized fields notes/verification/visibility) +
 * GET /runs/{id}/track when has_track (RealMap hero) + run comments CRUD +
 * run kudos toggle. Photos ride the response as signed URLs (1h — used
 * directly, never cached, 계약). MediaCarousel's photo path wakes here.
 *
 * Entry params seed the first paint (nickname/kudos state) because the
 * sanitized RunResponse carries no nickname and no my_kudos — my_kudos on
 * the detail response is a logged 지연-ask; until then the seed is the
 * viewer's truth from the list row they tapped.
 *
 * Parity note (TODO.md): the canvas 이 코스 달리기 CTA is omitted —
 * sanitized route_id is null unless the linked course is public, and the
 * public single-route GET is a standing 지연-ask; graduates when it lands.
 */
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
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

import { MediaCarousel } from '@/components/media-carousel';
import { Icon } from '@/components/ui';
import { avatarBg } from '@/lib/fr-hash';
import { openProfile } from '@/lib/profile-nav';
import {
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
import type { Coordinate } from '@/types';

const HERO_H = 210;

function InitialAvatar({ name, size }: { name: string | null; size: number }) {
  const n = name?.trim() || '러너';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: avatarBg(n), alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.42, fontWeight: '700', color: '#fff' }}>{n[0]}</Text>
    </View>
  );
}

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
    myKudos?: string;   // '1' | '0' — viewer's state from the tapped row
    kudosCount?: string;
  }>();
  const units = useSettings(s => s.settings.units);

  const { run, loading, error } = useRunDetail(params.runId ?? null);

  // ♥ — seeded from the entry row (sanitized detail has no my_kudos —
  // 지연-ask logged); count prefers server truth once the run loads
  const [liked, setLiked] = useState(params.myKudos === '1');
  const [likeDelta, setLikeDelta] = useState(0);
  const baseCount = run?.kudos_count ?? (Number(params.kudosCount) || 0);
  const likeCount = Math.max(0, baseCount + likeDelta);

  // Track hero — fetched only when the run reports has_track
  const [track, setTrack] = useState<Coordinate[] | null>(null);
  useEffect(() => {
    if (!run?.has_track || !run.id) return;
    let cancelled = false;
    getRunTrack(run.id)
      .then(t => { if (!cancelled) setTrack(t.polyline); })
      .catch(() => { /* trackless/expired scope — hero falls back to MiniMap */ });
    return () => { cancelled = true; };
  }, [run?.has_track, run?.id]);

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

  function toggleKudos() {
    if (!run) return;
    const next = !liked;
    setLiked(next);
    setLikeDelta(d => d + (next ? 1 : -1));
    (next ? kudosRun(run.id) : unkudosRun(run.id)).catch(() => {
      setLiked(!next); // rollback
      setLikeDelta(d => d + (next ? -1 : 1));
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
    } catch {
      Alert.alert('댓글 실패', '댓글을 게시하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setPosting(false);
    }
  }

  const nickname = params.nickname ?? '러너';
  const commentCount = comments?.length ?? run?.comment_count ?? 0;

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
            {/* Author header — nickname from entry seed (sanitized detail has none) */}
            <Pressable
              onPress={() => run.user_id && openProfile(run.user_id, nickname)}
              style={({ pressed }) => [st.authorRow, pressed && { opacity: 0.7 }]}
            >
              <InitialAvatar name={nickname} size={42} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.authorName} numberOfLines={1}>{nickname}</Text>
                <Text style={st.authorSub}>{fmtWhen(run.ran_at)}</Text>
              </View>
            </Pressable>

            {/* Hero — real track when served; photos are 1h signed URLs (no caching) */}
            <View style={st.hero}>
              <MediaCarousel polyline={track} seed={run.id} photos={run.photos ?? []} height={HERO_H} />
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

              {/* ♥ kudos */}
              <Pressable onPress={toggleKudos} style={({ pressed }) => [st.kudosBtn, liked && st.kudosBtnActive, pressed && { opacity: 0.8 }]}>
                <Icon name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? C.danger : C.sub} />
                <Text style={[st.kudosTxt, liked && { color: C.danger }]}>{likeCount}</Text>
              </Pressable>

              {/* Comments */}
              <Text style={st.commentsHead}>댓글 {commentCount}</Text>
              {comments === null ? (
                <ActivityIndicator size="small" color={C.faint} style={{ paddingVertical: 16 }} />
              ) : comments.length === 0 ? (
                <Text style={st.commentsEmpty}>{loadError ? '댓글을 불러오지 못했어요' : '첫 댓글을 남겨보세요.'}</Text>
              ) : (
                <View style={{ gap: 14, paddingBottom: 8 }}>
                  {comments.map(cm => (
                    <View key={cm.id} style={st.commentRow}>
                      <Pressable onPress={() => openProfile(cm.user_id, cm.nickname)} hitSlop={6}>
                        <InitialAvatar name={cm.nickname} size={30} />
                      </Pressable>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Pressable onPress={() => openProfile(cm.user_id, cm.nickname)} hitSlop={4}>
                          <Text style={st.commentAuthor}>{cm.nickname ?? '러너'}</Text>
                        </Pressable>
                        <Text style={st.commentBody}>{cm.content}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>

          {/* Composer */}
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
  sendBtnDisabled: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  sendTxt:         { fontSize: 13.5, fontWeight: '700', color: C.accentText, letterSpacing: -0.2 },
});
