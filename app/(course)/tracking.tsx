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
import * as ExpoLocation from 'expo-location';
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
import { courseLengthM, nearestOnCourse, nextTurn, OFF_COURSE_ENTER_M, OFF_COURSE_EXIT_M, pointAhead, sliceAhead } from '@/lib/course-nav';
import { runSession } from '@/store/run-session';
import { useRunTracker } from '@/hooks/use-run-tracker';
import { composeFinishCue, composeSplitCue, composeStartCue, speakCue, stopSpeech } from '@/lib/audio-coach';
import { activateRunAudioSession, deactivateRunAudioSession } from '@/lib/audio-session';
import { useQuota } from '@/store/use-quota';
import { addLiveActivityActionListener } from '@/modules/live-activity';
import { clearActiveCourse, getActiveCourse } from '@/store/active-course';
import { t, tf } from '@/lib/i18n';
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
const NAV_ALTITUDE_M = 320;   // ↑ from 280 — more forward range at the steeper pitch
const NAV_PITCH_DEG = 57;     // ↑ from 45 — the T-map-class perspective
const NAV_LOOKAHEAD_M = 180;  // ↑ from 120 — pushes the puck toward the ~22% band
const NAV_ENTER_MS = 1800;    // overview → follow flight, flown DURING the countdown ("drive pressed")
// ── 8/3 nav-completion — ALL FIELD-TUNABLE (the walk judges) ──
const FUSION_SPEED_MPS = 1.0; // below: compass steers heading; above: course-over-ground
const HEADING_SNAP_DEG = 5;   // compass jitter floor — SNAP threshold chosen over a low-pass
                              // (no lag, no circular-mean math; sub-5° wobble is invisible at nav zoom)
