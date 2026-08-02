/**
 * 내 프로필 — social/public profile, own-view (canvas 2026-07-07; screenshot-
 * verified). Pushed from the home header avatar. Distinct from the 프로필 TAB —
 * the gear routes to 프로필 설정 (design-wave C — canvas my-profile.jsx
 * gear → profileSettings; the 설정 hub keeps its door inside that screen).
 *
 * Approved interim honesty (backend gaps, TODO'd):
 *  - bio shows under the name when present (plain line — the location-pin
 *    interim died with the 8/4 capture slice);
 *  - section = "내 러닝" + real total ("공개 N개" reframing is its own item);
 *  - run cards are reduced feed-style: no per-run area/tags — title falls
 *    back to timeTitle(ran_at);
 *  - footer: ♥ live toggle + count→likers sheet (K1 split; self-kudos live
 *    since the 8/8 K2 restore — the 400 lifted 7/30 v120). 💬 display-only
 *    (own runs' comments live on the run-post own-mode);
 *  - 프로필 공유 → 준비 중 (no shareable URL yet).
 */
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import React, { useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { KudosSheet } from '@/components/kudos-sheet';
import { MiniMap } from '@/components/mini-map';
import { RealMap } from '@/components/real-map';
import { Icon } from '@/components/ui';
import { useMyPublicProfile, type MyRun } from '@/hooks/use-my-public-profile';
import { ApiError, apiFetch } from '@/lib/api';
import { distUnit, fmtDist, fmtDuration, fmtPaceIn, fmtWhen, paceUnit, timeTitle } from '@/lib/run-format';
import { radius as R, shadows, spacing as S, type Tokens, DENSE_MAX_FONT_SCALE} from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { prewarmTracks, useRunTrack } from '@/lib/track-cache';
import { useSettings } from '@/store/use-settings';
import { t, tf, useLang, useT } from '@/lib/i18n';

// Own-list visibility is never null (legacy rows = 'followers' server-side)
// key-holding (static-capture rule) — resolved at render inside the card
const VIS_CAPTION_KEY = {
  public:    'mp.visPublic',
  followers: 'mp.visFollowers',
  private:   'mp.visPrivate',
} as const;

// Reduced feed-style run card (canvas shows area/tags — no backend source
// for own runs; honest subset, tap → activity detail)
function RunCard({ run, name, photoUrl, units, mapLive, kudosOff, onKudos, onCountPress }: {
  run: MyRun; name: string; photoUrl?: string | null; units: ReturnType<typeof useSettings.getState>['settings']['units']; mapLive: boolean; kudosOff: boolean; onKudos: () => void; onCountPress: () => void }) {
  const T = useT(); // reactive anchor (name-twin card, long-lived FlatList — the 4a-now shared-card treatment)
  const lang = useLang(); // compiler-visible locale for the date/title formatters (2026-08-03 formatter-cache fix)
  const C = useTokens();
  const st = useStyles(makeSt);
  // visual-split ruling: full track when fetched, thumb while loading
  const { line: cardLine, pending: linePending } = useRunTrack(mapLive ? run.id : null, run.polyline_thumb);
  return (
    // Whole card → own-run SOCIAL view (owner correction 2026-07-12); the
    // 활동 상세 analysis screen's home is the 기록 tab — social links to it
    // via 분석 보기 inside run-post.
    <Pressable
      onPress={() => router.push({
        pathname: '/run-post' as never,
        params: { runId: run.id, own: '1', nickname: name, kudosCount: String(run.kudos_count) },
      })}
      style={[st.card, shadows.sm]}
    >
      <View style={st.cardHead}>
        <Avatar name={name} size={36} photoUrl={photoUrl} ring={C.accent} initialsRatio={0.38} upper />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.cardName}>{name}</Text>
          <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.cardDate}>{fmtWhen(run.ran_at, lang)}</Text>
          {/* 8/5 crew banner — twin grammar matching the shared RunCard.
              8/8 OWNER AMEND (the flagged judgment call exercised): the twin
              JOINS THE MIRROR — same predicate as the shared card. The
              shape-based rule: PROFILE-SHAPED surfaces mirror the stranger's
              view (an OFF run bannering here reads as "still public");
              RECORD-SHAPED surfaces (기록, 활동 상세) always know their crew. */}
          {run.crew_name && run.show_crew !== false ? (
            <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.cardCrew} numberOfLines={1}>{tf('rc.withCrew', { name: run.crew_name })}</Text>
          ) : null}
        </View>
      </View>
      {/* polyline_thumb slice: viewable + thumb → real map (card-mode, same
          perf pattern as the feed); off-screen/trackless → route-shaped or
          seed SVG per the ledger rulings */}
      {mapLive && ((cardLine && cardLine.length >= 2) || linePending) ? (
        <RealMap height={150} polyline={cardLine ?? run.polyline_thumb} lineHidden={linePending} />
      ) : (
        <MiniMap seed={run.id} height={150} polyline={cardLine ?? undefined} />
      )}
      <View style={st.cardBody}>
        <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.cardTitle}>{run.title ?? timeTitle(run.ran_at, lang)}</Text>
        <View style={st.statsRow}>
          {([
            [fmtDist(run.distance_km, units, 1), distUnit(units), T('runSave.statDist')],
            [fmtDuration(run.duration_sec), '', T('res.time')],
            [run.avg_pace_sec_per_km != null ? fmtPaceIn(run.avg_pace_sec_per_km, units) : '--', paceUnit(units), T('res.pace')],
          ] as [string, string, string][]).map(([val, unit, label], i) => (
            <View key={i} style={{ gap: 2 }}>
              <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.statVal}>
                {val}{unit ? <Text style={st.statUnit}> {unit}</Text> : null}
              </Text>
              <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.statLbl}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
      {/* Footer — K1 split, K2 RESTORED (8/8): self-kudos 400 lifted
          server-side 7/30 (v120, probed 204 + round-trip) — the ♥ is a live
          toggle with the 44pt asymmetric template; the COUNT keeps the
          likers sheet (left slop 0 — disjoint zones, the 8/4 geometry).
          💬 is display-only: own runs have no post screen (card tap →
          activity analysis covers it). */}
      <View style={st.cardFooter}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={st.kudosBtn}>
            {kudosOff ? (
              <Icon name="heart-outline" size={18} color={C.sub} />
            ) : (
              <Pressable onPress={onKudos} hitSlop={{ top: 13, bottom: 13, left: 13, right: 2 }} style={({ pressed }) => pressed ? { opacity: 0.6 } : null}>
                <Icon name={run.my_kudos ? 'heart' : 'heart-outline'} size={18} color={run.my_kudos ? C.danger : C.sub} />
              </Pressable>
            )}
            <Pressable onPress={onCountPress} hitSlop={{ top: 8, bottom: 8, left: 0, right: 8 }} style={({ pressed }) => pressed ? { opacity: 0.6 } : null}>
              <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={[st.kudosCount, !kudosOff && run.my_kudos && { color: C.danger }]}>{run.kudos_count}</Text>
            </Pressable>
          </View>
          {/* 💬 display-only — taps fall through to the card (→ social view) */}
          <View style={[st.kudosBtn, { marginLeft: 14 }]}>
            <Icon name="chatbubble-outline" size={17} color={C.sub} />
            <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.kudosCount}>{run.comment_count}</Text>
          </View>
        </View>
        <Text style={st.visCaption}>{T(VIS_CAPTION_KEY[run.visibility])}</Text>
      </View>
    </Pressable>
  );
}

