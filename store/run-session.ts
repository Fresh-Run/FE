// Run-session singleton (BUILD #1 ① — background GPS). Owns the state
// machine, the timestamp clock, the odometer + jitter gates, and the ONE fix
// pipeline shared by every delivery context. TaskManager background callbacks
// run in a headless JS scope that cannot see React refs, so everything a fix
// touches lives HERE at module scope; hooks/use-run-tracker.ts is a thin
// render subscriber over this module.
//
// ⚠️ defineTask MUST execute at bundle evaluation on EVERY launch — including
// an OS relaunch into the task — or iOS invokes an undefined task and
// crashes. app/_layout.tsx side-effect-imports this module, which puts the
// defineTask call on the entry import graph, before any React render.
//
// Permission model (native-verified 2026-07-15, LocationModule.swift:165):
// startLocationUpdatesAsync checks FOREGROUND permission only, and the task
// consumer sets allowsBackgroundLocationUpdates unconditionally — so a run
// started in the foreground keeps receiving fixes with the screen locked
// under plain When-In-Use (Apple's foreground-started-session rule; the blue
// indicator shows). "Always" is requested once (see use-run-tracker) but is
// NOT required for pocket survival, and the run never blocks on it.
//
// Kill semantics (ledgered, owner-approved): backgrounded/locked = fully
// survives (this module keeps accumulating). Hard kill mid-run = the
// throttled disk persist below feeds the EXISTING pending-run recovery on
// next launch (≤~8s tail lost) — never silent loss. Seamless HEADLESS
// continuation across an OS kill is explicitly OUT of ① scope: the task
// handler below detects the no-live-session relaunch and stops updates.

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import type { GpsPoint } from '@/lib/runs-api';
import type { CrewSessionTag } from '@/store/active-course';
import { persistActiveRun, type PendingRun } from '@/store/pending-run';
import { estimateKcal } from '@/store/use-local-profile';
import type { Coordinate } from '@/types';

export type TrackerState = 'idle' | 'countdown' | 'running' | 'paused' | 'ended';

export type RunSnapshot = {
  distanceKm: number;
  elapsedSec: number;
  avgPaceSecPerKm: number | null;
  /** MET×weight (single app-wide model); null = no saved weight. */
  kcal: number | null;
  path: Coordinate[];
  /** RAW received fixes (gates not applied) — uploaded as gps_track. */
  gpsTrack: GpsPoint[];
  endedAt: number;
};

/** Save-tags known at run START (course mode / 크루 러닝) so a mid-run kill
    recovers them too — the end-of-run save composes its own copy as before. */
export type RunContext = {
  course?: { id: string | null; title: string };
  crewSession?: CrewSessionTag;
};

const LOCATION_TASK = 'freshrun-run-location';

// ── GPS tuning — one place to adjust (moved verbatim from use-run-tracker;
//    gate audit 2026-07-11: accuracy/jitter/stationary/anchor EXONERATED) ────
const ACCURACY            = Location.Accuracy.Highest;
const DISTANCE_INTERVAL_M = 5;    // min movement between watch callbacks
const TIME_INTERVAL_MS    = 1000; // Android-only hint
const MAX_ACCURACY_M      = 25;   // reject fixes with a worse uncertainty radius
const MAX_SPEED_MPS       = 7;    // ~2'23"/km — faster is a glitch, not a runner
const MIN_SEGMENT_M       = 5;    // jitter floor before a segment counts
const STATIONARY_MPS      = 0.5;  // OS-reported speed below this = standing still
export const PACE_WINDOW_MS = 30_000; // rolling window for 현재 페이스
export const MOVING_MIN_M   = 10;   // window distance to count as "moving"

const PERSIST_INTERVAL_MS = 8_000; // kill-recovery disk throttle
const PERSIST_MIN_MS      = 10_000; // don't persist pure-noise micro-sessions

function haversineM(a: Coordinate, b: Coordinate): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// ── Module state (was: React refs in the hook) ───────────────────────────────
let state: TrackerState = 'idle';
let accumulatedMs = 0;
let segmentStart: number | null = null;
let anchor: { lat: number; lng: number; t: number } | null = null;
let distanceM = 0;
let path: Coordinate[] = [];      // filtered on-screen track (save + polyline)
let rawTrack: GpsPoint[] = [];    // RAW fixes, gates NOT applied → gps_track
let paceWindow: { t: number; cumM: number }[] = [];
let lastFixTs = 0;                // last RAW callback ts — GPS-lost chip
let context: RunContext = {};
let lastPersistMs = 0;
let watchSub: Location.LocationSubscription | null = null; // fallback stream only