const NEXT_BAND_M = 300;      // the emphasized "next stretch" band length
// T1.7 CLOSE (owner verdict from the field look, 2026-07-26): 320/57/180
// READS RIGHT — the baseline landed; the tuning panel stripped per the
// temp-probe doctrine without needing its session.
const SHEET_TOP = MAP_H - 22;         // sheet's expanded top edge (canvas -22 overlap)
const COMPACT_VISIBLE = 100;          // compact detent: handle + strip

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
      if (coachActive) speakCue(composeStartCue(coach.cue_interval_km), coach.rate);
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
        speakCue('자동으로 일시정지했어요', useSettings.getState().settings.audio_coach.rate);
      }
    }
    if (prev === 'paused' && state === 'running') {
      if (useSettings.getState().settings.run.haptics) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setTimeout(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }, 140);
      }
      if (wasAutoPauseRef.current && useSettings.getState().settings.run.voice_cue) {
        speakCue('러닝을 다시 시작해요', useSettings.getState().settings.audio_coach.rate);
      }
      wasAutoPauseRef.current = false;
    }
    if (state === 'idle') stopSpeech(); // paused handled in-branch (order-sensitive — see above)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  useEffect(() => () => { stopSpeech(); deactivateRunAudioSession(); }, []); // unmount safety

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
      });
      if (text) speakCue(text, coach.rate);
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

  // ── T1 NAVIGATION (course runs ONLY — free runs keep zero delta) ──────────
  // nearest-segment index drives the ahead/behind emphasis; point-to-segment
  // distance drives off-course with hysteresis (enter 40m / exit 25m).
  const [nearestSeg, setNearestSeg] = useState(0);
  const [offCourse, setOffCourse] = useState(false);
  const [rejoinM, setRejoinM] = useState(0);
  // T1.6 nav strip: along-line progress → 남은 거리 · 도착 예상
  const [alongM, setAlongM] = useState(0);
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
          speakCue('경로를 벗어났어요', useSettings.getState().settings.audio_coach.rate);
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePath.length, state, course]);

  // 8/3 nav-completion: the emphasized "next stretch" band (alongM →
  // alongM+NEXT_BAND_M, exact cuts on segments) + the first geometry-detected
  // turn ahead. Both recompute per alongM update (once per accepted fix —
  // a full walk over course vertices is trivial at that cadence).
  const courseNext = useMemo(
    () => (courseCoords.length > 1 ? sliceAhead(course?.polyline ?? [], alongM, NEXT_BAND_M).map(c => ({ latitude: c.lat, longitude: c.lng })) : []),
    [courseCoords.length, course, alongM],
  );
  const turnAhead = useMemo(
    () => (courseCoords.length > 1 ? nextTurn(course?.polyline ?? [], alongM) : null),
    [courseCoords.length, course, alongM],
  );

  // ahead/behind split — behind dims, ahead keeps the full course stroke
  const courseBehind = useMemo(
    () => (courseCoords.length > 1 ? courseCoords.slice(0, nearestSeg + 1) : []),
    [courseCoords, nearestSeg],
  );
  const courseAhead = useMemo(
    () => (courseCoords.length > 1 ? courseCoords.slice(nearestSeg) : []),
    [courseCoords, nearestSeg],
  );

  // ── Compass fusion (8/3): COG freezes at rest (iOS sends -1, we keep
  // last-good) so the map stopped rotating when the runner turned in place.
  // watchHeadingAsync (expo-location, in-binary) feeds heading BELOW
  // FUSION_SPEED_MPS; course-over-ground above it — the nav-app convention.
  // Lifecycle = course runs while running ONLY (battery honesty: no compass
  // stream on free runs, idle, or pause). Smoothing = HEADING_SNAP_DEG snap.
  const compassHeadingRef = useRef<number | null>(null);
  useEffect(() => {
    if (courseCoords.length < 2 || state !== 'running') return; // course runs only (hasCoursePath declared below)
    let dead = false;
    let sub: ExpoLocation.LocationSubscription | null = null;
    ExpoLocation.watchHeadingAsync((h: ExpoLocation.LocationHeadingObject) => {
      const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
      if (deg == null || deg < 0) return;
      const prev = compassHeadingRef.current;
      const delta = prev == null ? 360 : Math.abs(((deg - prev + 540) % 360) - 180);
      if (delta < HEADING_SNAP_DEG) return; // jitter floor
      compassHeadingRef.current = deg;
      // cadence rider (spec ③): while compass is the ACTIVE source (slow/
      // standing), rotation follows it continuously — heading-only partial
      // camera animation, suspension-respecting.
      const sp = runSession.getLastSpeedMps();
      if ((sp == null || sp < FUSION_SPEED_MPS) && !lastUserPanRef.current) {
        mapRef.current?.animateCamera({ heading: deg }, { duration: 300 });
      }
    }).then((s: ExpoLocation.LocationSubscription) => { if (dead) s.remove(); else sub = s; });
    return () => { dead = true; sub?.remove(); };
  }, [courseCoords.length, state]);

  /** The fused nav heading: compass at rest/slow, COG when moving; either
      alone when the other is absent. */
  const navHeading = useCallback((): number | null => {
    const sp = runSession.getLastSpeedMps();
    const cog = runSession.getLastHeading();
    const compass = compassHeadingRef.current;
    if (sp == null || sp < FUSION_SPEED_MPS) return compass ?? cog;
    return cog ?? compass;
  }, []);

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
    const h = navHeading(); // fused: compass at rest, COG in motion (8/3)
    const hereC = { lat: last.latitude, lng: last.longitude };
    const center = h != null ? pointAhead(hereC, h, NAV_LOOKAHEAD_M) : hereC;
    mapRef.current?.animateCamera(
      {
        center: { latitude: center.lat, longitude: center.lng },
        altitude: NAV_ALTITUDE_M,
        pitch: NAV_PITCH_DEG,
        ...(h != null ? { heading: h } : {}),
      },
      { duration: 500 },
    );
     
  }, [drawnPath.length, state, drawnPath, courseCoords.length, navHeading]);

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

  // (hoisted from the T-B block below — the visible-strip fit needs it)
  const { height: winH } = useWindowDimensions();

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
    const target = drawnPath.length > 0
      ? drawnPath[drawnPath.length - 1]
      : hereCoord ? { latitude: hereCoord.lat, longitude: hereCoord.lng } : null;
    if (!target) return;
    // 8/3: course-run recenter restores the FULL nav posture in ONE animation
    // (heading + lookahead + pitch + altitude — the follow effect's math).
    // The old altitude-only snap left a flat top-down frame that the next fix
    // re-asserted — a visible double-jump. Free-run recenter unchanged.
    if (hasCoursePath && state === 'running') {
      const h = navHeading();
      const hereC = { lat: target.latitude, lng: target.longitude };
      const center = h != null ? pointAhead(hereC, h, NAV_LOOKAHEAD_M) : hereC;
      mapRef.current?.animateCamera(
        {
          center: { latitude: center.lat, longitude: center.lng },
          altitude: NAV_ALTITUDE_M,
          pitch: NAV_PITCH_DEG,
          ...(h != null ? { heading: h } : {}),
        },
        { duration: 400 },
      );
      return;
    }
    // altitude: recenter snaps to the course-follow close view (tester ask) —
    // opinionated reset of any pinched-out zoom, owner walks and rules
    mapRef.current?.animateCamera({ center: target, altitude: NAV_ALTITUDE_M }, { duration: 400 });
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
    if (coachActive) speakCue(composeFinishCue(preview.distanceKm, preview.elapsedSec), useSettings.getState().settings.audio_coach.rate);
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
          onRegionChangeComplete={(_r, d) => { if (d?.isGesture && state === 'running') onUserPan(); }}
          showsUserLocation
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
          {courseBehind.length > 1 && (
            <Polyline coordinates={courseBehind} strokeColor={routeStroke('dark') + '59'} strokeWidth={10} lineCap="round" lineJoin="round" />
          )}
          {courseAhead.length > 1 && (
            <>
              <Polyline coordinates={courseAhead} strokeColor="rgba(12,18,6,0.85)" strokeWidth={14} lineCap="round" lineJoin="round" />
              <Polyline coordinates={courseAhead} strokeColor={routeStroke('dark')} strokeWidth={10} lineCap="round" lineJoin="round" />
            </>
          )}
          {/* 8/3: next-stretch emphasis — a white core over the ahead ribbon
              (nav-app current-leg grammar; no new palette entry). Width and
              NEXT_BAND_M are field-tunable. */}
          {courseNext.length > 1 && (
            <Polyline coordinates={courseNext} strokeColor="#FFFFFF" strokeWidth={5} lineCap="round" lineJoin="round" />
          )}
          {/* 8/3: geometry turn marker — VISUAL ONLY (ruled: no TTS until
              tuning + T2 names; a wrong spoken turn is worse than none).
              Direction from the bearing delta's sign; distance from alongM. */}
          {turnAhead && state === 'running' && (
            <Marker coordinate={{ latitude: turnAhead.point.lat, longitude: turnAhead.point.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <View style={st.turnBadge}>
                <Icon name={turnAhead.dir === 'right' ? 'arrow-redo' : 'arrow-undo'} size={13} color={C.text} />
                <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.turnTxt}>{Math.round(turnAhead.distM)}m</Text>
              </View>
            </Marker>
          )}
          {drawnPath.length > 1 && (
            <Polyline coordinates={drawnPath} strokeColor={C.accent} strokeWidth={5} />
          )}
        </MapView>

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
                onPress={() => { setCoachMuted(m => { if (!m) stopSpeech(); return !m; }); }}
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
                <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.gpsChipTxt}>{tf('trk.offCourse', { m: rejoinM })}</Text>
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
                  [etaMin != null ? tf('trk.etaMin', { n: etaMin }) : '—', '', t('trk.eta')],
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
              <Pressable style={[st.speakerBtn, shadows.sm]}>
                <Icon name="volume-medium-outline" size={22} color={C.sub} />
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

  // Course title pill (course mode)
  coursePillWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  coursePill:     { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '64%', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: R.pill, paddingHorizontal: 13, paddingVertical: 7 },
  coursePillTxt:  { fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: -0.2 },

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
