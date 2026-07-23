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
 *  - Wordmark PERMANENT (re-ruling 2026-07-24 supersedes the off-toggle:
 *    marketing/organic growth) — renders unconditionally, both formats;
 *    persisted wordmark:false blobs are INERT KEYS (the stale-blob class —
 *    nothing reads them, no migration write needed).
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
import Slider from '@react-native-community/slider';
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
  /** v2 free-placement — absent keys fall to the default stack (merge-safe) */
  placements?: Partial<Record<ShareMetricKey, MetricPlacement>>;
  /** v2.1 — route stroke styling (global taste, like metric selection) */
  strokeColor?: string;
  strokeWeight?: number;
  /** v2.1 — PER-RUN background adjust (x/y = canvas fractions of the pan
      offset, s = zoom ≥1, dim = overlay 0..0.6). Keyed by runId, pruned to
      the newest BG_ADJUST_CAP entries (insertion order) so the blob never
      grows unbounded. */
  bgAdjust?: Record<string, { x: number; y: number; s: number; dim: number }>;
};
const PREFS_KEY = '@fr_share_prefs';
const DEFAULT_PREFS: SharePrefs = {
  // Owner trim 2026-07-24: exactly three — 거리·평균 페이스·시간. The old
  // keys (best/splits/kcal/date) live on inert in stale stored blobs (the
  // merge keeps them; nothing reads them) — v2 candidates, ledgered.
  metrics: { dist: true, pace: true, time: true },
  format: '9:16',
};
const METRIC_LABELS: Record<ShareMetricKey, string> = {
  dist: '거리', pace: '평균 페이스', time: '시간',
};
const BG_ADJUST_CAP = 20;
// v2.1 stroke presets — the house lime leads; fixture companions chosen for
// dark-canvas/photo legibility (the composer's canvas family)
const STROKE_COLORS = ['#74E827', '#FFFFFF', '#FFC24B', '#5AC8FA', '#FF6B81'];
const STROKE_WEIGHTS: [number, string][] = [[3, '얇게'], [4.5, '보통'], [6, '굵게']];
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
  enabled = true,
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
      Gesture.Pan().enabled(enabled).onChange(e => { tx.value += e.changeX; ty.value += e.changeY; }).onEnd(end),
      Gesture.Pinch().enabled(enabled).onChange(e => { sc.value *= e.scaleChange; }).onEnd(end),
    );
  }, [key, canvasW, canvasH, persist, tx, ty, sc, enabled]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: sc.value }],
  }));
  return { gesture, style };
}

// ─── Background adjust layer (v2.1) — pan+pinch, CLAMPED to cover-fit ────────
// Unlike the route's free drag, a background with gaps reads broken: zoom
// floors at 1 (cover-fit), pan clamps to the overflow the zoom creates.
// Fractions persist per-run; format flips re-derive px then RE-CLAMP.

