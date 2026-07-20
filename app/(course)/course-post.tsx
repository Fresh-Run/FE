/**
 * 코스 포스트 — social course detail (R1, canvas: FrRunPost layout adapted
 * to the live course stack; run-post-true version blocked on 지연's run
 * visibility fix — see TODO R3). Data arrives via store/pending-post (the
 * pending-course rationale: owner-only GET /routes/{id}, oversized polyline).
 *
 * Live endpoints: ♥ = POST/DELETE /routes/{id}/like (optimistic + rollback),
 * comments = GET/POST /routes/{id}/comments. Entry: ORPHANED since the
 * feed-triage slice (2026-07-17) took the course cards off home — the old
 * item-17 rider-④ retarget never landed and the ledgered b7ca600 orphaning
 * finding covers this screen; re-entry rides the item-4-expanded repair
 * slice (course discovery lane).
 *
 * Adaptations from the run-post canvas (parity-noted in TODO.md): app bar
 * "코스" not "러닝"; stat tiles 거리/예상 시간/달린 횟수 (course has no run
 * pace); tag chips omitted (no server field); comment delete omitted (no
 * canvas affordance).
 */
import { router } from 'expo-router';
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

import { Avatar } from '@/components/avatar';
import { MediaCarousel } from '@/components/media-carousel';
import { Icon } from '@/components/ui';
import { openProfile } from '@/lib/profile-nav';
import {
  deleteRouteComment,
  getRouteComments,
  likeRoute,
  postRouteComment,
  unlikeRoute,
  type RouteComment,
} from '@/lib/routes-api';
import { fmtWhen } from '@/lib/run-format';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { setPendingCourse } from '@/store/pending-course';
import { getPendingPost } from '@/store/pending-post';
import { useStore } from '@/store/use-store';

const HERO_H = 210;

function fmtEstMin(min: number | null): string {
  if (min == null) return '—';
  if (min < 60) return `약 ${min}분`;
  const h = Math.floor(min / 60), m = min % 60;
  return m === 0 ? `약 ${h}시간` : `약 ${h}시간 ${m}분`;
}

function StatTile({ label, value }: { label: string; value: string }) {
  const st = useStyles(makeSt);
  return (
    <View style={[st.statTile, shadows.sm]}>
      <Text style={st.statVal} numberOfLines={1}>{value}</Text>
      <Text style={st.statLabel}>{label}</Text>
    </View>
  );
}

