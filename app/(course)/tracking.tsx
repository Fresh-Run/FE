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
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { MiniMap } from '@/components/mini-map';
import { Icon } from '@/components/ui';
import { useRunTracker } from '@/hooks/use-run-tracker';
import { clearActiveCourse, getActiveCourse } from '@/store/active-course';
import { setPendingRun } from '@/store/pending-run';
import { useSettings } from '@/store/use-settings';
import { distUnit, fmtDist, fmtPaceIn, paceUnit } from '@/lib/run-format';
import { accentShadow, colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';

const MAP_H = 330;

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
const HOLD_SZ = 72, HOLD_R = 33, HOLD_CIRC = 2 * Math.PI * HOLD_R;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function HoldStop({ onComplete }: { onComplete: () => void }) {
  const [holding, setHolding] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const doneRef = useRef(false);
  // run.haptics setting gates all haptic feedback here (persisted via profile)
  const hapticsOn = useSettings(s => s.settings.run.haptics);

  const begin = () => {
    doneRef.current = false;
    setHolding(true);
    if (hapticsOn) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(progress, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false })
      .start(({ finished }) => {
        if (!finished) return;
        doneRef.current = true;
        setHolding(false);
        if (hapticsOn) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onComplete();
      });
  };

  const cancel = () => {
    if (doneRef.current) return;
    setHolding(false);
    Animated.timing(progress, { toValue: 0, duration: 250, easing: Easing.out(Easing.ease), useNativeDriver: false }).start();
  };

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
        <Pressable
          onPressIn={begin}
          onPressOut={cancel}
          style={[st.stopBtn, accentShadow(C.danger), { transform: [{ scale: holding ? 0.86 : 1 }] }]}
        >
          <View style={st.stopSquare} />
        </Pressable>
      </View>
      <Text style={[st.holdLabel, { color: holding ? C.danger : C.faint }]}>
        {holding ? '계속 누르세요…' : '길게 눌러 종료'}
      </Text>
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
    start, togglePause, stop,
  } = useRunTracker();

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
    <View style={st.root}>
      {/* ── Map area (MiniMap placeholder — real GPS map is a later item) ── */}
      <View style={{ height: MAP_H }}>
        <MiniMap
          seed={course?.id ?? 'me-live-track'}
          height={MAP_H}
          borderRadius={0}
          polyline={course?.polyline ?? undefined}
        />
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
          <View style={{ position: 'absolute', top: insets.top + 8, right: 14 }}>
            <StatusBadge paused={state === 'paused'} />
          </View>
        )}
      </View>

      {/* ── Metrics panel ─────────────────────────────────────────────────── */}
      <View style={st.panel}>
        <View style={st.handleRow}><View style={st.handle} /></View>

        <View style={{ alignItems: 'center', marginTop: 14 }}>
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

        <View style={{ flex: 1 }} />

        {/* ── Controls ────────────────────────────────────────────────────── */}
        {idle ? (
          <View style={[st.controls, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
            <Pressable
              onPress={handleStart}
              style={({ pressed }) => [st.startBtn, accentShadow(C.accent), { opacity: pressed ? 0.9 : 1 }]}
            >
              <Icon name="play" size={22} color={C.accentText} />
              <Text style={st.startTxt}>러닝 시작</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[st.controls, st.controlsRow, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
            <Pressable style={[st.speakerBtn, shadows.sm]}>
              <Icon name="volume-medium-outline" size={22} color={C.sub} />
            </Pressable>
            <Pressable onPress={togglePause} style={[st.pauseBtn, accentShadow(C.accent)]}>
              <Icon name={running ? 'pause' : 'play'} size={32} color={C.accentText} />
            </Pressable>
            <HoldStop onComplete={endRun} />
          </View>
        )}
      </View>

      {state === 'countdown' && <CountdownOverlay value={countdownValue} />}
      {/* TODO(keep-awake): gate on settings.run.keep_screen_on AFTER the
          tracking-filter bug (TODO.md: PAUSED) is closed — letting the screen
          sleep mid-run risks iOS GPS throttling, which would confound that
          investigation. Until then KeepAwake stays always-on during a run,
          regardless of the persisted toggle. */}
      {(state === 'countdown' || state === 'running' || state === 'paused') && <KeepAwake />}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Close (idle only)
  closeBtn: { position: 'absolute', left: 14, width: 40, height: 40, borderRadius: R.pill, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },

  // Course title pill (course mode)
  coursePillWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  coursePill:     { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '64%', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: R.pill, paddingHorizontal: 13, paddingVertical: 7 },
  coursePillTxt:  { fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: -0.2 },

  // Badge
  badge:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: R.pill, paddingHorizontal: 13, paddingVertical: 7 },
  badgeDot: { width: 7, height: 7, borderRadius: 4 },
  badgeTxt: { fontSize: 12.5, fontWeight: '700', color: '#fff', letterSpacing: -0.2 },

  // Panel
  panel:     { flex: 1, backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -22, paddingHorizontal: S.gutter, ...shadows.lg },
  handleRow: { alignItems: 'center', paddingTop: 8 },
  handle:    { width: 38, height: 5, borderRadius: 99, backgroundColor: C.border },

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
