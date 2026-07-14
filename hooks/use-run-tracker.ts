// 자유 러닝 tracker hook — a THIN render subscriber over store/run-session.ts
// (① background GPS: the singleton owns the state machine, odometer, gates
// and fix pipeline — a TaskManager headless callback can't see React refs).
//
// ⚠️ REACT COMPILER CONTRACT (the 2026-07-16 frozen-clock bug): this app
// compiles with experiments.reactCompiler, which assumes render purity and
// memoizes by REACTIVE deps. Reading the mutable singleton during render
// (runSession.elapsedMs() etc.) gets cached — the compiled artifact keyed the
// return object on [countdownValue, moving, paceSecPerKm, state] only, so the
// clock refreshed ONLY on state transitions (pause→resume "jumps once, then
// frozen"; pace/kcal/GPS-chip/livePath silently frozen too — invisible
// indoors). THE RULE: the render may touch ONLY reactive state. Every
// singleton read happens in readSnap(), called from event/effect contexts
// (the 500ms tick, the transition subscriber) where impure reads are legal,
// and lands in React state the compiler tracks correctly.

import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

import { runSession, type RunContext, type TrackerState } from '@/store/run-session';
import { estimateKcal } from '@/store/use-local-profile';
import type { Coordinate } from '@/types';

export type { RunContext, RunSnapshot, TrackerState } from '@/store/run-session';

const COUNTDOWN_FROM = 3;

type TrackerSnap = {
  elapsedSec: number;
  distanceKm: number;
  paceSecPerKm: number;
  moving: boolean;
  kcal: number | null;
  lastFixAgeSec: number | null;
};

/** ALL singleton reads live here — called outside render only. */
function readSnap(st: TrackerState): TrackerSnap {
  const now = Date.now();
  const pace = runSession.currentPaceSecPerKm(now);
  const distanceKm = runSession.getDistanceM() / 1000;
  const lastFixTs = runSession.getLastFixTs();
  const moving = st === 'running' && pace != null;
  return {
    elapsedSec: Math.floor(runSession.elapsedMs() / 1000),
    distanceKm,
    paceSecPerKm: moving ? pace : 0,
    moving,
    kcal: estimateKcal(distanceKm), // MET×weight — null without saved weight
    lastFixAgeSec: lastFixTs ? Math.floor((now - lastFixTs) / 1000) : null,
  };
}

export function useRunTracker() {
  const [state, setLocalState] = useState<TrackerState>(() => runSession.getState());
  const [countdownValue, setCountdownValue] = useState(COUNTDOWN_FROM);
  const [snap, setSnap] = useState<TrackerSnap>(() => readSnap(runSession.getState()));
  // Immutable path snapshot: a NEW array reference only when the session path
  // grew — so downstream memoization (tracking's drawnPath, the map) sees a
  // real dep change per accepted fix instead of one stable mutated-in-place
  // ref it would cache forever (the same compiler trap as the clock).
  const [livePath, setLivePath] = useState<readonly Coordinate[]>([]);

  // Transition mirror + snapshot refresh (pause/resume/stop repaint even
  // though the tick below only runs while 'running').
  useEffect(() => runSession.subscribe(s => {
    setLocalState(s);
    setSnap(readSnap(s));
  }), []);

  // The 500ms tick now CARRIES the data (it used to be an empty re-render
  // ping — under the compiler that repainted nothing).
  useEffect(() => {
    if (state !== 'running') return;
    const id = setInterval(() => {
      setSnap(readSnap('running'));
      setLivePath(prev => {
        const p = runSession.getPath();
        return prev.length === p.length ? prev : [...p];
      });
    }, 500);
    return () => clearInterval(id);
  }, [state]);

  // Countdown: 3 → 2 → 1 (~1s each), then auto-start the run.
  useEffect(() => {
    if (state !== 'countdown') return;
    setCountdownValue(COUNTDOWN_FROM);
    const id = setInterval(() => {
      setCountdownValue(v => {
        if (v <= 1) {
          clearInterval(id);
          runSession.beginRunning();
          return v;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [state]);

  // Session teardown on unmount. Mid-run unmount is unreachable (tracking.tsx
  // nav-locks a live run) — this runs on 'ended'/'idle' and resets for the
  // next mount. A crash never reaches here, which is exactly why the
  // kill-recovery persist exists.
  useEffect(() => () => { runSession.teardown(); }, []);

  /** Requests location permission; returns false (and stays idle) on denial.
      The When-In-Use → Always upgrade is asked ONCE EVER: iOS reports
      'undetermined' only before the user has answered the Always prompt, so
      the guard is the OS's own permission state — no flag to desync. The run
      NEVER blocks on the answer: a foreground-started session keeps
      delivering in background under plain When-In-Use (native-verified,
      run-session.ts header), so "While Using" users lose nothing. */
  const start = useCallback(async (context?: RunContext): Promise<boolean> => {
    if (runSession.getState() !== 'idle') return true;
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return false;
    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status === 'undetermined') {
      await Location.requestBackgroundPermissionsAsync(); // outcome not blocking
    }
    await runSession.startCountdown(context);
    return true;
  }, []);

  const togglePause = useCallback(() => { runSession.togglePause(); }, []);

  /** Ends the run and returns its final snapshot (null if nothing was running). */
  const stop = useCallback(() => runSession.stop(), []);

  return {
    state,
    countdownValue,
    elapsedSec: snap.elapsedSec,
    distanceKm: snap.distanceKm,
    paceSecPerKm: snap.paceSecPerKm,
    moving: snap.moving,
    kcal: snap.kcal,
    start,
    togglePause,
    stop,
    // ── T-A read-only map surface (owner-approved boundary: the map is a
    // CONSUMER — these two exports are the ENTIRE tracker surface for it) ──
    /** Immutable snapshot of the filtered track — a NEW reference whenever
        the path grew (≤2/s), safe to memoize on directly. */
    livePath,
    /** Seconds since the last RAW watch callback (pre-gate); null = none yet.
        Note: distanceInterval suppresses callbacks while standing still, so
        age also grows at rest — render the GPS-lost chip only while running. */
    lastFixAgeSec: snap.lastFixAgeSec,
  };
}
