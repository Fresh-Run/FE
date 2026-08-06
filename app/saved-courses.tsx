/**
 * 저장된 코스들 — bookmarked courses list (canvas: FrSavedCourses in
 * run-choice.jsx). Concept per canvas = BOOKMARKS (feed-ribbon saves).
 *
 * Approved design-gap calls (2026-07-08):
 *  - tag chips dropped (routes carry no tags server-side);
 *  - region chips derived from summary keywords (canvas frRegionOf, pointed
 *    at summary — no area field);
 *  - 최신순 = server list order, 거리순 = client sort;
 *  - unsave = slide-out + undo snackbar with POST re-add (owner spec; no
 *    canvas design for the snackbar — parity-noted interim).
 * Row tap → course preview via the committed pending-course handoff.
 *
 * 내 코스 tab (2026-07-20, 코스 공개 slice — NO canvas design exists; built
 * from house grammar per the locked-showroom ruling; canvas blessing in the
 * relay): own StoredRoutes (GET /routes) + 공개/비공개 toggle (PATCH). Screen
 * title stays 저장된 코스들 (D1 — rename is a canvas question). Private-
 * account publish copy branches per the 결정-B probe: private owners' public
 * courses are excluded from 둘러보기/검색 (visible_owners) — followers-reach
 * only. Own rows run DIRECT (is_mine on the pending payload → preview skips
 * the copy).
 */
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { MiniMap } from '@/components/mini-map';
import { RealMap } from '@/components/real-map';
import { Icon } from '@/components/ui';
import { getBookmarkedRoutes } from '@/lib/bookmarks-api';
import { errorMessage } from '@/lib/error-copy';
import { getMyProfile } from '@/lib/profile-api';
import { openProfile } from '@/lib/profile-nav';
import { courseStats, fmtDuration } from '@/lib/run-format';
import {
  bookmarkRoute,
  deleteRoute,
  getMyRoutes,
  setRoutePublic,
  unbookmarkRoute,
  type PublicRoute,
  type StoredRoute,
} from '@/lib/routes-api';
import { t, tfIn, useLang, useT, type StringKey } from '@/lib/i18n';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { setPendingCourse } from '@/store/pending-course';

// ─── Filters (canvas: dist ranges + region keywords) ──────────────────────────

const REGION_KEYS = ['한강', '뚝섬', '남산', '올림픽', '양재천', '서울숲', '성수', '응봉', '중랑', '잠실', '반포', '여의도'];
/** 8/6 en-aware fold (the class audit's #1 — her lang-lane emits ENGLISH
    summaries for en users, e.g. "3.3km loop course"; the old first-word
    fallback minted garbage chips like "3.3km"). Predicate: a first-word
    fallback token is accepted ONLY if it contains at least one Hangul
    syllable (U+AC00–D7A3) — Hangul presence is the one positive signal the
    token is a Korean place-ish word; char-class whitelists fail on the
    digit/unit/latin mixes summaries actually contain. No landmark match +
    no-Hangul token → '기타' (the SENTINEL value — display resolves via
    sc.regionOther at render so a locale flip can't orphan an active filter
    selection; the region-'전체' sentinel discipline). */
function regionOf(r: { summary: string }): string {
  const s = r.summary ?? '';
  const landmark = REGION_KEYS.find(k => s.includes(k));
  if (landmark) return landmark;
  const first = s.split(/[ ·]/)[0] ?? '';
  return /[가-힣]/.test(first) ? first : '기타';
}
const DIST_RANGES: [string, number, number][] = [['~5km', 0, 5], ['5–10km', 5, 10], ['10km+', 10, 9999]];

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  return (
    <Pressable
      onPress={onPress}
      style={[st.chip, active && { backgroundColor: C.accentDim, borderColor: C.accent }]}
    >
      <Text style={[st.chipTxt, active && { color: C.accentGrn }]}>{label}</Text>
    </Pressable>
  );
}

// ─── Row (canvas: FrSavedCourseCard) ──────────────────────────────────────────

