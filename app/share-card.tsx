/**
 * 셰어 카드 컴포저 — Slice 1: the JS core (owner rulings 2026-07-24; the
 * split-lane build — export's native half rides build 8).
 *
 * Doors (both land HERE): run-result's 성과 공유하기 (upgraded from
 * text-share) · 활동 상세's new header share button.
 *
 * Rulings embodied:
 *  - Canvas: house DARK-FIXTURE gradients/solids as default (night-canvas
 *    family — white ink + lime line always legible by construction) + the
 *    run's OWN PHOTOS as the hero lane (signed URLs, used directly, never
 *    cached — contract). Format toggle 1:1 / 9:16.
 *  - Route = DRAGGABLE SVG LAYER: MiniMap's normalize math, pan/pinch/rotate
 *    via gesture-handler + Reanimated, house lime stroke.
 *  - Metrics: ruled enumeration (고도 EXCLUDED — privacy-null); selection
 *    persisted (@fr_share_prefs, AsyncStorage v1).
 *  - Wordmark default-ON with off toggle (organic growth, canvas ownership).
 *  - HONEST NO-EXPORT interim (stated adaptation): 텍스트로 공유 stays the
 *    WORKING primary action; 이미지 저장 renders disabled with the honest
 *    caption — the button is never a dead end.
 *
 * V2 (owner expansion 2026-07-24):
 *  - 앨범에서 선택 joins the bg picker (expo-image-picker — already in tree,
 *    the avatar/run-photo lane; pure JS).
 *  - FREE-PLACED METRICS: each enabled metric is its OWN draggable layer
 *    (drag + pinch, NO rotation — rotated text is a regret) — the
 *    story-editor grammar; placement persists as canvas FRACTIONS so
 *    format flips keep relative positions. Fully free, no snap (v2 call).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { Icon } from '@/components/ui';
import { useRunDetail } from '@/hooks/use-runs';
import { useRunTrack } from '@/lib/track-cache';
import { distUnit, fmtDist, fmtDuration, fmtPaceIn, paceUnit, timeTitle } from '@/lib/run-format';
import { routeStroke } from '@/lib/theme';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useSettings } from '@/store/use-settings';
import type { Coordinate } from '@/types';

// ─── Prefs (persisted metric selection — v1 local; settings.share later) ─────

export type ShareMetricKey = 'dist' | 'pace' | 'time';
type MetricPlacement = { x: number; y: number; s: number }; // x/y = canvas fractions, s = scale
type SharePrefs = {
  metrics: Record<ShareMetricKey, boolean>;
  format: '1:1' | '9:16';
  wordmark: boolean;
  /** v2 free-placement — absent keys fall to the default stack (merge-safe) */
  placements?: Partial<Record<ShareMetricKey, MetricPlacement>>;
};
const PREFS_KEY = '@fr_share_prefs';
const DEFAULT_PREFS: SharePrefs = {
  // Owner trim 2026-07-24: exactly three — 거리·평균 페이스·시간. The old
  // keys (best/splits/kcal/date) live on inert in stale stored blobs (the
  // merge keeps them; nothing reads them) — v2 candidates, ledgered.
  metrics: { dist: true, pace: true, time: true },
  format: '9:16',
  wordmark: true,
};
const METRIC_LABELS: Record<ShareMetricKey, string> = {
  dist: '거리', pace: '평균 페이스', time: '시간',
};
// default stack ≈ the old bottom-left block (canvas fractions)
const DEFAULT_PLACEMENT: Record<ShareMetricKey, MetricPlacement> = {
  dist: { x: 0.06, y: 0.60, s: 1 },
  pace: { x: 0.06, y: 0.73, s: 1 },
  time: { x: 0.06, y: 0.86, s: 1 },
};

// ─── Backgrounds — dark-fixture house family (night-canvas precedent) ─────────

type Bg =
  | { kind: 'gradient'; colors: [string, string]; label: string }
  | { kind: 'solid'; color: string; label: string }
  | { kind: 'photo'; url: string };
