/**
 * 크루 러닝 피드 — the full feed screen behind crew-detail's 크루 러닝 피드
 * section (전체 보기). Members-only (server 403 hides for non-members).
 *
 * Cards in the app's run-card language (user-profile RunCard idiom):
 * author head + real map (polyline_thumb, viewability-bounded like the home
 * feed — real MapView only for on-screen cells, route-shaped SVG otherwise)
 * + title + stats + a 💬 comment count. Whole card → 러닝 포스트 (run-post).
 *
 * Edge ⓑ (probed 2026-07-13): a card surfaced here for a LOCKED-profile
 * member still opens to a sanitized detail 200 — so the tap does NO lock
 * pre-check ("서피스에 보이는 카드는 상세까지"). kudos/comments are live on
 * that detail. The crew-run payload carries NO kudos_count, so cards show no
 * ♥ — kudos lives entirely on the detail; comment_count IS carried.
 *
 * Hide-first: allow_likes/allow_comments (BE 4fd5b66) forward to run-post as
 * seeds so the kudos/comment affordances never flash before the detail lands.
 *
 * v3.6: blocked users' cards are excluded server-side (zero FE). Pagination =
 * limit&offset (활동 피드와 동형).
 *
 * L1 forward-wire (지연 shipping crew-run tagging — crew_id-tagged runs get a
 * 정기런 badge + "N명이 함께 뛰었어요" grouping): the badge slot is marked in
 * the card header below. The field is NOT in CrewRunItem yet — nothing is
 * rendered until it lands (no faked badge).
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { MiniMap } from '@/components/mini-map';
import { RealMap } from '@/components/real-map';
import { Icon } from '@/components/ui';
import { KudosSheet } from '@/components/kudos-sheet';
import { ApiError, apiFetch } from '@/lib/api';
import { getCrewRuns, groupCrewSessions, CREW_FEED_PAGE, type CrewRunItem } from '@/lib/crews-api';
import { openProfile } from '@/lib/profile-nav';
import { distUnit, fmtAgo, fmtDist, fmtDuration, fmtPaceIn, paceUnit, timeTitle } from '@/lib/run-format';
import { shadows, spacing as S, type Tokens, DENSE_MAX_FONT_SCALE } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useRunTrack } from '@/lib/track-cache';
import { useSettings } from '@/store/use-settings';
import { useStore } from '@/store/use-store';
import { t, tf, tIn, useLang } from '@/lib/i18n';

function RunCard({ run, units, mapLive, onOpen, isMine, kudosOff, onKudos, onCountPress }: {
  run: CrewRunItem;
  units: ReturnType<typeof useSettings.getState>['settings']['units'];
  mapLive: boolean;
  onOpen: () => void;
  /** K1 wiring (8/5, her payload live): own rows = dimmed ♥ + count→sheet */
  isMine: boolean;
  kudosOff: boolean;
  onKudos: () => void;
  onCountPress: () => void;
}) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const lang = useLang(); // compiler-visible locale for the date/title formatters (2026-08-03 formatter-cache fix)
  // visual-split ruling: full track when fetched, thumb while loading
  const { line: cardLine, pending: linePending } = useRunTrack(mapLive ? run.run_id : null, run.polyline_thumb);
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [st.card, shadows.sm, pressed && { opacity: 0.85 }]}>
      <View style={st.cardHead}>
        <Pressable onPress={() => run.user_id && openProfile(run.user_id, run.nickname ?? t('home.runner'))} hitSlop={6}>
          <Avatar name={run.nickname} size={36} photoUrl={run.avatar_url} ring={C.border} initialsRatio={0.38} upper />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.cardName} numberOfLines={1}>{run.nickname ?? t('home.runner')}</Text>
          <View style={st.cardSubRow}>
            {/* Every card here is a 정기런 (session_only feed), so the word is
                noise — the participant count is what's informative. Chip keyed
                on the count; no count → no chip. */}
            {/* 세션-콜랩스 배지 (her prefix semantics): a: = 공지 러닝
                (announcement-anchored, the clean split) · c: = 함께 달림
                (same-day ad-hoc bucket). ko hardcoded ×2 — census note. */}
            {run.session_key?.startsWith('a:') ? (
              <View style={st.sessionChip}>
                <Icon name="megaphone-outline" size={10} color={C.accentGrn} />
                <Text style={st.sessionChipTxt}>공지 러닝</Text>
              </View>
            ) : run.session_key?.startsWith('c:') ? (
              <View style={st.sessionChip}>
                <Icon name="people" size={10} color={C.accentGrn} />
                <Text style={st.sessionChipTxt}>함께 달림</Text>
              </View>
            ) : null}
            {run.session_participant_count != null && (
              <View style={st.sessionChip}>
                <Icon name="people" size={10} color={C.accentGrn} />
                <Text style={st.sessionChipTxt}>{tf('crw.nJoined', { n: run.session_participant_count })}</Text>
              </View>
            )}
            <Text style={st.cardDate}>{fmtAgo(run.ran_at, lang)}</Text>
            {run.area ? (
              <>
                <View style={st.dot} />
                <Icon name="location-outline" size={11} color={C.faint} />
                <Text style={st.cardArea} numberOfLines={1}>{run.area}</Text>
              </>
            ) : null}
          </View>
        </View>
      </View>
      {/* 8/5 REWORK (owner split corrected): 전체보기 full cards = ROUTE MAP
          ONLY — the standard run-card line grammar; the photo-first cascade
          moved to crew-detail's feed rows where the ruling aimed it. The
          geometry HARD-PRECONDITION stays: a run with no drawable line gets
          seed art, never RealMap with a null polyline (whose center-mode
          Seoul default was this surface's bare-map hole). */}
      {(() => {
        const line = (cardLine && cardLine.length >= 2) ? cardLine
          : (run.polyline_thumb && run.polyline_thumb.length >= 2) ? run.polyline_thumb : null;
        if (!line) return <MiniMap seed={run.run_id} height={160} />; // trackless — seed art
        return mapLive
          ? <RealMap height={160} polyline={line} lineHidden={linePending && line !== cardLine} />
          : <MiniMap seed={run.run_id} height={160} polyline={line} />;
      })()}
      <View style={st.cardBody}>
        <Text style={st.cardTitle}>{run.title ?? timeTitle(run.ran_at, lang)}</Text>
        <View style={st.statsRow}>
          {([
            [fmtDist(run.distance_km, units, 1), distUnit(units), t('runSave.statDist')],
            [fmtDuration(run.duration_sec), '', t('res.time')],
            [run.avg_pace_sec_per_km != null ? fmtPaceIn(run.avg_pace_sec_per_km, units) : '--', paceUnit(units), t('res.pace')],
          ] as [string, string, string][]).map(([val, unit, label], i) => (
            <View key={i} style={{ gap: 2 }}>
              <Text style={st.statVal}>{val}{unit ? <Text style={st.statUnit}> {unit}</Text> : null}</Text>
              <Text style={st.statLbl}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
      {/* K1 grammar (8/5 crew-♥ wiring — the memo promise): ♥ toggles /
          count opens the sheet, home-feed rules verbatim incl. the 44pt
          asymmetric slop geometry; own rows = dimmed inert ♥ (self-like 400,
          K2 restores); allow_likes === false = read-only heart. 💬 stays
          display-only (card tap → run-post). */}
      <View style={st.cardFooter}>
        <View style={st.kudosCluster}>
          {isMine || kudosOff ? (
            <Icon name="heart-outline" size={18} color={isMine ? C.faint : C.sub} />
          ) : (
            <Pressable onPress={onKudos} hitSlop={{ top: 13, bottom: 13, left: 13, right: 2 }} style={({ pressed }) => pressed ? { opacity: 0.6 } : null}>
              <Icon name={run.my_kudos ? 'heart' : 'heart-outline'} size={18} color={run.my_kudos ? C.danger : C.sub} />
            </Pressable>
          )}
          <Pressable onPress={onCountPress} hitSlop={{ top: 8, bottom: 8, left: 0, right: 8 }} style={({ pressed }) => pressed ? { opacity: 0.6 } : null}>
            <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={[st.footCount, !isMine && !kudosOff && run.my_kudos && { color: C.danger }]}>{run.kudos_count}</Text>
          </Pressable>
        </View>
        <View style={[st.kudosCluster, { marginLeft: 14 }]}>
          <Icon name="chatbubble-outline" size={17} color={C.sub} />
          <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.footCount}>{run.comment_count}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function CrewRunsScreen() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const { crewId, crewName } = useLocalSearchParams<{ crewId: string; crewName?: string }>();
  const lang = useLang(); // folder-card date (screen scope — the card component has its own)
  const units = useSettings(s => s.settings.units);

  const [rows, setRows]     = useState<CrewRunItem[] | null>(null);
  // K1 kudos machinery (user-profile pattern verbatim): optimistic overlay,
  // wholesale clear on data arrival, per-run 403 race net, likers sheet door
  const [kudosOv, setKudosOv] = useState<Record<string, { on: boolean; delta: number }>>({});
  const [kudosOff403, setKudosOff403] = useState<Set<string>>(new Set());
  const [kudosSheetRun, setKudosSheetRun] = useState<{ id: string; count: number } | null>(null);
  // 세션 폴더 뷰 (8/5 리워크, 오너+지연 조인트): the open session's KEY only —
  // members derive LIVE from `rows` while the view is open, so later-page
  // participants absorb INTO the open view by the same re-derivation. A
  // MODAL (not a route screen) for exactly that: no data handoff, and the
  // screen's K1 machinery (overlay/toggle/403 net/sheet) serves the cards
  // inside directly. AUTOMATIC by construction: session_key alone drives
  // grouping — no leader/admin action exists or is needed (their "if
  // automatic = best", answered).
  const [openSessionKey, setOpenSessionKey] = useState<string | null>(null);
  // ── 8/5 tap-through fix. MECHANISM (confirmed): RN Modal is a NATIVE
  // overlay outside the navigation tree — router.push from inside it mounts
  // run-post into the stack BENEATH the modal (invisible), every tap stacks
  // another, and closing the modal reveals them all at once. FIX = the
  // personal-info chooser pattern (ledgered 지연-bug-② precedent): close
  // the modal FIRST, run the push ONCE on the Modal's real onDismiss (the
  // iOS dismissal-complete callback — rAF/InteractionManager fire mid-
  // dismiss and iOS can reject the presentation), with a 700ms fallback
  // timer for the onDismiss flakiness history; the ref-null makes whichever
  // fires first the only run. The pending ref doubles as the IN-FLIGHT
  // GUARD: while a nav is pending, further taps no-op — no duplicates. */
  const pendingNavRef = useRef<(() => void) | null>(null);
  function runPendingNav() {
    const a = pendingNavRef.current;
    pendingNavRef.current = null;
    a?.();
  }
  function navFromSession(action: () => void) {
    if (pendingNavRef.current) return; // in-flight guard — rapid taps no-op
    pendingNavRef.current = action;
    setOpenSessionKey(null);
    setTimeout(runPendingNav, 700);
  }

  /** 8/5 owner-ruled folder title: "{area} · {요일} {시간대}" — day.* keys +
      the new bare tod.* vocabulary (title.* carries the 러닝 suffix — wrong
      register for "토요일 밤"); area-null → date-only. timeTitle's hour
      boundaries mirrored. */
  const sessionTitle = useCallback((anchor: CrewRunItem): string => {
    const d = new Date(anchor.ran_at);
    const DAY = ['day.sun', 'day.mon', 'day.tue', 'day.wed', 'day.thu', 'day.fri', 'day.sat'] as const;
    const h = d.getHours();
    const tod = h >= 4 && h < 7 ? 'tod.dawn' : h < 10 ? 'tod.morning' : h < 12 ? 'tod.forenoon'
      : h < 14 ? 'tod.lunch' : h < 18 ? 'tod.afternoon' : h < 21 ? 'tod.evening' : 'tod.night';
    const when = `${tIn(lang, DAY[d.getDay()])} ${tIn(lang, tod)}`;
    return anchor.area ? `${anchor.area} · ${when}` : when;
  }, [lang]);
  const myUid = useStore(s => s.session?.user.id);

  function toggleKudos(run: CrewRunItem) {
    if (kudosOff403.has(run.run_id)) return;
    const cur = kudosOv[run.run_id]?.on ?? run.my_kudos;
    const next = !cur;
    setKudosOv(p => ({ ...p, [run.run_id]: { on: next, delta: (next ? 1 : 0) - (run.my_kudos ? 1 : 0) } }));
    apiFetch<void>(`/api/runs/${run.run_id}/kudos`, { method: next ? 'POST' : 'DELETE' })
      .catch((e: unknown) => {
        setKudosOv(p => ({ ...p, [run.run_id]: { on: run.my_kudos, delta: 0 } }));
        if (e instanceof ApiError && e.code === 'likes_disabled') {
          setKudosOff403(p => new Set(p).add(run.run_id)); // per-run race net
        }
      });
  }
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd]   = useState(false);
  const [error, setError]   = useState(false);

  // Viewability-bounded real maps (home-feed pattern): real MapView only for
  // on-screen cells; off-screen keep the route-shaped SVG.
  const [liveIds, setLiveIds] = useState<Set<string>>(new Set());
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 25 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: { key: string }[] }) => {
      setLiveIds(new Set(viewableItems.map(v => v.key)));
    },
  ).current;

  const load = useCallback(() => {
    if (!crewId) return;
    setError(false);
    getCrewRuns(crewId, 0)
      .then(list => { setRows(list); setKudosOv({}); setReachedEnd(list.length < CREW_FEED_PAGE); })
      .catch(() => { setRows([]); setError(true); });
  }, [crewId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  function loadMore() {
    if (!crewId || loadingMore || reachedEnd || !rows || rows.length === 0) return;
    setLoadingMore(true);
    getCrewRuns(crewId, rows.length)
      .then(more => {
        setRows(prev => {
          const seen = new Set((prev ?? []).map(r => r.run_id));
          return [...(prev ?? []), ...more.filter(r => !seen.has(r.run_id))];
        });
        if (more.length < CREW_FEED_PAGE) setReachedEnd(true);
      })
      .catch(() => { /* keep what we have; next end-reach retries */ })
      .finally(() => setLoadingMore(false));
  }

  function openRun(run: CrewRunItem) {
    // Edge ⓑ: no lock pre-check — the surfaced card's detail serves (probed
    // 200 even for a locked-profile member). Seed nickname/avatar + allow_*
    // (hide-first) so run-post paints without a flash.
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

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>{t('crw.sFeed')}</Text>
        <View style={{ width: 36 }} />
      </View>

      {rows === null ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : rows.length === 0 ? (
        <View style={st.centered}>
          <View style={st.emptyIcon}><Icon name={error ? 'footsteps-outline' : 'people-outline'} size={28} color={C.faint} /></View>
          {error ? (
            <Text style={st.emptyTxt}>{t('cruns.loadFail')}</Text>
          ) : (
            <>
              {/* Normal early state for a session-only feed — teaches the feature */}
              <Text style={st.emptyTxt}>{t('crw.feedEmpty')}</Text>
              <Text style={st.emptySub}>{t('crw.feedEmptySub')}</Text>
              <Pressable onPress={() => router.back()} style={({ pressed }) => [st.emptyCta, pressed && { opacity: 0.9 }]} hitSlop={6}>
                <Icon name="people" size={15} color={C.accentText} />
                <Text style={st.emptyCtaTxt}>{t('crw.startTitle')}</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : (
        <FlatList
          // session-collapse: groups derived per pass from the flat rows
          // (the replies derivation pattern) — later pages absorb free
          data={groupCrewSessions(rows)}
          keyExtractor={g => g.sessionKey ?? g.anchor.run_id}
          renderItem={({ item: g }) => {
            // 8/5 REWORK (owner+지연 joint): a session group renders as a
            // FOLDER ENTRY — visually distinct, no kudos/comment footer
            // (those live on the runs inside); tap opens the session view
            // with EVERY participant's full card. The anchor's route mini
            // is the folder's FACE (a preview, not an identity claim).
            if (g.sessionKey) {
              const a = g.anchor;
              const isAnn = g.sessionKey.startsWith('a:');
              // 8/5 anatomy (owner-ruled): green badge slot = "N명 참여"
              // (participation IS the badge) · title = auto-composed
              // area·day·time-of-day · a: gets a small 공지 marker only
              // (c: needs no label — the date-title says it) · fmtAgo sub.
              return (
                <Pressable onPress={() => setOpenSessionKey(g.sessionKey)} style={({ pressed }) => [st.folderCard, shadows.sm, pressed && { opacity: 0.85 }]}>
                  <View style={st.folderThumb}>
                    {a.polyline_thumb && a.polyline_thumb.length >= 2
                      ? <MiniMap seed={a.run_id} height={64} borderRadius={14} polyline={a.polyline_thumb} />
                      : <MiniMap seed={a.run_id} height={64} borderRadius={14} />}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={st.folderHeadRow}>
                      <Icon name="people" size={12} color={C.accentGrn} />
                      <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.folderBadgeTxt}>
                        {a.session_participant_count != null ? tf('crw.nJoined', { n: a.session_participant_count }) : '함께 달린 기록'}
                      </Text>
                      {isAnn && (
                        <View style={st.annMarker}>
                          <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.annMarkerTxt}>공지</Text>
                        </View>
                      )}
                    </View>
                    <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.folderTitle} numberOfLines={1}>{sessionTitle(a)}</Text>
                    <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.folderDate}>{fmtAgo(a.ran_at, lang)}</Text>
                  </View>
                  <Icon name="chevron-forward" size={18} color={C.faint} />
                </Pressable>
              );
            }
            const item = g.anchor;
            const ov = kudosOv[item.run_id];
            const shown = ov ? { ...item, my_kudos: ov.on, kudos_count: item.kudos_count + ov.delta } : item;
            return (
              <RunCard
                run={shown}
                units={units}
                mapLive={liveIds.has(item.run_id)}
                onOpen={() => openRun(item)}
                isMine={item.user_id === myUid}
                kudosOff={item.allow_likes === false || kudosOff403.has(item.run_id)}
                onKudos={() => toggleKudos(item)}
                onCountPress={() => setKudosSheetRun({ id: shown.run_id, count: shown.kudos_count })}
              />
            );
          }}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          contentContainerStyle={{ padding: S.gutter, paddingBottom: 40 }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginTop: 16 }} color={C.faint} /> : null}
          showsVerticalScrollIndicator={false}
        />
      )}
      {/* ── 세션 뷰 (폴더 탭 타깃): 전 참여자 풀 카드, K1 전 문법 —
             derives LIVE from rows (later pages absorb into the open view) */}
      <Modal visible={openSessionKey != null} animationType="slide" onRequestClose={() => setOpenSessionKey(null)} onDismiss={runPendingNav}>
        <View style={[st.root, { paddingTop: insets.top }]}>
          {(() => {
            if (!openSessionKey) return null;
            const members = (rows ?? []).filter(r => r.session_key === openSessionKey);
            const anchor = members[0];
            const isAnn = openSessionKey.startsWith('a:');
            const title = `${crewName ? `${crewName} · ` : ''}${isAnn ? '공지 러닝' : '함께 달림'}${anchor?.session_participant_count != null ? ` · ${tf('crw.nJoined', { n: anchor.session_participant_count })}` : ''}`;
            return (
              <>
                <View style={st.appBar}>
                  <Pressable onPress={() => setOpenSessionKey(null)} hitSlop={12} style={st.backBtn}>
                    <Icon name="arrow-back" size={20} color={C.text} />
                  </Pressable>
                  <Text style={st.appBarTitle} numberOfLines={1}>{title}</Text>
                  <View style={{ width: 36 }} />
                </View>
                <FlatList
                  data={members}
                  keyExtractor={r => r.run_id}
                  renderItem={({ item }) => {
                    const ov = kudosOv[item.run_id];
                    const shown = ov ? { ...item, my_kudos: ov.on, kudos_count: item.kudos_count + ov.delta } : item;
                    return (
                      <RunCard
                        run={shown}
                        units={units}
                        mapLive
                        onOpen={() => navFromSession(() => openRun(item))}
                        isMine={item.user_id === myUid}
                        kudosOff={item.allow_likes === false || kudosOff403.has(item.run_id)}
                        onKudos={() => toggleKudos(item)}
                        onCountPress={() => setKudosSheetRun({ id: shown.run_id, count: shown.kudos_count })}
                      />
                    );
                  }}
                  ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
                  contentContainerStyle={{ padding: S.gutter, paddingBottom: 40 }}
                  showsVerticalScrollIndicator={false}
                />
              </>
            );
          })()}
          {/* the likers sheet must ALSO render inside the modal (iOS modal
              sits above the screen's own overlay layer) */}
          {kudosSheetRun && openSessionKey != null && (
            <KudosSheet runId={kudosSheetRun.id} kudosCount={kudosSheetRun.count} onClose={() => setKudosSheetRun(null)} />
          )}
        </View>
      </Modal>
      {kudosSheetRun && openSessionKey == null && (
        <KudosSheet runId={kudosSheetRun.id} kudosCount={kudosSheetRun.count} onClose={() => setKudosSheetRun(null)} />
      )}
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.gutter, paddingVertical: 10 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },

  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 40 },
  emptyIcon: { width: 60, height: 60, borderRadius: 18, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTxt:  { fontSize: 14.5, fontWeight: '600', color: C.sub, letterSpacing: -0.3 },
  emptySub:  { fontSize: 12.5, color: C.faint, letterSpacing: -0.2, textAlign: 'center' },
  emptyCta:    { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14, backgroundColor: C.accent, borderRadius: 14, paddingHorizontal: 18, height: 44 },
  emptyCtaTxt: { fontSize: 14, fontWeight: '800', color: C.accentText, letterSpacing: -0.3 },

  card:      { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, overflow: 'hidden' },
  cardHead:  { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13 },
  cardName:  { fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  cardSubRow:{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  cardDate:  { fontSize: 12, color: C.faint, letterSpacing: -0.2 },
  cardArea:  { fontSize: 12, color: C.faint, letterSpacing: -0.2, flexShrink: 1 },
  sessionChip:    { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.accentDim, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginRight: 1 },
  sessionChipTxt: { fontSize: 10.5, fontWeight: '800', color: C.accentGrn, letterSpacing: -0.2 },
  dot:       { width: 3, height: 3, borderRadius: 2, backgroundColor: C.border },

  cardBody:  { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  statsRow:  { flexDirection: 'row', gap: 26, marginTop: 10 },
  statVal:   { fontSize: 16, fontWeight: '800', color: C.text, letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  statUnit:  { fontSize: 11, fontWeight: '600', color: C.faint },
  statLbl:   { fontSize: 11, color: C.faint, letterSpacing: -0.2 },

  cardFooter:{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 13, marginTop: 6, borderTopWidth: 1, borderTopColor: C.border },
  kudosCluster: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  folderCard:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 12 },
  folderThumb:   { width: 64, height: 64, borderRadius: 14, overflow: 'hidden', flexShrink: 0 },
  folderHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  folderBadgeTxt:{ fontSize: 11, fontWeight: '700', color: C.accentGrn, letterSpacing: -0.2 },
  annMarker:     { marginLeft: 4, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  annMarkerTxt:  { fontSize: 9.5, fontWeight: '700', color: C.sub, letterSpacing: -0.1 },
  folderTitle:   { fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3, marginTop: 2 },
  folderDate:    { fontSize: 11.5, color: C.faint, letterSpacing: -0.2, marginTop: 2 },
  footCount: { fontSize: 13, fontWeight: '600', color: C.sub, letterSpacing: -0.2 },
});
