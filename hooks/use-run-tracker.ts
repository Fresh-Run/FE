// 자유 러닝 tracker — state machine + metrics for the tracking screen.
// Slice 2: real GPS. Elapsed time is timestamp-based; distance/pace come from
// a filtered expo-location watch stream. Saving (POST /api/runs) is slice 3.

import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { GpsPoint } from '@/lib/runs-api';
import type { Coordinate } from '@/types';

export type TrackerState = 'idle' | 'countdown' | 'running' | 'paused' | 'ended';

export type RunSnapshot = {
  distanceKm: number;
  elapsedSec: number;
  avgPaceSecPerKm: number | null;
  kcal: number;
  path: Coordinate[];
  /** RAW received fixes (gates not applied) — uploaded as gps_track. */
  gpsTrack: GpsPoint[];
  endedAt: number;
};

const COUNTDOWN_FROM = 3;

// ── GPS tuning — one place to adjust ──────────────────────────────────────────
const ACCURACY            = Location.Accuracy.Highest;
const DISTANCE_INTERVAL_M = 5;    // min movement between watch callbacks
const TIME_INTERVAL_MS    = 1000; // Android-only hint
const MAX_ACCURACY_M      = 25;   // reject fixes with a worse uncertainty radius
const MAX_SPEED_MPS       = 7;    // ~2'23"/km — faster is a glitch, not a runner
const MIN_SEGMENT_M       = 5;    // jitter floor before a segment counts
const STATIONARY_MPS      = 0.5;  // OS-reported speed below this = standing still
const PACE_WINDOW_MS      = 30_000; // rolling window for 현재 페이스
const MOVING_MIN_M        = 10;   // window distance to count as "moving"

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