export default function CoursePostScreen() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  // Handoff read once; the store stays set so re-renders survive
  const [route] = useState(getPendingPost);

  // ♥ — optimistic toggle with rollback (멱등 endpoints per guide §5)
  const [liked, setLiked]         = useState(route?.is_liked ?? false);
  const [likeCount, setLikeCount] = useState(route?.like_count ?? 0);

  // Comments — null = loading; seed count from the feed payload until loaded
  const [comments, setComments] = useState<RouteComment[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft]       = useState('');
  const [posting, setPosting]   = useState(false);
  const myUid = useStore(s => s.session?.user.id);

  // Own-comment delete (S-batch #2): long-press an own row → destructive
  // confirm → DELETE → local filter (counts derive from comments.length)
  function confirmDeleteComment(cm: RouteComment) {
    Alert.alert('댓글 삭제', '이 댓글을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive',
        onPress: () => {
          deleteRouteComment(route!.id, cm.id)
            .then(() => setComments(prev => (prev ?? []).filter(c => c.id !== cm.id)))
            .catch(() => Alert.alert('삭제 실패', '잠시 후 다시 시도해 주세요'));
        },
      },
    ]);
  }

  useEffect(() => {
    if (!route) return;
    let cancelled = false;
    getRouteComments(route.id)
      .then(rows => { if (!cancelled) setComments(rows); })
      .catch(() => { if (!cancelled) { setComments([]); setLoadError(true); } });
    return () => { cancelled = true; };
  }, [route]);

  if (!route) {
    // Direct navigation without a handoff (stale deep link) — honest fallback
    return (
      <View style={[st.root, { paddingTop: insets.top }]}>
        <View style={st.appBar}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
            <Icon name="arrow-back" size={20} color={C.text} />
          </Pressable>
          <Text style={st.appBarTitle}>코스</Text>
          <View style={{ width: 36 }} />
        </View>
        <Text style={st.emptyTxt}>코스를 찾을 수 없어요</Text>
      </View>
    );
  }

  function toggleLike() {
    const next = !liked;
    setLiked(next);
    setLikeCount(c => c + (next ? 1 : -1));
    (next ? likeRoute(route!.id) : unlikeRoute(route!.id)).catch(() => {
      setLiked(!next); // rollback
      setLikeCount(c => c + (next ? -1 : 1));
    });
  }

  function runThisCourse() {
    setPendingCourse(route!);
    router.push('/(course)/preview' as never);
  }

  async function send() {
    const content = draft.trim();
    if (!content || posting) return;
    setPosting(true);
    try {
      const created = await postRouteComment(route!.id, content);
      setComments(prev => [...(prev ?? []), created]);
      setDraft('');
    } catch {
      Alert.alert('댓글 실패', '댓글을 게시하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setPosting(false);
    }
  }

  const commentCount = comments?.length ?? route.comment_count ?? 0;

  return (
    <KeyboardAvoidingView
      style={st.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[st.appBar, { marginTop: insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>코스</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
        {/* Author header */}
        <Pressable
          onPress={() => openProfile(route.owner_id, route.owner_nickname)}
          style={({ pressed }) => [st.authorRow, pressed && { opacity: 0.7 }]}
        >
          <Avatar name={route.owner_nickname} size={42} photoUrl={route.owner_avatar_url} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.authorName} numberOfLines={1}>{route.owner_nickname ?? '러너'}</Text>
            <Text style={st.authorSub}>{fmtWhen(route.created_at)}</Text>
          </View>
        </Pressable>

        {/* Hero — carousel-ready; photos=[] until run media lands (R2) */}
        <View style={st.hero}>
          <MediaCarousel polyline={route.polyline} seed={route.summary} height={HERO_H} />
        </View>

        <View style={{ paddingHorizontal: S.gutter }}>
          <Text style={st.title}>{route.summary}</Text>

          {/* Stat tiles */}
          <View style={st.statsRow}>
            <StatTile label="거리" value={`${route.total_distance_km.toFixed(1)} km`} />
            <StatTile label="예상 시간" value={fmtEstMin(route.estimated_duration_min)} />
            <StatTile label="달린 횟수" value={`${route.copy_count ?? 0}회`} />
          </View>

          {/* ♥ + 이 코스 달리기 */}
          <View style={st.actionRow}>
            <Pressable onPress={toggleLike} style={({ pressed }) => [st.likeBtn, liked && st.likeBtnActive, pressed && { opacity: 0.8 }]}>
              <Icon name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? C.danger : C.sub} />
              <Text style={[st.likeTxt, liked && { color: C.danger }]}>{likeCount}</Text>
            </Pressable>
            <Pressable onPress={runThisCourse} style={({ pressed }) => [st.runBtn, pressed && { opacity: 0.85 }]}>
              <Icon name="navigate-outline" size={16} color={C.accentText} />
              <Text style={st.runTxt}>이 코스 달리기</Text>
            </Pressable>
          </View>

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

      {/* Composer — sticky bottom */}
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
    </KeyboardAvoidingView>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.gutter, paddingVertical: 10 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },

  emptyTxt: { textAlign: 'center', paddingTop: 60, fontSize: 14, color: C.faint },

  authorRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: S.gutter, paddingBottom: 12 },
  authorName: { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  authorSub:  { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },

  hero: { marginHorizontal: S.gutter, borderRadius: R.xl, overflow: 'hidden' },

  title: { fontSize: 18, fontWeight: '700', color: C.text, letterSpacing: -0.5, marginTop: 14 },

  statsRow:  { flexDirection: 'row', gap: 10, marginTop: 14 },
  statTile:  { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center' },
  statVal:   { fontSize: 15.5, fontWeight: '700', color: C.text, letterSpacing: -0.4 },
  statLabel: { fontSize: 11, color: C.faint, marginTop: 3 },

  actionRow:     { flexDirection: 'row', gap: 10, marginTop: 12 },
  likeBtn:       { flex: 1, height: 46, borderRadius: R.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  likeBtnActive: { borderColor: C.danger, backgroundColor: C.danger + '14' },
  likeTxt:       { fontSize: 13.5, fontWeight: '700', color: C.sub, letterSpacing: -0.2 },
  runBtn:        { flex: 2, height: 46, borderRadius: R.md, backgroundColor: C.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  runTxt:        { fontSize: 14, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },

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
