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
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { SafeImage } from '@/components/safe-image';
import { MiniMap } from '@/components/mini-map';
import { RealMap } from '@/components/real-map';
import { Icon } from '@/components/ui';
import { KudosSheet } from '@/components/kudos-sheet';
import { ApiError, apiFetch } from '@/lib/api';
import { getCrewRuns, CREW_FEED_PAGE, type CrewRunItem } from '@/lib/crews-api';
import { openProfile } from '@/lib/profile-nav';
import { distUnit, fmtAgo, fmtDist, fmtDuration, fmtPaceIn, paceUnit, timeTitle } from '@/lib/run-format';
import { shadows, spacing as S, type Tokens, DENSE_MAX_FONT_SCALE } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useRunTrack } from '@/lib/track-cache';
import { useSettings } from '@/store/use-settings';
import { useStore } from '@/store/use-store';
import { t, tf, useLang } from '@/lib/i18n';

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
      {/* 8/5 media fix (owner field finding): PHOTO first (기록-카드 logic,
          photo > map priority, SafeImage precedent) → route line → seed art.
          KOREA-MAP ROOT CAUSE, ledgered: the old branch let `linePending`
          ALONE reach RealMap — a thumb-less run handed RealMap a null
          polyline, which fell to its center-mode Seoul default region = the
          bare zoomed-out map. Geometry is now required to enter RealMap. */}
      <SafeImage uri={run.photo_thumb} style={st.mediaPhoto}
        fallback={(() => {
          const line = (cardLine && cardLine.length >= 2) ? cardLine
            : (run.polyline_thumb && run.polyline_thumb.length >= 2) ? run.polyline_thumb : null;
          if (!line) return <MiniMap seed={run.run_id} height={160} />; // trackless — seed art (기록 parity)
          return mapLive
            ? <RealMap height={160} polyline={line} lineHidden={linePending && line !== cardLine} />
            : <MiniMap seed={run.run_id} height={160} polyline={line} />;
        })()} />
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
  const { crewId } = useLocalSearchParams<{ crewId: string }>();
  const units = useSettings(s => s.settings.units);

  const [rows, setRows]     = useState<CrewRunItem[] | null>(null);
  // K1 kudos machinery (user-profile pattern verbatim): optimistic overlay,
  // wholesale clear on data arrival, per-run 403 race net, likers sheet door
  const [kudosOv, setKudosOv] = useState<Record<string, { on: boolean; delta: number }>>({});
  const [kudosOff403, setKudosOff403] = useState<Set<string>>(new Set());
  const [kudosSheetRun, setKudosSheetRun] = useState<{ id: string; count: number } | null>(null);
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
          data={rows}
          keyExtractor={r => r.run_id}
          renderItem={({ item }) => {
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
      {kudosSheetRun && (
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
  mediaPhoto:   { width: '100%', height: 160 }, // signed URL — used directly, never cached (계약)
  footCount: { fontSize: 13, fontWeight: '600', color: C.sub, letterSpacing: -0.2 },
});
