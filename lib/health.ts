// Apple Health integration (③, Slice C — pure JS over the build-#4 natives).
// kingstinct v14 (Nitro): write the finished run as a real HKWorkout (+ the
// GPS route into Fitness maps — the ratification bonus), read body mass for
// the 체중-가져오기 affordance. HR read auth is requested for the roadmap
// (심박 존) but nothing consumes it yet — honest boundary: no Watch = no HR,
// never fabricated.
//
// Every call is guarded: non-iOS/simulator/denial degrade to false/undefined
// (kingstinct's own non-iOS stubs + our try/catch) — health can never break
// a save. Authorization truth: iOS NEVER reveals write-denial to apps
// (privacy design) — requestAuthorization resolving true means "the sheet
// was handled", not "granted". Writes to a denied store silently no-op
// server-side... HK-side. The opt-in row copy stays honest about that.
import {
  getMostRecentQuantitySample,
  isHealthDataAvailable,
  queryStatisticsForQuantity,
  requestAuthorization,
  saveWorkoutSample,
  WorkoutActivityType,
} from '@kingstinct/react-native-healthkit';

import type { GpsPoint } from '@/lib/runs-api';
import { useHealth } from '@/store/use-health';

const SHARE = [
  'HKWorkoutTypeIdentifier',
  'HKWorkoutRouteTypeIdentifier',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
] as const;
const READ = [
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierHeartRate',
  // 8/27 cadence slice — steps for avg_cadence_spm. Pure JS addition (OTA):
  // already-enabled users get the read-auth sheet re-presented for the NEW
  // type at the next opt-in touchpoint (iOS only sheets undetermined types);
  // until granted, step reads return empty → cadence simply absent.
  'HKQuantityTypeIdentifierStepCount',
] as const;

export function healthAvailable(): boolean {
  try { return isHealthDataAvailable(); } catch { return false; }
}

/** Present the HealthKit permission sheet (first time) — resolves true when
    the request was processed. iOS hides per-type write denial by design. */
export async function requestHealthAuthorization(): Promise<boolean> {
  try {
    return await requestAuthorization({ toShare: [...SHARE], toRead: [...READ] });
  } catch {
    return false;
  }
}

export type HealthRunInput = {
  /** TRUE wall-clock start (RunSnapshot/PendingRun.startedAtMs). Absent only
      on pre-anchor disk recoveries → fall back to endedAt − elapsed with the
      stated approximation (paused time compressed out). */
  startedAtMs?: number;
  endedAt: number;
  elapsedSec: number;
  distanceKm: number;
  kcal: number | null;
  gpsTrack?: GpsPoint[];
};

/** Write the finished run as an HKWorkout (+ route when a track exists).
    Fire-and-forget from the save flow — never throws, never blocks. */
export async function writeRunToHealth(run: HealthRunInput): Promise<boolean> {
  try {
    const start = new Date(run.startedAtMs ?? run.endedAt - run.elapsedSec * 1000);
    const end = new Date(run.endedAt);
    if (!(end > start)) return false;

    const distanceM = Math.round(run.distanceKm * 1000);
    const quantities = [
      {
        startDate: start, endDate: end,
        quantityType: 'HKQuantityTypeIdentifierDistanceWalkingRunning' as const,
        quantity: distanceM, unit: 'm',
      },
      ...(run.kcal != null && run.kcal > 0 ? [{
        startDate: start, endDate: end,
        quantityType: 'HKQuantityTypeIdentifierActiveEnergyBurned' as const,
        quantity: Math.round(run.kcal), unit: 'kcal',
      }] : []),
    ];
    const workout = await saveWorkoutSample(
      WorkoutActivityType.running, quantities, start, end,
      { distance: distanceM, ...(run.kcal != null && run.kcal > 0 ? { energyBurned: Math.round(run.kcal) } : {}) },
    );

    // Route → Fitness maps. CLLocation conventions: negative accuracy/speed/
    // course = unknown; alt 0 + vAcc -1 = altitude ignored.
    const track = run.gpsTrack ?? [];
    if (workout && track.length >= 2) {
      await workout.saveWorkoutRoute(track.map(p => ({
        latitude: p.lat,
        longitude: p.lng,
        altitude: p.alt ?? 0,
        date: new Date(p.t),
        horizontalAccuracy: p.acc ?? 15,
        verticalAccuracy: p.alt != null ? 15 : -1,
        speed: -1,
        course: -1,
      })));
    }
    return true;
  } catch {
    return false; // health must never break a save
  }
}

/** The save-flow hook: one line at each save-success site. Gated on the
    device-local opt-in; fire-and-forget (health can never block a save). */
export function maybeWriteRunToHealth(run: HealthRunInput): void {
  if (!useHealth.getState().enabled) return;
  void writeRunToHealth(run);
}

/** Avg cadence (steps/min) for a finished run — HK stepCount cumulative sum
    over the run's wall-clock window ÷ duration (SAME basis as pace: the
    duration_sec run clock, paused time excluded). null = HK opt-in off /
    read denied / unavailable / no window (pre-anchor recoveries lack
    startedAtMs) / zero samples — cadence is simply absent, never an error.
    Zero steps against a real-distance run = the known post-run sample-write
    lag → null, NEVER a persisted 0. */
export async function queryRunCadenceSpm(run: HealthRunInput): Promise<number | null> {
  if (!useHealth.getState().enabled) return null;
  if (run.startedAtMs == null || run.elapsedSec <= 0) return null;
  try {
    const res = await queryStatisticsForQuantity(
      'HKQuantityTypeIdentifierStepCount',
      ['cumulativeSum'],
      {
        filter: { date: { startDate: new Date(run.startedAtMs), endDate: new Date(run.endedAt) } },
        unit: 'count',
      },
    );
    const steps = res?.sumQuantity?.quantity ?? 0;
    if (steps <= 0) return null;
    return Math.round(steps / (run.elapsedSec / 60));
  } catch {
    return null; // health must never break a save
  }
}

/** Most-recent body mass (kg) from 건강 — the 체중 가져오기 affordance.
    undefined = none recorded / not authorized / unavailable. */
export async function fetchBodyMassKg(): Promise<number | undefined> {
  try {
    const s = await getMostRecentQuantitySample('HKQuantityTypeIdentifierBodyMass', 'kg');
    const kg = s?.quantity;
    return kg != null && kg >= 20 && kg <= 300 ? Math.round(kg * 10) / 10 : undefined;
  } catch {
    return undefined;
  }
}