function useBgLayer(
  canvasW: number,
  canvasH: number,
  stored: { x: number; y: number; s: number } | undefined,
  enabled: boolean,
  persist: (p: { x: number; y: number; s: number }) => void,
) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sc = useSharedValue(1);
  useEffect(() => {
    const s0 = Math.max(1, stored?.s ?? 1);
    const mx = ((s0 - 1) * canvasW) / 2, my = ((s0 - 1) * canvasH) / 2;
    sc.value = s0;
    tx.value = Math.min(mx, Math.max(-mx, (stored?.x ?? 0) * canvasW));
    ty.value = Math.min(my, Math.max(-my, (stored?.y ?? 0) * canvasH));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasW, canvasH, stored]);
  const gesture = useMemo(() => {
    const clamp = () => {
      'worklet';
      const mx = ((sc.value - 1) * canvasW) / 2, my = ((sc.value - 1) * canvasH) / 2;
      tx.value = Math.min(mx, Math.max(-mx, tx.value));
      ty.value = Math.min(my, Math.max(-my, ty.value));
    };
    const end = () => {
      'worklet';
      runOnJS(persist)({ x: tx.value / canvasW, y: ty.value / canvasH, s: sc.value });
    };
    return Gesture.Simultaneous(
      Gesture.Pan().enabled(enabled).onChange(e => { tx.value += e.changeX; ty.value += e.changeY; clamp(); }).onEnd(end),
      Gesture.Pinch().enabled(enabled).onChange(e => { sc.value = Math.min(4, Math.max(1, sc.value * e.scaleChange)); clamp(); }).onEnd(end),
    );
  }, [canvasW, canvasH, enabled, persist, tx, ty, sc]);
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
  const stroke = prefs.strokeColor ?? routeStroke('dark'); // preset-able (v2.1); lime default
  const strokeW = prefs.strokeWeight ?? 4.5;
  // 배경 조정 MODE (v2.1 arbitration): RNGH makes every detector whose view
  // contains the touch a CANDIDATE regardless of z-order — cross-wiring
  // relations across 5 detectors is fragile. The deterministic grammar: an
  // explicit mode. Mode ON → upper layers' gestures .enabled(false), the
  // bg detector alone is live; OFF → exactly the pre-v2.1 world.
  const [bgAdjustMode, setBgAdjustMode] = useState(false);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sc = useSharedValue(1);
  const rot = useSharedValue(0);
  const gesture = useMemo(() => Gesture.Simultaneous(
    Gesture.Pan().enabled(!bgAdjustMode).onChange(e => { tx.value += e.changeX; ty.value += e.changeY; }),
    Gesture.Pinch().enabled(!bgAdjustMode).onChange(e => { sc.value *= e.scaleChange; }),
    Gesture.Rotation().enabled(!bgAdjustMode).onChange(e => { rot.value += e.rotationChange; }),
  ), [tx, ty, sc, rot, bgAdjustMode]);
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
  const distLayer = useMetricLayer('dist', canvasW, canvasH, prefs.placements?.dist, persistPlacement, !bgAdjustMode);
  const paceLayer = useMetricLayer('pace', canvasW, canvasH, prefs.placements?.pace, persistPlacement, !bgAdjustMode);
  const timeLayer = useMetricLayer('time', canvasW, canvasH, prefs.placements?.time, persistPlacement, !bgAdjustMode);
  const layerFor = { dist: distLayer, pace: paceLayer, time: timeLayer } as const;

  // ── v2.1 per-run background adjust (photos only) ────────────────────────────
  const bgStored = runId ? prefs.bgAdjust?.[runId] : undefined;
  const persistBg = useMemo(() => (patch: Partial<{ x: number; y: number; s: number; dim: number }>) => {
    if (!runId) return;
    setPrefs(prev => {
      const cur = prev.bgAdjust?.[runId] ?? { x: 0, y: 0, s: 1, dim: 0 };
      const map = { ...(prev.bgAdjust ?? {}) };
      delete map[runId]; // re-insert last = newest (insertion-order prune)
      map[runId] = { ...cur, ...patch };
      const keys = Object.keys(map);
      while (keys.length > BG_ADJUST_CAP) { delete map[keys[0]]; keys.shift(); }
      const next = { ...prev, bgAdjust: map };
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [runId]);
  const bgIsPhoto = bg?.kind === 'photo';
  const bgLayer = useBgLayer(canvasW, canvasH, bgStored, bgAdjustMode && bgIsPhoto, persistBg);
  const bgDim = bgStored?.dim ?? 0;

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
            {bg.kind === 'photo' && (
              <GestureDetector gesture={bgLayer.gesture}>
                <Reanimated.View style={[StyleSheet.absoluteFillObject, bgLayer.style]}>
                  <Image source={{ uri: bg.url }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                </Reanimated.View>
              </GestureDetector>
            )}
            {bg.kind === 'gradient' && <LinearGradient colors={bg.colors} style={StyleSheet.absoluteFillObject} />}
            {bg.kind === 'solid' && <View style={[StyleSheet.absoluteFillObject, { backgroundColor: bg.color }]} />}
            {/* dim overlay (photos only) — legibility rescue; pairs with zoom */}
            {bg.kind === 'photo' && bgDim > 0 && (
              <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000', opacity: bgDim }]} />
            )}
            {bgAdjustMode && bgIsPhoto && (
              <View pointerEvents="none" style={st.bgModeBadge}>
                <Text style={st.bgModeTxt}>배경 조정 중 — 드래그·핀치</Text>
              </View>
            )}

            {/* draggable route layer — Instagram-story grammar */}
            {route && (
              <GestureDetector gesture={gesture}>
                <Reanimated.View style={[st.routeLayer, { width: layerSize, height: layerSize, left: (canvasW - layerSize) / 2, top: (canvasH - layerSize) / 2 }, layerStyle]}>
                  <Svg viewBox={`0 0 ${layerSize} ${layerSize}`} width="100%" height="100%">
                    <Path d={route.d} stroke={stroke} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.95} />
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

            {/* permanent wordmark (re-ruling) — subtle corner, both formats */}
            <Text style={st.wordmark} pointerEvents="none">FreshRun</Text>
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
          </View>
          <Text style={st.groupLbl}>루트 스타일</Text>
          <View style={st.chipRow}>
            {STROKE_COLORS.map(c => (
              <Pressable key={c} onPress={() => save({ ...prefs, strokeColor: c })} style={[st.colorDot, { backgroundColor: c }, (prefs.strokeColor ?? STROKE_COLORS[0]) === c && st.colorDotOn]} />
            ))}
            {STROKE_WEIGHTS.map(([w, label]) => (
              <Pressable key={w} onPress={() => save({ ...prefs, strokeWeight: w })} style={[st.chip, (prefs.strokeWeight ?? 4.5) === w && st.chipOn]}>
                <Text style={[st.chipTxt, (prefs.strokeWeight ?? 4.5) === w && st.chipTxtOn]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {bgIsPhoto && (
            <>
              <Text style={st.groupLbl}>배경 (사진)</Text>
              <View style={st.chipRow}>
                <Pressable onPress={() => setBgAdjustMode(m => !m)} style={[st.chip, bgAdjustMode && st.chipOn]}>
                  <Text style={[st.chipTxt, bgAdjustMode && st.chipTxtOn]}>{bgAdjustMode ? '조정 완료' : '배경 조정'}</Text>
                </Pressable>
                <View style={st.dimSlider}>
                  <Text style={st.dimLbl}>딤 {Math.round(bgDim * 100)}%</Text>
                  <Slider
                    style={{ flex: 1 }}
                    minimumValue={0} maximumValue={0.6} step={0.05} value={bgDim}
                    onSlidingComplete={v => persistBg({ dim: Math.round(v * 20) / 20 })}
                    minimumTrackTintColor={C.accent} maximumTrackTintColor={C.border} thumbTintColor="#fff"
                  />
                </View>
              </View>
            </>
          )}
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
  colorDot:   { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'transparent' },
  dimSlider:  { flex: 1, minWidth: 170, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dimLbl:     { fontSize: 12, fontWeight: '600', color: C.sub, letterSpacing: -0.2, width: 58 },
  colorDotOn: { borderColor: C.text },
  bgModeBadge: { position: 'absolute', top: 10, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  bgModeTxt:   { fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: -0.2 },

  actions:      { paddingHorizontal: S.gutter, paddingTop: 18, gap: 9 },
  textShareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingVertical: 14 },
  textShareTxt: { fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  exportBtn:    { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 14, opacity: 0.65 },
  exportTxt:    { fontSize: 14, fontWeight: '700', color: C.faint, letterSpacing: -0.3 },
  exportSub:    { fontSize: 11, color: C.faint, letterSpacing: -0.2, marginTop: 1 },
});
