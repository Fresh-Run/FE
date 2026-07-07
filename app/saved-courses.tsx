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
 */
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
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

import { MiniMap } from '@/components/mini-map';
import { Icon } from '@/components/ui';
import { avatarBg } from '@/lib/fr-hash';
import { getBookmarkedRoutes } from '@/lib/bookmarks-api';
import { openProfile } from '@/lib/profile-nav';
import { courseStats, fmtDuration } from '@/lib/run-format';
import { bookmarkRoute, unbookmarkRoute, type PublicRoute } from '@/lib/routes-api';
import { colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';
import { setPendingCourse } from '@/store/pending-course';

// ─── Filters (canvas: dist ranges + region keywords) ──────────────────────────

const REGION_KEYS = ['한강', '뚝섬', '남산', '올림픽', '양재천', '서울숲', '성수', '응봉', '중랑', '잠실', '반포', '여의도'];
function regionOf(r: PublicRoute): string {
  const s = r.summary ?? '';
  return REGION_KEYS.find(k => s.includes(k)) ?? s.split(/[ ·]/)[0] ?? '기타';
}
const DIST_RANGES: [string, number, number][] = [['~5km', 0, 5], ['5–10km', 5, 10], ['10km+', 10, 9999]];

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
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
  const s = courseStats({
    dist: route.total_distance_km,
    dur:  route.estimated_duration_min != null ? fmtDuration(route.estimated_duration_min * 60) : undefined,
    title: route.summary,
    name:  route.owner_nickname ?? undefined,
  });
  const owner = route.owner_nickname ?? '러너';
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [st.row, shadows.sm, pressed && { opacity: 0.8 }]}>
      <View style={{ width: 82 }}>
        <MiniMap seed={route.id} height={82} borderRadius={14} polyline={route.polyline ?? undefined} />
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
          <View style={[st.ownerAvatar, { backgroundColor: avatarBg(owner) }]}>
            <Text style={st.ownerAvatarTxt}>{owner.trim()[0]?.toUpperCase() ?? '?'}</Text>
          </View>
          <Text style={st.ownerTxt} numberOfLines={1}>{owner} 코스</Text>
        </Pressable>
      </View>
      {/* filled bookmark = unsave (canvas top-right) */}
      <Pressable onPress={onUnsave} hitSlop={8} style={st.unsaveBtn}>
        <Icon name="bookmark" size={19} color={C.accentGrn} />
      </Pressable>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

type Undo = { route: PublicRoute; index: number } | null;