function CourseRow({ route, onOpen, onUnsave }: { route: PublicRoute; onOpen: () => void; onUnsave: () => void }) {
  const T = useT();
  const lang = useLang();
  const C = useTokens();
  const st = useStyles(makeSt);
  const s = courseStats({
    dist: route.total_distance_km,
    dur:  route.estimated_duration_min != null ? fmtDuration(route.estimated_duration_min * 60) : undefined,
    title: route.summary,
    name:  route.owner_nickname ?? undefined,
  });
  const owner = route.owner_nickname ?? T('home.runner');
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [st.row, shadows.sm, pressed && { opacity: 0.8 }]}>
      <View style={{ width: 82 }}>
        {route.polyline && route.polyline.length >= 2
          ? <RealMap height={82} borderRadius={14} polyline={route.polyline} />
          : <MiniMap seed={route.id} height={82} borderRadius={14} />}
      </View>
      <View style={{ flex: 1, minWidth: 0, paddingRight: 26 }}>
        <Text style={st.rowTitle} numberOfLines={1}>{route.summary}</Text>
        <View style={st.statsLine}>
          <Text style={st.statTxt}>{s.dist.toFixed(1)}<Text style={st.statUnit}> km</Text></Text>
          <View style={st.dot} />
          <Text style={st.statTxt}>{s.dur}</Text>
          <View style={st.dot} />
          <Text style={st.statTxt}>{s.pace}</Text>
        </View>
        {/* Owner line → profile (routing rule); falls back to plain when
            owner_id is missing */}
        <Pressable
          onPress={() => openProfile(route.owner_id, route.owner_nickname)}
          disabled={!route.owner_id}
          hitSlop={6}
          style={({ pressed }) => [st.ownerLine, pressed && { opacity: 0.7 }]}
        >
          <Avatar name={owner} size={18} photoUrl={route.owner_avatar_url} upper />
          <Text style={st.ownerTxt} numberOfLines={1}>{tfIn(lang, 'sc.ownerCourse', { name: owner })}</Text>
        </Pressable>
      </View>
      {/* filled bookmark = unsave (canvas top-right) */}
      <Pressable onPress={onUnsave} hitSlop={8} style={st.unsaveBtn}>
        <Icon name="bookmark" size={19} color={C.accentGrn} />
      </Pressable>
    </Pressable>
  );
}

// ─── 내 코스 row (no canvas design — CourseRow grammar minus owner/bookmark,
//     plus the 공개 state pill) ─────────────────────────────────────────────────

function MyCourseRow({ route, onOpen, onTogglePublic, onDelete }: {
  route: StoredRoute; onOpen: () => void; onTogglePublic: () => void; onDelete: () => void;
}) {
  const T = useT();
  const C = useTokens();
  const st = useStyles(makeSt);
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [st.row, shadows.sm, pressed && { opacity: 0.8 }]}>
      {/* 삭제 — the sibling segment's top-right icon idiom (unsaveBtn);
          destructive confirm Alert owns the cascade honesty copy */}
      <Pressable onPress={onDelete} hitSlop={8} style={st.rowDelBtn}>
        <Icon name="trash-outline" size={16} color={C.faint} />
      </Pressable>
      <View style={{ width: 82 }}>
        {route.polyline && route.polyline.length >= 2
          ? <RealMap height={82} borderRadius={14} polyline={route.polyline} />
          : <MiniMap seed={route.id} height={82} borderRadius={14} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[st.rowTitle, { flexShrink: 1 }]} numberOfLines={1}>{route.summary}</Text>
          {/* 편도 badge (is_one_way windfall rider — go-forward: pre-column
              rows were backfilled false) */}
          {route.is_one_way && (
            <View style={st.oneWayBadge}><Text style={st.oneWayTxt}>{T('sc.oneWay')}</Text></View>
          )}
        </View>
        <View style={st.statsLine}>
          <Text style={st.statTxt}>{route.total_distance_km.toFixed(1)}<Text style={st.statUnit}> km</Text></Text>
          {route.estimated_duration_min != null && (
            <>
              <View style={st.dot} />
              <Text style={st.statTxt}>{fmtDuration(Math.round(route.estimated_duration_min * 60))}</Text>
            </>
          )}
        </View>
        {/* 공개 state pill — tap toggles (confirm Alert owns the honesty copy) */}
        <Pressable onPress={onTogglePublic} hitSlop={8} style={({ pressed }) => [st.pubPill, route.is_public && st.pubPillOn, pressed && { opacity: 0.7 }]}>
          <Icon name={route.is_public ? 'globe-outline' : 'lock-closed-outline'} size={12} color={route.is_public ? C.accentGrn : C.faint} />
          <Text style={[st.pubPillTxt, route.is_public && { color: C.accentGrn }]}>{route.is_public ? T('sc.pub') : T('sc.priv')}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

