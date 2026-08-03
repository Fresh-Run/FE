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
 *    story-editor grammar; placement holds as canvas FRACTIONS so format
 *    flips keep relative positions WITHIN a visit (8/3 ruling: per-visit
 *    defaults — cross-visit persistence died; entry = designed default).
 */
import { SeededSlider } from '@/components/seeded-slider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t, tf, useLang } from '@/lib/i18n';
import { Image, Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, { runOnJS, useAnimatedProps, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

import { Icon } from '@/components/ui';
import { useRunDetail } from '@/hooks/use-runs';
import { useRunTrack } from '@/lib/track-cache';
import { distUnit, fmtDist, fmtDuration, fmtPaceIn, paceUnit, timeTitle } from '@/lib/run-format';
import { routeStroke, DENSE_MAX_FONT_SCALE} from '@/lib/theme';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useSettings } from '@/store/use-settings';
import type { Coordinate } from '@/types';

// stroke counter-scale (8/3 ruling): the preset must hold at any pinch zoom
const AnimatedPath = Reanimated.createAnimatedComponent(Path);
const AnimatedCircle = Reanimated.createAnimatedComponent(Circle);

// ─── Prefs (persisted metric selection — v1 local; settings.share later) ─────

export type ShareMetricKey = 'dist' | 'pace' | 'time';
/** 8/6 free-layer JOIN: the crew line rides the metric-layer machinery under
    its own key — same hook, same guides, same persistence. Records below
    widen to this; `metrics` stays ShareMetricKey (crew toggles are per-visit
    state, her mock-amendment default-OFF, never persisted). */
type ShareLayerKey = ShareMetricKey | 'crew';
type MetricPlacement = { x: number; y: number; s: number }; // x/y = canvas fractions, s = scale
type SharePrefs = {
  metrics: Record<ShareMetricKey, boolean>;
  format: '1:1' | '9:16';
  /** ~~v2 free-placement persistence~~ DIED 8/3 (owner ruling: per-visit
      defaults — the share card is a per-run COMPOSITION, not a workspace;
      every share starts from the designed default). Placements now live in
      SESSION STATE only (the component's sessionPlacements — drag/pinch
      and format-flip fraction memory work exactly as before WITHIN a
      visit; entry resets). Old stored `placements` blobs are INERT KEYS
      (the stale-blob class — nothing reads them, no migration write). */
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
const METRIC_LABELS = {
  dist: 'shr.metricDist', pace: 'shr.metricPace', time: 'shr.metricTime',
} as const; // keys — render-time (static-capture rule)
const BG_ADJUST_CAP = 20;
// v2.1 stroke presets — the house lime leads; fixture companions chosen for
// dark-canvas/photo legibility (the composer's canvas family)
const STROKE_COLORS = ['#74E827', '#FFFFFF', '#FFC24B', '#5AC8FA', '#FF6B81'];
const STROKE_WEIGHTS = [[3, 'shr.thin'], [4.5, 'shr.normal'], [6, 'shr.thick']] as const; // keys — render-time
// default stack ≈ the old bottom-left block (canvas fractions)
const DEFAULT_PLACEMENT: Record<ShareLayerKey, MetricPlacement> = {
  dist: { x: 0.06, y: 0.60, s: 1 },
  pace: { x: 0.06, y: 0.73, s: 1 },
  time: { x: 0.06, y: 0.86, s: 1 },
  // 8/6: where the static crew line sat (left 14 / bottom ~34 → fractions);
  // small tier comes from crewTxt's own 12pt, not from s
  crew: { x: 0.05, y: 0.88, s: 1 },
};

// ─── Backgrounds — dark-fixture house family (night-canvas precedent) ─────────

type Bg =
  | { kind: 'gradient'; colors: [string, string]; label: string }
  | { kind: 'solid'; color: string; label: string }
  | { kind: 'photo'; url: string };
const HOUSE_BGS: Bg[] = [
  { kind: 'gradient', colors: ['#0C1206', '#1E3A0F'], label: 'shr.bgMidnight' },
  { kind: 'gradient', colors: ['#0C0F14', '#1B2430'], label: 'shr.bgNightCity' },
  { kind: 'solid', color: '#0C0F14', label: 'shr.bgBlack' },
  { kind: 'solid', color: '#15171C', label: 'shr.bgCharcoal' },
];

// ─── Route → SVG path (MiniMap's normalize math, verbatim shape) ─────────────

function routePath(polyline: Coordinate[], size: number, pad: number): { d: string; start: [number, number]; end: [number, number] } | null {
  if (polyline.length < 2) return null;
  // Fidelity ruling (8/3, Jeju coastal squiggle): UNIFORM scale — one factor
  // for both axes (min-fit), cos(lat)-corrected longitude, letterboxed to
  // center. A coastal 7:1 route keeps its shore proportions instead of being
  // stretched square. DELIBERATE DIVERGENCE from MiniMap's per-axis math —
  // the 62px stylized minis keep their idiom; here the route is the subject.
  const lats = polyline.map(c => c.lat);
  const lngs = polyline.map(c => c.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const kx = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180); // lng° → lat°-equivalent
  const spanX = (maxLng - minLng) * kx || 0.0001;
  const spanY = (maxLat - minLat) || 0.0001;
  const s = (size - 2 * pad) / Math.max(spanX, spanY);
  const ox = pad + ((size - 2 * pad) - spanX * s) / 2; // letterbox centering
  const oy = pad + ((size - 2 * pad) - spanY * s) / 2;
  const px = (c: Coordinate) => ox + (c.lng - minLng) * kx * s;
  const py = (c: Coordinate) => size - oy - (c.lat - minLat) * s;
  const d = polyline.map((c, i) => `${i === 0 ? 'M' : 'L'} ${px(c).toFixed(1)} ${py(c).toFixed(1)}`).join(' ');
  const first = polyline[0], last = polyline[polyline.length - 1];
  return { d, start: [px(first), py(first)], end: [px(last), py(last)] };
}

// ─── Smart alignment guides (owner spec 2026-07-27) — the PPT/IG grammar ─────
// Snap targets, priority: canvas centerlines → safe-margin lines → sibling
// centers/edges. Route layer + wordmark are NOT targets (v1 ruling: organic
// shape / fixed furniture). Equal-spacing: NOT v1 (3-body solve — declared
// honestly, not silently dropped). Snap ASSISTS, never constrains: raw finger
// position stays the truth; display snaps within threshold and releases the
// moment raw pulls past it — no sticky trap.
const SNAP_THRESHOLD_PX = 10; // tunable — the 8-12px class, middle picked
const SAFE_MARGIN_PX = 20;    // consistent inset for the margin guide lines

type LayerGeom = {
  tx: SharedValue<number>; ty: SharedValue<number>; sc: SharedValue<number>;
  w: SharedValue<number>; h: SharedValue<number>;
  /** measured width of the VALUE Text alone — X-snap targets the value glyphs */
  vw: SharedValue<number>;
  /** 8/3 selection model: raw finger truth + snap edges live in the geom so
      the ANYWHERE channel (canvas gestures driving the selected layer) runs
      the exact same drag worklet as direct manipulation. */
  rawX: SharedValue<number>; rawY: SharedValue<number>;
  snappedX: SharedValue<number>; snappedY: SharedValue<number>;
};
type GuideCtx = {
  geoms: Partial<Record<ShareLayerKey, LayerGeom>>; // registered at hook mount
  guideX: SharedValue<number>; // px of the vertical guide line; -1 = hidden
  guideY: SharedValue<number>; // px of the horizontal guide line; -1 = hidden
};

// 8/3 selection model: selectable keys = the four text layers + the track
type SelKey = ShareLayerKey | 'track';
/** Double-tap preset scales S→M→L→S (absolute layer scale, field-tunable) */
const SCALE_PRESETS = [0.85, 1.0, 1.25];
/** Touch slop added around a layer's box for hit-testing (px) */
const HIT_PAD_PX = 8;
/** 8/3 amend (지연 mid-glance): one-finger corner resize handle — hit
    radius 18px ≈ a 36pt circle (the ~28pt target + generous slop). */
const HANDLE_HIT_R_PX = 18;
/** resize floor — the handle can't collapse a layer past this scale */
const HANDLE_SCALE_MIN = 0.3;

// Snap tick — Light, gated under run.haptics per the vocabulary table's own
// scope (tabs/toggles are non-run surfaces and ride the same gate: it is the
// app's ONE haptic switch, gate-not-generator). Fire-time snapshot idiom.
function snapTick() {
  if (useSettings.getState().settings.run.haptics) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

// ─── Free-placed metric layer (v2) — drag + pinch, NO rotation ───────────────
// One hook instance per layer key (fixed count of 4 since the 8/2 crew join —
// hooks stay unconditional; toggles hide the RENDER, never the hook).
// Position lives in shared values (px), committed as canvas FRACTIONS to
// SESSION state on gesture end (8/3 per-visit ruling); canvas-dim changes
// (format flip) re-derive px from fractions within the visit.

// ─── Shared drag worklets (8/3 selection model) — ONE snap machine for BOTH
// channels: direct manipulation (the layer's own pan) and the anywhere-drag
// (canvas pan driving the selected layer). Extracted verbatim from the v2
// per-layer onChange; behavior identical by construction.

function dragStart(g: LayerGeom) {
  'worklet';
  g.rawX.value = g.tx.value;
  g.rawY.value = g.ty.value;
}

function dragStep(key: ShareLayerKey, g: LayerGeom, guides: GuideCtx, canvasW: number, canvasH: number, changeX: number, changeY: number) {
  'worklet';
  g.rawX.value += changeX;
  g.rawY.value += changeY;
  // Snap on the value sub-box, not the container — the label trails
  // visually (owner walk finding 7/30: pace's 55px label offset its
  // value ~31px from box-center guides). vw falls back to the box
  // until the value's first onLayout. Exact under center-origin
  // scale: value visual center = raw + w/2 + sc·(vw − w)/2 (the box
  // scales about ITS center; the value rides left of it).
  const vEff = g.vw.value || g.w.value;
  const halfW = (vEff * g.sc.value) / 2;
  const halfH = (g.h.value * g.sc.value) / 2;
  const cx = g.rawX.value + g.w.value / 2 + (g.sc.value * (vEff - g.w.value)) / 2;
  const cy = g.rawY.value + g.h.value / 2;
  // candidate = [snap-to center position, guide-line px]
  const xc: [number, number][] = [
    [canvasW / 2, canvasW / 2],                              // ① V centerline
    [SAFE_MARGIN_PX + halfW, SAFE_MARGIN_PX],                // ② left margin (edge)
    [canvasW - SAFE_MARGIN_PX - halfW, canvasW - SAFE_MARGIN_PX], // ② right margin (edge)
  ];
  const yc: [number, number][] = [
    [canvasH / 2, canvasH / 2],                              // ① H centerline
    [SAFE_MARGIN_PX + halfH, SAFE_MARGIN_PX],                // ② top margin
    [canvasH - SAFE_MARGIN_PX - halfH, canvasH - SAFE_MARGIN_PX], // ② bottom margin
  ];
  // ③ siblings — centers + edges (skip unrendered: w === 0)
  for (const k2 of (['dist', 'pace', 'time', 'crew'] as ShareLayerKey[])) {
    if (k2 === key) continue;
    const sg = guides.geoms[k2];
    if (!sg || sg.w.value === 0) continue;
    const gvEff = sg.vw.value || sg.w.value; // sibling value sub-box too
    const sHalfW = (gvEff * sg.sc.value) / 2;
    const sHalfH = (sg.h.value * sg.sc.value) / 2;
    const scx = sg.tx.value + sg.w.value / 2 + (sg.sc.value * (gvEff - sg.w.value)) / 2;
    const scy = sg.ty.value + sg.h.value / 2;
    xc.push([scx, scx]);                                     // H-center align
    xc.push([scx - sHalfW + halfW, scx - sHalfW]);           // left-align
    xc.push([scx + sHalfW - halfW, scx + sHalfW]);           // right-align
    yc.push([scy, scy]);                                     // V-center align
    yc.push([scy - sHalfH + halfH, scy - sHalfH]);           // top-align
    yc.push([scy + sHalfH - halfH, scy + sHalfH]);           // bottom-align
  }
  let bestX = -1, bestXd = SNAP_THRESHOLD_PX + 1, bestXg = -1;
  for (const [pos, g2] of xc) {
    const d = Math.abs(cx - pos);
    if (d < bestXd) { bestXd = d; bestX = pos; bestXg = g2; }
  }
  let bestY = -1, bestYd = SNAP_THRESHOLD_PX + 1, bestYg = -1;
  for (const [pos, g2] of yc) {
    const d = Math.abs(cy - pos);
    if (d < bestYd) { bestYd = d; bestY = pos; bestYg = g2; }
  }
  const xSnap = bestXd <= SNAP_THRESHOLD_PX;
  const ySnap = bestYd <= SNAP_THRESHOLD_PX;
  // invert the value-center mapping — layout x from the target center
  g.tx.value = xSnap ? bestX - g.w.value / 2 - (g.sc.value * (vEff - g.w.value)) / 2 : g.rawX.value; // magnetic pull ↔ clean release
  g.ty.value = ySnap ? bestY - g.h.value / 2 : g.rawY.value;
  guides.guideX.value = xSnap ? bestXg : -1; // lines exist ONLY while snapped
  guides.guideY.value = ySnap ? bestYg : -1;
  if ((xSnap && g.snappedX.value === 0) || (ySnap && g.snappedY.value === 0)) {
    runOnJS(snapTick)(); // rising edge only — engage tick, no machine-gun
  }
  g.snappedX.value = xSnap ? 1 : 0;
  g.snappedY.value = ySnap ? 1 : 0;
}

function dragEnd(g: LayerGeom, guides: GuideCtx) {
  'worklet';
  guides.guideX.value = -1; // guides vanish on release — never outlive a drag
  guides.guideY.value = -1;
  g.snappedX.value = 0;
  g.snappedY.value = 0;
  g.rawX.value = g.tx.value; // next drag starts from the settled (snapped) spot
  g.rawY.value = g.ty.value;
}

function useMetricLayer(
  key: ShareLayerKey,
  canvasW: number,
  canvasH: number,
  stored: MetricPlacement | undefined,
  persist: (key: ShareLayerKey, p: MetricPlacement) => void,
  guides: GuideCtx,
  enabled = true,
  /** 8/3 selection model: a direct drag/pinch SELECTS as it manipulates */
  onSelect?: (key: ShareLayerKey) => void,
) {
  const base = stored ?? DEFAULT_PLACEMENT[key];
  const tx = useSharedValue(base.x * canvasW);
  const ty = useSharedValue(base.y * canvasH);
  const sc = useSharedValue(base.s);
  // raw = the finger's truth; tx/ty = the (possibly snapped) display
  const rawX = useSharedValue(base.x * canvasW);
  const rawY = useSharedValue(base.y * canvasH);
  const w = useSharedValue(0); // measured (unscaled) row size — onLayout below
  const h = useSharedValue(0);
  const vw = useSharedValue(0); // measured value-Text width — onValueLayout below
  const snappedX = useSharedValue(0); // 0/1 — tick fires on the rising edge only
  const snappedY = useSharedValue(0);
  guides.geoms[key] = { tx, ty, sc, w, h, vw, rawX, rawY, snappedX, snappedY }; // idempotent per-render registration
  // reposition on hydrate/format-flip (fractions are the truth)
  useEffect(() => {
    tx.value = base.x * canvasW;
    ty.value = base.y * canvasH;
    rawX.value = base.x * canvasW;
    rawY.value = base.y * canvasH;
    sc.value = base.s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasW, canvasH, stored]);
  const gesture = useMemo(() => {
    const g: LayerGeom = { tx, ty, sc, w, h, vw, rawX, rawY, snappedX, snappedY };
    const end = () => {
      'worklet';
      dragEnd(g, guides);
      runOnJS(persist)(key, { x: tx.value / canvasW, y: ty.value / canvasH, s: sc.value });
    };
    const select = () => {
      'worklet';
      if (onSelect) runOnJS(onSelect)(key);
    };
    return Gesture.Simultaneous(
      Gesture.Pan().enabled(enabled)
        .onStart(() => {
          'worklet';
          dragStart(g);
          select(); // one gesture, both effects (8/3 item 3)
        })
        .onChange(e => {
          'worklet';
          dragStep(key, g, guides, canvasW, canvasH, e.changeX, e.changeY);
        })
        .onEnd(end),
      Gesture.Pinch().enabled(enabled)
        .onStart(select)
        .onChange(e => { sc.value *= e.scaleChange; }).onEnd(end),
    );
  }, [key, canvasW, canvasH, persist, tx, ty, sc, rawX, rawY, w, h, vw, snappedX, snappedY, guides, enabled, onSelect]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: sc.value }],
  }));
  const onLayout = (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
    w.value = e.nativeEvent.layout.width;
    h.value = e.nativeEvent.layout.height;
  };
  const onValueLayout = (e: { nativeEvent: { layout: { width: number } } }) => {
    vw.value = e.nativeEvent.layout.width;
  };
  return { gesture, style, onLayout, onValueLayout };
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
  const lang = useLang(); // compiler-visible locale for the date/title formatters (2026-08-03 formatter-cache fix)
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
  // 8/3 EDIT-CANVAS GROWTH (owner part 2): height cap 0.52 → 0.68 of the
  // window — the whole screen scrolls, so controls stay reachable below a
  // taller card. On a 390×844 device: 9:16 preview 247→323pt wide (+31%
  // linear); 1:1 was already width-capped at 358pt (unchanged). EXPORT
  // UNTOUCHED — view-shot captures at fixed 1080-wide regardless of the
  // preview scale; gesture targets live ON the layers, so they grow with
  // the preview for free.
  const maxW = winW - S.gutter * 2;
  const maxH = winH * 0.68;
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
  // Slice 2 (build 8 alive): the canvas ref view-shot captures
  const canvasRef = useRef<View>(null);
  const [exporting, setExporting] = useState(false);
  // ── 8/3 SELECTION MODEL (option A + double-tap rider) ──────────────────────
  // Tap a layer → selected (dashed border); anywhere-drag/pinch drives the
  // SELECTED layer; direct manipulation on any layer keeps working and
  // selects as it moves. selectedSV mirrors JS state into worklets.
  const [selected, setSelected] = useState<SelKey | null>(null);
  const selectedSV = useSharedValue('');
  useEffect(() => { selectedSV.value = selected ?? ''; }, [selected, selectedSV]);
  const selectLayer = useCallback((k: ShareLayerKey) => setSelected(k), []);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sc = useSharedValue(1);
  const rot = useSharedValue(0);
  // Track gestures: direct pan/pinch select-as-they-move (the metric
  // grammar); ROTATION STAYS DIRECT-ONLY (8/3 item-5 choice: an anywhere-
  // rotate is ambiguous against the anywhere-pinch's two-finger grammar —
  // twist on the track itself, as always).
  const gesture = useMemo(() => Gesture.Simultaneous(
    Gesture.Pan().enabled(!bgAdjustMode)
      .onStart(() => { 'worklet'; runOnJS(setSelected)('track'); })
      .onChange(e => { tx.value += e.changeX; ty.value += e.changeY; }),
    Gesture.Pinch().enabled(!bgAdjustMode)
      .onStart(() => { 'worklet'; runOnJS(setSelected)('track'); })
      .onChange(e => { sc.value *= e.scaleChange; }),
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
  // counter-scale: the layer transform scales everything incl. the stroke;
  // dividing by sc keeps the chosen preset (3/4.5/6) visually constant
  const strokeProps = useAnimatedProps(() => ({ strokeWidth: strokeW / sc.value }));
  // addendum: the start/end dots counter-scale the same way (same class)
  const startDotProps = useAnimatedProps(() => ({ r: 5 / sc.value, strokeWidth: 3 / sc.value }));
  const endDotProps = useAnimatedProps(() => ({ r: 5.5 / sc.value, strokeWidth: 2 / sc.value }));

  // v2 free-placed layers — fixed four incl. crew (hooks unconditional; the
  // toggle hides the RENDER, never the hook). 8/3 PER-VISIT RULING: gesture
  // ends persist to SESSION STATE only (format-flip fraction memory intact
  // within the visit); every composer entry starts at DEFAULT_PLACEMENT —
  // the AsyncStorage placement write DIED (supersedes the crew-line build's
  // matched persist convention).
  const [sessionPlacements, setSessionPlacements] = useState<Partial<Record<ShareLayerKey, MetricPlacement>>>({});
  const persistPlacement = useMemo(() => (key: ShareLayerKey, p: MetricPlacement) => {
    setSessionPlacements(prev => ({ ...prev, [key]: p }));
  }, []);
  // smart-guide context — one per canvas; geoms registered by the layer hooks
  const guideX = useSharedValue(-1);
  const guideY = useSharedValue(-1);
  const guideCtx = useRef<GuideCtx>({ geoms: {}, guideX, guideY }).current;
  const guideVStyle = useAnimatedStyle(() => ({ opacity: guideX.value >= 0 ? 1 : 0, transform: [{ translateX: guideX.value }] }));
  const guideHStyle = useAnimatedStyle(() => ({ opacity: guideY.value >= 0 ? 1 : 0, transform: [{ translateY: guideY.value }] }));
  const distLayer = useMetricLayer('dist', canvasW, canvasH, sessionPlacements.dist, persistPlacement, guideCtx, !bgAdjustMode, selectLayer);
  const paceLayer = useMetricLayer('pace', canvasW, canvasH, sessionPlacements.pace, persistPlacement, guideCtx, !bgAdjustMode, selectLayer);
  const timeLayer = useMetricLayer('time', canvasW, canvasH, sessionPlacements.time, persistPlacement, guideCtx, !bgAdjustMode, selectLayer);
  const crewLayer = useMetricLayer('crew', canvasW, canvasH, sessionPlacements.crew, persistPlacement, guideCtx, !bgAdjustMode, selectLayer);
  const layerFor = { dist: distLayer, pace: paceLayer, time: timeLayer, crew: crewLayer } as const;

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

  // 8/6 crew toggles (split ruling): 크루명 + 참여인원, BOTH per-visit
  // default OFF (her mock amendment — the one deliberate divergence from
  // the metrics' persisted toggles). Semantic: count renders only when the
  // name is ON — the count chip itself hides while the name is OFF (and
  // when the run carries no count). The line is a free LAYER (crewLayer
  // above); its PLACEMENT persists like the metrics' — convention matched.
  // Hooks sit ABOVE the early return (rules-of-hooks).
  const [showCrewName, setShowCrewName] = useState(false);
  const [showCrewCount, setShowCrewCount] = useState(false);

  // ── 8/3 selection model: the CANVAS gesture system (anywhere-channel) ──────
  // Arbitration (the table, stated): ① touch lands ON a layer → the canvas
  // pan/pinch FAIL themselves (onTouchesDown hit-test + manager.fail()) —
  // direct manipulation wins, no double-handling, no cross-detector refs
  // (the v2.1 fragility the mode grammar was built against). ② touch on
  // EMPTY canvas + a selection active → the canvas gestures drive the
  // selected layer (same dragStep worklet → guides/snap identical). ③ no
  // selection + empty touch → nothing. ④ bgAdjustMode ON → this whole
  // system is .enabled(false) AND entering the mode deselects — the bg
  // detector alone is live, exactly the v2.1 grammar. Taps never fail:
  // single-tap = select/deselect by hit, double-tap = preset cycle.
  const renderedCsv = [
    prefs.metrics.dist ? 'dist' : '',
    prefs.metrics.pace && run?.avg_pace_sec_per_km != null ? 'pace' : '',
    prefs.metrics.time ? 'time' : '',
    showCrewName && run?.crew_name ? 'crew' : '',
    route ? 'track' : '',
  ].filter(Boolean).join(',');
  const renderedSV = useSharedValue('');
  useEffect(() => { renderedSV.value = renderedCsv; }, [renderedCsv, renderedSV]);
  useEffect(() => {
    // a layer toggled off while selected deselects (no ghost selection)
    if (selected && !renderedCsv.split(',').includes(selected)) setSelected(null);
  }, [selected, renderedCsv]);
  const ownsPan = useSharedValue(0);   // 0 none · 1 metric-move · 2 track-move · 3 handle-resize
  const ownsPinch = useSharedValue(0);
  // 8/3 handle amend: grab snapshot for the distance-from-center mapping
  const grabHandle = useSharedValue(0); // set at onTouchesDown, consumed at onStart
  const grabCX = useSharedValue(0);
  const grabCY = useSharedValue(0);
  const grabD0 = useSharedValue(1);
  const grabS0 = useSharedValue(1);
  const applyTapSelect = useCallback((k: string) => {
    setSelected(k === '' ? null : (k as SelKey));
  }, []);
  const applyPresetCycle = useCallback((k: string) => {
    // S→M→L→S on the double-tapped layer (selects it too). Nearest preset
    // to the current scale advances by one; constants field-tunable.
    const scv = k === 'track' ? sc : guideCtx.geoms[k as ShareLayerKey]?.sc;
    if (!scv) return;
    let nearest = 0;
    for (let i = 1; i < SCALE_PRESETS.length; i++) {
      if (Math.abs(scv.value - SCALE_PRESETS[i]) < Math.abs(scv.value - SCALE_PRESETS[nearest])) nearest = i;
    }
    const next = SCALE_PRESETS[(nearest + 1) % SCALE_PRESETS.length];
    scv.value = next;
    setSelected(k as SelKey);
    if (k !== 'track') {
      const g = guideCtx.geoms[k as ShareLayerKey];
      if (g) persistPlacement(k as ShareLayerKey, { x: g.tx.value / canvasW, y: g.ty.value / canvasH, s: next });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasW, canvasH, persistPlacement]);
  const canvasGesture = useMemo(() => {
    const geoms = guideCtx.geoms;
    // 8/3 handle amend: the selected layer's bottom-right border corner —
    // the resize knob's canvas position (border inset 6 scales with the
    // layer; track uses its axis-aligned box, rotation ignored as before).
    // Returns [cx, cy, hx, hy] of layer center + handle center, or null.
    const handleGeom = (): [number, number, number, number] | null => {
      'worklet';
      const sel = selectedSV.value;
      if (sel === '') return null;
      if (sel === 'track') {
        if (renderedSV.value.indexOf('track') === -1) return null;
        const cx = canvasW / 2 + tx.value;
        const cy = canvasH / 2 + ty.value;
        const off = (layerSize / 2 + 6) * sc.value;
        return [cx, cy, cx + off, cy + off];
      }
      const g = geoms[sel as ShareLayerKey];
      if (!g || g.w.value === 0) return null;
      const cx = g.tx.value + g.w.value / 2;
      const cy = g.ty.value + g.h.value / 2;
      return [cx, cy, cx + (g.w.value / 2 + 6) * g.sc.value, cy + (g.h.value / 2 + 6) * g.sc.value];
    };
    const handleHit = (x: number, y: number): boolean => {
      'worklet';
      const hg = handleGeom();
      if (!hg) return false;
      const dx = x - hg[2], dy = y - hg[3];
      return dx * dx + dy * dy <= HANDLE_HIT_R_PX * HANDLE_HIT_R_PX;
    };
    const hitTest = (x: number, y: number): string => {
      'worklet';
      const rendered = renderedSV.value;
      // top-most first (render order: metrics under crew; track underneath all)
      const order: ShareLayerKey[] = ['crew', 'time', 'pace', 'dist'];
      for (const k of order) {
        if (rendered.indexOf(k) === -1) continue;
        const g = geoms[k];
        if (!g || g.w.value === 0) continue;
        const cx = g.tx.value + g.w.value / 2;
        const cy = g.ty.value + g.h.value / 2;
        if (Math.abs(x - cx) <= (g.w.value * g.sc.value) / 2 + HIT_PAD_PX
          && Math.abs(y - cy) <= (g.h.value * g.sc.value) / 2 + HIT_PAD_PX) return k;
      }
      if (rendered.indexOf('track') !== -1) {
        // rotation ignored — axis-aligned box approximation (stated)
        const cx = canvasW / 2 + tx.value;
        const cy = canvasH / 2 + ty.value;
        const half = (layerSize * sc.value) / 2;
        if (Math.abs(x - cx) <= half && Math.abs(y - cy) <= half) return 'track';
      }
      return '';
    };
    const pan = Gesture.Pan().enabled(!bgAdjustMode)
      .onTouchesDown((e, mgr) => {
        'worklet';
        const t0 = e.allTouches[0];
        if (!t0) return;
        // ARBITRATION (8/3 amend): handle > layer > canvas. The knob is
        // CHROME — its hit wins over everything; the canvas owns the touch
        // in resize mode instead of failing to the layer underneath.
        if (handleHit(t0.x, t0.y)) {
          const hg = handleGeom();
          if (hg) {
            grabHandle.value = 1;
            grabCX.value = hg[0];
            grabCY.value = hg[1];
            const dx = t0.x - hg[0], dy = t0.y - hg[1];
            grabD0.value = Math.max(10, Math.sqrt(dx * dx + dy * dy)); // div-by-0 floor
            const sel = selectedSV.value;
            grabS0.value = sel === 'track' ? sc.value
              : (geoms[sel as ShareLayerKey]?.sc.value ?? 1);
          }
          return; // canvas OWNS — no fail
        }
        if (hitTest(t0.x, t0.y) !== '') mgr.fail(); // direct wins on-layer
      })
      .onStart(() => {
        'worklet';
        ownsPan.value = 0;
        if (grabHandle.value === 1) { ownsPan.value = 3; return; }
        const sel = selectedSV.value;
        if (sel === '') return;
        if (sel === 'track') { ownsPan.value = 2; return; }
        const g = geoms[sel as ShareLayerKey];
        if (g) { dragStart(g); ownsPan.value = 1; }
      })
      .onChange(e => {
        'worklet';
        if (ownsPan.value === 1) {
          const sel = selectedSV.value as ShareLayerKey;
          const g = geoms[sel];
          if (g) dragStep(sel, g, guideCtx, canvasW, canvasH, e.changeX, e.changeY);
        } else if (ownsPan.value === 2) {
          tx.value += e.changeX; ty.value += e.changeY;
        } else if (ownsPan.value === 3) {
          // MAPPING (stated): scale = grab-scale × (finger distance from the
          // layer's center ÷ grab distance) — pull outward to grow, inward
          // to shrink, center-anchored like the pinch. Floor at 0.3.
          const dx = e.x - grabCX.value, dy = e.y - grabCY.value;
          const d = Math.sqrt(dx * dx + dy * dy);
          const next = Math.max(HANDLE_SCALE_MIN, grabS0.value * (d / grabD0.value));
          const sel = selectedSV.value;
          if (sel === 'track') sc.value = next;
          else {
            const g = geoms[sel as ShareLayerKey];
            if (g) g.sc.value = next;
          }
        }
      })
      .onEnd(() => {
        'worklet';
        const mode = ownsPan.value;
        if (mode === 1 || mode === 3) {
          const sel = selectedSV.value;
          if (sel !== 'track' && sel !== '') {
            const g = geoms[sel as ShareLayerKey];
            if (g) {
              if (mode === 1) dragEnd(g, guideCtx);
              runOnJS(persistPlacement)(sel as ShareLayerKey, { x: g.tx.value / canvasW, y: g.ty.value / canvasH, s: g.sc.value });
            }
          }
        }
        ownsPan.value = 0;
        grabHandle.value = 0;
      })
      .onFinalize(() => {
        'worklet';
        grabHandle.value = 0; // a grab that never activated must not leak
      });
    const pinch = Gesture.Pinch().enabled(!bgAdjustMode)
      .onTouchesDown((e, mgr) => {
        'worklet';
        if (e.numberOfTouches >= 2) {
          const a = e.allTouches[0], b = e.allTouches[1];
          if (hitTest((a.x + b.x) / 2, (a.y + b.y) / 2) !== '') mgr.fail(); // direct wins on-layer
        }
      })
      .onStart(() => {
        'worklet';
        const sel = selectedSV.value;
        ownsPinch.value = sel === '' ? 0 : sel === 'track' ? 2 : 1;
      })
      .onChange(e => {
        'worklet';
        if (ownsPinch.value === 1) {
          const g = geoms[selectedSV.value as ShareLayerKey];
          if (g) g.sc.value *= e.scaleChange;
        } else if (ownsPinch.value === 2) {
          sc.value *= e.scaleChange;
        }
      })
      .onEnd(() => {
        'worklet';
        if (ownsPinch.value === 1) {
          const sel = selectedSV.value as ShareLayerKey;
          const g = geoms[sel];
          if (g) runOnJS(persistPlacement)(sel, { x: g.tx.value / canvasW, y: g.ty.value / canvasH, s: g.sc.value });
        }
        ownsPinch.value = 0;
      });
    const doubleTap = Gesture.Tap().numberOfTaps(2).enabled(!bgAdjustMode)
      .onEnd((e, success) => {
        'worklet';
        if (!success) return;
        if (handleHit(e.x, e.y)) return; // knob taps are chrome — no cycle
        const k = hitTest(e.x, e.y);
        if (k !== '') runOnJS(applyPresetCycle)(k);
      });
    const singleTap = Gesture.Tap().numberOfTaps(1).enabled(!bgAdjustMode)
      .onEnd((e, success) => {
        'worklet';
        if (!success) return;
        if (handleHit(e.x, e.y)) return; // knob taps keep the selection
        runOnJS(applyTapSelect)(hitTest(e.x, e.y));
      });
    return Gesture.Simultaneous(pan, pinch, Gesture.Exclusive(doubleTap, singleTap));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgAdjustMode, canvasW, canvasH, layerSize, guideCtx, persistPlacement, applyPresetCycle, applyTapSelect]);

  if (!run) return <View style={st.root} />;

  // ── metric values — the ruled three. 시간 = SINGLE 총 시간 (owner lean
  // adopted: the stranger reading a story understands wall time; the
  // moving·총 pair is analysis-grade and lives on 활동 상세). 페이스 keeps
  // the moving-based VALUE (fallback-chained) — the honest average.
  // Pace-convention ruling (8/3, Jeju 8'51"/7'52" field evidence): 평균 페이스
  // = the server-stored TOTAL-time pace, everywhere the label appears — the
  // card must match the run-detail hero exactly. Moving pace lives only in
  // the analysis card, under its own label.
  const avgPace = run.avg_pace_sec_per_km;
  const title = run.title ?? timeTitle(run.ran_at, lang);
  const rows: [ShareMetricKey, string, string][] = [];
  if (prefs.metrics.dist) rows.push(['dist', `${fmtDist(run.distance_km, units, 2)}${distUnit(units)}`, t('shr.metricDist')]);
  if (prefs.metrics.pace && avgPace != null) rows.push(['pace', `${fmtPaceIn(avgPace, units)}${paceUnit(units)}`, t('shr.metricPace')]);
  if (prefs.metrics.time) rows.push(['time', fmtDuration(run.duration_sec), t('shr.metricTime')]);

  // Slice 2 — IMAGE EXPORT WAKES (the honest caption's promise fulfilled):
  // view-shot captures the composed canvas (route layer, metrics, wordmark,
  // photo bg with dim — the view tree as seen) at 3x for story quality →
  // OS share sheet (whose Save Image row works via the plist key shipped in
  // build 8). Adjust-mode badge is excluded by exiting the mode first.
  const exportCard = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      if (bgAdjustMode || selected) {
        setBgAdjustMode(false);
        setSelected(null); // selection border must never reach the capture
        await new Promise(r => setTimeout(r, 120)); // let badge/border unmount
      }
      const uri = await captureRef(canvasRef, {
        format: 'png', quality: 1, result: 'tmpfile',
        width: 1080, height: Math.round(1080 * (canvasH / canvasW)),
      });
      await Share.share({ url: uri });
    } catch { /* dismissed or capture failure — nothing to clean */ }
    setExporting(false);
  };

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
        <Text style={st.hTitle}>{t('shr.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {/* ── THE CARD ── */}
        <View style={st.canvasWrap}>
          {/* 8/3 selection model: the canvas-level detector carries the
              anywhere-channel + tap selection (arbitration table at the
              canvasGesture definition) */}
          <GestureDetector gesture={canvasGesture}>
          <View ref={canvasRef} collapsable={false} style={[st.canvas, { width: canvasW, height: canvasH }]}>
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
                <Text style={st.bgModeTxt}>{t('shr.bgAdjusting')}</Text>
              </View>
            )}

            {/* draggable route layer — Instagram-story grammar */}
            {route && (
              <GestureDetector gesture={gesture}>
                <Reanimated.View style={[st.routeLayer, { width: layerSize, height: layerSize, left: (canvasW - layerSize) / 2, top: (canvasH - layerSize) / 2 }, layerStyle]}>
                  <Svg viewBox={`0 0 ${layerSize} ${layerSize}`} width="100%" height="100%">
                    <AnimatedPath d={route.d} stroke={stroke} animatedProps={strokeProps} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.95} />
                    <AnimatedCircle cx={route.start[0]} cy={route.start[1]} animatedProps={startDotProps} fill="#fff" stroke={stroke} />
                    <AnimatedCircle cx={route.end[0]} cy={route.end[1]} animatedProps={endDotProps} fill={stroke} stroke="#fff" />
                  </Svg>
                  {selected === 'track' && <View pointerEvents="none" style={st.selBorder}><View style={st.selHandle} /></View>}
                </Reanimated.View>
              </GestureDetector>
            )}

            {/* v2: each metric = its own free layer (fixture white ink —
                dark-canvas family by design). Drag to place, pinch to size. */}
            {rows.map(([k, v, l]) => (
              <GestureDetector key={k} gesture={layerFor[k].gesture}>
                <Reanimated.View onLayout={layerFor[k].onLayout} style={[st.metricLayer, layerFor[k].style]}>
                  <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.statVal} onLayout={layerFor[k].onValueLayout}>{v}</Text>
                  <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.statLbl}>{l}</Text>
                  {selected === k && <View pointerEvents="none" style={st.selBorder}><View style={st.selHandle} /></View>}
                </Reanimated.View>
              </GestureDetector>
            ))}

            {/* 8/6 crew line — a free layer on the metric machinery (drag/
                pinch/guides/export identical); date-tier ink. Single Text =
                its own value sub-box (vw ≡ w — snap math degenerates cleanly). */}
            {showCrewName && run.crew_name ? (
              <GestureDetector gesture={layerFor.crew.gesture}>
                <Reanimated.View onLayout={layerFor.crew.onLayout} style={[st.crewLayer, layerFor.crew.style]}>
                  <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.crewTxt} onLayout={layerFor.crew.onValueLayout} numberOfLines={1}>
                    {run.crew_name}{showCrewCount && run.session_participant_count != null ? ` · ${tf('crw.nJoined', { n: run.session_participant_count })}` : ''}
                  </Text>
                  {selected === 'crew' && <View pointerEvents="none" style={st.selBorder}><View style={st.selHandle} /></View>}
                </Reanimated.View>
              </GestureDetector>
            ) : null}
            {/* permanent wordmark (re-ruling) — subtle corner, both formats */}
            <Text style={st.wordmark} pointerEvents="none">FreshRun</Text>
          </View>
          </GestureDetector>
          {/* smart-guide lines — OUTSIDE the captured ref (structural export
              exclusion: capture cannot see them, ever) + gesture-end clearing
              (belt). Render only while a drag is snapped. */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { width: canvasW, height: canvasH, alignSelf: 'center' }]}>
            <Reanimated.View style={[st.guideV, { height: canvasH }, guideVStyle]} />
            <Reanimated.View style={[st.guideH, { width: canvasW }, guideHStyle]} />
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

        {/* ── format + metric toggles (wordmark is permanent — no control) ── */}
        <View style={st.controls}>
          <View style={st.chipRow}>
            {(['1:1', '9:16'] as const).map(f => (
              <Pressable key={f} onPress={() => save({ ...prefs, format: f })} style={[st.chip, prefs.format === f && st.chipOn]}>
                <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={[st.chipTxt, prefs.format === f && st.chipTxtOn]}>{f === '1:1' ? t('shr.fmtSquare') : t('shr.fmtStory')}</Text>
              </Pressable>
            ))}
          </View>
          <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.groupLbl}>{t('shr.routeStyle')}</Text>
          <View style={st.chipRow}>
            {STROKE_COLORS.map(c => (
              <Pressable key={c} onPress={() => save({ ...prefs, strokeColor: c })} style={[st.colorDot, { backgroundColor: c }, (prefs.strokeColor ?? STROKE_COLORS[0]) === c && st.colorDotOn]} />
            ))}
            {STROKE_WEIGHTS.map(([w, label]) => (
              <Pressable key={w} onPress={() => save({ ...prefs, strokeWeight: w })} style={[st.chip, (prefs.strokeWeight ?? 4.5) === w && st.chipOn]}>
                <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={[st.chipTxt, (prefs.strokeWeight ?? 4.5) === w && st.chipTxtOn]}>{t(label)}</Text>
              </Pressable>
            ))}
          </View>
          {bgIsPhoto && (
            <>
              <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.groupLbl}>{t('shr.bgPhoto')}</Text>
              <View style={st.chipRow}>
                <Pressable onPress={() => { setSelected(null); setBgAdjustMode(m => !m); }} style={[st.chip, bgAdjustMode && st.chipOn]}>
                  <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={[st.chipTxt, bgAdjustMode && st.chipTxtOn]}>{bgAdjustMode ? t('shr.adjustDone') : t('shr.adjustBg')}</Text>
                </Pressable>
                <View style={st.dimSlider}>
                  <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.dimLbl}>{tf('shr.dim', { p: Math.round(bgDim * 100) })}</Text>
                  <SeededSlider
                    siteId="share-dim"
                    style={{ flex: 1 }}
                    minimumValue={0} maximumValue={0.6} step={0.05} value={bgDim}
                    onSlidingComplete={v => persistBg({ dim: Math.round(v * 20) / 20 })}
                    minimumTrackTintColor={C.accent} maximumTrackTintColor={C.border} thumbTintColor="#fff"
                  />
                </View>
              </View>
            </>
          )}
          <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.groupLbl}>{t('shr.metrics')}</Text>
          <View style={st.chipRow}>
            {(Object.keys(METRIC_LABELS) as ShareMetricKey[]).map(k => (
              <Pressable
                key={k}
                onPress={() => save({ ...prefs, metrics: { ...prefs.metrics, [k]: !prefs.metrics[k] } })}
                style={[st.chip, prefs.metrics[k] && st.chipOn]}
              >
                <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={[st.chipTxt, prefs.metrics[k] && st.chipTxtOn]}>{t(METRIC_LABELS[k])}</Text>
              </Pressable>
            ))}
            {run.crew_name ? (
              <Pressable
                onPress={() => setShowCrewName(v => !v)}
                style={[st.chip, showCrewName && st.chipOn]}
              >
                <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={[st.chipTxt, showCrewName && st.chipTxtOn]}>{t('shr.crewToggle')}</Text>
              </Pressable>
            ) : null}
            {/* count chip exists only while the name is ON (count-requires-
                name semantic) and the run actually carries a count */}
            {run.crew_name && showCrewName && run.session_participant_count != null ? (
              <Pressable
                onPress={() => setShowCrewCount(v => !v)}
                style={[st.chip, showCrewCount && st.chipOn]}
              >
                <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={[st.chipTxt, showCrewCount && st.chipTxtOn]}>{t('shr.crewCount')}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* ── actions — the export AWAKE (slice 2, build 8): image is the
               primary; text share survives as the secondary lane ── */}
        <View style={st.actions}>
          <Pressable onPress={exportCard} disabled={exporting} style={({ pressed }) => [st.exportLive, shadows.sm, (pressed || exporting) && { opacity: 0.85 }]}>
            <Icon name="image-outline" size={17} color="#0C1206" />
            <Text style={st.exportLiveTxt}>{exporting ? t('shr.exporting') : t('shr.export')}</Text>
          </Pressable>
          <Pressable onPress={shareText} style={({ pressed }) => [st.textShareBtn, pressed && { opacity: 0.7 }]}>
            <Icon name="share-outline" size={15} color={C.sub} />
            <Text style={st.textShareSubTxt}>{t('shr.textShare')}</Text>
          </Pressable>
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
  // smart guides — thin lime full-bleed (the PPT look); 74E827 = the house lime
  guideV: { position: 'absolute', left: 0, top: 0, width: 1.5, backgroundColor: '#74E827', opacity: 0 },
  guideH: { position: 'absolute', left: 0, top: 0, height: 1.5, backgroundColor: '#74E827', opacity: 0 },
  statVal:    { fontSize: 21, fontWeight: '800', color: '#fff', letterSpacing: -0.6, fontVariant: ['tabular-nums'], textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 5 },
  statLbl:    { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.75)', letterSpacing: -0.2, textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 4 },
  wordmark:   { position: 'absolute', right: 14, bottom: 12, fontSize: 12, fontWeight: '800', letterSpacing: -0.3, color: 'rgba(255,255,255,0.82)', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  // 8/6 free-layer join: box anchored at 0,0 like metricLayer (transform
  // positions it); ink keeps the static line's date-tier typography + the
  // metric family's text shadow (free placement can land on bright photo
  // areas the fixed bottom-left corner never met). maxWidth dropped — the
  // layer is measured/pinchable like its siblings.
  crewLayer: { position: 'absolute', left: 0, top: 0 },
  // 8/3 selection visual — the Stories treatment: subtle dashed border +
  // soft glow, white ink (the dark-canvas family; the accent line is the
  // ROUTE's color — a white selection reads as chrome, not content).
  // Drawn, not labeled (string-free). pointerEvents none; excluded from
  // export by the pre-capture deselect.
  selBorder: {
    position: 'absolute', top: -6, bottom: -6, left: -6, right: -6,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 8,
    shadowColor: '#fff', shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 0 },
  },
  // 8/3 amend: the one-finger resize knob — 16px circle centered ON the
  // border's bottom-right corner (right/bottom -8 relative to the border
  // box); same white chrome, dark hairline for photo legibility. VISUAL
  // only — the 36pt touch logic lives in the canvas hit-test (handleHit);
  // rides the border, so it scales with the layer and joins the
  // pre-capture deselect for free.
  selHandle: {
    position: 'absolute', right: -8, bottom: -8, width: 16, height: 16,
    borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.35)',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
  },
  crewTxt: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.85)', letterSpacing: -0.2, textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 4 },

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
  exportLive:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#74E827', borderRadius: 14, paddingVertical: 15 },
  exportLiveTxt: { fontSize: 15, fontWeight: '800', color: '#0C1206', letterSpacing: -0.3 },
  textShareSubTxt: { fontSize: 13, fontWeight: '600', color: C.sub, letterSpacing: -0.2 },
});
