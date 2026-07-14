// 자유 러닝 tracker hook — since ① (background GPS) this is a THIN render
// subscriber over store/run-session.ts, which owns the state machine, the
// odometer/gates and the fix pipeline (a TaskManager background callback
// can't see React refs, so none of that can live here anymore). The hook
// keeps what is genuinely UI: the permission flow, the countdown ticker, the
// 500ms render tick, and the derived per-render numbers. Public surface is
// unchanged — tracking.tsx consumes it exactly as before.

import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

import { runSession, type RunContext, type TrackerState } from '@/store/run-session';
import { estimateKcal } from '@/store/use-local-profile';
import type { Coordinate } from '@/types';

export type { RunContext, RunSnapshot, TrackerState } from '@/store/run-session';

const COUNTDOWN_FROM = 3;

export function useRunTracker() {
  const [state, setLocalState] = useState<TrackerState>(runSession.getState());
  const [countdownValue, setCountdownValue] = useState(COUNTDOWN_FROM);

  // Mirror the session's machine transitions into React (transitions only —
  // per-fix accumulation never re-renders; the tick below drives that).
  useEffect(() => runSession.subscribe(setLocalState), []);

  // Interval only drives re-renders while running; values come from the session.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (state !== 'running') return;
    const id = setInterval(() => setTick(t => t + 1), 500);
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

  const elapsedSec = Math.floor(runSession.elapsedMs() / 1000);

  // Rolling-window pace — the session's single source (④b: the widget
  // receives the same number this hook renders; they can never disagree).
  const now = Date.now();
  const pace = runSession.currentPaceSecPerKm(now);

  const distanceKm   = runSession.getDistanceM() / 1000;
  const moving       = state === 'running' && pace != null;
  const paceSecPerKm = moving ? pace : 0;
  const kcal         = estimateKcal(distanceKm); // MET×weight — null without saved weight
  const lastFixTs    = runSession.getLastFixTs();

  return {
    state,
    countdownValue,
    elapsedSec,
    distanceKm,
    paceSecPerKm,
    moving,
    kcal,
    start,
    togglePause,
    stop,
    // ── T-A read-only map surface (owner-approved boundary: the map is a
    // CONSUMER — these two exports are the ENTIRE tracker surface for it) ──
    /** Filtered on-screen track (the same array the save snapshot copies).
        READ-ONLY — consumers must never mutate. Mutated in place by the fix
        pipeline; re-draws should key on .length. */
    livePath: runSession.getPath() as readonly Coordinate[],
    /** Seconds since the last RAW watch callback (pre-gate); null = none yet.
        Note: distanceInterval suppresses callbacks while standing still, so
        age also grows at rest — render the GPS-lost chip only while running. */
    lastFixAgeSec: lastFixTs ? Math.floor((now - lastFixTs) / 1000) : null,
  };
}
