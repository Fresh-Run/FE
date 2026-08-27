/**
 * 러닝 포스트 — social run detail (R3', canvas: FrRunPost).
 * Two modes — DERIVED FROM DATA since the 8/4 P1 hotfix (run.user_id === me,
 * fail-closed); `own=1` survives only as a first-paint identity seed and
 * gates no action:
 *  - others' runs (user-profile RunCard, !is_mine): kudos toggle + comments.
 *  - OWN runs (내 프로필 💬 target, owner directive 2026-07-12):
 *    author reads/replies to comments on their own run; ♥ toggles (self-
 *    kudos live since the 8/8 K2 restore — the 400 lifted 7/30 v120) +
 *    likers-sheet row; header inert (self-navigation loop). Card body
 *    stays → 활동 상세 (analysis view).
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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import { MentionText } from '@/components/mention-text';
import { PhotoViewer } from '@/components/photo-viewer';
import { errorMessage } from '@/lib/error-copy';
import { setRouteMap } from '@/store/route-map';
import { Icon } from '@/components/ui';
import { ScreenshotShareOffer } from '@/components/screenshot-share-offer';
import { ApiError } from '@/lib/api';
import { getUserIdentity } from '@/lib/profile-api';
import { openProfile } from '@/lib/profile-nav';
import { deleteRun } from '@/lib/runs-api';
import { useRunTrack } from '@/lib/track-cache';
import {
  deleteRunComment,
  getRunComments,
  kudosRun,
  postRunComment,
  unkudosRun,
  type RunComment,
} from '@/lib/run-social-api';
import { REPORT_REASONS, reportRun, type ReportReason } from '@/lib/reports-api';
import {
  distUnit,
  fmtDist,
  fmtDuration,
  fmtPaceIn,
  fmtAgo, fmtWhen,
  paceUnit,
  timeTitle,
} from '@/lib/run-format';
import { radius as R, shadows, spacing as S, type Tokens, DENSE_MAX_FONT_SCALE} from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useRunDetail } from '@/hooks/use-runs';
import { useSettings } from '@/store/use-settings';
import { useStore } from '@/store/use-store';
import { t, useLang, useT, tfIn } from '@/lib/i18n';

const COMMENT_PAGE = 20; // reply-slice pagination (follow-list pattern)

const HERO_H = 210;

function StatTile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  const st = useStyles(makeSt);
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
  const T = useT(); // reactive anchor — stack-mounted beneath 설정
  const lang = useLang(); // compiler-visible locale for the date/title formatters (2026-08-03 formatter-cache fix)
  const C = useTokens();
  const st = useStyles(makeSt);
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
  const units = useSettings(s => s.settings.units);

  const { run, loading, error, refetch } = useRunDetail(params.runId ?? null);
  const myUid = useStore(s => s.session?.user.id);

  // ── OWNERSHIP (8/4 P1 hotfix — 지연 repro: a notification door opened a
  // stranger's post in own mode: viewer's pfp + "러너" AND 수정/삭제/공유).
  // `own=1` was an ENTRY PARAM ASSERTION — whoever set it decided ownership,
  // and the notif door hardcoded it (see notif-routing's conviction note).
  // Authorization now derives from DATA and FAILS CLOSED: both sides must be
  // explicitly present. Unknown user_id (thin/legacy payload) = NOT owner —
  // never the reverse. Probed live 2026-08-04 cross-account: the sanitized
  // others' detail DOES serve user_id (the older "omits user_id" note in
  // this file was stale), so this is decidable on every door.
  const isOwner = run?.user_id != null && myUid != null && run.user_id === myUid;
  // Paint-only seed: the doors that KNOW they opened your own run (내 프로필,
  // crew-chat's own card) still avoid a first-paint identity flash. It gates
  // NO action — the moment the detail lands, data governs (the same two-phase
  // rule the ♥ seed above uses).
  const ownSeed = params.own === '1';
  const identityOwn = run != null ? isOwner : ownSeed;
  // Silent SWR-lite refetch on focus — the 수정하기 return path (edited
  // title/notes repaint without a spinner; first load unaffected).
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  // ♥ — entry-row seed paints instantly; server my_kudos (BE 111a446) wins
  // once the fetch lands, unless the user already toggled mid-flight
  const [liked, setLiked] = useState(params.myKudos === '1');
  const [likeDelta, setLikeDelta] = useState(0);
  const touchedKudos = useRef(false);
  useEffect(() => {
    if (run?.my_kudos == null) return;
    if (!touchedKudos.current) {
      setLiked(run.my_kudos);
      setLikeDelta(0); // server count is the authoritative base
      return;
    }
    // RECONCILE ON ARRIVAL (8/1, the "2"-count fix): the touched-guard above
    // WILL look like protective code — it is, for MID-FLIGHT toggles. But it
    // also blocked reconciliation forever: once the toggle LANDED, every
    // refetch (focus SWR at :118) returned a count that already contained
    // the like, and the surviving +1 delta double-counted it (0→like→refocus
    // = "2"). Agreement (server my_kudos === local liked) means the action
    // is in the server count — zero the delta. Disagreement = still
    // mid-flight — keep it.
    if (run.my_kudos === liked) setLikeDelta(0);
  }, [run?.my_kudos, liked]);
  const baseCount = run?.kudos_count ?? (Number(params.kudosCount) || 0);
  const likeCount = Math.max(0, baseCount + likeDelta);

  // Hero line — the SHARED (a) cache lane (hero-joins ruling 2026-07-23);
  // see activity.tsx's twin comment. `track` name kept — null while thumb.
  const { line: heroLine, pending: heroPending } = useRunTrack(run?.id ?? null, run?.polyline_thumb);
  const track = heroLine !== null && heroLine !== (run?.polyline_thumb ?? null) ? heroLine : null;

  // Likers sheet (the dedicated row below the bar, both modes)
  const [likersOpen, setLikersOpen] = useState(false);

  // 신고 sheet (others' runs only — ⋯ hidden on own mode; server self-400 is
  // the backstop). The user-profile grammar verbatim: ⋯ → menu → reason
  // picker; 204 AND 404 both land on 신고가 접수되었어요 (은닉 rule, hers).
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetView, setSheetView] = useState<'menu' | 'report'>('menu');
  // ⑦ photo enlarge — 활동 상세's wiring mirrored (per-surface gap, 2026-07-21)
  const [photoViewIdx, setPhotoViewIdx] = useState<number | null>(null);

  // ── 러닝 삭제 (own-⋯ slice, 2026-07-21) — 활동 상세's contract verbatim:
  // 2-step destructive confirm, cascade copy per guide, 404=already-gone=
  // success (deleteRun's transport). Exit = the own-detail contract's landing
  // (기록 tab; a feed entry point refreshes on its own next focus).
  const [delOpen, setDelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  async function doDelete() {
    if (deleting || !run) return;
    setDeleting(true);
    try {
      await deleteRun(run.id);
      setDelOpen(false);
      router.dismissAll?.();
      router.replace('/(tabs)/records' as never);
    } catch (e: unknown) {
      setDeleting(false);
      Alert.alert(t('annd.delFailT'), errorMessage(e));
    }
  }
  const [reportReason, setReportReason] = useState<ReportReason | null>(null);
  const [reportDetail, setReportDetail] = useState('');
  const [reportBusy, setReportBusy] = useState(false);

  function closeSheet() {
    setMenuOpen(false);
    setSheetView('menu'); setReportReason(null); setReportDetail(''); setReportBusy(false);
  }

  function submitReport() {
    if (!params.runId || !reportReason || reportBusy) return;
    setReportBusy(true);
    reportRun(params.runId, reportReason, reportDetail)
      .then(() => {
        closeSheet();
        Alert.alert(t('up.reported'), t('up.reportedSub'));
      })
      .catch((e: unknown) => {
        setReportBusy(false);
        Alert.alert(t('up.reportFail'), errorMessage(e));
      });
  }

  // Comments — reply slice (8/5, contract LOCKED de578c5 · design c471366):
  // flat fetch + parent refs, paginated (the must-ride: an unpaginated flat
  // list renders silently-childless threads when children land off-page).
  const [comments, setComments]   = useState<RunComment[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft]         = useState('');
  const [posting, setPosting]     = useState(false);
  const [cmHasMore, setCmHasMore] = useState(false);
  const [cmLoadingMore, setCmLoadingMore] = useState(false);
  const cmInFlightRef = useRef(false);
  // threading UI state: expanded parents + the composer's reply target
  const [expanded, setExpanded]   = useState<Set<string>>(new Set());
  const [replyTo, setReplyTo]     = useState<{ parentId: string; nickname: string } | null>(null);
  // count = server truth (includes replies, contract) + local post/delete
  // deltas; drift self-corrects on next mount's fresh detail
  const [countDelta, setCountDelta] = useState(0);
  useEffect(() => {
    if (!params.runId) return;
    let cancelled = false;
    getRunComments(params.runId, COMMENT_PAGE, 0)
      .then(rows => { if (!cancelled) { setComments(rows); setCmHasMore(rows.length === COMMENT_PAGE); } })
      .catch(() => { if (!cancelled) { setComments([]); setLoadError(true); } });
    return () => { cancelled = true; };
  }, [params.runId]);

  // follow-list pattern: offset = loaded count · in-flight ref · id dedup ·
  // short batch = end · silent tail retry. ScrollView surface → the trigger
  // is an explicit 댓글 더 보기 button (stated deviation from onEndReached).
  const loadMoreComments = useCallback(() => {
    if (!params.runId || cmInFlightRef.current || !cmHasMore) return;
    cmInFlightRef.current = true;
    setCmLoadingMore(true);
    getRunComments(params.runId, COMMENT_PAGE, comments?.length ?? 0)
      .then(rows => {
        setCmHasMore(rows.length === COMMENT_PAGE);
        setComments(prev => {
          const seen = new Set((prev ?? []).map(c => c.id));
          return [...(prev ?? []), ...rows.filter(c => !seen.has(c.id))];
        });
      })
      .catch(() => { /* silent — the button retries */ })
      .finally(() => { cmInFlightRef.current = false; setCmLoadingMore(false); });
  }, [params.runId, cmHasMore, comments?.length]);

  // Grouping — derived WHOLLY from the flat array each pass: parents keep
  // served order; children sort ascending under their parent. An orphan
  // (child whose parent hasn't paged in) is held IMPLICITLY — it renders
  // nothing now and attaches the moment a later page delivers its parent,
  // because this derivation re-runs on every append. No separate pool state.
  const grouped = useMemo(() => {
    const list = comments ?? [];
    const parents: RunComment[] = [];
    const children = new Map<string, RunComment[]>();
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

  /** 답글 on EVERY row (ruling ③): a reply's 답글 targets its PARENT thread
      with the "@{nickname} " plain-text prefill (that case only). */
  function startReply(cm: RunComment) {
    const parentId = cm.parent_comment_id ?? cm.id;
    setReplyTo({ parentId, nickname: cm.nickname ?? '' });
    if (cm.parent_comment_id) {
      const prefix = `@${cm.nickname ?? ''} `;
      setDraft(d => d.startsWith(prefix) ? d : prefix + d);
    }
  }

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
    || (!identityOwn && (run != null ? (run.allow_likes === false || run.allow_likes === null) : seedKudosOff));
  const commentsOff = commentsOff403
    || (!identityOwn && (run != null ? (run.allow_comments === false || run.allow_comments === null) : seedCommentsOff));

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
      const created = await postRunComment(run.id, content, replyTo?.parentId ?? null);
      setComments(prev => [...(prev ?? []), created]);
      setCountDelta(d => d + 1);
      if (replyTo) setExpanded(prev => new Set(prev).add(replyTo.parentId)); // the new reply is visible
      setReplyTo(null);
      setDraft('');
    } catch (e: unknown) {
      if (e instanceof ApiError && e.code === 'comments_disabled') {
        setCommentsOff403(true); // silent race net
      } else if (e instanceof ApiError && e.code === 'comment_parent_invalid') {
        // her CASCADE raced our reply — the thread is gone; drop reply mode
        setReplyTo(null);
        Alert.alert(t('rp.commentFailT'), t('rp.replyParentGone'));
      } else if (e instanceof ApiError && e.code === 'reply_depth_exceeded') {
        // unreachable by our UI construction — honest copy anyway
        setReplyTo(null);
        Alert.alert(t('rp.commentFailT'), t('rp.replyDepth'));
      } else {
        Alert.alert(t('rp.commentFailT'), t('rp.commentFailB'));
      }
    } finally {
      setPosting(false);
    }
  }

  // ── AUTHOR IDENTITY (8/4 P1, symptom ⓐ). The detail serves user_id but no
  // nickname/avatar, and a notification/push/deep-link door seeds neither —
  // the old fallback then landed on the CURRENT USER (own-mode pfp) + the
  // "러너" default, i.e. the viewer wearing the author's post. The identity
  // now comes from the run's OWN user_id: seed → hydrate → generic default,
  // never the viewer. Fetch only when the door left it blank and the run is
  // not mine; a failed fetch degrades to "러너" (honest, never borrowed).
  const [author, setAuthor] = useState<{ nickname: string | null; avatarUrl: string | null } | null>(null);
  useEffect(() => {
    const uid = run?.user_id;
    if (!uid || uid === myUid || params.nickname) return;
    let cancelled = false;
    getUserIdentity(uid)
      .then(p => { if (!cancelled) setAuthor({ nickname: p.nickname, avatarUrl: p.avatar_url }); })
      .catch(() => { /* generic default stands — never the viewer's identity */ });
    return () => { cancelled = true; };
  }, [run?.user_id, myUid, params.nickname]);

  const myNickname = useStore(s => s.displayName);
  const ownPhotoUrl = useStore(s => s.photoUrl);
  const nickname = identityOwn
    ? (params.nickname ?? myNickname ?? T('home.runner'))
    : (params.nickname ?? author?.nickname ?? T('home.runner'));
  const authorPhotoUrl = identityOwn
    ? ownPhotoUrl
    : (params.avatarUrl || author?.avatarUrl || null);
  // server count INCLUDES replies (contract) — read verbatim + local delta;
  // pre-detail fallback = loaded length (entry edge only)
  const commentCount = (run?.comment_count != null ? run.comment_count : (comments?.length ?? 0)) + countDelta;

  // Own-comment delete (S-batch #2): long-press an own row → destructive
  // confirm → DELETE → local filter (counts derive from comments.length)
  function confirmDeleteComment(cm: RunComment) {
    Alert.alert(t('rp.cmDelAsk'), t('rp.cmDelSub'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: () => {
          deleteRunComment(params.runId!, cm.id)
            .then(() => {
              // CASCADE mirror (contract: DB-level) — a parent takes its
              // loaded children with it locally; delta = 1 + LOADED children
              // (unloaded ones drift the count until the next mount's fresh
              // detail — chosen over a refetch round-trip, stated).
              const groupSize = 1 + (cm.parent_comment_id ? 0 : (grouped.children.get(cm.id)?.length ?? 0));
              setComments(prev => (prev ?? []).filter(c => c.id !== cm.id && c.parent_comment_id !== cm.id));
              setCountDelta(d => d - groupSize);
            })
            .catch(() => Alert.alert(t('annd.delFailT'), t('runSave.saveFailBody')));
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
        <Text style={st.appBarTitle}>{T('rp.title')}</Text>
        {/* 공유 — the run-detail header idiom (활동 상세's icon; joined at
            the 2026-07-24 revision: card long-press RETIRED, every screen a
            run opens on carries the header share instead). Own-runs-only,
            and since the 8/4 hotfix that means the DERIVED owner on every
            door — the own=1 half of this predicate was the assertion the
            notification path abused. */}
        {isOwner && (
          <Pressable
            onPress={() => router.push({ pathname: '/share-card' as never, params: { runId: params.runId } })}
            hitSlop={12}
            style={st.backBtn}
          >
            <Icon name="share-outline" size={19} color={C.text} />
          </Pressable>
        )}
        {/* ⋯ — both modes since the own-⋯ slice (2026-07-21): own → 수정/삭제
            (the guide's prescribed own-detail consumption), others → 신고 */}
        <Pressable onPress={() => setMenuOpen(true)} hitSlop={12} style={st.backBtn}>
          <Icon name="ellipsis-horizontal" size={20} color={C.text} />
        </Pressable>
      </View>

      {loading ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : error || !run ? (
        <Text style={st.emptyTxt}>{error ?? T('rp.notFound')}</Text>
      ) : (
        <>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
            {/* Author header — nickname from entry seed (sanitized detail has
                none); inert on own runs (self-navigation loop) */}
            <Pressable
              onPress={() => !isOwner && run.user_id && openProfile(run.user_id, nickname)}
              disabled={isOwner}
              style={({ pressed }) => [st.authorRow, pressed && !isOwner && { opacity: 0.7 }]}
            >
              <Avatar name={nickname} size={42} photoUrl={authorPhotoUrl} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.authorName} numberOfLines={1}>{nickname}</Text>
                <Text style={st.authorSub}>{fmtWhen(run.ran_at, lang)}</Text>
              </View>
            </Pressable>

            {/* Hero — real track when served; photos are 1h signed URLs (no caching) */}
            <View style={st.hero}>
              <MediaCarousel
                distanceMarkers
                units={units}
                officialDistanceKm={run.distance_km}
                // thumb-first + tap-to-enlarge (B7) — same grammar as 활동 상세
                polyline={heroLine ?? run.polyline_thumb ?? null}
                lineHidden={heroPending}
                seed={run.id}
                photos={run.photos ?? []}
                height={HERO_H}
                onPhotoPress={i => setPhotoViewIdx(i)}
                onMapPress={() => {
                  const line = track ?? run.polyline_thumb;
                  if (!line || line.length < 2) return;
                  setRouteMap({ title: run.title ?? timeTitle(run.ran_at), polyline: line, distanceMarkers: true, officialDistanceKm: run.distance_km, ...(track ? {} : { upgradeRunId: run.id }) });
                  router.push('/(course)/route-map' as never);
                }}
              />
            </View>

            <View style={{ paddingHorizontal: S.gutter }}>
              <Text style={st.title}>{run.title ?? timeTitle(run.ran_at, lang)}</Text>

              {/* Run stats — canvas-exact tiles (unit-aware) */}
              <View style={st.statsRow}>
                <StatTile label={T('runSave.statDist')} value={fmtDist(run.distance_km, units, 2)} unit={distUnit(units)} />
                <StatTile label={T('res.time')} value={fmtDuration(run.duration_sec)} />
                <StatTile
                  label={T('shr.metricPace')}
                  value={run.avg_pace_sec_per_km != null ? fmtPaceIn(run.avg_pace_sec_per_km, units) : '--'}
                  unit={paceUnit(units)}
                />
                {/* 케이던스 (8/27) — non-null only; legacy runs keep 3 tiles */}
                {run.avg_cadence_spm != null ? (
                  <StatTile label={T('run.cadence')} value={String(run.avg_cadence_spm)} unit={T('run.cadenceUnit')} />
                ) : null}
              </View>


              {/* 분석 보기 — own mode: analysis stays one tap from social
                  (활동 상세's 내 프로필 entry moved here, owner correction) */}
              {isOwner && (
                <Pressable
                  onPress={() => router.push({ pathname: '/(records)/activity' as never, params: { runId: run.id } })}
                  hitSlop={6}
                  style={({ pressed }) => [st.analysisLink, pressed && { opacity: 0.6 }]}
                >
                  <Icon name="stats-chart-outline" size={13} color={C.accentGrn} />
                  <Text style={st.analysisLinkTxt}>{T('rp.analysis')}</Text>
                  <Icon name="chevron-forward" size={12} color={C.accentGrn} />
                </Pressable>
              )}

              {/* ♥ kudos — ONE GRAMMAR (owner ruling 8/1): ♥ = toggle,
                  count = sheet, everywhere. */}
              {/* 8/4 grammar (owner-ruled): the BAR is the button — tap
                  anywhere on it = like/unlike (the old inner islands left
                  ~90% of a button-dressed bar dead). The SHEET moved to its
                  own deliberate row below; the count inside the bar is
                  display-only. */}
              {/* K2 RESTORED (8/8): self-kudos 400 lifted server-side 7/30
                  (v120, probed 204 + round-trip) — own mode gets the real
                  toggle bar back; the sheet row below stays. */}
              {kudosOff ? (
                /* likes_disabled — read-only bar (no toggle); sheet row below */
                <View style={st.kudosBtn}>
                  <Icon name="heart-outline" size={18} color={C.sub} />
                  <Text style={st.kudosTxt}>{likeCount}</Text>
                </View>
              ) : (
                <Pressable
                  onPress={toggleKudos}
                  style={({ pressed }) => [st.kudosBtn, liked && st.kudosBtnActive, pressed && { opacity: 0.8 }]}
                >
                  <Icon name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? C.danger : C.sub} />
                  <Text style={[st.kudosTxt, liked && { color: C.danger }]}>{likeCount}</Text>
                </Pressable>
              )}

              {/* 8/4: the dedicated likers-sheet door — ≥44pt row, renders
                  only with likes to show (zero-count = NOTHING, ruled-this-
                  build: an empty-state line about your own likes reads as
                  begging; the row appears with the first like). ko hardcoded
                  — census note. */}
              {likeCount > 0 && (
                <Pressable
                  onPress={() => setLikersOpen(true)}
                  style={({ pressed }) => [st.likersRow, pressed && { opacity: 0.6 }]}
                >
                  <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.likersRowTxt}>{tfIn(lang, 'rp.nLikes', { n: likeCount })}</Text>
                  <Icon name="chevron-forward" size={13} color={C.faint} />
                </Pressable>
              )}

              {/* Comments */}
              <Text style={st.commentsHead}>{tfIn(lang, 'rp.commentsN', { n: commentCount })}</Text>
              {comments === null ? (
                <ActivityIndicator size="small" color={C.faint} style={{ paddingVertical: 16 }} />
              ) : comments.length === 0 ? (
                <Text style={st.commentsEmpty}>{loadError ? T('rp.cmLoadFail') : T('rp.cmEmpty')}</Text>
              ) : (
                <View style={{ gap: 14, paddingBottom: 8 }}>
                  {/* Instagram-pattern threading (c471366): parents in served
                      order · replies COLLAPSED under a per-parent expander ·
                      답글 on every row (a reply's targets its parent). */}
                  {grouped.parents.map(cm => {
                    const kids = grouped.children.get(cm.id) ?? [];
                    const open = expanded.has(cm.id);
                    const row = (c: RunComment, child: boolean) => (
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
                          {/* 8/5: @멘션 탭-투-프로필 (visual link + tap-time
                              resolve — see mention-text.tsx) */}
                          <MentionText content={c.content} style={st.commentBody} mentionColor={C.accentGrn} />
                          {!commentsOff && (
                            <Pressable onPress={() => startReply(c)} hitSlop={{ top: 6, bottom: 8, left: 8, right: 8 }} style={{ alignSelf: 'flex-start' }}>
                              <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.replyBtnTxt}>{T('rp.replyBtn')}</Text>
                            </Pressable>
                          )}
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
                  {cmHasMore && (
                    <Pressable onPress={loadMoreComments} disabled={cmLoadingMore} style={st.moreCmBtn}>
                      {cmLoadingMore
                        ? <ActivityIndicator size="small" color={C.faint} />
                        : <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.moreCmTxt}>{T('rp.moreComments')}</Text>}
                    </Pressable>
                  )}
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
              <Text style={st.commentsOffTxt}>{T('rp.commentsOff')}</Text>
            </View>
          ) : (
            <View style={st.composerWrap}>
              {/* reply-mode chip (ruling ④): × cancels back to normal mode,
                  the typed draft survives */}
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
          )}
        </>
      )}

      {/* ⋯ report sheet — user-profile grammar verbatim (menu → reason picker;
          Modal hosts its own KAV: the native overlay sits outside the screen's
          KAV tree). Single row for now — block stays a profile-level action. */}
      <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={closeSheet}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={st.sheetOverlay} onPress={closeSheet}>
          <Pressable style={[st.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]} onPress={() => {}}>
            <View style={st.sheetHandleRow}><View style={st.sheetHandle} /></View>
            {/* 8/4 P1: the destructive rows are gated on the DERIVED owner —
                and while the detail is still loading NEITHER branch renders
                (fail-closed: an unknown owner offers no 삭제, and no 신고 on
                what may be your own run). */}
            {sheetView === 'menu' ? (
              isOwner ? (
                <>
                  {/* own-run controls — 활동 상세's pair, sheet-row grammar */}
                  <Pressable
                    onPress={() => {
                      closeSheet();
                      if (run) router.push({ pathname: '/(records)/edit-run' as never, params: { runId: run.id } });
                    }}
                    style={({ pressed }) => [st.sheetRow, pressed && { opacity: 0.7 }]}
                  >
                    <Icon name="create-outline" size={19} color={C.text} />
                    <Text style={st.sheetRowTxt}>{T('rp.edit')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { closeSheet(); setDelOpen(true); }}
                    style={({ pressed }) => [st.sheetRow, pressed && { opacity: 0.7 }]}
                  >
                    <Icon name="trash-outline" size={19} color={C.danger} />
                    <Text style={[st.sheetRowTxt, { color: C.danger }]}>{T('rp.delete')}</Text>
                  </Pressable>
                </>
              ) : run != null ? (
              <Pressable onPress={() => setSheetView('report')} style={({ pressed }) => [st.sheetRow, pressed && { opacity: 0.7 }]}>
                <Icon name="flag-outline" size={19} color={C.text} />
                <Text style={st.sheetRowTxt}>{T('up.report')}</Text>
              </Pressable>
              ) : null
            ) : (
              <>
                <Text style={st.sheetTitle}>{T('up.report')}</Text>
                {REPORT_REASONS.map(r => {
                  const on = reportReason === r.value;
                  return (
                    <Pressable key={r.value} onPress={() => setReportReason(r.value)} style={({ pressed }) => [st.reasonRow, pressed && { opacity: 0.7 }]}>
                      <Icon name={on ? 'radio-button-on' : 'radio-button-off'} size={19} color={on ? C.accentGrn : C.faint} />
                      <Text style={[st.sheetRowTxt, on && { fontWeight: '700' }]}>{T(r.label)}</Text>
                    </Pressable>
                  );
                })}
                <TextInput
                  value={reportDetail}
                  onChangeText={t => setReportDetail(t.slice(0, 500))}
                  placeholder={T('up.reportDetailPh')}
                  placeholderTextColor={C.faint}
                  multiline
                  style={st.reportInput}
                />
                <Pressable
                  onPress={submitReport}
                  disabled={!reportReason || reportBusy}
                  style={[st.reportSubmit, !reportReason && { backgroundColor: C.surfaceAlt }]}
                >
                  {reportBusy
                    ? <ActivityIndicator size="small" color={C.accentText} />
                    : <Text style={[st.reportSubmitTxt, !reportReason && { color: C.faint }]}>{T('up.reportSubmit')}</Text>}
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {photoViewIdx !== null && run && (
        <PhotoViewer
          visible
          photos={run.photos ?? []}
          initialIndex={photoViewIdx}
          onClose={() => setPhotoViewIdx(null)}
        />
      )}

      {/* 삭제 confirm — 활동 상세's modal verbatim (crew-해체 grammar; honest
          cascade body; no recovery — this IS the last gate) */}
      <Modal visible={delOpen} transparent animationType="fade" onRequestClose={() => !deleting && setDelOpen(false)}>
        <View style={st.delRoot}>
          <Pressable style={st.delBackdrop} onPress={() => !deleting && setDelOpen(false)} />
          <View style={st.delCard}>
            <View style={st.delIconWrap}>
              <Icon name="trash-outline" size={26} color={C.danger} />
            </View>
            <Text style={st.delTitle}>{T('rp.delAsk')}</Text>
            <Text style={st.delBody}>{T('rp.delBody')}</Text>
            <Pressable onPress={doDelete} disabled={deleting} style={st.delBtn}>
              {deleting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={st.delBtnTxt}>{T('rp.delete')}</Text>}
            </Pressable>
            <Pressable onPress={() => !deleting && setDelOpen(false)} style={st.delCancelBtn}>
              <Text style={st.delCancelTxt}>{T('common.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      {/* slice 3: screenshot offer — same own-guard as the header share */}
      {isOwner && params.runId && (
        <ScreenshotShareOffer runId={params.runId} />
      )}
    </KeyboardAvoidingView>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.gutter, paddingVertical: 10 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  // ⋯ report sheet (user-profile grammar verbatim — third screen-local copy
  // of the house sheet idiom after crew-members/user-profile; extraction is a
  // post-beta cleanup, not this S-slice)
  sheetOverlay:   { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.42)' },
  sheet:          { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: S.gutter },
  sheetHandleRow: { alignItems: 'center', paddingTop: 10, paddingBottom: 2 },
  sheetHandle:    { width: 38, height: 5, borderRadius: 99, backgroundColor: C.border },
  sheetRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, paddingHorizontal: 4 },
  sheetRowTxt:    { fontSize: 15, fontWeight: '600', color: C.text, letterSpacing: -0.3 },

  // 삭제 confirm — mirrored verbatim from (records)/activity.tsx (own-⋯ slice)
  delRoot:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  delBackdrop:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  delCard:      { width: '100%', backgroundColor: C.surface, borderRadius: 22, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 18 },
  delIconWrap:  { alignSelf: 'center', width: 54, height: 54, borderRadius: R.pill, backgroundColor: C.danger + '1A', alignItems: 'center', justifyContent: 'center' },
  delTitle:     { fontSize: 19, fontWeight: '700', color: C.text, letterSpacing: -0.5, textAlign: 'center', marginTop: 16 },
  delBody:      { fontSize: 13.5, lineHeight: 20, color: C.sub, textAlign: 'center', letterSpacing: -0.3, marginTop: 8, marginHorizontal: 8 },
  delBtn:       { height: 52, borderRadius: 14, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  delBtnTxt:    { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: -0.3 },
  delCancelBtn: { height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  delCancelTxt: { fontSize: 15, fontWeight: '700', color: C.sub, letterSpacing: -0.3 },
  sheetTitle:     { fontSize: 16, fontWeight: '700', color: C.text, letterSpacing: -0.4, paddingVertical: 10, textAlign: 'center' },
  reasonRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4 },
  reportInput:    { minHeight: 64, maxHeight: 120, borderWidth: 1, borderColor: C.border, borderRadius: 12, backgroundColor: C.surfaceAlt, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.text, letterSpacing: -0.2, textAlignVertical: 'top', marginTop: 6 },
  reportSubmit:   { height: 50, borderRadius: 14, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  reportSubmitTxt:{ fontSize: 15, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },
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
  kudosBtnActive: { borderColor: C.danger, backgroundColor: C.danger + '14' },
  kudosTxt:       { fontSize: 13.5, fontWeight: '700', color: C.sub, letterSpacing: -0.2 },
  likersRow:      { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', minHeight: 44, marginTop: 2 },
  likersRowTxt:   { fontSize: 13, fontWeight: '600', color: C.sub, letterSpacing: -0.2 },

  commentsHead:  { fontSize: 13.5, fontWeight: '700', color: C.text, letterSpacing: -0.3, marginTop: 22, marginBottom: 10 },
  commentsEmpty: { fontSize: 13, color: C.faint, letterSpacing: -0.2, paddingVertical: 8 },
  commentRow:    { flexDirection: 'row', gap: 9 },
  commentAuthor: { fontSize: 12.5, fontWeight: '700', color: C.text, letterSpacing: -0.2 },
  commentHead:   { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  commentRowChild:   { marginLeft: 39 }, // avatar 30 + gap 9 — one-level indent
  replyBtnTxt:       { fontSize: 11.5, fontWeight: '700', color: C.faint, letterSpacing: -0.1, marginTop: 3 },
  replyExpander:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 39 },
  replyExpanderRule: { width: 24, height: 1, backgroundColor: C.border },
  replyExpanderTxt:  { fontSize: 12, fontWeight: '700', color: C.sub, letterSpacing: -0.2 },
  moreCmBtn:         { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 20 },
  moreCmTxt:         { fontSize: 12.5, fontWeight: '700', color: C.sub, letterSpacing: -0.2 },
  composerWrap:      { borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface },
  replyChip:         { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginTop: 8, marginHorizontal: S.gutter, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, maxWidth: '80%' },
  replyChipTxt:      { flexShrink: 1, fontSize: 12, fontWeight: '600', color: C.sub, letterSpacing: -0.2 },
  commentWhen:   { fontSize: 11, color: C.faint, letterSpacing: -0.1 },
  commentBody:   { fontSize: 13.5, color: C.sub, letterSpacing: -0.2, lineHeight: 19, marginTop: 2 },

  composer:        { flexDirection: 'row', alignItems: 'flex-end', gap: 9, paddingHorizontal: S.gutter, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface },
  composerInput:   { flex: 1, minHeight: 42, maxHeight: 100, borderRadius: 21, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.bg, paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 11 : 8, paddingBottom: 8, fontSize: 14, color: C.text },
  sendBtn:         { height: 42, paddingHorizontal: 16, borderRadius: 21, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  commentsOffTxt: { flex: 1, textAlign: 'center', fontSize: 12.5, fontWeight: '600', color: C.faint, letterSpacing: -0.2, paddingVertical: 12 },
  sendBtnDisabled: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  sendTxt:         { fontSize: 13.5, fontWeight: '700', color: C.accentText, letterSpacing: -0.2 },
});