const HOUSE_BGS: Bg[] = [
  { kind: 'gradient', colors: ['#0C1206', '#1E3A0F'], label: '심야 러닝' },
  { kind: 'gradient', colors: ['#0C0F14', '#1B2430'], label: '나이트 시티' },
  { kind: 'solid', color: '#0C0F14', label: '블랙' },
  { kind: 'solid', color: '#15171C', label: '차콜' },
];

// ─── Route → SVG path (MiniMap's normalize math, verbatim shape) ─────────────

function routePath(polyline: Coordinate[], size: number, pad: number): { d: string; start: [number, number]; end: [number, number] } | null {
  if (polyline.length < 2) return null;
  const lats = polyline.map(c => c.lat);
  const lngs = polyline.map(c => c.lng);
  const minLat = Math.min(...lats), latR = (Math.max(...lats) - minLat) || 0.001;
  const minLng = Math.min(...lngs), lngR = (Math.max(...lngs) - minLng) || 0.001;
  const px = (c: Coordinate) => pad + ((c.lng - minLng) / lngR) * (size - 2 * pad);
  const py = (c: Coordinate) => size - pad - ((c.lat - minLat) / latR) * (size - 2 * pad);
  const d = polyline.map((c, i) => `${i === 0 ? 'M' : 'L'} ${px(c).toFixed(1)} ${py(c).toFixed(1)}`).join(' ');
  const first = polyline[0], last = polyline[polyline.length - 1];
  return { d, start: [px(first), py(first)], end: [px(last), py(last)] };
}

// ─── Free-placed metric layer (v2) — drag + pinch, NO rotation ───────────────
// One hook instance per metric (fixed count of 3 — hooks stay unconditional).
// Position lives in shared values (px), persists as canvas FRACTIONS on
// gesture end; canvas-dim changes (format flip) re-derive px from fractions.