export default function SavedCoursesScreen() {
  const insets = useSafeAreaInsets();
  const [all, setAll]         = useState<PublicRoute[] | null>(null);
  const [error, setError]     = useState(false);
  const [regions, setRegions] = useState<string[]>([]);
  const [dists, setDists]     = useState<string[]>([]);
  const [sort, setSort]       = useState<'recent' | 'dist'>('recent');
  const [undo, setUndo]       = useState<Undo>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      setAll(await getBookmarkedRoutes());
    } catch {
      setError(true);
    }
  }, []);
  // Focus-refetch: returning from feed/preview re-syncs bookmark changes
  useFocusEffect(useCallback(() => { load(); }, [load]));

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
      Alert.alert('해제 실패', '저장 해제에 실패했어요. 잠시 후 다시 시도해 주세요.');
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
      Alert.alert('되돌리기 실패', '다시 저장하지 못했어요. 피드에서 다시 북마크해 주세요.');
    });
  }

  function onOpen(route: PublicRoute) {
    setPendingCourse(route);
    router.push('/(course)/preview' as any);
  }

  const regionOpts = [...new Set((all ?? []).map(regionOf))];
  const anyFilter = regions.length > 0 || dists.length > 0;
  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>, arr: string[], v: string) =>
    setter(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  const clearFilters = () => { setRegions([]); setDists([]); };

  let list = (all ?? []).filter(r => {
    if (regions.length && !regions.includes(regionOf(r))) return false;
    if (dists.length) {
      const d = r.total_distance_km;
      if (!dists.some(l => { const rng = DIST_RANGES.find(x => x[0] === l)!; return d >= rng[1] && d < rng[2]; })) return false;
    }
    return true;
  });
  if (sort === 'dist') list = [...list].sort((a, b) => a.total_distance_km - b.total_distance_km);

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.appBarBtn}>
          <Icon name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>저장된 코스들</Text>
        <View style={{ width: 40 }} />
      </View>

      {all !== null && all.length > 0 && (
        <View style={st.filterHead}>
          <View style={st.sortRow}>
            <View style={st.sortSeg}>
              {([['recent', '최신순'], ['dist', '거리순']] as const).map(([v, l]) => (
                <Pressable key={v} onPress={() => setSort(v)} style={[st.sortBtn, sort === v && [st.sortBtnOn, shadows.sm]]}>
                  <Text style={[st.sortTxt, sort === v && { color: C.text }]}>{l}</Text>
                </Pressable>
              ))}
            </View>
            {anyFilter ? (
              <Pressable onPress={clearFilters} hitSlop={8} style={st.clearBtn}>
                <Icon name="close" size={14} color={C.danger} />
                <Text style={st.clearTxt}>초기화</Text>
              </Pressable>
            ) : (
              <Text style={st.countTxt}>{list.length}개</Text>
            )}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chipsRow}>
            {DIST_RANGES.map(([l]) => (
              <Chip key={l} label={l} active={dists.includes(l)} onPress={() => toggle(setDists, dists, l)} />
            ))}
            {regionOpts.length > 0 && <View style={st.chipDivider} />}
            {regionOpts.map(rg => (
              <Chip key={rg} label={rg} active={regions.includes(rg)} onPress={() => toggle(setRegions, regions, rg)} />
            ))}
          </ScrollView>
        </View>
      )}

      {all === null && !error ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : error ? (
        <View style={st.centered}>
          <Icon name="warning-outline" size={36} color={C.faint} />
          <Text style={st.stateTxt}>저장된 코스를 불러올 수 없어요</Text>
          <Pressable onPress={load} style={st.retryBtn}><Text style={st.retryTxt}>다시 시도</Text></Pressable>
        </View>
      ) : (all ?? []).length === 0 ? (
        <View style={st.emptyCard}>
          <View style={st.emptyIcon}><Icon name="bookmark-outline" size={24} color={C.faint} /></View>
          <Text style={st.emptyTxt}>아직 저장된 코스가 없어요.{'\n'}피드에서 마음에 드는 코스를 북마크해보세요.</Text>
        </View>
      ) : list.length === 0 ? (
        <View style={st.centered}>
          <View style={st.emptyIcon}><Icon name="locate-outline" size={24} color={C.faint} /></View>
          <Text style={st.stateTxt}>조건에 맞는 코스가 없어요.</Text>
          <Pressable onPress={clearFilters} style={st.filterResetBtn}>
            <Text style={st.filterResetTxt}>필터 초기화</Text>
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
      )}

      {/* Undo snackbar — owner-spec interim, no canvas design (parity-noted) */}
      {undo && (
        <View style={[st.snackbar, shadows.sm, { bottom: insets.bottom + 18 }]}>
          <Text style={st.snackTxt} numberOfLines={1}>코스 저장을 해제했어요</Text>
          <Pressable onPress={onUndo} hitSlop={10}>
            <Text style={st.snackUndo}>되돌리기</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, paddingVertical: 10 },
  appBarBtn:   { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },

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
  ownerAvatar:    { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  ownerAvatarTxt: { fontSize: 8, fontWeight: '700', color: '#fff' },
  ownerTxt:  { fontSize: 11.5, color: C.faint, letterSpacing: -0.2, flexShrink: 1 },
  unsaveBtn: { position: 'absolute', top: 10, right: 10, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },

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
