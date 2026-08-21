/**
 * 자유 러닝 — live tracking screen (bundle: tracking-screen.jsx), slice 1.
 *
 * States (use-run-tracker): idle → countdown → running ⇄ paused → ended.
 *
 * Deliberate deviations from the bundle:
 *  - No auto-start: idle state with a 러닝 시작 CTA → fullscreen 3-2-1
 *    countdown → running.
 *  - No X/close button in any state. Idle exits via the normal back gesture;
 *    from countdown on, hold-to-stop is the only way out.
 *
 * Slice 2: real GPS behind use-run-tracker (permission gate on start, filtered
 * watch stream, rolling-window pace). Foreground-only; screen kept awake while
 * a run is active. Saving (POST /api/runs) and post-run screens are slice 3.
 */
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { Gesture, GestureDetector, GestureHandlerRootView, type GestureType } from 'react-native-gesture-handler';
import MapView, { Marker, Polyline } from 'react-native-maps';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Icon } from '@/components/ui';
import { SEOUL_FALLBACK, useCurrentLocation } from '@/hooks/use-current-location';
import { courseLengthM, courseTangentAt, nearestOnCourse, nextTurn, OFF_COURSE_ENTER_M, OFF_COURSE_EXIT_M, pointAhead, sliceAhead, snapToCourse } from '@/lib/course-nav';
import { runSession } from '@/store/run-session';
import { useRunTracker } from '@/hooks/use-run-tracker';
import { composeFinishCue, composeSplitCue, composeStartCue, setSessionMuted, speakCue, stopSpeech } from '@/lib/audio-coach';
import { activateRunAudioSession, deactivateRunAudioSession } from '@/lib/audio-session';
import { useQuota } from '@/store/use-quota';
import { addLiveActivityActionListener } from '@/modules/live-activity';
import { clearActiveCourse, getActiveCourse } from '@/store/active-course';
import * as Location from 'expo-location';
import { getLang, t, tfIn, useLang } from '@/lib/i18n';
import { getPendingRun, refreshPendingRun, setPendingRun } from '@/store/pending-run';
import { useLocalProfile } from '@/store/use-local-profile';
import { useSettings } from '@/store/use-settings';
import { distUnit, fmtDist, fmtPaceIn, paceUnit } from '@/lib/run-format';
import { accentShadow, radius as R, routeStroke, shadows, spacing as S, type Tokens, DENSE_MAX_FONT_SCALE} from '@/lib/theme';
import { useScheme } from '@/store/use-scheme';
import { useStyles, useTokens } from '@/hooks/use-tokens';

const MAP_H = 330;                    // expanded-detent map viewport (canvas)

// ── T1.5/1.7 nav camera posture (course mode) — TUNABLE. T1.7 retune from
// the T-map comparison (owner-measured deltas): puck 40-45%→target 20-25%
// screen height · forward range ~200m→300-400m · pitch reads 45→~57.
// nav v2 (8/3 course-run convictions): FLAT 2D — pitch 0, course-up
// rotation KEPT (the world still turns; the runner always runs "up").
// Flat pair re-derived for the ~22% band: at pitch 0 the visible ground
// height ≈ the camera altitude (standard-FOV approximation — stated,
// field-tunable), so runner-behind-center = (0.50−0.22)·visH ≈ 0.28×420
// ≈ 118 → lookahead 120.
// nav v5 (8/3 living-room ruling — IMAGE 2 IS THE FRAMING: dot visible with
// route context, moderate zoom ≈ 2× the 420m view): one altitude constant,
// field-tunable; lookahead re-derived (0.28 × 850 ≈ 238 → 240).
const NAV_ALTITUDE_M = 850;   // v5 ruled framing (was 420 — read "tight" vs image 2)
const NAV_PITCH_DEG = 0;      // v2 FLAT (was 57 — field: tilt read as distortion, not depth)
// v5.2 (owner ruling 8/3 — tangent-vertical CONFIRMED; the 0.22 band hid
// the dot under the stats card): the dot's screen band, ~35% up — clearly
// above the collapsed card, course still owning the screen above. ONE
// fraction drives the lookahead for BOTH follow and recenter (courseCamera
// is the single math — the band is identical everywhere by construction).
const NAV_BAND_FRAC = 0.35;
const NAV_LOOKAHEAD_M = Math.round((0.5 - NAV_BAND_FRAC) * NAV_ALTITUDE_M); // ≈128 (was 240 at 0.22)
const FREE_RECENTER_ALTITUDE_M = 420; // free runs keep their prior close view (unchanged behavior)
// v3 follow-animation duration: with the LIVE dot during follow (the dot
// renders each raw fix instantly; the camera animates to its projection),
// the dot detaches from the ~22% spot for the animation window. Desk math:
// one fix-step ≈ 5m ≈ 5/420·850pt ≈ 10pt of screen slip — visible at
// 500ms, tight at 350ms (still completes well inside the 1-2s fix cadence,
// rotation stays smooth). Field-tunable.
const NAV_FOLLOW_MS = 350;    // was inline 500
// nav v4 (8/3 field screenshots): the custom dot's per-fix glide — short
// linear position animation so the dot glides, never teleports.
const DOT_GLIDE_MS = 300;

const NAV_ENTER_MS = 1800;    // overview → follow flight, flown DURING the countdown ("drive pressed")
// ── 8/3 nav-completion — ALL FIELD-TUNABLE (the walk judges) ──
// 8/3 tmap grammar (owner ruling — SUPERSEDES the compass-fusion standing
// rotation; ledger pointer at the fusion entry): the camera bears from
// MOVEMENT ONLY. Constants field-tunable.
const BEARING_HOLD_MPS = 0.5;   // below: GPS course is untrustworthy — HOLD the last bearing
// v2 two-speed blend (field: 0.35 lagged real turns by seconds): hard
// course changes converge FAST, straights stay gentle. Response math at
// run cadence (~1 fix / 1-2s): a 90° turn under FAST 0.65 leaves
// 31°→11°→4° residual in 3 fixes ≈ 2-4s (0.35 needed ~5-7 fixes).
const BEARING_ALPHA_SLOW = 0.3;
const BEARING_ALPHA_FAST = 0.65;
const BEARING_FAST_DEG = 15;    // |Δ| at/above → the fast lane
const SNAP_TO_ROUTE_M = 18;     // v2 display-only arrow snap (boundary — see the camera effect)
const ARRIVAL_M = 25;           // v2 go-to-start: arrival radius → NAVIGATING
// (v3: ARROW_ANCHOR_FRAC deleted with the arrow — the ~22% band survives
// as the CAMERA's own projection: lookahead × flat posture puts the runner
// there by construction; NAV_FOLLOW_MS below keeps the dot visually tied.)
const NEXT_BAND_M = 300;      // the emphasized "next stretch" band + the turn overlay's approach window
const TURN_EXECUTE_M = 40;    // T2 voice: the "지금 우회전" execute cue threshold (tunable — field decision)
// nav v6 (8/9 field): the heading cone + backward detection
const CONE_SMOOTH_ALPHA = 0.25;  // circular low-pass — a jittery cone is worse than none
const CONE_COMMIT_DEG = 0.5;     // v6.2 (owner): dropped 3°→0.5° — rules out threshold-filtering as the freeze cause; revisit the throttle after the fix is field-proven
const BACKWARD_M = 30;           // net regression vs window max → wrong-way cue (tunable)
const BACKWARD_RESET_M = 15;     // forward progress vs window min → re-arm turns
const BACKWARD_WINDOW_MS = 45_000;
const BACKWARD_COOLDOWN_MS = 60_000;
// T1.7 CLOSE (owner verdict from the field look, 2026-07-26): 320/57/180
// READS RIGHT — the baseline landed; the tuning panel stripped per the
// temp-probe doctrine without needing its session.
const SHEET_TOP = MAP_H - 22;         // sheet's expanded top edge (canvas -22 overlap)
const COMPACT_VISIBLE = 100;          // compact detent: handle + strip

// ─── nav v5: THE ONE CAMERA MATH (8/3 recenter fly-away conviction) ──────────
// Recenter and follow had drifted apart — divergence between them was this
// bug's whole GENUS (recenter's paused path fell to a course-less tail that
// could center on the location hook's SEOUL-FALLBACK coordinate; its
// running path lookahead-ed on a degenerate ?? 0 bearing). BOTH now call
// this single function. v5.1 (owner ruling): "north-up on a course run"
// DIED — a course always has a direction. The bearing LADDER (see
// courseBearing below) guarantees a bearing on every course-run call:
// live movement COG → course tangent → (null only survives as a
// course-less residual: center-on-runner north-up, free-run family).
function courseCamera(runner: { lat: number; lng: number }, bearing: number | null) {
  const center = bearing != null ? pointAhead(runner, bearing, NAV_LOOKAHEAD_M) : runner;
  return {
    center: { latitude: center.lat, longitude: center.lng },
    altitude: NAV_ALTITUDE_M,
    pitch: NAV_PITCH_DEG,
    heading: bearing ?? 0,
  };
}

// ─── tmap blinking turn overlay (8/3 part 4) ─────────────────────────────────
// Big black-on-white approach card: bold direction arrow + live countdown.
// Blink = slow opacity pulse at ~1Hz (500ms down + 500ms up, the StatusBadge
// loop's grammar) — attention without strobe. String-free (glyph + Nm).

function TurnOverlay({ dir, distM }: { dir: 'left' | 'right'; distM: number }) {
  const st = useStyles(makeSt);
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.35, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1,    duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View pointerEvents="none" style={[st.turnOverlayWrap, { opacity }]}>
      <View style={st.turnOverlayCard}>
        <Icon name={dir === 'right' ? 'arrow-redo' : 'arrow-undo'} size={44} color="#0C0F14" />
        <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.turnOverlayDist}>{Math.round(distM)}m</Text>
      </View>
    </Animated.View>
  );
}

// ─── Status badge (blinking dot while running) ────────────────────────────────

function StatusBadge({ paused }: { paused: boolean }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (paused) { opacity.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.25, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1,    duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [paused, opacity]);

  return (
    <View style={st.badge}>
      <Animated.View style={[st.badgeDot, { backgroundColor: paused ? C.sun : C.accent, opacity }]} />
      <Text style={st.badgeTxt}>{paused ? t('trk.paused') : t('trk.running')}</Text>
    </View>
  );
}

// ─── Waveform (12 bars, animated while active) ────────────────────────────────

const WAVE_BARS = [10, 18, 26, 14, 22, 30, 16, 12, 24, 20, 28, 14];

