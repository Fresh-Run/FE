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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import type { GpsPoint } from '@/lib/runs-api';
import { useHealth } from '@/store/use-health';

// ── Android slice ① (2026-10-09): PLATFORM-GATED LAZY LOAD ───────────────────
// The HealthKit package is never imported at module scope. On iOS the first
// call requires it (Metro resolves the real Nitro-backed healthkit.ios); on
// any other platform HK() returns null and every export below is a no-op
// with the same default it already returned for "unavailable/denied".
// Finding (9/22 audit candidate, verified against v14.0.2 sources): the
// package does NOT throw on import under Android — Metro resolves its
// platform-split `healthkit.js`, a pure-JS mock set (console.warn once,
// default values), and that file never imports the Nitro `modules.ts`. The
// guard here is belt-and-suspenders: it also removes the warn and keeps the
// Android bundle from pulling the package graph at all.
type HealthKitModule = typeof import('@kingstinct/react-native-healthkit');
let hkModule: HealthKitModule | null | undefined;
function HK(): HealthKitModule | null {
  if (Platform.OS !== 'ios') return null;
  if (hkModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- conditional native load; a static import would evaluate on every platform
      hkModule = require('@kingstinct/react-native-healthkit') as HealthKitModule;
    } catch {
      hkModule = null; // native absent (e.g. a binary predating the module) → no-op surface
    }
  }
  return hkModule;
}

// ── Android twin (Health Connect) — big-five ② skeleton (2026-10-09) ────────
// Same exported surface, mirrored: HC() lazy-loads react-native-health-connect
// on Android only (its JS entry is a throwing Proxy off Android, and its
// expo-module.config is platforms ["android"] — iOS autolinking never sees
// it, exactly as the HealthKit package has no android/ dir). Scope here =
// availability + permission + cadence READ parity; the workout write and
// body-mass read are honest TODOs (see each export).
type HealthConnectModule = typeof import('react-native-health-connect');
let hcModule: HealthConnectModule | null | undefined;
function HC(): HealthConnectModule | null {
  if (Platform.OS !== 'android') return null;
  if (hcModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- conditional native load (the HK() twin)
      hcModule = require('react-native-health-connect') as HealthConnectModule;
    } catch {
      hcModule = null;
    }
  }
  return hcModule;
}
const HC_STEPS_READ = { accessType: 'read', recordType: 'Steps' } as const;
const hasStepsRead = (granted: readonly { accessType?: string; recordType?: string }[]) =>
  granted.some(p => p.accessType === 'read' && p.recordType === 'Steps');
// Availability has THREE states on Android (getSdkStatus): SDK_AVAILABLE (HC
// built into Android 14+, or the HC app installed on 13↓) ·
// SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED (installed but stale) ·
// SDK_UNAVAILABLE (device without HC). Only the first is "available"; the
// other two fall to the same no-op defaults iOS-unavailable uses. The probe
// is async but the shared healthAvailable() is sync by contract (the 연결 row
// reads it on tap), so the answer is CACHED here at root hydrate.
let hcSdkAvailable: boolean | undefined;
let hcInitialized = false;
/** Resolve the HC module ready for calls: status probed+cached, initialize()
    done once. null = not Android / unavailable / init failed. */
async function hcReady(): Promise<HealthConnectModule | null> {
  const hc = HC();
  if (!hc) return null;
  try {
    if (hcSdkAvailable === undefined) {
      hcSdkAvailable = (await hc.getSdkStatus()) === hc.SdkAvailabilityStatus.SDK_AVAILABLE;
    }
    if (!hcSdkAvailable) return null;
    if (!hcInitialized) hcInitialized = await hc.initialize();
    return hcInitialized ? hc : null;
  } catch {
    return null;
  }
}

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
  if (Platform.OS === 'android') return hcSdkAvailable === true; // cached by hydrateHealthAndReask (root)
  const hk = HK();
  if (!hk) return false;
  try { return hk.isHealthDataAvailable(); } catch { return false; }
}

/** Present the HealthKit permission sheet (first time) — resolves true when
    the request was processed. iOS hides per-type write denial by design.
    Android: Health Connect's own permission ACTIVITY (not a runtime dialog)
    for READ Steps; true iff the grant came back in the result list. */
export async function requestHealthAuthorization(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const hc = await hcReady();
    if (!hc) return false;
    try {
      return hasStepsRead(await hc.requestPermission([HC_STEPS_READ]));
    } catch {
      return false;
    }
  }
  const hk = HK();
  if (!hk) return false;
  try {
    return await hk.requestAuthorization({ toShare: [...SHARE], toRead: [...READ] });
  } catch {
    return false;
  }
}

// ── Cadence chain repair (2026-10-04, links 2+3 of the 10/3 investigation) ──
const STEPS_REASK_KEY = '@fr_health_steps_reasked';