// Likers sheet extracted to components/kudos-sheet.tsx (2026-07-12 — the
// own-run social view became its second consumer, per the original scoping
// note's graduation condition).

export default function MyProfileScreen() {
  const T = useT(); // reactive anchor — stack-mounted beneath 설정
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const units = useSettings(s => s.settings.units);
  const { profile, runs, loading, error, refetch } = useMyPublicProfile();
  // No-swap pre-warm (ruling ③): tracks ready before the eye lands
  useEffect(() => {
    prewarmTracks(runs.filter(r => r.polyline_thumb && r.polyline_thumb.length >= 2).map(r => r.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs.length]);
  const [kudosRun, setKudosRun] = React.useState<MyRun | null>(null);
  // K2 restore (8/8) — K1 machinery, the crew-runs pattern verbatim:
  // optimistic overlay + wholesale clear on fresh rows + per-run 403 net
  const [kudosOv, setKudosOv] = React.useState<Record<string, { on: boolean; delta: number }>>({});
  const [kudosOff403, setKudosOff403] = React.useState<Set<string>>(new Set());
  useEffect(() => { setKudosOv({}); }, [runs]); // fresh rows carry the server truth
  function toggleKudos(run: MyRun) {
    if (kudosOff403.has(run.id)) return;
    const cur = kudosOv[run.id]?.on ?? run.my_kudos;
    const next = !cur;
    setKudosOv(p => ({ ...p, [run.id]: { on: next, delta: (next ? 1 : 0) - (run.my_kudos ? 1 : 0) } }));
    apiFetch<void>(`/api/runs/${run.id}/kudos`, { method: next ? 'POST' : 'DELETE' })
      .catch((e: unknown) => {
        setKudosOv(p => ({ ...p, [run.id]: { on: run.my_kudos, delta: 0 } }));
        if (e instanceof ApiError && e.code === 'likes_disabled') {
          setKudosOff403(p => new Set(p).add(run.id));
        }
      });
  }

  // polyline_thumb slice — real-map-only-for-viewable-cells (feed pattern:
  // stable refs, 25% threshold; off-screen cells keep the SVG)
  const [liveIds, setLiveIds] = React.useState<Set<string>>(new Set());
  const viewabilityConfig = React.useRef({ itemVisiblePercentThreshold: 25 }).current;
  const onViewableItemsChanged = React.useRef(
    ({ viewableItems }: { viewableItems: { key: string }[] }) => {
      setLiveIds(new Set(viewableItems.map(v => v.key)));
    },
  ).current;

  // Refetch on focus — 프로필 편집 renames must show on return
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const header = profile && (
    <View>
      {/* Identity */}
      <View style={st.identity}>
        <Avatar name={profile.nickname} size={76} photoUrl={profile.avatarUrl} ring={C.accent} initialsRatio={0.38} upper />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.name} numberOfLines={1}>{profile.nickname}</Text>
          {/* 8/4 ruled: plain bio line (user-profile style) — the location
              pin misread beside real prose once capture shipped */}
          {profile.bio ? <Text style={[st.bioTxt, { marginTop: 5 }]} numberOfLines={1}>{profile.bio}</Text> : null}
        </View>
      </View>

      {/* Counts — 팔로잉/팔로워 tap → follow list; 활동 non-tappable */}
      <View style={st.countsRow}>
        {([
          [profile.followingCount, T('fl.tabFollowing'), 'following'],
          [profile.followerCount,  T('fl.tabFollowers'), 'followers'],
          [profile.runCount,       T('pf.activity'),   null],
        ] as [number, string, string | null][]).map(([n, label, tabParam]) => (
          <Pressable
            key={label}
            disabled={!tabParam}
            onPress={() => router.push({ pathname: '/follow-list' as any, params: { tab: tabParam! } })}
            style={st.countCell}
          >
            <Text style={st.countNum}>{n}</Text>
            <Text style={st.countLabel}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Actions */}
      <View style={st.actionsRow}>
        <Pressable
          onPress={() => router.push({ pathname: '/personal-info' as any, params: { nickname: profile.nickname } })}
          style={({ pressed }) => [st.actionBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Icon name="pencil-outline" size={15} color={C.text} />
          <Text style={st.actionTxt}>{T('mp.editProfile')}</Text>
        </Pressable>
        <Pressable
          onPress={() => Alert.alert(t('mp.comingSoon'), t('mp.shareSoon'))}
          style={({ pressed }) => [st.actionBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Icon name="share-social-outline" size={15} color={C.text} />
          <Text style={st.actionTxt}>{T('mp.shareProfile')}</Text>
        </Pressable>
      </View>

      {/* Section head — "내 러닝" + real total (no 공개 framing until
          run visibility exists server-side) */}
      <View style={st.sectionHead}>
        <Text style={st.sectionTitle}>{T('mp.myRuns')}</Text>
        <Text style={st.sectionCount}>{tf('mp.nCount', { n: profile.runCount })}</Text>
      </View>
    </View>
  );

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      {/* App bar: back · title · gear → 프로필 설정 (canvas: profileSettings) */}
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.appBarBtn}>
          <Icon name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>{T('fl.myProfile')}</Text>
        <Pressable onPress={() => router.push('/profile-settings' as any)} hitSlop={12} style={st.appBarBtn}>
          <Icon name="settings-outline" size={20} color={C.text} />
        </Pressable>
      </View>

      {loading ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : error || !profile ? (
        <View style={st.centered}>
          <Icon name="warning-outline" size={36} color={C.faint} />
          <Text style={st.stateTxt}>{error ?? T('pf.loadFail')}</Text>
          <Pressable onPress={refetch} style={st.retryBtn}><Text style={st.retryTxt}>{T('common.retry')}</Text></Pressable>
        </View>
      ) : (
        <FlatList
          data={runs}
          keyExtractor={r => r.id}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          ListHeaderComponent={header}
          renderItem={({ item }) => {
            const ov = kudosOv[item.id];
            const shown = ov ? { ...item, my_kudos: ov.on, kudos_count: item.kudos_count + ov.delta } : item;
            return (
              <View style={{ paddingHorizontal: S.gutter }}>
                <RunCard
                  run={shown}
                  name={profile.nickname}
                  photoUrl={profile.avatarUrl}
                  units={units}
                  mapLive={liveIds.has(item.id)}
                  kudosOff={item.allow_likes === false || kudosOff403.has(item.id)}
                  onKudos={() => toggleKudos(item)}
                  onCountPress={() => setKudosRun(shown)}
                />
              </View>
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          ListEmptyComponent={
            <View style={st.centered}>
              <Icon name="walk-outline" size={36} color={C.faint} />
              <Text style={st.stateTxt}>{T('mp.noRuns')}</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 36 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {kudosRun && <KudosSheet runId={kudosRun.id} kudosCount={kudosRun.kudos_count} onClose={() => setKudosRun(null)} />}
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, paddingVertical: 10 },
  appBarBtn:   { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },

  identity: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: S.gutter, paddingTop: 20 },
  name:     { fontSize: 22, fontWeight: '700', letterSpacing: -0.6, color: C.text },
  bioTxt:   { fontSize: 13.5, color: C.sub, letterSpacing: -0.2 },

  countsRow:  { flexDirection: 'row', gap: 22, paddingHorizontal: S.gutter, paddingTop: 16 },
  countCell:  { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  countNum:   { fontSize: 16, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  countLabel: { fontSize: 12.5, color: C.faint, letterSpacing: -0.2 },

  actionsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: S.gutter, paddingTop: 14 },
  actionBtn:  { flex: 1, height: 36, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionTxt:  { fontSize: 13, fontWeight: '600', color: C.text, letterSpacing: -0.2 },

  sectionHead:  { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: S.gutter, paddingTop: 24, paddingBottom: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: C.text },
  sectionCount: { fontSize: 13, color: C.faint, letterSpacing: -0.2 },

  card:      { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, overflow: 'hidden' },
  cardHead:  { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 11, paddingHorizontal: 14 },
  cardName:  { fontSize: 14, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  cardDate:  { fontSize: 11.5, color: C.faint, letterSpacing: -0.2, marginTop: 1 },
  cardCrew:  { fontSize: 11, fontWeight: '600', color: C.accentGrn, letterSpacing: -0.2, marginTop: 2 },
  cardBody:  { paddingTop: 12, paddingBottom: 14, paddingHorizontal: 14 },
  cardTitle: { fontSize: 15.5, fontWeight: '700', color: C.text, letterSpacing: -0.4, marginBottom: 9 },
  statsRow:  { flexDirection: 'row', gap: 18 },
  statVal:   { fontSize: 16, fontWeight: '700', color: C.text, letterSpacing: -0.4 },
  statUnit:  { fontSize: 11, color: C.faint, fontWeight: '600' },
  statLbl:   { fontSize: 10.5, color: C.faint, letterSpacing: -0.1 },

  // Card footer (canvas: hairline top, 8/14/12 padding)
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 12, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: C.border },
  kudosBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  kudosCount: { fontSize: 13.5, fontWeight: '700', color: C.sub, letterSpacing: -0.2 },
  visCaption: { fontSize: 11.5, color: C.faint, letterSpacing: -0.2 },

  // Likers sheet (canvas: grab bar, centered title, 68% max height)
  // (likers-sheet styles moved to components/kudos-sheet.tsx)

  centered: { alignItems: 'center', gap: 12, paddingVertical: 60 },
  stateTxt: { fontSize: 14, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: R.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  retryTxt: { fontSize: 14, fontWeight: '700', color: C.text },
});