function Waveform({ active }: { active: boolean }) {
  const st = useStyles(makeSt);
  const scales = useRef(WAVE_BARS.map(() => new Animated.Value(1))).current;

  useEffect(() => {
    if (!active) {
      scales.forEach(v => { v.stopAnimation(); v.setValue(1); });
      return;
    }
    const loops = scales.map((v, i) =>
      Animated.loop(Animated.sequence([
        Animated.delay(i * 70),
        Animated.timing(v, { toValue: 0.45, duration: 450, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 1,    duration: 450, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])),
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [active, scales]);

  return (
    <View style={st.wave}>
      {WAVE_BARS.map((h, i) => (
        <Animated.View
          key={i}
          style={[st.waveBar, { height: h, opacity: active ? 1 : 0.4, transform: [{ scaleY: scales[i] }] }]}
        />
      ))}
    </View>
  );
}

// ─── Press-and-hold stop (ring fills over HOLD_MS) ───────────────────────────

const HOLD_MS = 1100;
const HOLD_DRIFT_MAX = 34; // finger drift allowance while HOLDING (owner: 20px must survive)
// Hold-begin Light fires only once the press outlives a tap — feedback for
// the real gesture, never for a bare tap (ring-honesty ruling 2026-07-26)
const HOLD_LIGHT_AT_MS = 180;
// Early release: fast reverse — the ring visibly "lets go" (owner lean)
const HOLD_SNAPBACK_MS = 150;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// size prop (T-B): 72 = expanded controls row, 44 = compact strip — the ring
// geometry scales; the 1100ms hold semantics never change.
//
// Gesture semantics (owner ruling, T-B final): the hold is an RNGH LongPress
// (minDuration = the hold itself, maxDistance = drift allowance). The sheet's
// pan (now @gorhom/bottom-sheet's content pan) waits for it via the sheet's
// `waitFor` — HOLDING with ≤34px drift keeps the sheet pan blocked and ends
// the run; DELIBERATE travel beyond 34px FAILS the hold, freeing the pan
// mid-gesture → sheet drags. No dead-zones.
function HoldStop({ onComplete, size = 72, showLabel = true, gestureRef }: {
  onComplete: () => void; size?: number; showLabel?: boolean;
  /** Exposes this hold to the sheet's waitFor (Gesture.withRef). */
  gestureRef?: React.MutableRefObject<GestureType | undefined>;
}) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const HOLD_SZ = size, HOLD_R = size / 2 - 3, HOLD_CIRC = 2 * Math.PI * HOLD_R;
  const [holding, setHolding] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  // run.haptics setting gates all haptic feedback here (persisted via profile)
  const hapticsOn = useSettings(s => s.settings.run.haptics);

  // ── Ring lifecycle rides RAW TOUCH events, not gesture verdicts ────────────
  // Field conviction (2026-07-26 re-test, group 22f92d5f): onFinalize does NOT
  // fire on-device for sub-minDuration taps — the ring ran a full orbit, stayed
  // full, and the next hold inherited it. The touch lane, by contrast, provably
  // fires: activation works, and activation IS the touch stream timed against
  // minDuration. So the visual + the Light timer bind to onTouchesDown/Up/
  // Cancelled (delivered from the touch stream regardless of the state
  // machine's verdict); the LongPress state machine keeps ONE job — activation.
  // onFinalize stays only as an idempotent belt (drift-fail path), guarded by
  // holdingRef so a ghost or a double-fire is a no-op.
  const lightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdingRef = useRef(false);   // multi-touch guard + idempotence
  const completedRef = useRef(false); // release-after-completion must not snap back
  const clearLight = () => {
    if (lightTimer.current) { clearTimeout(lightTimer.current); lightTimer.current = null; }
  };
  useEffect(() => clearLight, []);

  // Re-entry reset (ring × back-button seam, 2026-07-27): a COMPLETED fill
  // held on a screen being left forever (v2's completedRef) became a stale
  // claim once back-from-save made the screen returnable. Focus regain is the
  // reset hook — the session offers no transition (paused before back, paused
  // after), and focus cannot fire mid-gesture (gestures require an already-
  // focused screen; an in-flight press at focus-fire is skipped via
  // holdingRef, whose pressDown already zeroed the ring). This is the ONE
  // sanctioned writer besides the touch stream. Initial mount = zero → no-op;
  // the 종료→save exit animates untouched (reset rides return-focus only).
  useFocusEffect(useCallback(() => {
    if (holdingRef.current) return;
    completedRef.current = false;
    clearLight();
    setHolding(false);
    progress.stopAnimation();
    progress.setValue(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  const pressDown = () => {
    if (holdingRef.current) return; // second finger — the first press owns the ring
    holdingRef.current = true;
    completedRef.current = false;
    setHolding(true);
    // defect-② fix: every gesture starts from zero — no inherited fill
    progress.stopAnimation();
    progress.setValue(0);
    // Light waits out the tap window — a bare tap gets NO buzz
    if (hapticsOn) lightTimer.current = setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), HOLD_LIGHT_AT_MS);
    Animated.timing(progress, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false }).start();
  };
  const pressUp = () => {
    if (!holdingRef.current || completedRef.current) return;
    holdingRef.current = false;
    clearLight();
    setHolding(false);
    Animated.timing(progress, { toValue: 0, duration: HOLD_SNAPBACK_MS, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  };
  const complete = () => {
    completedRef.current = true;
    holdingRef.current = false;
    clearLight();
    setHolding(false);
    if (hapticsOn) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onComplete();
  };

  let hold = Gesture.LongPress()
    .minDuration(HOLD_MS)          // activation = the hold completing
    .maxDistance(HOLD_DRIFT_MAX)   // beyond this the hold FAILS → sheet pan freed
    .shouldCancelWhenOutside(false) // drift may leave the small ring — maxDistance governs
    .runOnJS(true)
    .onTouchesDown(pressDown)
    .onTouchesUp(pressUp)
    .onTouchesCancelled(pressUp)
    .onStart(complete)
    .onFinalize((_e, success) => { if (!success) pressUp(); }); // belt — idempotent
  if (gestureRef) hold = hold.withRef(gestureRef);

  const dashOffset = progress.interpolate({ inputRange: [0, 1], outputRange: [HOLD_CIRC, 0] });

  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <View style={{ width: HOLD_SZ, height: HOLD_SZ, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={HOLD_SZ} height={HOLD_SZ} viewBox={`0 0 ${HOLD_SZ} ${HOLD_SZ}`} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
          <Circle cx={HOLD_SZ / 2} cy={HOLD_SZ / 2} r={HOLD_R} fill="none" stroke={C.danger + '2A'} strokeWidth={4} />
          <AnimatedCircle
            cx={HOLD_SZ / 2} cy={HOLD_SZ / 2} r={HOLD_R} fill="none"
            stroke={C.danger} strokeWidth={4} strokeLinecap="round"
            strokeDasharray={`${HOLD_CIRC}`} strokeDashoffset={dashOffset}
          />
        </Svg>
        <GestureDetector gesture={hold}>
          <View
            style={[
              st.stopBtn,
              { width: size - 16, height: size - 16 },
              accentShadow(C.danger),
              { transform: [{ scale: holding ? 0.86 : 1 }] },
            ]}
          >
            <View style={[st.stopSquare, { width: Math.round(size * 0.25), height: Math.round(size * 0.25) }]} />
          </View>
        </GestureDetector>
      </View>
      {showLabel && (
        <Text style={[st.holdLabel, { color: holding ? C.danger : C.faint }]}>
          {holding ? t('trk.holdKeep') : t('trk.holdHint')}
        </Text>
      )}
    </View>
  );
}

// Mounted only while a run is active — keeps the screen on for the duration.
function KeepAwake() {
  useKeepAwake();
  return null;
}

// ─── Countdown overlay ────────────────────────────────────────────────────────

function CountdownOverlay({ value }: { value: number }) {
  const st = useStyles(makeSt);
  const scale = useRef(new Animated.Value(1.4)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    scale.setValue(1.4);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(scale,   { toValue: 1, duration: 260, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [value, scale, opacity]);

  return (
    <View style={st.countdownOverlay}>
      <Animated.Text style={[st.countdownNum, { opacity, transform: [{ scale }] }]}>
        {value}
      </Animated.Text>
      <Text style={st.countdownSub}>{t('trk.countdownSub')}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

function fmtElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function TrackingScreen() {
  const lang = useLang(); // 8/6 back-sweep: render tfIn anchor
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  // Course mode ("이 코스 달리기"): map shows the course shape, pill shows its
  // title, and the finished run links route_id. Absent → free run, as before.
  const [course] = useState(() => getActiveCourse());
  const resolved = useScheme(s => s.resolved); // course under-layer stroke keys on scheme
  useEffect(() => () => clearActiveCourse(), []);

  // Settings (run.haptics gates hold-stop feedback) — hydrate in case the
  // profile tab was never opened this session.
  useEffect(() => { useSettings.getState().hydrate(); }, []);
  // kcal model needs the local weight hydrated before the run ends
  useEffect(() => { useLocalProfile.getState().hydrate(); }, []);
  const {
    state, countdownValue, elapsedSec, distanceKm, paceSecPerKm, moving, kcal,
    start, togglePause, snapshot, livePath, lastFixAgeSec, stillnessAccruing,
  } = useRunTracker();

  // ── 오디오 코치 v1 (premium, LOCAL cues — owner scope 2026-07-14) ─────────
  // Gate: premium (server-truth quota) AND the 음성 안내 master (server-
  // persisted run.voice_cue) AND not muted. Split cues fire on interval-km
  // thresholds from the tracker's own odometer (the 07-11 filter fix made it
  // trustworthy). kcal line = honest-estimate rule (null → silently omitted).
  const isPremium = useQuota(q => q.isPremium);
  const voiceCue  = useSettings(s2 => s2.settings.run.voice_cue);
  // ①: the background task keeps tracking through a sleeping screen, so
  // 화면 항상 켜기 is now a genuine user choice, not a GPS crutch.
  const keepScreenOn = useSettings(s2 => s2.settings.run.keep_screen_on);
  // 지연 report fix (2026-07-21): NO render-path subscription to the coach
  // store — every cue-time read is an imperative getState() snapshot at fire
  // time. The 783 compiler contract's spirit applied preemptively: the
  // reported toggles-ignored staleness matches the compiled-memoization
  // class on this same screen, and fire-time snapshots kill the entire
  // class by construction (the start-cue's intervalKm reset already used
  // this idiom — now everything does).
  const [coachMuted, setCoachMuted] = useState(false);
  useEffect(() => { useQuota.getState().hydrate(); }, []);
  const coachActive = isPremium && voiceCue && !coachMuted;
  // coach detail settings live on settings.audio_coach now (server-migration
  // slice 2026-07-23) — same fire-time snapshot idiom, one store fewer
  const nextCueKmRef = useRef<number>(useSettings.getState().settings.audio_coach.cue_interval_km);
  const prevStateRef = useRef(state);

  // run lifecycle → start cue + threshold reset; stop speech on leave/pause
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    // #12 session rider: arm the audio session when the run arms — the
    // countdown's ~3s means ducking is in force before the start cue speaks
    if (prev === 'idle' && state === 'countdown') {
      // Session mute is PER-RUN: every run starts unmuted (the button is a
      // this-session override, not a preference — that's settings voice_cue)
      setSessionMuted(false);
      setCoachMuted(false);
      activateRunAudioSession();
      // T1.5 "drive pressed": in course mode, fly overview → follow posture
      // DURING the countdown (the overlay lifts onto an already-set camera)
      if (courseCoords.length > 1 && hereCoord) {
        mapRef.current?.animateCamera(
          { center: { latitude: hereCoord.lat, longitude: hereCoord.lng }, altitude: NAV_ALTITUDE_M, pitch: NAV_PITCH_DEG },
          { duration: NAV_ENTER_MS },
        );
      }
    }
    if (prev === 'countdown' && state === 'running') {
      const coach = useSettings.getState().settings.audio_coach; // fire-time snapshot
      nextCueKmRef.current = coach.cue_interval_km; // fresh run
      // countdown-go (haptics enumeration 2026-07-23): Light impact at 출발 —
      // fire-time gate, same idiom as every cue-time read on this screen
      if (useSettings.getState().settings.run.haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // self-verifying start cue — names the armed interval (M1 episode fix)
      if (coachActive) speakCue(composeStartCue(coach.cue_interval_km, useSettings.getState().settings.units), coach.rate);
    }
    // Pause/resume confirmation buzzes (vocabulary expansion 2026-07-23):
    // a pocketed fumble gets ANSWERED without looking. Riding the state
    // TRANSITION (not the button) catches every entry point — UI button,
    // Live-Activity action, and the future 자동 일시정지 inherits free
    // (its build must still own the ledgered buzz constraint). Patterns:
    // pause = ONE FIRM (Heavy); resume = LIGHT DOUBLE — both distinct from
    // split's Medium single and countdown-go's Light single.
    if (prev === 'running' && state === 'paused') {
      if (useSettings.getState().settings.run.haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      // Cut any in-flight split cue FIRST (a pause silences the coach). This
      // call used to sit at the effect TAIL — where it executed AFTER the
      // auto-pause cue below and killed it in the same pass (Speech.stop
      // cancels queued utterances). Convicted on the 8/3 canyon walk: the
      // pause fired with no voice. Order is the fix; the tail now handles
      // 'idle' only.
      stopSpeech();
      // 자동 일시정지 (8/2): never-silent — the AUTO event announces itself
      // (manual = the runner did it; no cue). Backgrounded: haptic no-ops but
      // TTS rides the live audio session + the LA flips to paused; voice-off
      // + backgrounded = LA-visual only (RULED accepted — the lock screen is
      // where a pocketed runner looks).
      wasAutoPauseRef.current = runSession.getPauseSource() === 'auto';
      if (wasAutoPauseRef.current && useSettings.getState().settings.run.voice_cue) {
        speakCue(t('spk.autoPaused'), useSettings.getState().settings.audio_coach.rate);
      }
    }
    if (prev === 'paused' && state === 'running') {
      if (useSettings.getState().settings.run.haptics) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setTimeout(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }, 140);
      }
      if (wasAutoPauseRef.current && useSettings.getState().settings.run.voice_cue) {
        speakCue(t('spk.autoResumed'), useSettings.getState().settings.audio_coach.rate);
      }
      wasAutoPauseRef.current = false;
    }
    if (state === 'idle') stopSpeech(); // paused handled in-branch (order-sensitive — see above)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  useEffect(() => () => { stopSpeech(); setSessionMuted(false); deactivateRunAudioSession(); }, []); // unmount safety (+ session-mute scope ends with the screen)

  // interval-split watcher — catch-up-safe (advances past every crossed
  // threshold). ONE EVENT, TWO CHANNELS (haptics ruling 2026-07-23): the
  // crossing feeds voice AND buzz, each behind its own gate — so the buzz
  // fires for voice-off/free runners too. Neither channel live → the
  // threshold is LEFT for catch-up (pre-existing mid-run re-enable
  // semantics, unchanged). Buzz gate is a fire-time snapshot; the threshold
  // itself stays the coach's intervalKm for both channels.
  useEffect(() => {
    if (state !== 'running') return;
    if (distanceKm < nextCueKmRef.current) return;
    const buzzOn = useSettings.getState().settings.run.haptics;
    if (!coachActive && !buzzOn) return;
    const coach = useSettings.getState().settings.audio_coach; // fire-time snapshot (지연 fix)
    const spokenAt = nextCueKmRef.current;
    while (distanceKm >= nextCueKmRef.current) nextCueKmRef.current += coach.cue_interval_km;
    // Medium — distinct from the tab bars' Light and hold-stop's Success
    if (buzzOn) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (coachActive) {
      const text = composeSplitCue({
        km: spokenAt,
        elapsedSec,
        paceSecPerKm,
        kcal, // estimateKcal-driven — null without confirmed weight (honest rule)
        items: { dist: coach.announce_distance, pace: coach.announce_pace, kcal: coach.announce_calories },
        units: useSettings.getState().settings.units,
      });
      if (text) speakCue(text, coach.rate, 'coach'); // droppable: a turn cue in flight outranks a pace report
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distanceKm, state, coachActive]);


  // ── T-A: real map (consumer of the tracker's read-only surface ONLY) ──
  const { coordinate: hereCoord, status: locStatus } = useCurrentLocation();
  const mapRef = useRef<MapView>(null);
  // Follow-camera suspension (v2, her 8/3 tester relay): any user gesture
  // pauses following INDEFINITELY — the 8s timeout WAS the defect (adjusted
  // views snapped back mid-inspection). The existing re-center button is the
  // only way back to follow; no new UI.
  const lastUserPanRef = useRef(0);
  const recenterShownRef = useRef(false);
  const [recenterVisible, setRecenterVisible] = useState(false);

  // Re-draw the live polyline only when a fix was actually ACCEPTED
  // (length change) — the 500ms metrics tick alone never re-creates it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const drawnPath = useMemo(() => livePath.map(p => ({ latitude: p.lat, longitude: p.lng })), [livePath.length]);

  const courseCoords = useMemo(
    () => (course?.polyline ?? []).map(p => ({ latitude: p.lat, longitude: p.lng })),
    [course],
  );

  // ── nav v2 (8/3): the GO-TO-START chapter — PRE_START → NAVIGATING,
  // one-way. Trigger: the first accepted fix within ARRIVAL_M of the course
  // start (a run beginning at the start transitions on fix #1). Course-nav
  // proper (turn overlay/marker + off-route) engages only in NAVIGATING —
  // pre-start the runner is LEGITIMATELY off the line and the guidance
  // chapter owns the screen (stated deviation from item-6 "untouched":
  // one phase gate per consumer, machinery internals untouched).
  const [navPhase, setNavPhase] = useState<'pre' | 'nav'>('pre');
  useEffect(() => {
    // nav v6: arrival is detectable while PAUSED too (the 8/9 field repro —
    // pausing through the arrival moment latched 'pre' forever because the
    // check was running-only and livePath froze; run-session now buffers
    // position through a gated pause, and this gate accepts both states)
    if (courseCoords.length < 2 || navPhase !== 'pre' || (state !== 'running' && state !== 'paused')) return;
    const here = livePath[livePath.length - 1];
    const s0 = course?.polyline?.[0];
    if (!here || !s0) return;
    const kx = Math.cos((here.lat * Math.PI) / 180) * 111_320;
    const d = Math.hypot((here.lng - s0.lng) * kx, (here.lat - s0.lat) * 110_540);
    if (d <= ARRIVAL_M) {
      setNavPhase('nav');
      runSession.beginAccumulation(); // nav v6: the session TRULY begins here
      // ONE arrival cue, voice_cue-gated (the off-route cue's exact pattern).
      // nav v6 4(b): when the first turn is already inside the window, the
      // cue extends with the first instruction — composed from the existing
      // keys (direction+distance only; the real-POI naming rule keeps names
      // out). That turn's approach flag is consumed so T2 won't repeat it.
      if (useSettings.getState().settings.run.voice_cue) {
        let text = t('trk.startCue');
        const firstTurn = course?.polyline ? nextTurn(course.polyline, 0) : null;
        if (firstTurn && firstTurn.distM <= NEXT_BAND_M) {
          const dd = Math.round(firstTurn.distM / 10) * 10;
          text += ' ' + tfIn(getLang(), firstTurn.dir === 'left' ? 'spk.turnApproachLeft' : 'spk.turnApproachRight', { d: dd });
          turnSpokenRef.current = { key: `${firstTurn.point.lat.toFixed(6)},${firstTurn.point.lng.toFixed(6)}`, approach: true, execute: false };
        }
        speakCue(text, useSettings.getState().settings.audio_coach.rate);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePath.length, courseCoords.length, navPhase, state]);
  // live distance to the start (pre-phase chip; re-derives per accepted fix)
  const toStartM = useMemo(() => {
    if (courseCoords.length < 2 || navPhase !== 'pre') return null;
    const here = livePath[livePath.length - 1];
    const s0 = course?.polyline?.[0];
    if (!here || !s0) return null;
    const kx = Math.cos((here.lat * Math.PI) / 180) * 111_320;
    return Math.hypot((here.lng - s0.lng) * kx, (here.lat - s0.lat) * 110_540);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePath.length, courseCoords.length, navPhase, course]);

  // ── T1 NAVIGATION (course runs ONLY — free runs keep zero delta) ──────────
  // nearest-segment index drives the ahead/behind emphasis; point-to-segment
  // distance drives off-course with hysteresis (enter 40m / exit 25m).
  const [nearestSeg, setNearestSeg] = useState(0);
  const [offCourse, setOffCourse] = useState(false);
  const [rejoinM, setRejoinM] = useState(0);
  // T1.6 nav strip: along-line progress → 남은 거리 · 도착 예상
  const [alongM, setAlongM] = useState(0);
  // 8/21 waypoint markers — ALWAYS-ON through the whole run (the POI
  // always-on rule's sibling): the runner sees upcoming waypoints ahead on
  // the route; passing one dismisses nothing. Middle waypoints only (출발/
  // 복귀 = the start flag/endpoint's job). NO voice cue in this slice —
  // the real-POI naming rule makes "지점 1" audio awkward; flagged for her
  // per-course capability flag (ledgered 8/8).
  const wpMarkers = useMemo(
    () => (course?.waypoints && course.waypoints.length > 2
      ? course.waypoints.slice(1, -1).map((wp, i) => ({ lat: wp.coordinate.lat, lng: wp.coordinate.lng, label: String(i + 1) }))
      : []),
    [course],
  );

  const courseLenM = useMemo(
    () => (course?.polyline && course.polyline.length > 1 ? courseLengthM(course.polyline) : 0),
    [course],
  );
  // Off-course haptic: Warning-class, the GPS-weak pattern's sibling —
  // rising-edge + 60s cooldown (the sibling's exact value: vocabulary
  // consistency beats a bespoke number) — run.haptics-gated, fire-time.
  const offBuzzAtRef = useRef(0);
  const wasAutoPauseRef = useRef(false); // auto-pause cue pairing (pause→resume)
  useEffect(() => {
    const poly = course?.polyline;
    // 8/2 belt: compute in 'paused' too — a mount-while-paused instance now
    // has a seeded livePath (hook fix), and this closes the class from the
    // screen end: remaining/off-course read truth in both live states.
    if ((state !== 'running' && state !== 'paused') || !poly || poly.length < 2) return;
    const here = livePath[livePath.length - 1];
    if (!here) return;
    const { segIndex, distM, alongM: am } = nearestOnCourse(poly, here);
    setNearestSeg(segIndex);
    setRejoinM(Math.round(distM));
    setAlongM(am);
    if (navPhase !== 'nav') { setOffCourse(false); return; } // v2: pre-start = legitimately off the line
    setOffCourse(prev => {
      const next = prev ? distM > OFF_COURSE_EXIT_M : distM > OFF_COURSE_ENTER_M;
      if (next && !prev) {
        const now = Date.now();
        if (now - offBuzzAtRef.current >= 60_000 && useSettings.getState().settings.run.haptics) {
          offBuzzAtRef.current = now;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
        // Off-route voice (owner + tester convergent ask 8/3): ONE line per
        // departure episode — this rising edge IS the banner's appearance
        // edge (enter/exit hysteresis debounces flapping); voice_cue-gated
        // like every cue. Hardcoded ko — slice-6/8 keying note.
        if (useSettings.getState().settings.run.voice_cue) {
          speakCue(t('spk.offRoute'), useSettings.getState().settings.audio_coach.rate);
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePath.length, state, course, navPhase]);

  // 8/3 nav-completion: the emphasized "next stretch" band (alongM →
  // alongM+NEXT_BAND_M, exact cuts on segments) + the first geometry-detected
  // turn ahead. Both recompute per alongM update (once per accepted fix —
  // a full walk over course vertices is trivial at that cadence).
  const turnAhead = useMemo(
    () => (courseCoords.length > 1 ? nextTurn(course?.polyline ?? [], alongM) : null),
    [courseCoords.length, course, alongM],
  );

  // ── T2 voice: turn-by-turn cues (8/8) — the overlay made audible ──────────
  // PARITY RULE: the voice announces exactly what the overlay shows — same
  // turn source (turnAhead), same gates (running · nav · !offCourse), same
  // 300m window. Two cues per turn instance: APPROACH at window entry
  // (distance = the live value the overlay renders, rounded to 10m for
  // speech), EXECUTE at TURN_EXECUTE_M. Dedup is structural like the
  // overlay's dismissal: flags key on the turn's course vertex — passing a
  // turn advances nextTurn to the following one (never behind), a new key
  // resets flags for the NEW turn only. Arriving inside the execute radius
  // consumes BOTH flags (no late "40미터 앞" after a 지금 cue). Off-route
  // yields by the same gate the overlay uses; voice_cue read at fire time
  // (arrival/off-route precedent); session mute + phase gates inherited via
  // speakCue. Free runs: no course → turnAhead is null by derivation →
  // structurally silent. tier 'turn' outranks coach splits (drop, not queue).
  const turnSpokenRef = useRef<{ key: string | null; approach: boolean; execute: boolean }>({ key: null, approach: false, execute: false });
  useEffect(() => {
    if (!turnAhead || state !== 'running' || navPhase !== 'nav' || offCourse) return;
    if (backwardRef.current) return; // v6 rule: turns are forward-defined — silent while wrong-way
    const key = `${turnAhead.point.lat.toFixed(6)},${turnAhead.point.lng.toFixed(6)}`;
    const flags = turnSpokenRef.current;
    if (flags.key !== key) { flags.key = key; flags.approach = false; flags.execute = false; }
    if (!useSettings.getState().settings.run.voice_cue) return; // fire-time read, never captured
    const rate = useSettings.getState().settings.audio_coach.rate;
    if (!flags.execute && turnAhead.distM <= TURN_EXECUTE_M) {
      flags.execute = true;
      flags.approach = true;
      speakCue(t(turnAhead.dir === 'left' ? 'spk.turnNowLeft' : 'spk.turnNowRight'), rate, 'turn');
    } else if (!flags.approach && turnAhead.distM <= NEXT_BAND_M) {
      flags.approach = true;
      const d = Math.round(turnAhead.distM / 10) * 10;
      speakCue(tfIn(getLang(), turnAhead.dir === 'left' ? 'spk.turnApproachLeft' : 'spk.turnApproachRight', { d }), rate, 'turn');
    }
  }, [turnAhead, state, navPhase, offCourse]);

  // ahead/behind split — behind dims, ahead keeps the full course stroke
  const courseNext = useMemo(
    () => (courseCoords.length > 1 ? sliceAhead(course?.polyline ?? [], alongM, NEXT_BAND_M).map(c => ({ latitude: c.lat, longitude: c.lng })) : []),
    [courseCoords.length, course, alongM],
  );
  const courseBehind = useMemo(
    () => (courseCoords.length > 1 ? courseCoords.slice(0, nearestSeg + 1) : []),
    [courseCoords, nearestSeg],
  );
  const courseAhead = useMemo(
    () => (courseCoords.length > 1 ? courseCoords.slice(nearestSeg) : []),
    [courseCoords, nearestSeg],
  );

  // ── tmap grammar (8/3, owner ruling): course-up from MOVEMENT ONLY.
  // COMPASS FUSION KILLED ENTIRELY — the watchHeadingAsync magnetometer
  // listener, the turn-in-place tilt rotation, and the 5° snap machinery
  // are REMOVED (not disabled). The camera bears from the GPS course
  // (runSession's course-over-ground), circular-low-passed so the world
  // doesn't jitter; below BEARING_HOLD_MPS there is no course — the last
  // bearing HOLDS (standing still keeps the world steady).
  const navBearingRef = useRef<number | null>(null);
  const navBearing = useCallback((): number | null => {
    const sp = runSession.getLastSpeedMps();
    const cog = runSession.getLastHeading();
    const prev = navBearingRef.current;
    if (cog != null && sp != null && sp >= BEARING_HOLD_MPS) {
      if (prev == null) {
        navBearingRef.current = cog;
      } else {
        const diff = ((cog - prev + 540) % 360) - 180;
        const a = Math.abs(diff) >= BEARING_FAST_DEG ? BEARING_ALPHA_FAST : BEARING_ALPHA_SLOW;
        navBearingRef.current = (prev + diff * a + 360) % 360;
      }
    }
    return navBearingRef.current;
  }, []);

  /** nav v5.1 BEARING LADDER (owner ruling 8/3 — the course path must run
      VERTICAL from the dot, standstill included):
      ① live movement bearing (speed ≥ BEARING_HOLD_MPS, smoothed COG) —
        skipped entirely when preferTangent (paused: a stale last-speed
        must not resurrect a movement bearing);
      ② the COURSE TANGENT at the runner's nearest on-course point, toward
        COURSE ORDER (the forward choice, stated: alongM monotonicity is
        not tracked today, so course-order is v1's honest rule — a runner
        legitimately traveling the line backward is MOVING, so rung ①
        owns their bearing and the tangent never fights them);
      ③ held/last bearing as residual (course-less calls — free-run family
        never reaches here). */
  const courseBearing = useCallback((raw: { lat: number; lng: number }, preferTangent = false): number | null => {
    const cog = navBearing(); // side effect: keeps the smoothed ref fresh
    const sp = runSession.getLastSpeedMps();
    if (!preferTangent && sp != null && sp >= BEARING_HOLD_MPS && cog != null) return cog;
    const tangent = course?.polyline && course.polyline.length > 1 ? courseTangentAt(course.polyline, raw) : null;
    if (tangent != null) return tangent;
    return cog;
  }, [navBearing, course]);

  // Camera follow on path growth (running only, not while user-panned)
  useEffect(() => {
    if (state !== 'running' || drawnPath.length === 0) return;
    if (lastUserPanRef.current) return; // user-adjusted view sticks until recenter
    // T1.5: full NAV POSTURE on COURSE runs — street altitude + pitch +
    // heading-up + forward-offset center (runner low, road ahead majority).
    // Heading null (pre-fix/at rest) → posture without rotation/lookahead.
    // Free runs keep the north-up center-follow verbatim (zero delta).
    const hasCourse = courseCoords.length > 1;
    const last = drawnPath[drawnPath.length - 1];
    if (!hasCourse) {
      mapRef.current?.animateCamera({ center: last }, { duration: 500 });
      return;
    }
    // v5 unified math: courseCamera owns the whole posture. Bearing null
    // (pre-first-movement) → center ON the runner north-up (no more ?? 0
    // lookahead into a nonsense direction). Camera-center snap unchanged
    // (display-only; HARD BOUNDARY per course-nav.ts helper doc).
    const raw = { lat: last.latitude, lng: last.longitude };
    const hereC = (navPhase === 'nav' && course?.polyline ? snapToCourse(course.polyline, raw, SNAP_TO_ROUTE_M) : null) ?? raw;
    // v5.1: the ladder — course runs ALWAYS have a bearing (tangent at
    // standstill) → the dot sits at the ~22% band in every camera state
    const followB = courseBearing(hereC);
    mapRef.current?.animateCamera(courseCamera(hereC, followB), { duration: NAV_FOLLOW_MS });
    camHeadingRef.current = followB ?? 0; // v6.1: we are the camera's heading commander — record it for the cone composition
     
  }, [drawnPath.length, state, drawnPath, courseCoords.length, courseBearing, navPhase, course]);

  // ── nav v4.2 (8/3 field: dot visible pre-start, DIES at press-start;
  // indoor-reproducible) — DOUBLE CONVICTION, desk-proven:
  // ① PRIMARY (the v4.1 hole, code-timeline proof): the tracksViewChanges
  //   flip timer keyed on `state !== 'idle'` — it starts at COUNTDOWN and
  //   flips false at +600ms, but the marker MOUNTS on the FIRST FIX
  //   (~countdown 3s + fix latency later) → mounted with false → the
  //   IDENTICAL snapshot-blank bug, unfixed. v4.2: the timer keys on the
  //   marker's ACTUAL mount (dotCoord != null).
  // ② BELT (eliminated wholesale): the Animated marker pipe is known-flaky
  //   on the new architecture, and a NaN reaching an Animated value poisons
  //   it permanently. v4.2 drops that pipe entirely — plain Marker +
  //   guarded React-state coordinate + a JS micro-lerp (3 steps over
  //   DOT_GLIDE_MS) keeps the glide contract; state can never be poisoned.
  //   snapToCourse desk-swept FINITE on all repro-adjacent shapes (start
  //   vertex/dup vertex/single segment) — NaN was not the mechanism; the
  //   guard ships as belt.
  // Position = snapped within SNAP_TO_ROUTE_M during NAVIGATING (display
  // snap; HARD BOUNDARY unchanged — raw GPS drives everything real), raw
  // elsewhere. Heading cone still skipped (course-up rotation encodes
  // direction).
  // nav v6.1 (owner ruling 8/9): the loop-direction CHEVRON at the start is
  // REMOVED — it never rotated anyway (AIRMapMarker implements neither
  // `rotation` nor `flat`; both props are Google-only — verified in native
  // source, the v6.1 conviction). The direction affordance is the EXTENDED
  // ARRIVAL CUE (spoken first direction) + the band once nav starts.

  // ── nav v6 ①: HEADING CONE (the v4 deferral repaid) ──────────────────────
  // STRICT BOUNDARY: the compass drives the DOT SPRITE ONLY — the camera
  // stays movement/course-tangent (the v2 compass-fusion lesson lives; a
  // compass touches rendering, never the camera). watchHeadingAsync fires on
  // change (iOS CLHeading, up to ~50Hz); we circular-low-pass (α 0.25) and
  // commit to React state only on ≥2° smoothed change — the cone glides.
  // trueHeading < 0 falls back to magHeading; no usable heading (accuracy
  // < 0 / no hardware / permission quirk) → cone hidden, plain dot stands.
  // v6.2 (지연 verdict: cone rendered but froze on 360° rotation): the
  // screen angle is now composed AT EVENT TIME and committed as STATE —
  // the old render-time `coneHeading - camHeadingRef.current` read a
  // non-reactive ref inside render, which the React Compiler may cache
  // (the formatter-cache class, this screen's own 783 lesson). Render is
  // now a pure state interpolation; every commit is a guaranteed re-render.
  const [coneScreenDeg, setConeScreenDeg] = useState<number | null>(null);
  const [coneRawDbg, setConeRawDbg] = useState<number | null>(null); // TEMP v6.2 diagnostic — strip after 지연's verdict
  const coneSmoothRef = useRef<number | null>(null);
  // v6.1: the camera's CURRENT heading as WE last commanded/synced it — the
  // cone's screen rotation composes as (worldHeading − cameraHeading)
  // because AIRMapMarker children are screen-billboards (no native
  // rotation/flat on Apple — verified in source). While standing (the
  // cone's whole use case) the camera bearing HOLDS, so the composition
  // base is static and every heading commit rotates the cone exactly.
  const camHeadingRef = useRef(0);
  useEffect(() => {
    // courseCoords-keyed (hasCoursePath declares later in the file — same truth)
    if (!(courseCoords.length > 1 && state !== 'idle')) { setConeScreenDeg(null); setConeRawDbg(null); coneSmoothRef.current = null; return; }
    let sub: { remove: () => void } | null = null;
    let dead = false;
    (async () => {
      try {
        const h = await Location.watchHeadingAsync((ev: Location.LocationHeadingObject) => {
          // v6.1 hide-condition fix: accuracy<0 (uncalibrated) previously hid
          // the cone entirely — but magHeading is usable while calibrating;
          // only a negative heading value itself means "no data".
          const deg = ev.trueHeading >= 0 ? ev.trueHeading : ev.magHeading;
          if (deg < 0) return;
          // TEMP v6.2 diagnostic (strip after verdict): raw heading before
          // smoothing — TF has no Metro console, so the on-cone readout
          // below is the observable; the log covers the dev lane.
          console.log('[cone] raw heading', Math.round(deg));
          setConeRawDbg(Math.round(deg));
          const prev = coneSmoothRef.current;
          let next = deg;
          if (prev != null) {
            const delta = ((deg - prev + 540) % 360) - 180;
            next = (prev + delta * CONE_SMOOTH_ALPHA + 360) % 360;
          }
          coneSmoothRef.current = next;
          // v6.2: compose HERE (event time — imperative ref read, compiler-
          // safe): screen = worldHeading − cameraHeading, normalized.
          const screen = (((next - camHeadingRef.current) % 360) + 360) % 360;
          setConeScreenDeg(c => (c == null || Math.abs(((screen - c + 540) % 360) - 180) >= CONE_COMMIT_DEG ? screen : c));
        });
        if (dead) h.remove(); else sub = h;
      } catch { /* no compass — plain dot, graceful */ }
    })();
    return () => { dead = true; sub?.remove(); };
  }, [courseCoords.length, state]);

  // ── nav v6 ⑤: BACKWARD DETECTION (on-line wrong-way) ─────────────────────
  // alongM regressing ≥ BACKWARD_M net vs the rolling-window MAX → one
  // corrective cue (cooldown-re-armable); forward ≥ BACKWARD_RESET_M vs the
  // window MIN clears it. STATED RULE: while backward, the turn system is
  // SILENT — turns are forward-defined; wrong directions are worse than
  // silence. Off-route machinery untouched (backward-on-line ≠ off-route:
  // the !offCourse gate here keeps the two states disjoint).
  const alongHistRef = useRef<{ t: number; m: number }[]>([]);
  const backwardRef = useRef(false);
  const backwardCueAtRef = useRef(0);
  useEffect(() => {
    if (navPhase !== 'nav' || state !== 'running' || offCourse) {
      alongHistRef.current = []; backwardRef.current = false; return;
    }
    const now = Date.now();
    const hist = alongHistRef.current;
    hist.push({ t: now, m: alongM });
    while (hist.length && hist[0].t < now - BACKWARD_WINDOW_MS) hist.shift();
    if (hist.length < 2) return;
    let maxM = -Infinity, minM = Infinity;
    for (const sm of hist) { if (sm.m > maxM) maxM = sm.m; if (sm.m < minM) minM = sm.m; }
    if (!backwardRef.current && alongM - maxM <= -BACKWARD_M) {
      backwardRef.current = true;
      if (now - backwardCueAtRef.current >= BACKWARD_COOLDOWN_MS && useSettings.getState().settings.run.voice_cue) {
        backwardCueAtRef.current = now;
        speakCue(t('spk.wrongWay'), useSettings.getState().settings.audio_coach.rate);
      }
    } else if (backwardRef.current && alongM - minM >= BACKWARD_RESET_M) {
      backwardRef.current = false;
    }
     
  }, [alongM, navPhase, state, offCourse]);

  const [dotCoord, setDotCoord] = useState<{ latitude: number; longitude: number } | null>(null);
  const dotCoordRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const dotLerpRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // v4.2 flip timer — keyed to the MARKER'S MOUNT (dotCoord), not the state
  // flip: false only after the mounted marker has had 600ms to paint;
  // resets whenever the marker unmounts.
  const [dotTracks, setDotTracks] = useState(true);
  const dotMounted = dotCoord != null;
  useEffect(() => {
    if (!(courseCoords.length > 1 && state !== 'idle' && dotMounted)) { setDotTracks(true); return; }
    const timer = setTimeout(() => setDotTracks(false), 600);
    return () => clearTimeout(timer);
  }, [courseCoords.length, state, dotMounted]);
  useEffect(() => {
    const last = drawnPath[drawnPath.length - 1];
    if (!last) return;
    const raw = { lat: last.latitude, lng: last.longitude };
    let p = (navPhase === 'nav' && course?.polyline ? snapToCourse(course.polyline, raw, SNAP_TO_ROUTE_M) : null) ?? raw;
    // NaN/invalid guard (belt): bad snap → raw; bad raw → keep the last good
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) p = raw;
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return;
    const target = { latitude: p.lat, longitude: p.lng };
    if (dotLerpRef.current) { clearInterval(dotLerpRef.current); dotLerpRef.current = null; }
    const from = dotCoordRef.current;
    if (!from) {
      // first fix seats instantly — no fly-in
      dotCoordRef.current = target;
      setDotCoord(target);
      return;
    }
    const STEPS = 3;
    let step = 0;
    dotLerpRef.current = setInterval(() => {
      step += 1;
      const fr = step / STEPS;
      const next = {
        latitude: from.latitude + (target.latitude - from.latitude) * fr,
        longitude: from.longitude + (target.longitude - from.longitude) * fr,
      };
      dotCoordRef.current = next;
      setDotCoord(next);
      if (step >= STEPS && dotLerpRef.current) { clearInterval(dotLerpRef.current); dotLerpRef.current = null; }
    }, DOT_GLIDE_MS / STEPS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawnPath.length, navPhase, course]);
  useEffect(() => () => { if (dotLerpRef.current) clearInterval(dotLerpRef.current); }, []);

  // (hoisted further 8/3 — the arrow spacing math needs it before the T-B fit)
  const { height: winH } = useWindowDimensions();



  // Center on the USER's RESOLVED location (T-B correction ②): the hook's
  // coordinate is Seoul-fallback-initialized (never null), so truthiness
  // fired the old center-once on the fallback at mount. status === 'granted'
  // is the real resolution signal — center once when it lands.
  //
  // L1 fix: skip user-centering only when there's real course GEOMETRY to
  // fit to (onMapReady fits those bounds) — NOT merely when a `course`
  // OBJECT exists. A 크루 러닝 sets `course` with polyline: null, so the old
  // `if (course ...)` guard skipped user-centering AND fit-to-bounds (empty
  // coords) → the map latched the Seoul fallback (the Jongno bug). Gate on
  // hasCoursePath so a geometry-less crew run centers on the user like a
  // free run does.
  const hasCoursePath = courseCoords.length > 1;
  const centeredOnUserRef = useRef(false);
  useEffect(() => {
    if (hasCoursePath || centeredOnUserRef.current) return;
    if (locStatus !== 'granted' || !hereCoord) return;
    centeredOnUserRef.current = true;
    mapRef.current?.animateCamera({ center: { latitude: hereCoord.lat, longitude: hereCoord.lng } }, { duration: 400 });
  }, [hasCoursePath, locStatus, hereCoord]);


  // Course fit — TO THE VISIBLE STRIP, not the full frame (leg-1 walk
  // conviction, 2026-07-21): the map is screen-sized behind the sheet, and
  // at idle the sheet is pinned expanded (canSlide gates on running/paused),
  // so only the top SHEET_TOP px are visible. The old full-frame fit
  // centered the course BEHIND the sheet — line rendered, never seen.
  // bottom padding = everything the sheet occludes; top clears the pill.
  // Called from onMapReady AND the MapView's onLayout: on iOS a fit inside
  // onMapReady can silently no-op when the frame hasn't settled — the
  // layout-settled call kills that branch. Guards: idle-only (the follow
  // camera owns a live run) and never after a user pan.
  const fitCourse = useCallback(() => {
    if (courseCoords.length < 2) return;
    if (state !== 'idle' || lastUserPanRef.current !== 0) return;
    mapRef.current?.fitToCoordinates(courseCoords, {
      edgePadding: {
        top: insets.top + 48,
        right: 40,
        bottom: winH - SHEET_TOP + 24,
        left: 40,
      },
      animated: false,
    });
  }, [courseCoords, state, insets.top, winH]);

  const onUserPan = () => {
    lastUserPanRef.current = Date.now();
    if (!recenterShownRef.current) {
      recenterShownRef.current = true;
      setRecenterVisible(true);
    }
  };
  const recenter = () => {
    lastUserPanRef.current = 0;
    recenterShownRef.current = false;
    setRecenterVisible(false);
    // v5 (the fly-away conviction): COURSE runs never reach the free tail
    // and never touch hereCoord — its Seoul-fallback initialization was the
    // "unrelated location" (paused recenter fell through to the tail with
    // an empty drawnPath → camera flew to 서울 중심). Course target chain:
    // last fix → course start → nothing (no-op). PAUSED now takes the nav
    // branch too, with bearing FORCED null (no lookahead while paused).
    if (hasCoursePath && state !== 'idle') {
      const t = drawnPath.length > 0
        ? { lat: drawnPath[drawnPath.length - 1].latitude, lng: drawnPath[drawnPath.length - 1].longitude }
        : course?.polyline?.[0] ?? null;
      if (!t) return;
      const hereC = (navPhase === 'nav' && course?.polyline ? snapToCourse(course.polyline, t, SNAP_TO_ROUTE_M) : null) ?? t;
      // v5.1: paused/standstill → the course TANGENT (preferTangent skips
      // the movement rung — a stale last-speed must not resurrect a COG)
      const bearing = courseBearing(hereC, state !== 'running');
      mapRef.current?.animateCamera(courseCamera(hereC, bearing), { duration: 400 });
      camHeadingRef.current = bearing ?? 0; // v6.1 cone composition bookkeeping
      return;
    }
    const target = drawnPath.length > 0
      ? drawnPath[drawnPath.length - 1]
      : hereCoord ? { latitude: hereCoord.lat, longitude: hereCoord.lng } : null;
    if (!target) return;
    // free-run recenter: the prior close view, unchanged (named constant)
    mapRef.current?.animateCamera({ center: target, altitude: FREE_RECENTER_ALTITUDE_M }, { duration: 400 });
  };

  // GPS-lost chip: >15s without a raw fix while running. 8/3 ruled interplay:
  // stillness detection PREEMPTS the chip — while evidence accrues in the
  // healthy-recent lane the chip suppresses (the old "standstill lights it"
  // caveat was the canyon walk's flicker); it fires only degraded-and-stale.
  const gpsLost = state === 'running' && lastFixAgeSec != null && lastFixAgeSec > 15 && !stillnessAccruing;
  // GPS-weak warning buzz (vocabulary expansion 2026-07-23): the chip's
  // honesty delivered to the pocket. RE-FIRE POLICY: rising-edge only (the
  // effect fires when gpsLost flips true) + a 60s cooldown floor — a
  // sustained loss buzzes ONCE; a flapping signal buzzes at most once a
  // minute, never machine-gunning the pocket. Warning notification pattern
  // (system triple) — unmistakably not a split/pause.
  const gpsBuzzAtRef = useRef(0);
  useEffect(() => {
    if (!gpsLost) return;
    if (!useSettings.getState().settings.run.haptics) return;
    const now = Date.now();
    if (now - gpsBuzzAtRef.current < 60_000) return;
    gpsBuzzAtRef.current = now;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, [gpsLost]);

  // ── T-B sheet — @gorhom/bottom-sheet (owner escalation after three
  // hand-rolled iterations shipped broken feel; the 미니플레이어 behavior —
  // touch anywhere → immediate attach → 1:1 tracking → velocity fling,
  // both directions — is this library's core job and no longer ours to
  // hand-validate). Built on the SAME RNGH+Reanimated already in the tree;
  // pure JS, Expo Go-safe. ──
  const sheetH = winH - SHEET_TOP;
  const runSnaps = useMemo(() => [COMPACT_VISIBLE, sheetH], [sheetH]);
  const [detent, setDetent] = useState<'expanded' | 'compact'>('expanded');
  // Slidable only mid-run; idle needs the start button, countdown is locked
  const canSlide = state === 'running' || state === 'paused';

  // Hold-stop relation, sheet-side: gorhom's `waitFor` takes ONE GestureRef
  // (arrays nest un-flattened into requireToFail and get silently dropped —
  // verified in RNGH source). Each HoldStop owns a real ref; activeHoldRef's
  // .current is swapped to the detent's hold. RNGH re-resolves relation refs
  // in a microtask on every detector update, so the swap lands on the next
  // render after a detent change.
  const holdRefExpanded = useRef<GestureType | undefined>(undefined);
  const holdRefCompact = useRef<GestureType | undefined>(undefined);
  const activeHoldRef = useRef<GestureType | undefined>(undefined);
  useEffect(() => {
    activeHoldRef.current = detent === 'compact' ? holdRefCompact.current : holdRefExpanded.current;
  }, [detent, state]);

  const onSheetChange = (index: number) => {
    const d = index === 0 ? 'compact' : 'expanded';
    setDetent(d);
    activeHoldRef.current = d === 'compact' ? holdRefCompact.current : holdRefExpanded.current;
  };

  // Lib-driven shared values: crossfade from the animated index (0 = compact,
  // 1 = expanded); re-center button rides the sheet's top edge position (②).
  const sheetIndex = useSharedValue(1);
  const sheetPos = useSharedValue(SHEET_TOP);
  const expandedFade = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, sheetIndex.value)),
  }));
  const compactFade = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, 1 - sheetIndex.value)),
  }));
  const recenterRide = useAnimatedStyle(() => ({
    top: sheetPos.value - 52,
  }));

  // Once countdown starts there is no exit except hold-stop: kill the back
  // gesture and swallow any remove attempt (incl. Android hardware back).
  const lockedRef  = useRef(false);
  const exitingRef = useRef(false);
  lockedRef.current = state === 'countdown' || state === 'running' || state === 'paused';

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !lockedRef.current });
  }, [navigation, state]);

  useEffect(() => {
    return navigation.addListener('beforeRemove', e => {
      if (lockedRef.current && !exitingRef.current) e.preventDefault();
    });
  }, [navigation]);

  // ④c: Live Activity 일시정지/종료 taps land here and drive the SAME
  // handlers the on-screen buttons use — one code path, no drift. Refs keep
  // the once-mounted listener reading fresh closures (compiler-safe: event
  // context, not render). Ignored unless a run is live (stale-intent guard).
  const laActionRef = useRef<{ pause: () => void; stop: () => void }>({ pause: () => {}, stop: () => {} });
  laActionRef.current = {
    // auto-paused + LA pause intent = CONVERT to manual (sticky — movement
    // no longer auto-resumes; the runner claimed the pause). Ruled 8/2.
    pause: () => {
      if (state === 'paused' && runSession.getPauseSource() === 'auto') { runSession.markManualPause(); return; }
      if (state === 'running' || state === 'paused') togglePause();
    },
    stop: () => { if (state === 'running' || state === 'paused') endRun(); },
  };
  useEffect(() => {
    const sub = addLiveActivityActionListener(action => {
      if (action === 'pause') laActionRef.current.pause();
      else laActionRef.current.stop();
    });
    return () => sub.remove();
  }, []);

  const endRun = () => {
    // DEFERRED TEARDOWN (back-button ruling 2026-07-27): 종료 freezes the
    // session (pause — clock stops, LA shows paused, fixes accumulate
    // nothing) and PUSHES the save screen as a revisitable checkpoint. Back
    // from 저장 pops here, paused; resume works; 종료 again refreshes the
    // numbers. The session dies only at save/discard (run-save owns stop()).
    if (state === 'running') togglePause();
    const preview = snapshot();
    if (!preview) { exitingRef.current = true; router.back(); return; } // dead session — old exit
    // 종료 cue — fire-and-forget before the screen swap
    if (coachActive) speakCue(composeFinishCue(preview.distanceKm, preview.elapsedSec, useSettings.getState().settings.units), useSettings.getState().settings.audio_coach.rate);
    const payload = course
      ? {
          ...preview,
          course: { id: course.id, title: course.title },
          ...(course.crewSession ? { crewSession: course.crewSession } : {}), // L1 정기런 tag
        }
      : preview;
    // Same run re-entering the checkpoint keeps its typed draft; a new run
    // resets it. Both persist to disk — crash-safe from this moment.
    if (getPendingRun()?.startedAtMs === preview.startedAtMs) refreshPendingRun(payload);
    else setPendingRun(payload);
    router.push('/(course)/run-save' as any); // push: the paused run stays alive beneath
  };

  const handleStart = async () => {
    // Context rides into the session so a mid-run KILL recovers the course/
    // 크루 tags too (①'s persist) — the clean-stop path below still composes
    // its own copy at end, unchanged.
    const granted = await start(course
      ? {
          course: { id: course.id, title: course.title },
          ...(course.crewSession ? { crewSession: course.crewSession } : {}),
          // nav v6: real geometry → the go-to-start chapter accumulates
          // NOTHING (crew runs without geometry keep free-run behavior)
          ...((course.polyline?.length ?? 0) > 1 ? { deferAccumulation: true } : {}),
        }
      : undefined);
    if (!granted) {
      // Repeat requests after denial never re-prompt — Settings is the only path.
      Alert.alert(
        t('trk.locPermTitle'),
        t('trk.locPermBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.openSettings'), onPress: () => Linking.openSettings() },
        ],
      );
    }
  };

  const running = state === 'running';
  const idle    = state === 'idle';
  const units   = useSettings(s => s.settings.units);
  const coachMsg = !moving ? t('trk.coachReady') : t('trk.coachPace');
  const paceDisplay = moving ? fmtPaceIn(paceSecPerKm, units) : "--'--\"";

  return (
    <GestureHandlerRootView style={st.root}>
      {/* ── Map — REAL Apple map (T-A), now FULL-SCREEN behind the sheet
             (T-B): blue dot via showsUserLocation (no second location
             stream — rides the tracker's hot GPS), live track polyline from
             the tracker's read-only livePath, course overlay in course mode.
             Compact detent reveals it; expanded shows the top MAP_H. ── */}
      <View style={StyleSheet.absoluteFill}>
        <MapView
          ref={mapRef}
          userInterfaceStyle={resolved}
          style={StyleSheet.absoluteFill}
          initialRegion={{
            latitude: courseCoords[0]?.latitude ?? hereCoord?.lat ?? SEOUL_FALLBACK.lat,
            longitude: courseCoords[0]?.longitude ?? hereCoord?.lng ?? SEOUL_FALLBACK.lng,
            latitudeDelta: 0.006,
            longitudeDelta: 0.006,
          }}
          onMapReady={fitCourse}
          onLayout={fitCourse}
          onPanDrag={onUserPan}
          // T1.5 zoom agency: pinch-zoom joins the indefinite suspension (onPanDrag
          // misses two-finger gestures); recenter resumes follow instantly
          onRegionChangeComplete={(_r, d) => {
            if (d?.isGesture && state === 'running') onUserPan();
            // v6.1: a two-finger rotation changes the camera heading OUTSIDE
            // our command path — re-sync the cone composition base on
            // gesture end (async ~ms; transient mid-gesture drift accepted)
            if (d?.isGesture) mapRef.current?.getCamera().then(c => { camHeadingRef.current = c.heading ?? 0; }).catch(() => {});
          }}
          // nav v4 (8/3 field screenshots — the halo verdict): the NATIVE
          // dot's accuracy halo is a real-meter circle that dominates at
          // street zoom and iOS offers no API to hide it → during a course
          // SESSION (running/paused) the native dot is OFF and the CUSTOM
          // dot below is the runner. Free runs + idle keep the native dot:
          // today's behavior, no field complaint there — the halo evidence
          // is course-nav screenshots; extending is one condition flip if
          // the field asks (stated).
          showsUserLocation={!(hasCoursePath && state !== 'idle')}
          // T1.6 POI MUTE: course tracking quiets to roads + ribbon; free
          // runs keep today's map (the prop is per-render — not mode-awkward)
          // 8/3 owner ruling (field experience over the 8/1 desk call):
          // labels ALWAYS on — at nav altitude Apple renders sparse labels,
          // so the clutter case that motivated course-mode suppression is
          // minimal; runners want building/store names. No mid-run toggle.
          showsPointsOfInterest
          showsTraffic={false}
          showsMyLocationButton={false}
          showsCompass={false}
          toolbarEnabled={false}
        >
          {/* Course shape ("where to go") UNDER the live track ("where I've
              been") — scheme-keyed courseStroke, deep green vs the vivid
              accent, width 4 vs 5. The old rgba(110,120,132,0.75) read
              2.0–2.7:1 on map tiles (sub-perceptual — leg-1 conviction). */}
          {/* T1.6 ROUTE RIBBON — road-width, unmissable. rn-maps has NO
              casing/outline prop: the Apple two-tone ribbon is FAKED cleanly
              with a double polyline (dark casing 14 UNDER lime fill 10 —
              render order = z-order). Behind stays a single dimmed lime
              (receded on purpose — no casing); alpha channel per T1's lesson. */}
          {courseBehind.length > 1 ? (
            <Polyline coordinates={courseBehind} strokeColor={routeStroke('dark') + '59'} strokeWidth={10} lineCap="round" lineJoin="round" />
          ) : null}
          {/* 8/3 thin pre-run preview: idle = HALVED (14/10 → 7/5). 8/3
              crash-class sweep: the Fragment wrapper inside MapView is
              DECOMPOSED to sibling ternaries (interop nil-insert candidate;
              see real-map.tsx's conviction note). */}
          {courseAhead.length > 1 ? (
            <Polyline coordinates={courseAhead} strokeColor="rgba(12,18,6,0.85)" strokeWidth={state === 'idle' ? 7 : 14} lineCap="round" lineJoin="round" />
          ) : null}
          {courseAhead.length > 1 ? (
            <Polyline coordinates={courseAhead} strokeColor={routeStroke('dark')} strokeWidth={state === 'idle' ? 5 : 10} lineCap="round" lineJoin="round" />
          ) : null}
          {/* next-stretch white band — RESTORED 8/3 (owner + 지연 ruling:
              the original band design STANDS; the arrows were considered
              and retired same-day — only the band's LIGHT-MODE contrast
              against the lime course line was the defect). Fix = CASING,
              the cartography standard: a slightly wider deep-ink outline
              beneath the white core (the ahead-ribbon's own casing family,
              no new palette entry) — the dark edge separates band from
              course line at every luminance, both themes. NEXT_BAND_M
              shared with the turn overlay's approach window as before. */}
          {courseNext.length > 1 ? (
            <Polyline coordinates={courseNext} strokeColor="rgba(12,18,6,0.9)" strokeWidth={8} lineCap="round" lineJoin="round" />
          ) : null}
          {courseNext.length > 1 ? (
            <Polyline coordinates={courseNext} strokeColor="#FFFFFF" strokeWidth={5} lineCap="round" lineJoin="round" />
          ) : null}
          {/* 8/21 waypoint markers — numbered circles, default
              tracksViewChanges (the ={false} empty-bitmap conviction) */}
          {wpMarkers.length > 0 ? wpMarkers.map(w => (
            <Marker key={`wp-${w.label}`} coordinate={{ latitude: w.lat, longitude: w.lng }} anchor={{ x: 0.5, y: 0.5 }} zIndex={7}>
              <View style={st.wpMarker}>
                <Text style={st.wpMarkerTxt}>{w.label}</Text>
              </View>
            </Marker>
          )) : null}
          {/* v2 GO-TO-START chapter: unmissable start flag (bigger than
              turn chips) + dashed guidance line from the runner to the
              start — both dissolve on arrival (navPhase → 'nav') */}
          {courseCoords.length > 1 && navPhase === 'pre' ? (
            <Marker coordinate={courseCoords[0]} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <View style={st.startFlag}>
                <Icon name="flag" size={16} color="#0C1206" />
              </View>
            </Marker>
          ) : null}
          {courseCoords.length > 1 && navPhase === 'pre' && drawnPath.length > 0 ? (
            <Polyline
              coordinates={[drawnPath[drawnPath.length - 1], courseCoords[0]]}
              strokeColor={C.accent}
              strokeWidth={3}
              lineDashPattern={[8, 8]}
            />
          ) : null}
          {/* 8/3: geometry turn marker — VISUAL ONLY (ruled: no TTS until
              tuning + T2 names; a wrong spoken turn is worse than none).
              Direction from the bearing delta's sign; distance from alongM. */}
          {turnAhead && state === 'running' && navPhase === 'nav' ? (
            <Marker coordinate={{ latitude: turnAhead.point.lat, longitude: turnAhead.point.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <View style={st.turnBadge}>
                <Icon name={turnAhead.dir === 'right' ? 'arrow-redo' : 'arrow-undo'} size={13} color={C.text} />
                <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.turnTxt}>{Math.round(turnAhead.distM)}m</Text>
              </View>
            </Marker>
          ) : null}
          {drawnPath.length > 1 ? (
            <Polyline coordinates={drawnPath} strokeColor={C.accent} strokeWidth={5} />
          ) : null}
          {/* nav v4: the custom runner dot — the Apple look, fixed pixel
              size at every zoom (markers are screen-space), NO halo ever.
              Billboard by default (flat=false): stays a dot under map
              rotation, never a tilting sprite. */}
          {/* nav v6.1: heading cone — DOT SPRITE ONLY (camera untouched).
              Rotation lives on the CHILD VIEW transform (Marker rotation/
              flat are Google-only — absent from AIRMapMarker source, the
              v6.1 conviction): screen = worldHeading − cameraHeading.
              tracksViewChanges stays TRUE — a rotating child must re-render
              natively (the dot's snapshot-flip trick would freeze it; one
              small live marker at ≤10 commits/s is the km-marker precedent
              cost class). Hidden when no usable heading (plain dot). */}
          {hasCoursePath && state !== 'idle' && dotCoord != null && coneScreenDeg != null ? (
            <Marker coordinate={dotCoord} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges zIndex={9}>
              <View style={[st.coneWrap, { transform: [{ rotate: `${coneScreenDeg}deg` }] }]}>
                <View style={st.headingConeRim} />
                <View style={st.headingCone} />
              </View>
            </Marker>
          ) : null}
          {/* TEMP v6.2 diagnostic marker (strip after 지연's verdict): the
              raw sensor number, un-rotated — spinning number + frozen cone
              = render/native channel; frozen number = sensor stall. */}
          {hasCoursePath && state !== 'idle' && dotCoord != null && coneRawDbg != null ? (
            <Marker coordinate={dotCoord} anchor={{ x: 0.5, y: -1.6 }} tracksViewChanges zIndex={11}>
              <View style={st.coneDbg}><Text style={st.coneDbgTxt}>{coneRawDbg}°</Text></View>
            </Marker>
          ) : null}
          {hasCoursePath && state !== 'idle' && dotCoord != null ? (
            <Marker
              coordinate={dotCoord}
              anchor={{ x: 0.5, y: 0.5 }}
              flat={false}
              tracksViewChanges={dotTracks}
              zIndex={10}
            >
              <View style={st.userDot} />
            </Marker>
          ) : null}
        </MapView>

        {/* ── nav v3 (8/3 executive ruling, second field walk): THE ARROW IS
            DEAD — deleted, not disabled. The NATIVE DOT is the runner marker
            in every phase: the camera-follow already projects the runner's
            position at the ~22% band BY CONSTRUCTION (pointAhead lookahead
            at the flat posture), so the dot sits at the old anchor without
            any screen-space chrome, and its heading cone is the direction
            indicator. Reversal path if ever needed: a custom snappable
            Marker (ledgered). */}

        {/* ── tmap blinking turn overlay (8/3 part 4): approach window =
            NEXT_BAND_M (the field-tuned band — the reuse the ruling names);
            distance counts down live (turnAhead recomputes per accepted
            fix); turn passage drops it by construction (nextTurn returns
            the following turn or null); off-route hands the screen to the
            off-course machinery. T2 voice (8/8): the turn-cue effect above
            speaks this same data — parity by shared source. */}
        {turnAhead && state === 'running' && navPhase === 'nav' && !offCourse && turnAhead.distM <= NEXT_BAND_M && (
          <TurnOverlay dir={turnAhead.dir} distM={turnAhead.distM} />
        )}

        {/* v2 go-to-start distance line — live countdown to the start */}
        {hasCoursePath && navPhase === 'pre' && state === 'running' && toStartM != null && toStartM > ARRIVAL_M && (
          <View pointerEvents="none" style={[st.coursePillWrap, { top: insets.top + 52 }]}>
            <View style={st.toStartChip}>
              <Icon name="flag-outline" size={13} color="#7CF03D" />
              <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.toStartTxt}>
                {tfIn(lang, 'trk.toStart', { d: toStartM >= 1000 ? `${(toStartM / 1000).toFixed(1)}km` : `${Math.round(toStartM)}m` })}
              </Text>
            </View>
          </View>
        )}

        {/* Course title pill (bundle: tracking-screen.jsx course mode) */}
        {course && (
          <View pointerEvents="none" style={[st.coursePillWrap, { top: insets.top + 8 }]}>
            <View style={st.coursePill}>
              <Icon name="navigate-outline" size={13} color="#7CF03D" />
              <Text style={st.coursePillTxt} numberOfLines={1}>{course.title}</Text>
            </View>
          </View>
        )}
        {/* X exits only in idle — once countdown starts, hold-stop is the only way out */}
        {idle && (
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={[st.closeBtn, { top: insets.top + 8 }]}
          >
            <Icon name="close" size={20} color="#fff" />
          </Pressable>
        )}
        {(state === 'running' || state === 'paused') && (
          <View style={{ position: 'absolute', top: insets.top + 8, right: 14, alignItems: 'flex-end', gap: 6 }}>
            <StatusBadge paused={state === 'paused'} />
            {/* 오디오 코치 mute — premium only (free: no affordance, line-132) */}
            {isPremium && voiceCue && (
              <Pressable
                onPress={() => { setCoachMuted(m => { setSessionMuted(!m); return !m; }); }}
                hitSlop={8}
                style={st.coachMuteBtn}
                accessibilityLabel={coachMuted ? t('trk.voiceOn') : t('trk.voiceOff')}
              >
                <Icon name={coachMuted ? 'volume-mute-outline' : 'volume-high-outline'} size={16} color={coachMuted ? 'rgba(255,255,255,0.55)' : '#7CF03D'} />
              </Pressable>
            )}
            {gpsLost && (
              <View style={st.gpsChip}>
                <Icon name="cellular-outline" size={11} color={C.sun} />
                <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.gpsChipTxt}>{t('trk.gpsWeak')}</Text>
              </View>
            )}
            {/* T1: 경로 이탈 banner + re-join hint (course runs only) */}
            {offCourse && (
              <View style={[st.gpsChip, { backgroundColor: 'rgba(180,40,40,0.72)' }]}>
                <Icon name="navigate-outline" size={11} color="#fff" />
                <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.gpsChipTxt}>{tfIn(lang, 'trk.offCourse', { m: rejoinM })}</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Re-center — anchored ABOVE the sheet's top edge, right side; rides
          the sheet via its animatedPosition. A sibling, not a sheet child:
          iOS drops touches outside a parent's bounds. */}
      {recenterVisible && (
        <Reanimated.View style={[st.recenterWrap, recenterRide]}>
          <Pressable onPress={recenter} style={st.recenterBtn} hitSlop={6}>
            <Icon name="locate" size={18} color={C.text} />
          </Pressable>
        </Reanimated.View>
      )}

      {/* ── Metrics sheet (T-B): @gorhom/bottom-sheet — 미니플레이어 feel is
             the lib's job (drag anywhere, 1:1 tracking, velocity fling, both
             directions). idle = content-hugging single detent, locked;
             run = [compact 100, expanded] with countdown locked. ── */}
      <BottomSheet
        key={idle ? 'idle' : 'run'}
        enableDynamicSizing={idle}
        {...(!idle ? { snapPoints: runSnaps, index: 1 } : {})}
        animateOnMount={false}
        enableOverDrag={false}
        enableContentPanningGesture={canSlide}
        enableHandlePanningGesture={canSlide}
        onChange={onSheetChange}
        animatedIndex={sheetIndex}
        animatedPosition={sheetPos}
        waitFor={activeHoldRef}
        backgroundStyle={st.sheetBg}
        handleIndicatorStyle={st.handleIndicator}
      >
        <BottomSheetView style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        {/* Compact strip — glanceable time/distance + pause + mini hold-stop */}
        {!idle && (
          <Reanimated.View
            pointerEvents={detent === 'compact' ? 'auto' : 'none'}
            style={[st.compactStrip, compactFade]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.compactTime}>{fmtElapsed(elapsedSec)}</Text>
              <Text style={st.compactDist}>{fmtDist(distanceKm, units, 2)} {distUnit(units)}</Text>
            </View>
            <View style={st.compactCluster}>
              <Pressable onPress={togglePause} style={[st.compactPauseBtn, accentShadow(C.accent)]}>
                <Icon name={running ? 'pause' : 'play'} size={20} color={C.accentText} />
              </Pressable>
              <HoldStop onComplete={endRun} size={44} showLabel={false} gestureRef={holdRefCompact} />
            </View>
          </Reanimated.View>
        )}

        {/* Expanded content — canvas layout; the flex spacer (dead space)
            is gone: controls sit right under the coach card. In idle the
            fade is inert (index 0 = the single content-hugging detent). */}
        <Reanimated.View
          pointerEvents={detent === 'expanded' ? 'auto' : 'none'}
          style={[st.expandedWrap, !idle ? expandedFade : null]}
        >
          <View style={{ alignItems: 'center', marginTop: 8 }}>
            <Text style={st.timeLabel}>{t('trk.elapsed')}</Text>
            <Text style={st.timeValue}>{fmtElapsed(elapsedSec)}</Text>
          </View>

          {/* T1.6 NAV STRIP (course mode): the navigator's trio — 남은 거리
              (course length − along-line progress) · 도착 예상 (remaining ÷
              avg pace so far, honestly labeled 예상). Free runs keep today's
              face untouched. */}
          {hasCoursePath && (
            <View style={[st.metricsRow, { marginBottom: 10 }]}>
              {(() => {
                const remainM = Math.max(0, courseLenM - alongM);
                const avgPace = distanceKm > 0.05 ? elapsedSec / distanceKm : null;
                const etaMin = avgPace != null ? Math.round(((remainM / 1000) * avgPace) / 60) : null;
                return ([
                  [fmtDist(remainM / 1000, units, 2), distUnit(units), t('trk.remaining')],
                  [etaMin != null ? tfIn(lang, 'trk.etaMin', { n: etaMin }) : '—', '', t('trk.eta')],
                ] as [string, string, string][]).map(([val, unit, label], i) => (
                  <View key={label} style={[st.metricCol, i > 0 && st.metricColDivider]}>
                    <View style={st.metricValRow}>
                      <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.metricVal}>{val}</Text>
                      {unit ? <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.metricUnit}>{unit}</Text> : null}
                    </View>
                    <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.metricLbl}>{label}</Text>
                  </View>
                ));
              })()}
            </View>
          )}
          {/* 8/4 평균 페이스 (tester ask): 2×2 grid — a 4-col row can't hold
              two pace values + units at the 1.3 clamp (desk math: ~88pt val
              row vs ~87pt col). 현재 페이스 keeps its slot beside 거리;
              평균 joins kcal below. Convention (8/1 ruling): TOTAL-time pace
              — elapsedSec/distanceKm, the session clock (pauses excluded),
              SAME floor+rounding as the save path so the last displayed
              평균 equals the saved avg exactly. Floor 0.05km field-tunable. */}
          {(() => {
            const liveAvgPace = distanceKm >= 0.05 && elapsedSec > 0 ? Math.round(elapsedSec / distanceKm) : null;
            // 8/4 reorder (owner-ruled after the grid glance): quantities on
            // top, the two paces adjacent for direct comparison.
            const rows: [string, string, string][][] = [
              [
                [fmtDist(distanceKm, units, 2), distUnit(units), t('trk.dist')],
                [kcal != null ? String(kcal) : '—', 'kcal', t('trk.kcal')],
              ],
              [
                [paceDisplay,                   paceUnit(units), t('trk.pace')],
                [liveAvgPace != null ? fmtPaceIn(liveAvgPace, units) : "--'--\"", paceUnit(units), t('res.avgPace')],
              ],
            ];
            return rows.map((row, r) => (
              <View key={r} style={[st.metricsRow, r > 0 && { marginTop: 14 }]}>
                {row.map(([val, unit, label], i) => (
                  <View key={i} style={[st.metricCol, i > 0 && st.metricColDivider]}>
                    <View style={st.metricValRow}>
                      <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.metricVal}>{val}</Text>
                      <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.metricUnit}>{unit}</Text>
                    </View>
                    <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.metricLbl}>{label}</Text>
                  </View>
                ))}
              </View>
            ));
          })()}

          {/* AI audio coach — static card, canned message (no real audio yet) */}
          <View style={[st.coachCard, shadows.sm]}>
            <View style={st.coachIcon}>
              <Icon name="sparkles" size={18} color={C.accentGrn} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.coachLabel}>{t('trk.coachTitle')}</Text>
              <Text style={st.coachMsg} numberOfLines={1}>{`"${coachMsg}"`}</Text>
            </View>
            <Waveform active={running} />
          </View>

          {/* ── Controls — directly under the coach card (dead space died) ── */}
          {idle ? (
            <View style={st.controls}>
              <Pressable
                onPress={handleStart}
                style={({ pressed }) => [st.startBtn, accentShadow(C.accent), { opacity: pressed ? 0.9 : 1 }]}
              >
                <Icon name="play" size={22} color={C.accentText} />
                <Text style={st.startTxt}>{t('trk.start')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={[st.controls, st.controlsRow]}>
              {/* 8/8 recon: this button was a Pressable wired to NOTHING (dead
                  affordance). Now the same session mute as the map-chrome pill —
                  one state, two mirrors. No coach (free / voice_cue off) =
                  dimmed-disabled: nothing to mute, shown honestly. */}
              <Pressable
                disabled={!(isPremium && voiceCue)}
                onPress={() => { setCoachMuted(m => { setSessionMuted(!m); return !m; }); }}
                accessibilityLabel={coachMuted ? t('trk.voiceOn') : t('trk.voiceOff')}
                style={[st.speakerBtn, shadows.sm, !(isPremium && voiceCue) && { opacity: 0.35 }]}
              >
                <Icon name={coachMuted ? 'volume-mute-outline' : 'volume-medium-outline'} size={22} color={coachMuted ? C.sub : C.text} />
              </Pressable>
              <Pressable onPress={togglePause} style={[st.pauseBtn, accentShadow(C.accent)]}>
                <Icon name={running ? 'pause' : 'play'} size={32} color={C.accentText} />
              </Pressable>
              <HoldStop onComplete={endRun} gestureRef={holdRefExpanded} />
            </View>
          )}
        </Reanimated.View>
        </BottomSheetView>
      </BottomSheet>

      {state === 'countdown' && <CountdownOverlay value={countdownValue} />}
      {/* keep-awake GATED on 화면 항상 켜기 (①, closes the always-on TODO):
          the background location task keeps tracking through a sleeping
          screen, so the GPS-throttling reason to force the screen on is gone
          — the persisted toggle is finally honest. */}
      {(state === 'countdown' || state === 'running' || state === 'paused')
        && keepScreenOn && <KeepAwake />}
    </GestureHandlerRootView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Close (idle only)
  closeBtn: { position: 'absolute', left: 14, width: 40, height: 40, borderRadius: R.pill, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  coachMuteBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  // Anchored just above the sheet's top edge; top driven by animatedPosition
  recenterWrap: { position: 'absolute', right: 14 },
  recenterBtn:  { width: 40, height: 40, borderRadius: R.pill, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', ...shadows.sm },
  gpsChip:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 5 },
  gpsChipTxt: { fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: -0.2 },
  turnBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, ...shadows.sm },
  turnTxt:    { fontSize: 11, fontWeight: '800', color: C.text, letterSpacing: -0.2 },
  // 8/3 turn overlay (v3: the arrow style died with the arrow). The card is
  // FIXTURE black-on-white (tmap's outline treatment) — identical in both
  // schemes by design, high-contrast over any tile.
  // nav v4 custom dot — the Apple look exactly: 18px system-blue disc +
  // 3px white ring (24px total), soft shadow; fixed pixel size by nature
  // 8/21 waypoint marker — the RealMap twin (route-stroke fill, white ring)
  wpMarker: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 4, backgroundColor: '#39FF14', borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  wpMarkerTxt: { fontSize: 11, fontWeight: '800', color: '#0D1A06' },
  userDot: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#007AFF', borderWidth: 3, borderColor: '#FFFFFF',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
  },
  // nav v6.1: the heading wedge — SOLID, unmistakable (owner ruling: the
  // translucent beam read as decoration). Apple's dot-cone as reference:
  // white rim + solid system-blue body, apex meeting the dot's edge,
  // widening outward. Two stacked border-triangles fake the rim.
  coneWrap: { width: 64, height: 64, alignItems: 'center' },
  // TEMP v6.2 diagnostic chip
  coneDbg: { backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  coneDbgTxt: { color: '#fff', fontSize: 10, fontWeight: '700', fontVariant: ['tabular-nums'] },
  headingConeRim: {
    marginTop: 2, width: 0, height: 0,
    borderLeftWidth: 14, borderRightWidth: 14, borderTopWidth: 24,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderTopColor: '#FFFFFF',
  },
  headingCone: {
    position: 'absolute', top: 5, width: 0, height: 0,
    borderLeftWidth: 11, borderRightWidth: 11, borderTopWidth: 19,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderTopColor: 'rgba(0,122,255,0.92)',
  },
  turnOverlayWrap: { position: 'absolute', left: 0, right: 0, top: '28%', alignItems: 'center' },
  turnOverlayCard: {
    alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 18,
    borderWidth: 2, borderColor: '#0C0F14',
    paddingHorizontal: 22, paddingVertical: 14, gap: 2,
    ...shadows.sm,
  },
  turnOverlayDist: { fontSize: 24, fontWeight: '900', color: '#0C0F14', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },

  // Course title pill (course mode)
  coursePillWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  coursePill:     { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '64%', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: R.pill, paddingHorizontal: 13, paddingVertical: 7 },
  coursePillTxt:  { fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: -0.2 },
  // v2 go-to-start chapter: flag-class start marker (bigger than the turn
  // chips — unmissable) + the to-start distance chip (pill family)
  startFlag:   { width: 34, height: 34, borderRadius: 17, backgroundColor: '#7CF03D', borderWidth: 2.5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadows.sm },
  toStartChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 6 },
  toStartTxt:  { fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: -0.2, fontVariant: ['tabular-nums'] },

  // Badge
  badge:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: R.pill, paddingHorizontal: 13, paddingVertical: 7 },
  badgeDot: { width: 7, height: 7, borderRadius: 4 },
  badgeTxt: { fontSize: 12.5, fontWeight: '700', color: '#fff', letterSpacing: -0.2 },

  // Sheet (T-B: 2-detent) — no sheet-level padding: the gesture detector's
  // view spans the full sheet so touch coords are sheet-local for the
  // anti-theft rect hit-test; content wrappers carry their own gutters.
  sheetBg:         { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  handleIndicator: { width: 38, height: 5, borderRadius: 99, backgroundColor: C.border },
  expandedWrap: { paddingHorizontal: S.gutter },
  // Absolute within the sheet content (which starts below the lib handle)
  compactStrip: {
    position: 'absolute', top: 0, left: S.gutter, right: S.gutter,
    flexDirection: 'row', alignItems: 'center', gap: 14, height: 64,
  },
  compactCluster: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  compactTime: { fontSize: 26, fontWeight: '700', letterSpacing: -1, color: C.text, fontVariant: ['tabular-nums'] },
  compactDist: { fontSize: 13, fontWeight: '600', color: C.sub, letterSpacing: -0.2, marginTop: 1, fontVariant: ['tabular-nums'] },
  compactPauseBtn: { width: 44, height: 44, borderRadius: R.pill, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },

  // Primary metric
  timeLabel: { fontSize: 11.5, fontWeight: '600', letterSpacing: 0.6, color: C.faint, textTransform: 'uppercase' },
  timeValue: { fontSize: 56, fontWeight: '700', letterSpacing: -2.5, color: C.text, lineHeight: 60, marginTop: 4, fontVariant: ['tabular-nums'] },

  // Metrics row
  metricsRow:       { flexDirection: 'row', marginTop: 18 },
  metricCol:        { flex: 1, alignItems: 'center' },
  metricColDivider: { borderLeftWidth: 1, borderLeftColor: C.border },
  metricValRow:     { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  metricVal:        { fontSize: 23, fontWeight: '700', letterSpacing: -0.7, color: C.text, fontVariant: ['tabular-nums'] },
  metricUnit:       { fontSize: 11.5, fontWeight: '600', color: C.faint },
  metricLbl:        { fontSize: 11, color: C.faint, marginTop: 4 },

  // Coach card
  coachCard:  { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 14, marginTop: 18 },
  coachIcon:  { width: 36, height: 36, borderRadius: 11, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  coachLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3, color: C.accentGrn, textTransform: 'uppercase' },
  coachMsg:   { fontSize: 13.5, fontWeight: '600', color: C.text, letterSpacing: -0.3, marginTop: 2 },

  // Waveform
  wave:    { flexDirection: 'row', alignItems: 'center', gap: 3, height: 30 },
  waveBar: { width: 3, borderRadius: 99, backgroundColor: C.accentGrn },

  // Controls
  controls:    { paddingTop: 18 },
  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 26 },
  speakerBtn:  { width: 56, height: 56, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  pauseBtn:    { width: 78, height: 78, borderRadius: R.pill, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },

  // Hold-stop
  stopBtn:    { width: 56, height: 56, borderRadius: R.pill, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center' },
  stopSquare: { width: 18, height: 18, borderRadius: 4, backgroundColor: '#fff' },
  holdLabel:  { fontSize: 11, fontWeight: '600', letterSpacing: -0.2 },

  // Idle CTA
  startBtn: { height: 60, borderRadius: R.lg, backgroundColor: C.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  startTxt: { fontSize: 17, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },

  // Countdown overlay
  countdownOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,12,4,0.88)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  countdownNum:     { fontSize: 128, fontWeight: '700', color: '#fff', letterSpacing: -4, fontVariant: ['tabular-nums'] },
  countdownSub:     { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.65)', letterSpacing: -0.3, marginTop: 6 },
});