/** Boot-time hydrate of the device-local opt-in + the ONE-TIME stepCount
    re-ask. Link 2: the opt-in store used to hydrate only on profile-tab
    mount (lazy tab) — a cold start → run → save read the default `false`,
    so cadence AND the Apple Health workout write were silently skipped on
    every session that never opened 프로필. Hydrating here, before any save
    door can run, makes the save-time gate read real state.
    Link 3: stepCount joined the read set on 8/27; iOS sheets only
    UNDETERMINED types and only inside requestAuthorization — which fired
    solely on the off→on tap, so pre-8/27 connectors were never asked and
    HK returns empty for an unauthorized read, indistinguishable from "no
    steps". Per-type READ status is hidden by iOS (authorizationStatusFor
    reflects SHARE only), so the probe is getRequestStatusForAuthorization
    scoped to stepCount alone: `shouldRequest` = undetermined → re-present
    the sheet with the current read set; `unnecessary` = already granted OR
    denied → never re-ask (a denier is left alone by iOS itself). A stored
    marker makes the re-ask fire at most once per device regardless.
    Never throws; health must never break boot. */
export async function hydrateHealthAndReask(): Promise<void> {
  try {
    await useHealth.getState().hydrate();
    // Android: prime the sync availability cache at boot regardless of opt-in
    // (the 연결 row's unavailable-alert branch reads it before any opt-in).
    if (Platform.OS === 'android') await hcReady();
    if (!useHealth.getState().enabled) return;
    if (!healthAvailable()) return;
    if (Platform.OS === 'android') {
      // Android twin of the one-time re-ask: "undetermined" ≈ Steps READ not
      // in getGrantedPermissions(). Same marker key (device-local, platform-
      // neutral) → at most one boot-time ask; HC itself stops showing the
      // activity after repeated denials, so a denier is left alone twice over.
      const hc = await hcReady();
      if (!hc) return;
      if (await AsyncStorage.getItem(STEPS_REASK_KEY)) return;
      if (hasStepsRead(await hc.getGrantedPermissions())) return;
      await AsyncStorage.setItem(STEPS_REASK_KEY, '1');
      await hc.requestPermission([HC_STEPS_READ]);
      return;
    }
    const hk = HK();
    if (!hk) return;
    if (await AsyncStorage.getItem(STEPS_REASK_KEY)) return;
    const status = await hk.getRequestStatusForAuthorization({
      toRead: ['HKQuantityTypeIdentifierStepCount'],
    });
    if (status !== hk.AuthorizationRequestStatus.shouldRequest) return;
    await AsyncStorage.setItem(STEPS_REASK_KEY, '1'); // set BEFORE the sheet — a crash mid-sheet can't loop
    await hk.requestAuthorization({ toShare: [...SHARE], toRead: [...READ] });
  } catch {
    // boot must never block on health
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
  // TODO(android, follow-up slice): Health Connect ExerciseSession write
  // (insertRecords ExerciseSessionRecord RUNNING + Distance/Calories +
  // ExerciseRoute) — needs WRITE_EXERCISE/WRITE_DISTANCE/… permissions and
  // its own 연결 copy. Skeleton = honest false (mirror never claims a write).
  if (Platform.OS === 'android') return false;
  const hk = HK();
  if (!hk) return false;
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
    const workout = await hk.saveWorkoutSample(
      hk.WorkoutActivityType.running, quantities, start, end,
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
    lag → null, NEVER a persisted 0.
    LINK 4 — RULED 2026-10-04 (owner): nulls from sample lag are ACCEPTED for
    now. iOS flushes pedometer (CoreMotion) step samples into HealthKit in
    batches with a lag of minutes, so a save tapped right after stopping
    can see an empty or partial window — short runs most exposed. A
    deferred re-read (e.g. re-query + PATCH after the flush) is a FUTURE
    enhancement, explicitly not this slice. */
export async function queryRunCadenceSpm(run: HealthRunInput): Promise<number | null> {
  if (!useHealth.getState().enabled) return null;
  if (run.startedAtMs == null || run.elapsedSec <= 0) return null;
  if (Platform.OS === 'android') {
    // Health Connect twin — IDENTICAL computation: total steps over the
    // run's wall-clock window ÷ moving duration (duration_sec). aggregate
    // COUNT_TOTAL is HC's cumulativeSum; same null-on-zero (sample lag) rule.
    const hc = await hcReady();
    if (!hc) return null;
    try {
      const agg = await hc.aggregateRecord({
        recordType: 'Steps',
        timeRangeFilter: {
          operator: 'between',
          startTime: new Date(run.startedAtMs).toISOString(),
          endTime: new Date(run.endedAt).toISOString(),
        },
      });
      const steps = agg?.COUNT_TOTAL ?? 0;
      if (steps <= 0) return null;
      return Math.round(steps / (run.elapsedSec / 60));
    } catch {
      return null;
    }
  }
  const hk = HK();
  if (!hk) return null;
  try {
    const res = await hk.queryStatisticsForQuantity(
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
  // TODO(android, follow-up): Health Connect Weight record (readRecords
  // 'Weight', latest) — needs READ_WEIGHT; skeleton = undefined (= "none").
  if (Platform.OS === 'android') return undefined;
  const hk = HK();
  if (!hk) return undefined;
  try {
    const s = await hk.getMostRecentQuantitySample('HKQuantityTypeIdentifierBodyMass', 'kg');
    const kg = s?.quantity;
    return kg != null && kg >= 20 && kg <= 300 ? Math.round(kg * 10) / 10 : undefined;
  } catch {
    return undefined;
  }
}