function useMetricLayer(
  key: ShareMetricKey,
  canvasW: number,
  canvasH: number,
  stored: MetricPlacement | undefined,
  persist: (key: ShareMetricKey, p: MetricPlacement) => void,
) {
  const base = stored ?? DEFAULT_PLACEMENT[key];
  const tx = useSharedValue(base.x * canvasW);
  const ty = useSharedValue(base.y * canvasH);
  const sc = useSharedValue(base.s);
  // reposition on hydrate/format-flip (fractions are the truth)
  useEffect(() => {
    tx.value = base.x * canvasW;
    ty.value = base.y * canvasH;
    sc.value = base.s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasW, canvasH, stored]);
  const gesture = useMemo(() => {
    const end = () => {
      'worklet';
      runOnJS(persist)(key, { x: tx.value / canvasW, y: ty.value / canvasH, s: sc.value });
    };
    return Gesture.Simultaneous(
      Gesture.Pan().onChange(e => { tx.value += e.changeX; ty.value += e.changeY; }).onEnd(end),
      Gesture.Pinch().onChange(e => { sc.value *= e.scaleChange; }).onEnd(end),
    );
  }, [key, canvasW, canvasH, persist, tx, ty, sc]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: sc.value }],
  }));
  return { gesture, style };
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ShareCardScreen() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const { runId } = useLocalSearchParams<{ runId: string }>();
  const { run } = useRunDetail(runId ?? null);
  const units = useSettings(s => s.settings.units);
  const { line } = useRunTrack(run?.id ?? null, run?.polyline_thumb);
  const routeLine = line ?? run?.polyline_thumb ?? null;

  // ── prefs (hydrate once; every change persists) ─────────────────────────────
  const [prefs, setPrefs] = useState<SharePrefs>(DEFAULT_PREFS);
  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY)
      .then(raw => {
        if (!raw) return;
        const p = JSON.parse(raw) as Partial<SharePrefs>;
        setPrefs({ ...DEFAULT_PREFS, ...p, metrics: { ...DEFAULT_PREFS.metrics, ...(p.metrics ?? {}) } });
      })
      .catch(() => { /* defaults stand */ });
  }, []);
  const save = (next: SharePrefs) => {
    setPrefs(next);
    AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => {});
  };

  // ── background selection (session-local — the photo set is per-run) ────────
  const photos = run?.photos ?? [];
  const bgs: Bg[] = useMemo(
    () => [...photos.map(url => ({ kind: 'photo' as const, url })), ...HOUSE_BGS],
    // photos are signed URLs (1h) — identity by index is fine for a session
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [photos.length],
  );
  const [bgIdx, setBgIdx] = useState(0);
  // 앨범에서 선택 (v2 lane 1 — expo-image-picker already in tree, the
  // avatar/run-photo lane; session-local like the run photos)
  const [albumBgs, setAlbumBgs] = useState<Bg[]>([]);
  const allBgs = useMemo(() => [...albumBgs, ...bgs], [albumBgs, bgs]);
  const pickAlbumBg = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 1 });
      const uri = res.assets?.[0]?.uri;
      if (!uri) return;
      setAlbumBgs(prev => [{ kind: 'photo', url: uri }, ...prev]);
      setBgIdx(0); // the fresh pick leads and selects
    } catch { /* picker dismissed/denied — nothing changes */ }
  };
  const bg = allBgs[Math.min(bgIdx, allBgs.length - 1)];

  // ── canvas geometry — fit the format inside the viewport ────────────────────
  const maxW = winW - S.gutter * 2;
  const maxH = winH * 0.52;
  const ratio = prefs.format === '1:1' ? 1 : 16 / 9;
  const canvasW = Math.min(maxW, maxH / ratio);
  const canvasH = canvasW * ratio;

  // ── the draggable route layer ───────────────────────────────────────────────
  const layerSize = Math.round(canvasW * 0.72);
  const route = useMemo(
    () => (routeLine ? routePath(routeLine, layerSize, 10) : null),
    [routeLine, layerSize],
  );
  const stroke = routeStroke('dark'); // the house lime — legible on the dark-fixture canvas AND photos
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sc = useSharedValue(1);
  const rot = useSharedValue(0);
  const gesture = useMemo(() => Gesture.Simultaneous(
    Gesture.Pan().onChange(e => { tx.value += e.changeX; ty.value += e.changeY; }),
    Gesture.Pinch().onChange(e => { sc.value *= e.scaleChange; }),
    Gesture.Rotation().onChange(e => { rot.value += e.rotationChange; }),
  ), [tx, ty, sc, rot]);
  const layerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: sc.value },
      { rotateZ: `${rot.value}rad` },
    ],
  }));

  // v2 free-placed metric layers — fixed three (hooks unconditional; the
  // toggle hides the RENDER, never the hook)
  const persistPlacement = useMemo(() => (key: ShareMetricKey, p: MetricPlacement) => {
    setPrefs(prev => {
      const next = { ...prev, placements: { ...(prev.placements ?? {}), [key]: p } };
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);
  const distLayer = useMetricLayer('dist', canvasW, canvasH, prefs.placements?.dist, persistPlacement);
  const paceLayer = useMetricLayer('pace', canvasW, canvasH, prefs.placements?.pace, persistPlacement);
  const timeLayer = useMetricLayer('time', canvasW, canvasH, prefs.placements?.time, persistPlacement);
  const layerFor = { dist: distLayer, pace: paceLayer, time: timeLayer } as const;

  if (!run) return <View style={st.root} />;

  // ── metric values — the ruled three. 시간 = SINGLE 총 시간 (owner lean
  // adopted: the stranger reading a story understands wall time; the
  // moving·총 pair is analysis-grade and lives on 활동 상세). 페이스 keeps
  // the moving-based VALUE (fallback-chained) — the honest average.
  const avgPace = run.moving_sec != null && run.distance_km > 0
    ? Math.round(run.moving_sec / run.distance_km)
    : run.avg_pace_sec_per_km;
  const title = run.title ?? timeTitle(run.ran_at);
  const rows: [ShareMetricKey, string, string][] = [];
  if (prefs.metrics.dist) rows.push(['dist', `${fmtDist(run.distance_km, units, 2)}${distUnit(units)}`, '거리']);
  if (prefs.metrics.pace && avgPace != null) rows.push(['pace', `${fmtPaceIn(avgPace, units)}${paceUnit(units)}`, '평균 페이스']);
  if (prefs.metrics.time) rows.push(['time', fmtDuration(run.duration_sec), '시간']);

  const shareText = () => {
    const parts = [
      `${title} — FreshRun`,
      rows.map(([, v, l]) => `${l} ${v}`).join(' · '),
    ].filter(Boolean);
    Share.share({ message: parts.join('\n') }).catch(() => { /* dismissed */ });
  };

  return (
    <GestureHandlerRootView style={st.root}>
      {/* ── header ── */}
      <View style={[st.header, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.hBtn}>
          <Icon name="close" size={20} color={C.text} />
        </Pressable>
        <Text style={st.hTitle}>공유 카드</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {/* ── THE CARD ── */}
        <View style={st.canvasWrap}>
          <View style={[st.canvas, { width: canvasW, height: canvasH }]}>
            {bg.kind === 'photo' && <Image source={{ uri: bg.url }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />}
            {bg.kind === 'gradient' && <LinearGradient colors={bg.colors} style={StyleSheet.absoluteFillObject} />}
            {bg.kind === 'solid' && <View style={[StyleSheet.absoluteFillObject, { backgroundColor: bg.color }]} />}

            {/* draggable route layer — Instagram-story grammar */}
            {route && (
              <GestureDetector gesture={gesture}>
                <Reanimated.View style={[st.routeLayer, { width: layerSize, height: layerSize, left: (canvasW - layerSize) / 2, top: (canvasH - layerSize) / 2 }, layerStyle]}>
                  <Svg viewBox={`0 0 ${layerSize} ${layerSize}`} width="100%" height="100%">
                    <Path d={route.d} stroke={stroke} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.95} />
                    <Circle cx={route.start[0]} cy={route.start[1]} r={5} fill="#fff" stroke={stroke} strokeWidth={3} />
                    <Circle cx={route.end[0]} cy={route.end[1]} r={5.5} fill={stroke} stroke="#fff" strokeWidth={2} />
                  </Svg>
                </Reanimated.View>
              </GestureDetector>
            )}

            {/* v2: each metric = its own free layer (fixture white ink —
                dark-canvas family by design). Drag to place, pinch to size. */}
            {rows.map(([k, v, l]) => (
              <GestureDetector key={k} gesture={layerFor[k].gesture}>
                <Reanimated.View style={[st.metricLayer, layerFor[k].style]}>
                  <Text style={st.statVal}>{v}</Text>
                  <Text style={st.statLbl}>{l}</Text>
                </Reanimated.View>
              </GestureDetector>
            ))}

            {prefs.wordmark && <Text style={st.wordmark} pointerEvents="none">FreshRun</Text>}
          </View>
        </View>

        {/* ── background picker ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.bgRow}>
          <Pressable onPress={pickAlbumBg} style={[st.bgSwatch, st.albumTile]}>
            <Icon name="images-outline" size={17} color={C.sub} />
          </Pressable>
          {allBgs.map((b, i) => (
            <Pressable key={i} onPress={() => setBgIdx(i)} style={[st.bgSwatch, i === bgIdx && { borderColor: C.accent }]}>
              {b.kind === 'photo' && <Image source={{ uri: b.url }} style={st.bgFill} />}
              {b.kind === 'gradient' && <LinearGradient colors={b.colors} style={st.bgFill} />}
              {b.kind === 'solid' && <View style={[st.bgFill, { backgroundColor: b.color }]} />}
              {b.kind === 'photo' && <View style={st.bgPhotoTag}><Icon name="image" size={9} color="#fff" /></View>}
            </Pressable>
          ))}
        </ScrollView>

        {/* ── format + wordmark + metric toggles ── */}
        <View style={st.controls}>
          <View style={st.chipRow}>
            {(['1:1', '9:16'] as const).map(f => (
              <Pressable key={f} onPress={() => save({ ...prefs, format: f })} style={[st.chip, prefs.format === f && st.chipOn]}>
                <Text style={[st.chipTxt, prefs.format === f && st.chipTxtOn]}>{f === '1:1' ? '정방형 1:1' : '스토리 9:16'}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => save({ ...prefs, wordmark: !prefs.wordmark })} style={[st.chip, prefs.wordmark && st.chipOn]}>
              <Text style={[st.chipTxt, prefs.wordmark && st.chipTxtOn]}>워드마크</Text>
            </Pressable>
          </View>
          <Text style={st.groupLbl}>표시할 항목</Text>
          <View style={st.chipRow}>
            {(Object.keys(METRIC_LABELS) as ShareMetricKey[]).map(k => (
              <Pressable
                key={k}
                onPress={() => save({ ...prefs, metrics: { ...prefs.metrics, [k]: !prefs.metrics[k] } })}
                style={[st.chip, prefs.metrics[k] && st.chipOn]}
              >
                <Text style={[st.chipTxt, prefs.metrics[k] && st.chipTxtOn]}>{METRIC_LABELS[k]}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ── actions — honest no-export interim (stated adaptation):
               text share WORKS today; image export names its arrival ── */}
        <View style={st.actions}>
          <Pressable onPress={shareText} style={({ pressed }) => [st.textShareBtn, shadows.sm, pressed && { opacity: 0.85 }]}>
            <Icon name="share-outline" size={17} color={C.text} />
            <Text style={st.textShareTxt}>텍스트로 공유</Text>
          </Pressable>
          <View style={st.exportBtn}>
            <Icon name="image-outline" size={17} color={C.faint} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.exportTxt}>이미지 저장</Text>
              <Text style={st.exportSub}>이미지 내보내기는 다음 업데이트에서 열려요</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </GestureHandlerRootView>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  header:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, paddingBottom: 8 },
  hBtn:    { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  hTitle:  { flex: 1, textAlign: 'center', fontSize: 16.5, fontWeight: '700', letterSpacing: -0.4, color: C.text },

  canvasWrap: { alignItems: 'center', paddingTop: 6 },
  canvas:     { borderRadius: 18, overflow: 'hidden', backgroundColor: '#0C0F14' },
  routeLayer: { position: 'absolute' },

  metricLayer: { position: 'absolute', left: 0, top: 0, flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  statVal:    { fontSize: 21, fontWeight: '800', color: '#fff', letterSpacing: -0.6, fontVariant: ['tabular-nums'], textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 5 },
  statLbl:    { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.75)', letterSpacing: -0.2, textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 4 },
  wordmark:   { position: 'absolute', right: 14, bottom: 12, fontSize: 12, fontWeight: '800', letterSpacing: -0.3, color: 'rgba(255,255,255,0.82)', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },

  bgRow:    { gap: 8, paddingHorizontal: S.gutter, paddingTop: 14 },
  bgSwatch:  { width: 46, height: 46, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  albumTile: { borderColor: C.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
  bgFill:   { width: '100%', height: '100%' },
  bgPhotoTag: { position: 'absolute', right: 3, bottom: 3, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 5, padding: 2 },

  controls: { paddingHorizontal: S.gutter, paddingTop: 14, gap: 10 },
  groupLbl: { fontSize: 11.5, fontWeight: '700', color: C.faint, letterSpacing: 0.2, marginTop: 4 },
  chipRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip:     { paddingHorizontal: 12, paddingVertical: 7, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  chipOn:   { borderColor: C.accent, backgroundColor: C.accent + '1A' },
  chipTxt:  { fontSize: 12.5, fontWeight: '600', color: C.sub, letterSpacing: -0.2 },
  chipTxtOn:{ color: C.text },

  actions:      { paddingHorizontal: S.gutter, paddingTop: 18, gap: 9 },
  textShareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingVertical: 14 },
  textShareTxt: { fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  exportBtn:    { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 14, opacity: 0.65 },
  exportTxt:    { fontSize: 14, fontWeight: '700', color: C.faint, letterSpacing: -0.3 },
  exportSub:    { fontSize: 11, color: C.faint, letterSpacing: -0.2, marginTop: 1 },
});