// State-transition listeners (the hook mirrors state into React) — fires on
// machine transitions only, never per-fix (no render storm).
const listeners = new Set<(s: TrackerState) => void>();
function setState(next: TrackerState): void {
  if (state === next) return;
  state = next;
  listeners.forEach(fn => fn(next));
}

// ── The ONE fix pipeline (moved VERBATIM from use-run-tracker's onFix; refs
//    became module vars — every gate, constant and branch is unchanged, so
//    foreground and background behavior are identical by construction) ──────
function processFix(loc: Location.LocationObject): void {
  const { latitude: lat, longitude: lng, accuracy, speed, altitude } = loc.coords;
  const t = loc.timestamp;
  const cur = { lat, lng };
  lastFixTs = t; // T-A mirror — before any gate

  // Raw track capture — BEFORE any gate (incl. the accuracy reject below):
  // the server filter must see everything the client filter saw.
  if (state === 'running') {
    rawTrack.push({
      // iOS timestamps carry fractional ms; the contract's t is integer
      // epoch ms (422 int_from_float otherwise — convicted 2026-07-08)
      lat, lng, t: Math.round(t),
      ...(accuracy != null ? { acc: Math.round(accuracy * 10) / 10 } : {}),
      ...(altitude != null ? { alt: Math.round(altitude * 10) / 10 } : {}),
    });
  }

  if (accuracy == null || accuracy > MAX_ACCURACY_M) {
    return; // bad fix — ignore
  }

  // Countdown (GPS warm-up) and pause: keep the anchor fresh so the first
  // running segment doesn't span the gap, but accumulate nothing.
  if (state === 'countdown' || state === 'paused') {
    anchor = { ...cur, t };
    return;
  }
  if (state !== 'running') {
    return;
  }

  if (!anchor) {
    anchor = { ...cur, t };
    path.push(cur);
    paceWindow.push({ t, cumM: distanceM });
    return;
  }

  // Standing still — OS says so. Refresh the anchor so wander can't build up.
  if (speed != null && speed >= 0 && speed < STATIONARY_MPS) {
    anchor = { ...cur, t };
    return;
  }

  const dM = haversineM(anchor, cur);
  const dtSec = (t - anchor.t) / 1000;
  if (dtSec <= 0) {
    return;
  }
  if (dM / dtSec > MAX_SPEED_MPS) {
    // Short-dt discretization artifact (convicted on the 2026-07-11 outing):
    // the computed speed is only trustworthy over a stable window; under 1.5s
    // the OS speed is the honest signal — reject only when IT also says glitch.
    if (dtSec >= 1.5 || (speed != null && speed > MAX_SPEED_MPS)) {
      return; // glitch (also drops teleport-y background gaps)
    }
    // else: short-dt over-computed speed with a sane OS speed — real motion
  }
  if (dM < MIN_SEGMENT_M) {
    return; // jitter floor — anchor stays put, slow progress still adds up
  }

  distanceM += dM;
  anchor = { ...cur, t };
  path.push(cur);
  paceWindow.push({ t, cumM: distanceM });
  const cutoff = t - PACE_WINDOW_MS;
  while (paceWindow.length > 1 && paceWindow[0].t < cutoff) {
    paceWindow.shift();
  }
}

/** Every delivery context funnels here: gates, then the throttled
    kill-recovery persist (state-guarded inside each). */
function feedFix(loc: Location.LocationObject): void {
  processFix(loc);
  maybePersist(Date.now());
}

// ── Kill-recovery persist (①, owner-ruled in scope): the run-so-far, in the
//    finished-run shape/key, so the EXISTING cold-start recovery offers it —
//    a crashed 10km run must never silently vanish. ≤~8s tail loss. ─────────
function buildPartial(): PendingRun | null {
  const elapsed = elapsedMsNow();
  if (elapsed < PERSIST_MIN_MS) return null; // micro-session = recovery noise
  const finalSec = Math.floor(elapsed / 1000);
  const finalKm  = distanceM / 1000;
  return {
    distanceKm: finalKm,
    elapsedSec: finalSec,
    avgPaceSecPerKm: finalKm >= 0.05 && finalSec > 0 ? Math.round(finalSec / finalKm) : null,
    kcal: estimateKcal(finalKm),
    path: [...path],
    gpsTrack: [...rawTrack],
    endedAt: Date.now(),
    ...(context.course ? { course: context.course } : {}),
    ...(context.crewSession ? { crewSession: context.crewSession } : {}),
  };
}

