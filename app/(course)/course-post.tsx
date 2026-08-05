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
import React, { useEffect, useMemo, useState } from 'react';
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
import { ApiError } from '@/lib/api';
import { MediaCarousel } from '@/components/media-carousel';
import { MentionText } from '@/components/mention-text';
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
import { fmtAgo, fmtWhen } from '@/lib/run-format';
import { t, tfIn, useLang, useT } from '@/lib/i18n';
import { radius as R, shadows, spacing as S, type Tokens, DENSE_MAX_FONT_SCALE} from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { setPendingCourse } from '@/store/pending-course';
import { getPendingPost } from '@/store/pending-post';
import { useStore } from '@/store/use-store';

const HERO_H = 210;

function fmtEstMin(min: number | null, lang: 'ko' | 'en'): string {
  if (min == null) return '—';
  if (min < 60) return tfIn(lang, 'cp.estMin', { m: min });
  const h = Math.floor(min / 60), m = min % 60;
  return m === 0 ? tfIn(lang, 'cp.estH', { h }) : tfIn(lang, 'cp.estHM', { h, m });
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
  const T = useT(); // reply UI rides rp.* keys (the rest of the screen = slice-7 territory)
  const lang = useLang(); // compiler-visible locale for the date formatter (2026-08-03 formatter-cache fix)
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
  // ── Replies (8/5, her route contract deployed — run-post's Instagram
  // grammar ported per the ledgered port map; rp.* keys reused): expanded
  // parents + the composer's reply target. getRouteComments is UNPAGINATED
  // (full flat list) so the grouping is always complete — no orphan case.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [replyTo, setReplyTo]   = useState<{ parentId: string; nickname: string } | null>(null);

  const grouped = useMemo(() => {
    const list = comments ?? [];
    const parents: RouteComment[] = [];
    const children = new Map<string, RouteComment[]>();
    const parentIds = new Set(list.filter(c => !c.parent_comment_id).map(c => c.id));
    for (const c of list) {
      if (!c.parent_comment_id) parents.push(c);
      else if (parentIds.has(c.parent_comment_id)) {
        const arr = children.get(c.parent_comment_id) ?? [];
        arr.push(c);
        children.set(c.parent_comment_id, arr);
      }
    }
    for (const arr of children.values()) arr.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return { parents, children };
  }, [comments]);

  /** 답글 on EVERY row (run-post ruling ③): a reply's 답글 targets its
      PARENT thread with the "@{nickname} " prefill (that case only). */
  function startReply(cm: RouteComment) {
    const parentId = cm.parent_comment_id ?? cm.id;
    setReplyTo({ parentId, nickname: cm.nickname ?? '' });
    if (cm.parent_comment_id) {
      const prefix = `@${cm.nickname ?? ''} `;
      setDraft(d => d.startsWith(prefix) ? d : prefix + d);
    }
  }

  // Own-comment delete (S-batch #2): long-press an own row → destructive
  // confirm → DELETE → local filter (counts derive from comments.length)
  function confirmDeleteComment(cm: RouteComment) {
    Alert.alert(t('rp.cmDelAsk'), t('rp.cmDelSub'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: () => {
          deleteRouteComment(route!.id, cm.id)
            // CASCADE mirror (contract probed 8/5: DB-level, count follows) —
            // unpaginated list ⇒ the local filter removes ALL children, exact
            .then(() => setComments(prev => (prev ?? []).filter(c => c.id !== cm.id && c.parent_comment_id !== cm.id)))
            .catch(() => Alert.alert(t('annd.delFailT'), t('auth.tryLater')));
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
          <Text style={st.appBarTitle}>{t('cp.title')}</Text>
          <View style={{ width: 36 }} />
        </View>
        <Text style={st.emptyTxt}>{t('ntfr.courseGoneT')}</Text>
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
      const created = await postRouteComment(route!.id, content, replyTo?.parentId ?? null);
      setComments(prev => [...(prev ?? []), created]);
      if (replyTo) setExpanded(prev => new Set(prev).add(replyTo.parentId)); // the new reply is visible
      setReplyTo(null);
      setDraft('');
    } catch (e: unknown) {
      if (e instanceof ApiError && e.code === 'comment_parent_invalid') {
        // her CASCADE raced our reply — the thread is gone; drop reply mode
        setReplyTo(null);
        Alert.alert(t('rp.commentFailT'), t('rp.replyParentGone'));
      } else if (e instanceof ApiError && e.code === 'reply_depth_exceeded') {
        setReplyTo(null);
        Alert.alert(t('rp.commentFailT'), t('rp.replyDepth'));
      } else {
        Alert.alert(t('rp.commentFailT'), t('rp.commentFailB'));
      }
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
        <Text style={st.appBarTitle}>{t('cp.title')}</Text>
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
            <Text style={st.authorName} numberOfLines={1}>{route.owner_nickname ?? T('home.runner')}</Text>
            <Text style={st.authorSub}>{fmtWhen(route.created_at, lang)}</Text>
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
            <StatTile label={T('cp.dist')} value={`${route.total_distance_km.toFixed(1)} km`} />
            <StatTile label={T('cp.estTime')} value={fmtEstMin(route.estimated_duration_min, lang)} />
            <StatTile label={T('cp.runCount')} value={tfIn(lang, 'cp.nTimes', { n: route.copy_count ?? 0 })} />
          </View>

          {/* ♥ + 이 코스 달리기 */}
          <View style={st.actionRow}>
            <Pressable onPress={toggleLike} style={({ pressed }) => [st.likeBtn, liked && st.likeBtnActive, pressed && { opacity: 0.8 }]}>
              <Icon name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? C.danger : C.sub} />
              <Text style={[st.likeTxt, liked && { color: C.danger }]}>{likeCount}</Text>
            </Pressable>
            <Pressable onPress={runThisCourse} style={({ pressed }) => [st.runBtn, pressed && { opacity: 0.85 }]}>
              <Icon name="navigate-outline" size={16} color={C.accentText} />
              <Text style={st.runTxt}>{T('cp.runThis')}</Text>
            </Pressable>
          </View>

          {/* Comments */}
          <Text style={st.commentsHead}>{tfIn(lang, 'rp.commentsN', { n: commentCount })}</Text>
          {comments === null ? (
            <ActivityIndicator size="small" color={C.faint} style={{ paddingVertical: 16 }} />
          ) : comments.length === 0 ? (
            <Text style={st.commentsEmpty}>{loadError ? T('rp.cmLoadFail') : T('rp.cmEmpty')}</Text>
          ) : (
            <View style={{ gap: 14, paddingBottom: 8 }}>
              {/* Instagram-pattern threading — run-post grammar ported (8/5):
                  parents in served order · replies COLLAPSED under a
                  per-parent expander · 답글 on every row. */}
              {grouped.parents.map(cm => {
                const kids = grouped.children.get(cm.id) ?? [];
                const open = expanded.has(cm.id);
                const row = (c: RouteComment, child: boolean) => (
                  <Pressable
                    key={c.id}
                    style={[st.commentRow, child && st.commentRowChild]}
                    // Own rows only: long-press → destructive confirm
                    onLongPress={c.user_id === myUid ? () => confirmDeleteComment(c) : undefined}
                    delayLongPress={400}
                  >
                    <Pressable onPress={() => openProfile(c.user_id, c.nickname)} hitSlop={6}>
                      <Avatar name={c.nickname} size={child ? 24 : 30} photoUrl={c.avatar_url} />
                    </Pressable>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={st.commentHead}>
                        <Pressable onPress={() => openProfile(c.user_id, c.nickname)} hitSlop={4}>
                          <Text style={st.commentAuthor}>{c.nickname ?? T('home.runner')}</Text>
                        </Pressable>
                        <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.commentWhen}>{fmtAgo(c.created_at, lang)}</Text>
                      </View>
                      {/* 8/5: @멘션 탭-투-프로필 (run-post 트윈) */}
                      <MentionText content={c.content} style={st.commentBody} mentionColor={C.accentGrn} />
                      <Pressable onPress={() => startReply(c)} hitSlop={{ top: 6, bottom: 8, left: 8, right: 8 }} style={{ alignSelf: 'flex-start' }}>
                        <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.replyBtnTxt}>{T('rp.replyBtn')}</Text>
                      </Pressable>
                    </View>
                  </Pressable>
                );
                return (
                  <View key={cm.id} style={{ gap: 10 }}>
                    {row(cm, false)}
                    {kids.length > 0 && (
                      <Pressable
                        onPress={() => setExpanded(prev => {
                          const next = new Set(prev);
                          if (next.has(cm.id)) next.delete(cm.id); else next.add(cm.id);
                          return next;
                        })}
                        hitSlop={8}
                        style={st.replyExpander}
                      >
                        <View style={st.replyExpanderRule} />
                        <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.replyExpanderTxt}>
                          {open ? T('rp.hideReplies') : tfIn(lang, 'rp.viewReplies', { n: kids.length })}
                        </Text>
                      </Pressable>
                    )}
                    {open && kids.map(k => row(k, true))}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Composer — sticky bottom; reply-mode chip above (run-post ruling ④:
          × cancels back to normal mode, the typed draft survives) */}
      <View style={st.composerWrap}>
        {replyTo && (
          <View style={st.replyChip}>
            <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.replyChipTxt} numberOfLines={1}>
              {tfIn(lang, 'rp.replyingTo', { name: replyTo.nickname || T('home.runner') })}
            </Text>
            <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
              <Icon name="close" size={13} color={C.faint} />
            </Pressable>
          </View>
        )}
        <View style={[st.composer, { borderTopWidth: 0, paddingBottom: Math.max(insets.bottom, S.sm) + 6 }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={T('rp.cmPh')}
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
            : <Text style={[st.sendTxt, !draft.trim() && { color: C.faint }]}>{T('rp.post')}</Text>}
        </Pressable>
        </View>
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
  commentHead:   { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  commentWhen:   { fontSize: 11, color: C.faint, letterSpacing: -0.1 },
  // reply family — run-post makeSt verbatim (8/5 port)
  commentRowChild:   { marginLeft: 39 }, // avatar 30 + gap 9 — one-level indent
  replyBtnTxt:       { fontSize: 11.5, fontWeight: '700', color: C.faint, letterSpacing: -0.1, marginTop: 3 },
  replyExpander:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 39 },
  replyExpanderRule: { width: 24, height: 1, backgroundColor: C.border },
  replyExpanderTxt:  { fontSize: 12, fontWeight: '700', color: C.sub, letterSpacing: -0.2 },
  composerWrap:      { borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface },
  replyChip:         { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginTop: 8, marginHorizontal: S.gutter, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, maxWidth: '80%' },
  replyChipTxt:      { flexShrink: 1, fontSize: 12, fontWeight: '600', color: C.sub, letterSpacing: -0.2 },
  commentBody:   { fontSize: 13.5, color: C.sub, letterSpacing: -0.2, lineHeight: 19, marginTop: 2 },

  composer:        { flexDirection: 'row', alignItems: 'flex-end', gap: 9, paddingHorizontal: S.gutter, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface },
  composerInput:   { flex: 1, minHeight: 42, maxHeight: 100, borderRadius: 21, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.bg, paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 11 : 8, paddingBottom: 8, fontSize: 14, color: C.text },
  sendBtn:         { height: 42, paddingHorizontal: 16, borderRadius: 21, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  sendTxt:         { fontSize: 13.5, fontWeight: '700', color: C.accentText, letterSpacing: -0.2 },
});
