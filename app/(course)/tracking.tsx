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
import { router, useNavigation } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import MapView, { Polyline } from 'react-native-maps';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Icon } from '@/components/ui';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { useRunTracker } from '@/hooks/use-run-tracker';
import { clearActiveCourse, getActiveCourse } from '@/store/active-course';
import { setPendingRun } from '@/store/pending-run';
import { useSettings } from '@/store/use-settings';
import { distUnit, fmtDist, fmtPaceIn, paceUnit } from '@/lib/run-format';
import { accentShadow, colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';

const MAP_H = 330;                    // expanded-detent map viewport (canvas)
const SHEET_TOP = MAP_H - 22;         // sheet's expanded top edge (canvas -22 overlap)
const COMPACT_VISIBLE = 100;          // compact detent: handle + strip

// ─── Status badge (blinking dot while running) ────────────────────────────────

function StatusBadge({ paused }: { paused: boolean }) {
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
      <Text style={st.badgeTxt}>{paused ? '일시정지' : '러닝 중'}</Text>
    </View>
  );
}

// ─── Waveform (12 bars, animated while active) ────────────────────────────────

const WAVE_BARS = [10, 18, 26, 14, 22, 30, 16, 12, 24, 20, 28, 14];

function Waveform({ active }: { active: boolean }) {
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
  const HOLD_SZ = size, HOLD_R = size / 2 - 3, HOLD_CIRC = 2 * Math.PI * HOLD_R;
  const [holding, setHolding] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  // run.haptics setting gates all haptic feedback here (persisted via profile)
  const hapticsOn = useSettings(s => s.settings.run.haptics);

  const begin = () => {
    setHolding(true);
    if (hapticsOn) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(progress, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false }).start();
  };
  const complete = () => {
    setHolding(false);
    if (hapticsOn) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onComplete();
  };
  const cancel = () => {
    setHolding(false);
    Animated.timing(progress, { toValue: 0, duration: 250, easing: Easing.out(Easing.ease), useNativeDriver: false }).start();
  };

  let hold = Gesture.LongPress()
    .minDuration(HOLD_MS)          // activation = the hold completing
    .maxDistance(HOLD_DRIFT_MAX)   // beyond this the hold FAILS → sheet pan freed
    .shouldCancelWhenOutside(false) // drift may leave the small ring — maxDistance governs
    .runOnJS(true)
    .onBegin(begin)
    .onStart(complete)
    .onFinalize((_e, success) => { if (!success) cancel(); });
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
          {holding ? '계속 누르세요…' : '길게 눌러 종료'}
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
      <Text style={st.countdownSub}>곧 시작해요</Text>
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
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  // Course mode ("이 코스 달리기"): map shows the course shape, pill shows its
  // title, and the finished run links route_id. Absent → free run, as before.
  const [course] = useState(() => getActiveCourse());
  useEffect(() => () => clearActiveCourse(), []);

  // Settings (run.haptics gates hold-stop feedback) — hydrate in case the
  // profile tab was never opened this session.
  useEffect(() => { useSettings.getState().hydrate(); }, []);
  const {
    state, countdownValue, elapsedSec, distanceKm, paceSecPerKm, moving, kcal,
    start, togglePause, stop, livePath, lastFixAgeSec,
  } = useRunTracker();

  // ── T-A: real map (consumer of the tracker's read-only surface ONLY) ──
  const { coordinate: hereCoord, status: locStatus } = useCurrentLocation();
  const mapRef = useRef<MapView>(null);
  // Follow-camera suspension: any user pan pauses following for 8s; the
  // re-center button ends the suspension immediately.
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

  // Camera follow on path growth (running only, not while user-panned)
  useEffect(() => {
    if (state !== 'running' || drawnPath.length === 0) return;
    if (Date.now() - lastUserPanRef.current < 8000) return;
    mapRef.current?.animateCamera({ center: drawnPath[drawnPath.length - 1] }, { duration: 500 });
  }, [drawnPath.length, state, drawnPath]);

  // Center on the USER's RESOLVED location (T-B correction ②): the hook's
  // coordinate is Seoul-fallback-initialized (never null), so truthiness
  // fired the old center-once on the fallback at mount. status === 'granted'
  // is the real resolution signal — center once when it lands (free-run;
  // course mode fits to the course bounds in onMapReady instead).
  const centeredOnUserRef = useRef(false);
  useEffect(() => {
    if (course || centeredOnUserRef.current) return;
    if (locStatus !== 'granted' || !hereCoord) return;
    centeredOnUserRef.current = true;
    mapRef.current?.animateCamera({ center: { latitude: hereCoord.lat, longitude: hereCoord.lng } }, { duration: 400 });
  }, [course, locStatus, hereCoord]);

  const onMapReady = () => {
    if (courseCoords.length > 1) {
      mapRef.current?.fitToCoordinates(courseCoords, {
        edgePadding: { top: 90, right: 50, bottom: 50, left: 50 },
        animated: false,
      });
    }
  };

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
    if (target) mapRef.current?.animateCamera({ center: target }, { duration: 400 });
  };

  // GPS-lost chip: >15s without a raw fix while running. Honest caveat
  // (walk-verifiable): distanceInterval suppresses fixes at rest, so a long
  // mid-run standstill can also light it — quiet copy on purpose.
  const gpsLost = state === 'running' && lastFixAgeSec != null && lastFixAgeSec > 15;

  // ── T-B sheet — @gorhom/bottom-sheet (owner escalation after three
  // hand-rolled iterations shipped broken feel; the 미니플레이어 behavior —
  // touch anywhere → immediate attach → 1:1 tracking → velocity fling,
  // both directions — is this library's core job and no longer ours to
  // hand-validate). Built on the SAME RNGH+Reanimated already in the tree;
  // pure JS, Expo Go-safe. ──
  const { height: winH } = useWindowDimensions();
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

  const endRun = () => {
    const snapshot = stop();
    exitingRef.current = true;
    if (!snapshot) { router.back(); return; }
    // setPendingRun also persists to disk — crash-safe from this moment
    setPendingRun(course ? { ...snapshot, course: { id: course.id, title: course.title } } : snapshot);
    // replace: back must never land on a dead tracking screen
    router.replace('/(course)/run-save' as any);
  };

  const handleStart = async () => {
    const granted = await start();
    if (!granted) {
      // Repeat requests after denial never re-prompt — Settings is the only path.
      Alert.alert(
        '위치 권한이 필요해요',
        '러닝 기록에는 위치 권한이 필요해요. 설정에서 위치 접근을 허용해 주세요.',
        [
          { text: '취소', style: 'cancel' },
          { text: '설정 열기', onPress: () => Linking.openSettings() },
        ],
      );
    }
  };

  const running = state === 'running';
  const idle    = state === 'idle';
  const units   = useSettings(s => s.settings.units);
  const coachMsg = !moving ? '출발 준비 완료! 가볍게 시작해볼까요?' : '좋아요! 목표 페이스 유지 중이에요';
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
          style={StyleSheet.absoluteFill}
          initialRegion={{
            latitude: courseCoords[0]?.latitude ?? hereCoord?.lat ?? 37.5665,
            longitude: courseCoords[0]?.longitude ?? hereCoord?.lng ?? 126.978,
            latitudeDelta: 0.006,
            longitudeDelta: 0.006,
          }}
          onMapReady={onMapReady}
          onPanDrag={onUserPan}
          showsUserLocation
          showsMyLocationButton={false}
          showsCompass={false}
          toolbarEnabled={false}
        >
          {/* Course shape (dim neutral) UNDER the live track (accent) */}
          {courseCoords.length > 1 && (
            <Polyline coordinates={courseCoords} strokeColor="rgba(110,120,132,0.75)" strokeWidth={4} />
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
            {gpsLost && (
              <View style={st.gpsChip}>
                <Icon name="cellular-outline" size={11} color={C.sun} />
                <Text style={st.gpsChipTxt}>GPS 신호 약함</Text>
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
            <Text style={st.timeLabel}>경과 시간</Text>
            <Text style={st.timeValue}>{fmtElapsed(elapsedSec)}</Text>
          </View>

          <View style={st.metricsRow}>
            {([
              [fmtDist(distanceKm, units, 2), distUnit(units), '거리'],
              [paceDisplay,                   paceUnit(units), '현재 페이스'],
              [String(kcal),                  'kcal',          '칼로리'],
            ] as [string, string, string][]).map(([val, unit, label], i) => (
              <View key={i} style={[st.metricCol, i > 0 && st.metricColDivider]}>
                <View style={st.metricValRow}>
                  <Text style={st.metricVal}>{val}</Text>
                  <Text style={st.metricUnit}>{unit}</Text>
                </View>
                <Text style={st.metricLbl}>{label}</Text>
              </View>
            ))}
          </View>

          {/* AI audio coach — static card, canned message (no real audio yet) */}
          <View style={[st.coachCard, shadows.sm]}>
            <View style={st.coachIcon}>
              <Icon name="sparkles" size={18} color={C.accentGrn} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.coachLabel}>AI 오디오 코치</Text>
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
                <Text style={st.startTxt}>러닝 시작</Text>
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
      {/* TODO(keep-awake): gate on settings.run.keep_screen_on AFTER the
          tracking-filter bug (TODO.md: PAUSED) is closed — letting the screen
          sleep mid-run risks iOS GPS throttling, which would confound that
          investigation. Until then KeepAwake stays always-on during a run,
          regardless of the persisted toggle. */}
      {(state === 'countdown' || state === 'running' || state === 'paused') && <KeepAwake />}
    </GestureHandlerRootView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Close (idle only)
  closeBtn: { position: 'absolute', left: 14, width: 40, height: 40, borderRadius: R.pill, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  // Anchored just above the sheet's top edge; top driven by animatedPosition
  recenterWrap: { position: 'absolute', right: 14 },
  recenterBtn:  { width: 40, height: 40, borderRadius: R.pill, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', ...shadows.sm },
  gpsChip:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 5 },
  gpsChipTxt: { fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: -0.2 },

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