type Undo = { route: PublicRoute; index: number } | null;

export default function SavedCoursesScreen() {
  const T = useT();
  const lang = useLang();
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const [tab, setTab]         = useState<'saved' | 'mine'>('saved');
  const [all, setAll]         = useState<PublicRoute[] | null>(null);
  const [error, setError]     = useState(false);
  const [mine, setMine]       = useState<StoredRoute[] | null>(null);
  const [mineError, setMineError] = useState(false);
  const [regions, setRegions] = useState<string[]>([]);
  const [dists, setDists]     = useState<string[]>([]);
  const [sort, setSort]       = useState<'recent' | 'dist'>('recent');
  const [undo, setUndo]       = useState<Undo>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Own profile (publish-copy branch + pending owner line). Silent fail →
  // null → the public-account copy (most common case; wrong only in wording
  // reach for an unfetchable private profile — disclosed trade-off).
  const [me, setMe] = useState<{ nickname: string; visibility: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    getMyProfile()
      .then(p => { if (!cancelled) setMe({ nickname: p.nickname, visibility: p.visibility }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const load = useCallback(async () => {
    setError(false);
    try {
      setAll(await getBookmarkedRoutes());
    } catch {
      setError(true);
    }
  }, []);
  const loadMine = useCallback(async () => {
    setMineError(false);
    try {
      setMine(await getMyRoutes());
    } catch {
      setMineError(true);
    }
  }, []);
  // Focus-refetch: returning from feed/preview/generation re-syncs both lanes
  // (bookmark changes; freshly generated routes appearing in 내 코스)
  useFocusEffect(useCallback(() => { load(); loadMine(); }, [load, loadMine]));

  function dismissUndo() {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = null;
    setUndo(null);
  }

  function onUnsave(route: PublicRoute) {
    if (!all) return;
    const index = all.findIndex(r => r.id === route.id);
    setAll(all.filter(r => r.id !== route.id)); // optimistic slide-out
    dismissUndo();
    unbookmarkRoute(route.id).catch(() => {
      setAll(prev => {
        const next = [...(prev ?? [])];
        next.splice(Math.min(index, next.length), 0, route);
        return next;
      });
      Alert.alert(t('sc.unsaveFailT'), t('sc.unsaveFailB'));
    });
    setUndo({ route, index });
    undoTimer.current = setTimeout(() => setUndo(null), 4000);
  }

  function onUndo() {
    if (!undo) return;
    const { route, index } = undo;
    dismissUndo();
    setAll(prev => {
      const next = [...(prev ?? [])];
      next.splice(Math.min(index, next.length), 0, route); // optimistic re-add
      return next;
    });
    bookmarkRoute(route.id).catch(() => {
      setAll(prev => (prev ?? []).filter(r => r.id !== route.id));
      Alert.alert(t('sc.undoFailT'), t('sc.undoFailB'));
    });
  }

  function onOpen(route: PublicRoute) {
    setPendingCourse(route);
    router.push('/(course)/preview' as any);
  }

  // 내 코스 → preview handoff: StoredRoute → PublicRoute shape, is_mine=true
  // (drives preview's direct-run branch — no copy for own routes, D3).
  function onOpenMine(r: StoredRoute) {
    setPendingCourse({
      id: r.id,
      created_at: r.created_at,
      owner_id: r.user_id,
      summary: r.summary,
      total_distance_km: r.total_distance_km,
      estimated_duration_min: r.estimated_duration_min,
      start_lat: r.polyline?.[0]?.lat ?? null,
      start_lng: r.polyline?.[0]?.lng ?? null,
      polyline: r.polyline,
      is_mine: true,
      owner_nickname: me?.nickname ?? null,
      owner_avatar_url: null,
      copy_count: 0,
      like_count: 0,
      is_liked: false,
      comment_count: 0,
    });
    router.push('/(course)/preview' as any);
  }

  // 코스 삭제 (item-4 slice, guide 2026-07-21) — destructive confirm Alert;
  // cascade copy verbatim + the linked-runs-survive line (guide-sanctioned).
  // Removal is request-then-remove (no optimistic row kill on a hard delete).
  function onDeleteMine(r: StoredRoute) {
    Alert.alert(
      t('sc.delAsk'),
      t('sc.delBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('sc.delCta'),
          style: 'destructive',
          onPress: () => {
            deleteRoute(r.id)
              .then(() => setMine(prev => (prev ?? []).filter(x => x.id !== r.id)))
              .catch((e: unknown) =>
                Alert.alert(t('annd.delFailT'), errorMessage(e)));
          },
        },
      ],
    );
  }

  // 공개/비공개 toggle — confirm Alert carries the honesty copy (D2 ruling +
  // 결정-B probe: private accounts' public courses are excluded from
  // 둘러보기/검색, followers-reach only).
  function onTogglePublic(r: StoredRoute) {
    const publishing = !r.is_public;
    const privateAcct = me?.visibility === 'private';
    Alert.alert(
      publishing ? t('sc.pubAsk') : t('sc.privAsk'),
      publishing
        ? (privateAcct ? t('sc.pubBodyLocked') : t('sc.pubBody'))
        : t('sc.privBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: publishing ? t('sc.pubCta') : t('sc.privCta'),
          onPress: () => {
            setRoutePublic(r.id, publishing)
              .then(updated => setMine(prev => (prev ?? []).map(x => (x.id === updated.id ? updated : x))))
              .catch((e: unknown) =>
                Alert.alert(publishing ? t('sc.pubFailT') : t('sc.privFailT'), errorMessage(e)));
          },
        },
      ],
    );
  }

  const activeAll = tab === 'saved' ? all : mine;
  // 8/6 degenerate-case rule (audit item 2): the region chip row renders
  // only with ≥2 REAL (non-기타) regions — a filter offering one meaningless
  // chip is worse than no filter. 기타 itself appears only alongside real
  // choices (as the remainder bucket), never alone.
  const regionOptsAll = [...new Set((activeAll ?? []).map(regionOf))];
  const realRegions = regionOptsAll.filter(rg => rg !== '기타');
  const regionOpts = realRegions.length >= 2 ? regionOptsAll : [];
  const anyFilter = regions.length > 0 || dists.length > 0;
  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>, arr: string[], v: string) =>
    setter(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  const clearFilters = () => { setRegions([]); setDists([]); };

  // One filter/sort pipeline, both tabs (region keys read summary; both row
  // types carry summary + total_distance_km)
  function applyFilters<T extends { summary: string; total_distance_km: number }>(rows: T[]): T[] {
    let out = rows.filter(r => {
      if (regions.length && !regions.includes(regionOf(r))) return false;
      if (dists.length) {
        const d = r.total_distance_km;
        if (!dists.some(l => { const rng = DIST_RANGES.find(x => x[0] === l)!; return d >= rng[1] && d < rng[2]; })) return false;
      }
      return true;
    });
    if (sort === 'dist') out = [...out].sort((a, b) => a.total_distance_km - b.total_distance_km);
    return out;
  }
  const list = applyFilters(all ?? []);
  const mineList = applyFilters(mine ?? []);
  const activeCount = tab === 'saved' ? list.length : mineList.length;

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.appBarBtn}>
          <Icon name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>{T('sc.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tab segment — 저장된 코스 | 내 코스 (house pill grammar; no canvas
          design for 내 코스, per the ledgered divergence) */}
      <View style={st.tabRow}>
        <View style={st.tabSeg}>
          {([['saved', 'sc.tabSaved'], ['mine', 'sc.tabMine']] as [('saved' | 'mine'), StringKey][]).map(([v, l]) => (
            <Pressable key={v} onPress={() => setTab(v)} style={[st.tabBtn, tab === v && [st.sortBtnOn, shadows.sm]]}>
              <Text style={[st.tabTxt, tab === v && { color: C.text }]}>{T(l)}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {activeAll !== null && activeAll.length > 0 && (
        <View style={st.filterHead}>
          <View style={st.sortRow}>
            <View style={st.sortSeg}>
              {([['recent', 'sc.sortRecent'], ['dist', 'sc.sortDist']] as [('recent' | 'dist'), StringKey][]).map(([v, l]) => (
                <Pressable key={v} onPress={() => setSort(v)} style={[st.sortBtn, sort === v && [st.sortBtnOn, shadows.sm]]}>
                  <Text style={[st.sortTxt, sort === v && { color: C.text }]}>{T(l)}</Text>
                </Pressable>
              ))}
            </View>
            {anyFilter ? (
              <Pressable onPress={clearFilters} hitSlop={8} style={st.clearBtn}>
                <Icon name="close" size={14} color={C.danger} />
                <Text style={st.clearTxt}>{T('sc.reset')}</Text>
              </Pressable>
            ) : (
              <Text style={st.countTxt}>{tfIn(lang, 'sc.nCount', { n: activeCount })}</Text>
            )}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chipsRow}>
            {DIST_RANGES.map(([l]) => (
              <Chip key={l} label={l} active={dists.includes(l)} onPress={() => toggle(setDists, dists, l)} />
            ))}
            {regionOpts.length > 0 && <View style={st.chipDivider} />}
            {regionOpts.map(rg => (
              <Chip key={rg} label={rg === '기타' ? T('sc.regionOther') : rg} active={regions.includes(rg)} onPress={() => toggle(setRegions, regions, rg)} />
            ))}
          </ScrollView>
        </View>
      )}

      {tab === 'saved' ? (
        all === null && !error ? (
          <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
        ) : error ? (
          <View style={st.centered}>
            <Icon name="warning-outline" size={36} color={C.faint} />
            <Text style={st.stateTxt}>{T('sc.loadFail')}</Text>
            <Pressable onPress={load} style={st.retryBtn}><Text style={st.retryTxt}>{T('common.retry')}</Text></Pressable>
          </View>
        ) : (all ?? []).length === 0 ? (
          <View style={st.emptyCard}>
            <View style={st.emptyIcon}><Icon name="bookmark-outline" size={24} color={C.faint} /></View>
            <Text style={st.emptyTxt}>{T('sc.emptySaved')}</Text>
          </View>
        ) : list.length === 0 ? (
          <View style={st.centered}>
            <View style={st.emptyIcon}><Icon name="locate-outline" size={24} color={C.faint} /></View>
            <Text style={st.stateTxt}>{T('sc.noMatch')}</Text>
            <Pressable onPress={clearFilters} style={st.filterResetBtn}>
              <Text style={st.filterResetTxt}>{T('sc.filterReset')}</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={list}
            keyExtractor={r => r.id}
            renderItem={({ item }) => (
              <CourseRow route={item} onOpen={() => onOpen(item)} onUnsave={() => onUnsave(item)} />
            )}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            contentContainerStyle={{ padding: S.gutter, paddingTop: 14, paddingBottom: 90 }}
            showsVerticalScrollIndicator={false}
          />
        )
      ) : (
        mine === null && !mineError ? (
          <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
        ) : mineError ? (
          <View style={st.centered}>
            <Icon name="warning-outline" size={36} color={C.faint} />
            <Text style={st.stateTxt}>{T('sc.loadFailMine')}</Text>
            <Pressable onPress={loadMine} style={st.retryBtn}><Text style={st.retryTxt}>{T('common.retry')}</Text></Pressable>
          </View>
        ) : (mine ?? []).length === 0 ? (
          <View style={st.emptyCard}>
            <View style={st.emptyIcon}><Icon name="sparkles-outline" size={24} color={C.faint} /></View>
            <Text style={st.emptyTxt}>{T('sc.emptyMine')}</Text>
            <Pressable onPress={() => router.push('/(course)/create' as any)} style={st.filterResetBtn}>
              <Text style={st.filterResetTxt}>{T('sc.makeAi')}</Text>
            </Pressable>
          </View>
        ) : mineList.length === 0 ? (
          <View style={st.centered}>
            <View style={st.emptyIcon}><Icon name="locate-outline" size={24} color={C.faint} /></View>
            <Text style={st.stateTxt}>{T('sc.noMatch')}</Text>
            <Pressable onPress={clearFilters} style={st.filterResetBtn}>
              <Text style={st.filterResetTxt}>{T('sc.filterReset')}</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={mineList}
            keyExtractor={r => r.id}
            renderItem={({ item }) => (
              <MyCourseRow route={item} onOpen={() => onOpenMine(item)} onTogglePublic={() => onTogglePublic(item)} onDelete={() => onDeleteMine(item)} />
            )}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            contentContainerStyle={{ padding: S.gutter, paddingTop: 14, paddingBottom: 90 }}
            showsVerticalScrollIndicator={false}
          />
        )
      )}

      {/* Undo snackbar — owner-spec interim, no canvas design (parity-noted).
          Saved tab only (unsave lives there). */}
      {undo && tab === 'saved' && (
        <View style={[st.snackbar, shadows.sm, { bottom: insets.bottom + 18 }]}>
          <Text style={st.snackTxt} numberOfLines={1}>{T('sc.unsaved')}</Text>
          <Pressable onPress={onUndo} hitSlop={10}>
            <Text style={st.snackUndo}>{T('sc.undo')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, paddingVertical: 10 },
  appBarBtn:   { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },

  // Tab segment (house pill grammar, full-width variant)
  tabRow: { paddingHorizontal: S.gutter, paddingTop: 2, paddingBottom: 8 },
  tabSeg: { flexDirection: 'row', gap: 3, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: 999, padding: 3 },
  tabBtn: { flex: 1, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  tabTxt: { fontSize: 13, fontWeight: '700', color: C.faint, letterSpacing: -0.3 },

  // 공개 state pill (내 코스 rows)
  pubPill:    { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 9, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceAlt },
  pubPillOn:  { borderColor: C.accent + '66', backgroundColor: C.accentDim },
  pubPillTxt: { fontSize: 11.5, fontWeight: '700', color: C.faint, letterSpacing: -0.2 },
  oneWayBadge: { backgroundColor: C.blue + '18', borderWidth: 1, borderColor: C.blue + '44', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  oneWayTxt:   { fontSize: 10, fontWeight: '800', color: C.blue, letterSpacing: -0.1 },

  filterHead: { borderBottomWidth: 1, borderBottomColor: C.border },
  sortRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S.gutter, paddingTop: 4 },
  sortSeg:    { flexDirection: 'row', gap: 3, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: 999, padding: 3 },
  sortBtn:    { height: 28, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  sortBtnOn:  { backgroundColor: C.surface },
  sortTxt:    { fontSize: 12.5, fontWeight: '700', color: C.faint, letterSpacing: -0.2 },
  clearBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  clearTxt:   { fontSize: 12.5, fontWeight: '700', color: C.danger, letterSpacing: -0.2 },
  countTxt:   { fontSize: 12.5, fontWeight: '600', color: C.faint },
  chipsRow:   { gap: 8, paddingHorizontal: S.gutter, paddingVertical: 12 },
  chip:       { height: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  chipTxt:    { fontSize: 13, fontWeight: '700', color: C.sub, letterSpacing: -0.2 },
  chipDivider: { width: 1, backgroundColor: C.border, marginVertical: 4 },

  row:      { flexDirection: 'row', gap: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 12 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.4 },
  statsLine: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  statTxt:   { fontSize: 13, fontWeight: '700', color: C.text, letterSpacing: -0.2 },
  statUnit:  { fontSize: 10, color: C.faint, fontWeight: '600' },
  dot:       { width: 3, height: 3, borderRadius: 2, backgroundColor: C.border },
  ownerLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9 },
  ownerTxt:  { fontSize: 11.5, color: C.faint, letterSpacing: -0.2, flexShrink: 1 },
  unsaveBtn: { position: 'absolute', top: 10, right: 10, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  // 내 코스 삭제 — unsaveBtn's top-right idiom on the mine segment
  rowDelBtn: { position: 'absolute', top: 10, right: 10, width: 30, height: 30, alignItems: 'center', justifyContent: 'center', zIndex: 1 },

  emptyCard: { margin: S.gutter, alignItems: 'center', gap: 13, backgroundColor: C.surfaceAlt, borderWidth: 1, borderStyle: 'dashed', borderColor: C.border, borderRadius: 18, paddingVertical: 28, paddingHorizontal: 24 },
  emptyIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  emptyTxt:  { fontSize: 13.5, lineHeight: 21, color: C.sub, letterSpacing: -0.2, textAlign: 'center' },

  filterResetBtn: { height: 42, paddingHorizontal: 20, borderRadius: 999, borderWidth: 1.5, borderColor: C.accent, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  filterResetTxt: { fontSize: 13.5, fontWeight: '700', color: C.accentGrn, letterSpacing: -0.2 },

  snackbar: { position: 'absolute', left: S.gutter, right: S.gutter, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: C.text, borderRadius: R.md, paddingVertical: 13, paddingHorizontal: 16 },
  snackTxt:  { flex: 1, fontSize: 13.5, fontWeight: '600', color: C.bg, letterSpacing: -0.2 },
  snackUndo: { fontSize: 13.5, fontWeight: '800', color: C.accent, letterSpacing: -0.2 },

  centered: { alignItems: 'center', gap: 12, paddingVertical: 60 },
  stateTxt: { fontSize: 14, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: R.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  retryTxt: { fontSize: 14, fontWeight: '700', color: C.text },
});