export function useRunTracker() {
  const [state, setState] = useState<TrackerState>('idle');
  const [countdownValue, setCountdownValue] = useState(COUNTDOWN_FROM);

  // Watch callbacks fire outside React's render cycle — mirror state in a ref.
  const stateRef = useRef<TrackerState>('idle');
  stateRef.current = state;

  // Elapsed time is derived from timestamps, not interval ticks, so it stays
  // correct across dropped frames / backgrounding: completed run segments are
  // accumulated in ms, and the live segment is (now - segmentStart).
  const accumulatedMsRef = useRef(0);
  const segmentStartRef  = useRef<number | null>(null);

  // GPS accumulators. `anchor` is the last *accepted* fix — small moves build
  // up against it until they clear the jitter floor. `window` holds
  // (timestamp, cumulative meters) samples for the rolling pace.
  const subRef       = useRef<Location.LocationSubscription | null>(null);
  const anchorRef    = useRef<{ lat: number; lng: number; t: number } | null>(null);
  const distanceMRef = useRef(0);
  const pathRef      = useRef<Coordinate[]>([]); // for slice 3 save + live polyline
  // RAW received fixes while running, gates NOT applied (owner decision
  // 2026-07-08) — uploaded as gps_track so the server filters independently
  // (layer attribution). pathRef stays the filtered on-screen source.
  const rawTrackRef  = useRef<GpsPoint[]>([]);
  const windowRef    = useRef<{ t: number; cumM: number }[]>([]);
  // T-A read-only surface: last RAW callback timestamp (any received fix,
  // before all gates) — feeds the map's GPS-lost chip. A mirror write only;
  // no gate/accumulator behavior depends on it.
  const lastFixTsRef = useRef(0);

  // Interval only drives re-renders while running; values come from the refs.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (state !== 'running') return;
    const id = setInterval(() => setTick(t => t + 1), 500);
    return () => clearInterval(id);
  }, [state]);

  // ── Fix pipeline ────────────────────────────────────────────────────────────
  // Gate audit (2026-07-11 outing, tethered log): accuracy/jitter/stationary/
  // anchor gates EXONERATED — 90%+ of raw credited at walk pace, 98% at run
  // pace, ANCHOR-MOVED destroyer fired zero times. The one convicted defect
  // (short-dt speed rejects) is fixed below.
  const onFix = useCallback((loc: Location.LocationObject) => {
    const { latitude: lat, longitude: lng, accuracy, speed, altitude } = loc.coords;
    const t = loc.timestamp;
    const cur = { lat, lng };
    lastFixTsRef.current = t; // T-A mirror (see decl) — before any gate

    // Raw track capture — BEFORE any gate (incl. the accuracy reject below):
    // the server filter must see everything the client filter saw.
    if (stateRef.current === 'running') {
      rawTrackRef.current.push({
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

    const st = stateRef.current;

    // Countdown (GPS warm-up) and pause: keep the anchor fresh so the first
    // running segment doesn't span the gap, but accumulate nothing.
    if (st === 'countdown' || st === 'paused') {
      anchorRef.current = { ...cur, t };
      return;
    }
    if (st !== 'running') {
      return;
    }

    const anchor = anchorRef.current;
    if (!anchor) {
      anchorRef.current = { ...cur, t };
      pathRef.current.push(cur);
      windowRef.current.push({ t, cumM: distanceMRef.current });
      return;
    }

    // Standing still — OS says so. Refresh the anchor so wander can't build up.
    if (speed != null && speed >= 0 && speed < STATIONARY_MPS) {
      anchorRef.current = { ...cur, t };
      return;
    }

    const dM = haversineM(anchor, cur);
    const dtSec = (t - anchor.t) / 1000;
    if (dtSec <= 0) {
      return;
    }
    if (dM / dtSec > MAX_SPEED_MPS) {
      // Short-dt discretization artifact (convicted on the 2026-07-11 outing:
      // walking fixes rejected at a computed 8 m/s over dt≈1s — integer-second
      // dt inflates v while dM spans a longer real interval). The computed
      // speed is only trustworthy over a stable window; under 1.5s the OS
      // speed is the honest signal — reject only when IT also says glitch.
      if (dtSec >= 1.5 || (speed != null && speed > MAX_SPEED_MPS)) {
        return; // glitch (also drops teleport-y background gaps)
      }
      // else: short-dt over-computed speed with a sane OS speed — real motion
    }
    if (dM < MIN_SEGMENT_M) {
      return; // jitter floor — anchor stays put, slow progress still adds up
    }

    distanceMRef.current += dM;
    anchorRef.current = { ...cur, t };
    pathRef.current.push(cur);
    windowRef.current.push({ t, cumM: distanceMRef.current });
    const cutoff = t - PACE_WINDOW_MS;
    while (windowRef.current.length > 1 && windowRef.current[0].t < cutoff) {
      windowRef.current.shift();
    }
  }, []);

  // Subscription lifecycle: warm up during countdown, tear down on end/unmount.
  useEffect(() => {
    if (state === 'countdown' && !subRef.current) {
      let cancelled = false;
      Location.watchPositionAsync(
        { accuracy: ACCURACY, distanceInterval: DISTANCE_INTERVAL_M, timeInterval: TIME_INTERVAL_MS },
        onFix,
      ).then(sub => {
        if (cancelled) sub.remove();
        else subRef.current = sub;
      });
      return () => { cancelled = true; };
    }
    if (state === 'ended') {
      subRef.current?.remove();
      subRef.current = null;
    }
  }, [state, onFix]);

  useEffect(() => () => { subRef.current?.remove(); }, []);

  // Countdown: 3 → 2 → 1 (~1s each), then auto-start the run.
  useEffect(() => {
    if (state !== 'countdown') return;
    setCountdownValue(COUNTDOWN_FROM);
    const id = setInterval(() => {
      setCountdownValue(v => {
        if (v <= 1) {
          clearInterval(id);
          segmentStartRef.current = Date.now();
          setState('running');
          return v;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [state]);

  /** Requests location permission; returns false (and stays idle) on denial. */
  const start = useCallback(async (): Promise<boolean> => {
    if (stateRef.current !== 'idle') return true;
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return false;
    setState('countdown');
    return true;
  }, []);

  const togglePause = useCallback(() => {
    setState(s => {
      if (s === 'running') {
        if (segmentStartRef.current != null) {
          accumulatedMsRef.current += Date.now() - segmentStartRef.current;
          segmentStartRef.current = null;
        }
        return 'paused';
      }
      if (s === 'paused') {
        segmentStartRef.current = Date.now();
        return 'running';
      }
      return s;
    });
  }, []);

  /** Ends the run and returns its final snapshot (null if nothing was running). */
  const stop = useCallback((): RunSnapshot | null => {
    const s = stateRef.current;
    if (s !== 'running' && s !== 'paused') return null;
    if (segmentStartRef.current != null) {
      accumulatedMsRef.current += Date.now() - segmentStartRef.current;
      segmentStartRef.current = null;
    }
    setState('ended');

    const finalSec = Math.floor(accumulatedMsRef.current / 1000);
    const finalKm  = distanceMRef.current / 1000;
    return {
      distanceKm: finalKm,
      elapsedSec: finalSec,
      avgPaceSecPerKm: finalKm >= 0.05 && finalSec > 0 ? Math.round(finalSec / finalKm) : null,
      kcal: Math.round(finalKm * 62),
      path: [...pathRef.current],
      gpsTrack: [...rawTrackRef.current],
      endedAt: Date.now(),
    };
  }, []);

  const elapsedMs =
    accumulatedMsRef.current +
    (segmentStartRef.current != null ? Date.now() - segmentStartRef.current : 0);
  const elapsedSec = Math.floor(elapsedMs / 1000);

  // Rolling-window pace over the last 30s of accepted fixes.
  const now = Date.now();
  const win = windowRef.current.filter(s => s.t >= now - PACE_WINDOW_MS);
  const winM   = win.length >= 2 ? win[win.length - 1].cumM - win[0].cumM : 0;
  const winSec = win.length >= 2 ? (win[win.length - 1].t - win[0].t) / 1000 : 0;

  const distanceKm   = distanceMRef.current / 1000;
  const moving       = state === 'running' && winM >= MOVING_MIN_M && winSec > 0;
  const paceSecPerKm = moving ? Math.round(winSec / (winM / 1000)) : 0;
  const kcal         = Math.round(distanceKm * 62); // heuristic, matches bundle

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
    livePath: pathRef.current as readonly Coordinate[],
    /** Seconds since the last RAW watch callback (pre-gate); null = none yet.
        Note: distanceInterval suppresses callbacks while standing still, so
        age also grows at rest — render the GPS-lost chip only while running. */
    lastFixAgeSec: lastFixTsRef.current ? Math.floor((now - lastFixTsRef.current) / 1000) : null,
  };
}