function maybePersist(now: number): void {
  if (state !== 'running') return;
  if (now - lastPersistMs < PERSIST_INTERVAL_MS) return;
  const partial = buildPartial();
  if (!partial) return;
  lastPersistMs = now;
  persistActiveRun(partial);
}

// ── The background task — defined at MODULE SCOPE (see header warning) ──────
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  // Headless-relaunch guard: iOS may relaunch the app into this task after a
  // kill. Module state resets on relaunch → no live session → stop updates
  // (battery + garbage guard). Headless continuation = out of ① scope.
  if (state !== 'countdown' && state !== 'running' && state !== 'paused') {
    stopUpdates();
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] })?.locations ?? [];
  for (const loc of locations) feedFix(loc);
});

async function startUpdates(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) return;
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: ACCURACY,
      distanceInterval: DISTANCE_INTERVAL_M,
      timeInterval: TIME_INTERVAL_MS,
      activityType: Location.ActivityType.Fitness,
      pausesUpdatesAutomatically: false,      // never let iOS pause a run
      showsBackgroundLocationIndicator: true, // honest blue indicator
    });
  } catch {
    // Task path unavailable (e.g. Android without the bg permission we
    // deliberately didn't declare) — fall back to the foreground-only watch
    // feeding the SAME pipeline. Behavior degrades to pre-① exactly.
    if (watchSub) return;
    watchSub = await Location.watchPositionAsync(
      { accuracy: ACCURACY, distanceInterval: DISTANCE_INTERVAL_M, timeInterval: TIME_INTERVAL_MS },
      feedFix,
    ).catch(() => null);
  }
}

function stopUpdates(): void {
  watchSub?.remove();
  watchSub = null;
  Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)
    .then(started => { if (started) return Location.stopLocationUpdatesAsync(LOCATION_TASK); })
    .catch(() => {});
}

function elapsedMsNow(): number {
  return accumulatedMs + (segmentStart != null ? Date.now() - segmentStart : 0);
}

function resetAccumulators(): void {
  accumulatedMs = 0;
  segmentStart = null;
  anchor = null;
  distanceM = 0;
  path = [];
  rawTrack = [];
  paceWindow = [];
  lastFixTs = 0;
  lastPersistMs = 0;
}

// ── Public surface (the hook + the task are the only intended callers) ──────
export const runSession = {
  getState: (): TrackerState => state,
  subscribe(fn: (s: TrackerState) => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },

  /** Fresh accumulators + GPS warm-up. Permission is the hook's concern. */
  async startCountdown(ctx?: RunContext): Promise<void> {
    if (state !== 'idle') return;
    resetAccumulators();
    context = ctx ?? {};
    setState('countdown');
    await startUpdates();
  },

  beginRunning(): void {
    if (state !== 'countdown') return;
    segmentStart = Date.now();
    setState('running');
  },

  togglePause(): void {
    if (state === 'running') {
      if (segmentStart != null) {
        accumulatedMs += Date.now() - segmentStart;
        segmentStart = null;
      }
      setState('paused');
      // a pause is an interruption-risk moment — persist outside the throttle
      const partial = buildPartial();
      if (partial) persistActiveRun(partial);
    } else if (state === 'paused') {
      segmentStart = Date.now();
      setState('running');
    }
  },

  /** Ends the run and returns its final snapshot (null if nothing was live). */
  stop(): RunSnapshot | null {
    if (state !== 'running' && state !== 'paused') return null;
    if (segmentStart != null) {
      accumulatedMs += Date.now() - segmentStart;
      segmentStart = null;
    }
    setState('ended');
    stopUpdates();

    const finalSec = Math.floor(accumulatedMs / 1000);
    const finalKm  = distanceM / 1000;
    return {
      distanceKm: finalKm,
      elapsedSec: finalSec,
      avgPaceSecPerKm: finalKm >= 0.05 && finalSec > 0 ? Math.round(finalSec / finalKm) : null,
      kcal: estimateKcal(finalKm),
      path: [...path],
      gpsTrack: [...rawTrack],
      endedAt: Date.now(),
    };
  },

  /** Hook-unmount cleanup. Mid-run unmount is nav-locked (tracking.tsx), so
      this normally runs on 'ended'/'idle'; the disk copy is NOT touched — by
      then it holds the final run and belongs to the save flow. */
  teardown(): void {
    stopUpdates();
    setState('idle');
    resetAccumulators();
    context = {};
  },

  // Read-only getters for the render subscriber.
  elapsedMs: elapsedMsNow,
  getDistanceM: () => distanceM,
  getPath: () => path as readonly Coordinate[],
  getPaceWindow: () => paceWindow as readonly { t: number; cumM: number }[],
  getLastFixTs: () => lastFixTs,
};
