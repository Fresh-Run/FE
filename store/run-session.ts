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

import { track } from '@/lib/analytics';
import { t } from '@/lib/i18n';
import type { GpsPoint } from '@/lib/runs-api';
import { endLiveActivity, startLiveActivity, updateLiveActivity } from '@/modules/live-activity';
import type { CrewSessionTag } from '@/store/active-course';
import { persistActiveRun, type PendingRun } from '@/store/pending-run';
import { estimateKcal } from '@/store/use-local-profile';
import { useSettings } from '@/store/use-settings';
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
  /** TRUE wall-clock run start (beginRunning's Date.now — the ④b clock's own
      anchor). ③'s HKWorkout start uses THIS, never endedAt − elapsed·1000:
      elapsed excludes pauses, so the subtraction would push a paused run's
      start LATER than reality (owner flag 2026-07-16). */
  startedAtMs: number;
  endedAt: number;
};

/** Save-tags known at run START (course mode / 크루 러닝) so a mid-run kill
    recovers them too — the end-of-run save composes its own copy as before. */
export type RunContext = {
  course?: { id: string | null; title: string };
  crewSession?: CrewSessionTag;
  /** nav v6 (8/9): course runs with real geometry start in the go-to-start
      chapter — GPS watching + nav UI only, ZERO accumulation (no clock, no
      distance, no gps_track, no splits) until beginAccumulation() at the
      PRE_START→NAVIGATING transition. Free/crew runs never set this —
      their behavior is byte-identical to before. */
  deferAccumulation?: boolean;
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
// ── 자동 일시정지 + consecutive-evidence stationary core (8/2 bundle) ────────
// Mechanism-(b) lesson (8/2 ledger, her 834/834@3.2m data): a SINGLE
// sub-0.5 OS-speed reading lies during real movement even on clean GPS —
// the old single-fix anchor teleport ate real distance at every stop/
// restart. Evidence is now TIME-BASED and displacement-PRIMARY: ≥5s where
// displacement stays under the jitter floor AND speed agrees throughout.
const STILL_EVIDENCE_MS   = 5_000; // agreeing-evidence span before "still"
// ── v2 rework (8/3 field: 서빙고로 canyon walk FAILED — pause 20-30s late).
// Root: the evidence tracker was FIX-DRIVEN and both fix supplies die exactly
// at a stop — the accuracy gate discarded canyon fixes wholesale, and
// distanceInterval suppresses callbacks at rest. Two additions, detection
// only (frozen anchor / resume / state machine untouched):
//  (a) timer-driven stillness — a 1s ticker treats fix-SILENCE as evidence
//      (distanceInterval semantics: no callbacks ≈ no movement), gated on a
//      healthy-recent last fix so a signal that died mid-stride lands in the
//      GPS-lost lane instead (never auto-pause on a dead signal);
//  (b) evidence-only gated fixes — >MAX_ACCURACY_M fixes stay banned from
//      the odometer but feed the stillness tracker (error-circle-scaled
//      displacement tolerance). The canyon lesson: the gate that protects
//      distance must not blind the pause detector.
// Field calibration: the pre-rework in-comment honest-limit said "a few
// seconds over"; the 8/3 walk measured 20-30s. The ticker exists to make
// detection ~5-8s everywhere, canyons included.
const STILL_TICK_MS       = 1_000;  // (a) evidence ticker cadence
const SILENCE_TRUST_MS    = 60_000; // silence older than this = presumed GPS
                                    // death, not stillness — chip's lane
// ── 8/5 slow-walk false-fire fix (field: auto-pause kicked in mid-walk at
// slow gait). Math: distanceInterval 5m at walking speed v gives natural
// fix gaps of 5/v seconds — 0.8 m/s → 6.3s, 0.5 m/s → 10s — ALL past the
// 5s evidence span, so the silence ticker read every slow-walk gap as
// stillness. Guard = the lastSpeedMps mirror (speed-guard option, chosen
// over a longer threshold: a real stop's final fix reads slow/invalid, so
// true stops KEEP the fast 5s lane — no latency trade for the common case).
// Dual lane: last fix spoke movement (≥ WALK_SUPPRESS_MPS) → silence must
// exceed SILENCE_SLOW_MS (> 5/0.35 ≈ 14.3s, the slowest guarded gait's
// gap) before firing — covers the rare abrupt stop whose final fix was
// mid-stride (worst-case pause latency 15s, stated). Both FIELD-TUNABLE.
const WALK_SUPPRESS_MPS   = 0.35;   // last-fix speed at/above = still walking
const SILENCE_SLOW_MS     = 15_000; // walking-band silence floor (slow-walk protection)
// ── v4 three-lane refine (8/5 owner field ruling: the abrupt stop from full
// stride felt ~15s — too long; his sweetspot 5-6s = the calibration datum).
// A RUNNING-speed final fix changes what silence means: at run cadence
// (~2-3s between fixes at distanceInterval 5m) 6s of silence ≈ 2-3 missed
// fixes = probable abrupt stop. A walker CANNOT reach this lane by
// construction — walking fixes carry 0.35-1.0 m/s and land in the 15s lane;
// their 6-10s natural gaps never meet a ≥1.0 final fix. All three constants
// FIELD-TUNABLE.
const RUN_SPEED_MPS       = 1.0;    // last-fix speed above = running stride
const SILENCE_RUN_MS      = 6_000;  // run-lane silence floor (owner sweetspot)
const RESUME_SPEED_MPS    = 1.0;   // hysteresis above STATIONARY_MPS
const RESUME_DISP_M       = 8;     // or clear displacement from the frozen point
const AUTO_REPAUSE_GRACE_MS = 10_000; // after a MANUAL resume (crosswalk case)
const START_GRACE_MS      = 10_000;   // countdown-exit can't instantly pause
export const PACE_WINDOW_MS = 30_000; // rolling window for 현재 페이스
export const MOVING_MIN_M   = 10;   // window distance to count as "moving"

const PERSIST_INTERVAL_MS = 8_000; // kill-recovery disk throttle
const PERSIST_MIN_MS      = 10_000; // don't persist pure-noise micro-sessions

// ④b Live-Activity update throttle. Fixes arrive every ~1.5–3s at run pace
// (5m distance filter at ~3.3m/s); 5s caps extension wake-ups at ≤12/min
// while the clock ticks natively (Text(timerInterval:) — zero updates) and
// distance moves in sub-0.02km display steps. Local ActivityKit updates have
// no OS budget, but every update re-renders the widget process — 5s keeps
// that cost trivial. Pause/resume bypass the throttle (exact clock freeze).
const LA_UPDATE_MS   = 5_000;
const LA_ROUTE_MAX   = 50; // points (100 floats) — ActivityKit 4KB state cap

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
let wallStartedAt = 0; // true wall-clock start (beginRunning) — ③'s HK anchor
let lastHeading: number | null = null; // T1 nav — last valid course-over-ground
// stationary-core state
let pauseSource: 'manual' | 'auto' | null = null;
let stillRef: { lat: number; lng: number; t: number } | null = null;
let manualResumeAt = 0;
let stillTicker: ReturnType<typeof setInterval> | null = null; // (a) 1s evidence ticker, running only
let lastRawAccM: number | null = null; // last RAW fix accuracy — silence-lane discriminator
let lastSpeedMps: number | null = null; // last RAW OS speed — compass-fusion source pick (8/3 nav)
let anchor: { lat: number; lng: number; t: number } | null = null;
let distanceM = 0;
let path: Coordinate[] = [];      // filtered on-screen track (save + polyline)
let rawTrack: GpsPoint[] = [];    // RAW fixes, gates NOT applied → gps_track
let paceWindow: { t: number; cumM: number }[] = [];
let lastFixTs = 0;                // last RAW callback ts — GPS-lost chip
let context: RunContext = {};
let accumGated = false;
// nav v6 accumulation gate — while true: the session is in the go-to-start
// hunt. Fixes keep the POSITION BUFFER alive (anchor + path, for the dot,
// dashed guidance, arrival detection) but credit NOTHING: distanceM, pace,
// rawTrack, elapsed (segmentStart/wallStartedAt stay unseeded) and the Live
// Activity all wait for beginAccumulation(). Auto-pause is OFF while gated
// (zero accumulation = nothing to protect; the hunt is mostly standing).
let lastPersistMs = 0;
let watchSub: Location.LocationSubscription | null = null; // fallback stream only

// State-transition listeners (the hook mirrors state into React) — fires on
// machine transitions only, never per-fix (no render storm).
const listeners = new Set<(s: TrackerState) => void>();
function setState(next: TrackerState): void {
  if (state === next) return;
  state = next;
  // (a) evidence ticker rides the state machine: alive only while running.
  if (next === 'running') {
    if (!stillTicker) stillTicker = setInterval(stillTick, STILL_TICK_MS);
  } else if (stillTicker) {
    clearInterval(stillTicker);
    stillTicker = null;
  }
  listeners.forEach(fn => fn(next));
}

/** (a) timer-driven stillness (8/3 rework): while running, fix-SILENCE lets
    the evidence clock keep counting — under distanceInterval semantics no
    callbacks ≈ no movement, which is exactly when the fix-driven paths go
    blind. Disambiguation from GPS loss, ruled: a HEALTHY-recent last fix
    (≤MAX_ACCURACY_M, within SILENCE_TRUST_MS) reads as stillness; a
    degraded-or-stale one is the GPS-lost lane — never pause someone whose
    signal died mid-stride. Flowing fixes are handled by the fix paths; this
    firing alongside them is idempotent (maybeAutoPause re-checks state). */
function stillTick(): void {
  if (state !== 'running') return;
  if (!stillRef) return; // no evidence anchor yet
  const now = Date.now();
  if (lastRawAccM == null || lastRawAccM > MAX_ACCURACY_M) return; // degraded → GPS-lost lane
  if (now - lastFixTs > SILENCE_TRUST_MS) return; // stale → presumed signal death
  // v4 THREE-LANE silence floor, keyed on the FINAL fix's speed:
  //  < 0.35 (or invalid)  → 5s  — the real-stop signature, fast lane
  //  0.35–1.0 (walking)   → 15s — the ambiguous band; why slow walks never misfire
  //  > 1.0 (running)      → 6s  — silence at run cadence is already anomalous
  const sp = lastSpeedMps;
  const silenceFloor =
    sp == null || sp < WALK_SUPPRESS_MPS ? STILL_EVIDENCE_MS
    : sp > RUN_SPEED_MPS ? SILENCE_RUN_MS
    : SILENCE_SLOW_MS;
  if (now - stillRef.t < silenceFloor) return;
  maybeAutoPause(now);
}

/** Chip interplay (8/3, ruled): while stillness evidence is accumulating in
    the healthy-recent lane, the GPS-lost chip SUPPRESSES — stationary
    detection preempts it; the chip fires only for degraded-and-stale. */
function isStillnessAccruing(): boolean {
  if (state !== 'running' || !stillRef) return false;
  if (lastRawAccM == null || lastRawAccM > MAX_ACCURACY_M) return false;
  return Date.now() - lastFixTs <= SILENCE_TRUST_MS;
}

// ── The ONE fix pipeline (moved VERBATIM from use-run-tracker's onFix; refs
//    became module vars — every gate, constant and branch is unchanged, so
//    foreground and background behavior are identical by construction) ──────
function processFix(loc: Location.LocationObject): void {
  const { latitude: lat, longitude: lng, accuracy, speed, altitude, heading } = loc.coords;
  // T1 nav (2026-07-26): the heading field, dropped since day one, finally
  // consumed — course-over-ground degrees; iOS sends -1 when invalid (rest/
  // poor fix) → keep the last good value (heading-up camera stays stable).
  if (typeof heading === 'number' && heading >= 0) lastHeading = heading;
  const t = loc.timestamp;
  const cur = { lat, lng };
  lastFixTs = t; // T-A mirror — before any gate
  lastRawAccM = accuracy ?? null; // silence-lane discriminator — before any gate
  lastSpeedMps = typeof speed === 'number' && speed >= 0 ? speed : null; // -1 = invalid

  // Raw track capture — BEFORE any gate (incl. the accuracy reject below):
  // the server filter must see everything the client filter saw.
  if (state === 'running' && !accumGated) {
    rawTrack.push({
      // iOS timestamps carry fractional ms; the contract's t is integer
      // epoch ms (422 int_from_float otherwise — convicted 2026-07-08)
      lat, lng, t: Math.round(t),
      ...(accuracy != null ? { acc: Math.round(accuracy * 10) / 10 } : {}),
      ...(altitude != null ? { alt: Math.round(altitude * 10) / 10 } : {}),
    });
  }

  if (accuracy == null || accuracy > MAX_ACCURACY_M) {
    // (b) evidence-only consumption (8/3 canyon lesson): a degraded fix can't
    // credit distance, but its displacement is still stillness EVIDENCE when
    // read against its own error circle — a 40m-accuracy fix showing 8m of
    // displacement is consistent with standing still. Tolerance scales with
    // the reported accuracy; a clearly-moving OS speed still breaks evidence.
    // The odometer/anchor/path remain untouched on this branch.
    if (state === 'running' && accuracy != null) {
      const tol = Math.max(MIN_SEGMENT_M, accuracy);
      // 8/5: the evidence-break speed drops RESUME(1.0) → WALK_SUPPRESS(0.35)
      // — a slow canyon walker (0.5-0.8 m/s inside the error circle) now
      // breaks evidence instead of accruing it. Stricter reset = safer
      // against false pause; true canyon stops keep near-zero speeds and
      // still accrue (the 8/3 [Stop test] (b)-path pass preserved).
      if (!stillRef) {
        stillRef = { ...cur, t };
      } else if (haversineM(stillRef, cur) > tol || (speed != null && speed >= WALK_SUPPRESS_MPS)) {
        stillRef = { ...cur, t };
      } else if (t - stillRef.t >= STILL_EVIDENCE_MS) {
        maybeAutoPause(t);
      }
    }
    return; // bad fix — still banned from the odometer
  }

  // Countdown (GPS warm-up) and MANUAL pause: keep the anchor fresh so the
  // first running segment doesn't span the gap, but accumulate nothing —
  // a manual pause is an intentional gap (café walk must never credit).
  // AUTO pause: the anchor stays FROZEN at the pause point — one moving fix
  // resumes AND the pause-point→fix segment credits (the traffic-light
  // sprint-start loses ~0m; the exact under-credit class the 8/2 core cures).
  if (state === 'countdown' || (state === 'paused' && pauseSource !== 'auto')) {
    anchor = { ...cur, t };
    // gated hunt: path is a position buffer (cleared at beginAccumulation),
    // so a PAUSED hunter still moves the dot / dashed line / arrival check
    if (accumGated && state === 'paused') path.push(cur);
    return;
  }
  if (state === 'paused' && pauseSource === 'auto') {
    const disp = anchor ? haversineM(anchor, cur) : 0;
    const moving = (speed != null && speed >= RESUME_SPEED_MPS) || disp > RESUME_DISP_M;
    if (!moving) return; // still resting — frozen anchor holds
    stillRef = { ...cur, t };
    runSession.togglePause('auto'); // auto-resume; fall through so THIS fix credits
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

  // Consecutive-evidence stillness (8/2 — replaces the single-fix teleport):
  // the anchor is FROZEN through stillness; this is the mechanism-(b) CURE.
  // A misfired slow reading alone changes nothing; ≥5s of displacement+speed
  // agreement triggers auto-pause (setting-gated). With the setting off, the
  // jitter floor alone holds the anchor — resume credits from the frozen
  // point either way, so stops can no longer eat distance.
  {
    const slow = speed != null && speed >= 0 && speed < STATIONARY_MPS;
    if (!stillRef) {
      stillRef = { ...cur, t };
    } else if (haversineM(stillRef, cur) > MIN_SEGMENT_M || !slow) {
      stillRef = { ...cur, t }; // evidence broken — movement or speed disagrees
    } else if (t - stillRef.t >= STILL_EVIDENCE_MS) {
      maybeAutoPause(t);
      if (state !== 'running') return; // paused mid-fix — stop crediting here
    }
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

  if (accumGated) {
    // hunt mode: the fix moves the position buffer, credits nothing
    anchor = { ...cur, t };
    path.push(cur);
    return;
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

/** Auto-pause trigger — fires from the stillness core after ≥5s evidence.
    Fire-time setting read (the gate-not-generator idiom); start-grace and
    manual-resume grace keep it polite. FIELD CALIBRATION (8/3): the old
    honest-limit here claimed no-fix rests overran "a few seconds" — the
    서빙고로 canyon walk measured 20-30s (accuracy gate + callback
    suppression starved the fix-driven tracker). The stillTick ticker (a) +
    evidence-only gated fixes (b) exist to make detection ~5-8s everywhere,
    canyons included. */
function maybeAutoPause(now: number): void {
  if (state !== 'running') return;
  if (accumGated) return; // hunt = zero accumulation, nothing to protect
  if (!useSettings.getState().settings.run.auto_pause) return;
  if (wallStartedAt && now - wallStartedAt < START_GRACE_MS) return;
  if (now - manualResumeAt < AUTO_REPAUSE_GRACE_MS) return;
  runSession.togglePause('auto');
}

/** Every delivery context funnels here: gates, then the throttled
    kill-recovery persist and Live-Activity push (state-guarded inside each). */
function feedFix(loc: Location.LocationObject): void {
  processFix(loc);
  const now = Date.now();
  maybePersist(now);
  // running only — a paused push would creep the frozen clock (pause/resume
  // have their own exact force-pushes in togglePause)
  if (state === 'running' && !accumGated) pushLiveActivity(now); // no LA until the session truly begins
}

// ── ④b: rolling pace + Live-Activity stats push ──────────────────────────────

/** Rolling-window pace over the last 30s of accepted fixes; null when not
    moving (< MOVING_MIN_M in-window) or too few samples. Single source —
    the hook renders THIS number, the widget receives THIS number. */
function currentPaceSecPerKm(now: number): number | null {
  const win = paceWindow.filter(s => s.t >= now - PACE_WINDOW_MS);
  if (win.length < 2) return null;
  const winM = win[win.length - 1].cumM - win[0].cumM;
  const winSec = (win[win.length - 1].t - win[0].t) / 1000;
  if (winM < MOVING_MIN_M || winSec <= 0) return null;
  return Math.round(winSec / (winM / 1000));
}

/** Downsample the filtered path to ≤LA_ROUTE_MAX points, normalized to 0…1
    SCREEN space (y down), uniform scale (longitude corrected by cos(lat) so
    the shape is true, not axis-stretched), centered, 3dp (compact JSON).
    <2 points or a degenerate bbox → [] (the widget renders its empty grid). */
function downsampleRoute(pts: readonly Coordinate[]): number[] {
  if (pts.length < 2) return [];
  const step = Math.max(1, Math.ceil(pts.length / LA_ROUTE_MAX));
  const sel: Coordinate[] = [];
  for (let i = 0; i < pts.length; i += step) sel.push(pts[i]);
  const last = pts[pts.length - 1];
  if (sel[sel.length - 1] !== last) sel.push(last);

  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of sel) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  const cosLat = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const spanY = maxLat - minLat;
  const spanX = (maxLng - minLng) * cosLat;
  const span = Math.max(spanX, spanY);
  if (span < 1e-6) return []; // no real shape yet (stationary cluster)
  const offX = (1 - spanX / span) / 2;
  const offY = (1 - spanY / span) / 2;

  const out: number[] = [];
  for (const p of sel) {
    const x = offX + ((p.lng - minLng) * cosLat) / span;
    const y = offY + (maxLat - p.lat) / span; // lat up → screen y down
    out.push(Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000);
  }
  return out;
}

let lastLaUpdateMs = 0;
/** Push fresh stats to the Live Activity (running/paused only). startedAt is
    recomputed as now − elapsed so pauses never inflate the visible clock;
    while paused, pausedAt freezes it. kcal: MET×weight or null — the widget
    HIDES the column without a saved weight (honest-kcal; 0 at 0km is truth). */
function pushLiveActivity(now: number, force = false): void {
  if (state !== 'running' && state !== 'paused') return;
  if (!force && now - lastLaUpdateMs < LA_UPDATE_MS) return;
  lastLaUpdateMs = now;
  const kcal = estimateKcal(distanceM / 1000);
  updateLiveActivity({
    startedAtMs: now - elapsedMsNow(),
    pausedAtMs: state === 'paused' ? now : null,
    distanceM: Math.round(distanceM),
    // Build 11: the pause badge tells WHY (자동 일시정지 vs 일시정지) — the
    // module-level pauseSource is this file's truth, sent on every push.
    pauseSource: state === 'paused' ? (pauseSource ?? 'manual') : null,
    // 8/4 owner ruling: the banner shows 평균 페이스 (total-time) — the run
    // screen's exact math/clock/floor/rounding, so banner = run screen 평균
    // = saved value, always. Avg persists through stops where the 30s window
    // nulls — the better lock-screen face. [Build 11: the Swift label now
    // reads 평균 페이스 — the ledgered sharpening, done.]
    paceSecPerKm: distanceM >= 50 && elapsedMsNow() > 0
      ? Math.round((elapsedMsNow() / 1000) / (distanceM / 1000))
      : null,
    kcal: kcal == null ? null : Math.round(kcal),
    route: downsampleRoute(path),
  });
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
    ...(wallStartedAt ? { startedAtMs: wallStartedAt } : {}),
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
      // ── Android slice ③ runtime follow-up (2026-10-09, flagged at slice ①) ──
      // ANDROID ONLY: expo-location's `foregroundService` is the Android
      // foreground-service notification (LocationTaskServiceOptions). The iOS
      // native module never reads the key (zero references under
      // expo-location/ios; the type's siblings activityType /
      // pausesUpdatesAutomatically are the ones marked @platform ios) — the
      // iOS call is unchanged by construction. On Android it is load-bearing
      // twice: (1) without it the task dies on backgrounding (Android 8+
      // background-execution limits), (2) LocationModule.kt treats a
      // foreground-service start as USER-INITIATED and stops requiring
      // ACCESS_BACKGROUND_LOCATION — the pocketed run survives on the
      // When-In-Use grant, matching the iOS foreground-started-session rule.
      // Copy is call-time t() (locale honored per run start); color = the
      // native-surface brand lime (#39FF14 — the widget's, build 13).
      foregroundService: {
        notificationTitle: t('run.fgNotifTitle'),
        notificationBody: t('run.fgNotifBody'),
        notificationColor: '#39FF14',
      },
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
  accumGated = false;
  accumulatedMs = 0;
  segmentStart = null;
  wallStartedAt = 0;
  lastHeading = null;
  anchor = null;
  distanceM = 0;
  path = [];
  rawTrack = [];
  paceWindow = [];
  lastFixTs = 0;
  lastPersistMs = 0;
  stillRef = null;     // cross-run residue (a stale anchor could pre-age the ticker)
  lastRawAccM = null;
  lastSpeedMps = null;
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
    accumGated = !!ctx?.deferAccumulation;
    setState('countdown');
    await startUpdates();
  },

  beginRunning(): void {
    if (state !== 'countdown') return;
    setState('running');
    track('run_start'); // 빌드 13 (9/29) — 카운트다운 완료 = 러닝 시작의 진실

    if (accumGated) return; // hunt: clocks + LA wait for beginAccumulation
    segmentStart = Date.now();
    wallStartedAt = segmentStart; // true wall-clock start (③'s HK anchor)
    // ④a: lock-screen/Dynamic-Island Live Activity — clock self-counts from
    // here; ④b feeds stats. Fire-and-forget, never blocks the run; no-op on
    // Android/unsupported (requireOptionalNativeModule).
    startLiveActivity(segmentStart);
  },

  /** nav v6: the PRE_START→NAVIGATING seam — the session TRULY begins here.
      Zeroes the hunt's position buffer into a fresh track (first vertex =
      the course start area), seeds the clocks, starts the Live Activity.
      Arrival while PAUSED: the gate opens but clocks/LA seed on the resume
      (togglePause's resume branch) — a paused arrival must not tick. */
  beginAccumulation(): void {
    if (!accumGated) return;
    accumGated = false;
    distanceM = 0;
    paceWindow = [];
    rawTrack = [];
    const seed = path[path.length - 1];
    path = seed ? [seed] : [];
    stillRef = null;
    if (state === 'running') {
      const now = Date.now();
      segmentStart = now;
      wallStartedAt = now;
      startLiveActivity(now);
    }
  },

  togglePause(source: 'manual' | 'auto' = 'manual'): void {
    if (state === 'running') {
      const now = Date.now();
      if (segmentStart != null) {
        accumulatedMs += now - segmentStart;
        segmentStart = null;
      }
      pauseSource = source;
      setState('paused');
      // a pause is an interruption-risk moment — persist outside the throttle
      const partial = buildPartial();
      if (partial) persistActiveRun(partial);
      if (!accumGated) pushLiveActivity(now, true); // ④b: freeze the widget clock exactly here (no LA exists while gated)
    } else if (state === 'paused') {
      const now = Date.now();
      // a MANUAL resume from an auto-pause gets a re-pause grace (crosswalk:
      // the runner overrode us — don't re-pause them at the same light)
      if (pauseSource === 'auto' && source === 'manual') manualResumeAt = now;
      pauseSource = null;
      stillRef = null;
      if (accumGated) {
        // hunt resume: still zero accumulation — no clock seam to manage
        setState('running');
        return;
      }
      if (wallStartedAt === 0) {
        // arrival happened WHILE paused (beginAccumulation opened the gate
        // with no clocks) — this resume is the true start
        segmentStart = now;
        wallStartedAt = now;
        setState('running');
        startLiveActivity(now);
        return;
      }
      segmentStart = now;
      setState('running');
      pushLiveActivity(now, true); // ④b: unfreeze — startedAt absorbs the pause
    }
  },

  /** Why the session is paused ('auto' | 'manual' | null) — cue/UI branching. */
  getPauseSource: () => pauseSource,

  /** LA/pause-intent while ALREADY auto-paused: convert to manual (sticky —
      movement no longer auto-resumes; the runner claimed the pause). */
  markManualPause(): void {
    if (state === 'paused' && pauseSource === 'auto') pauseSource = 'manual';
  },

  /** Non-destructive preview of the live run — same math as stop(), zero
      state change. The 러닝-저장 checkpoint reads this so 종료 no longer has
      to kill the session (back-button ruling 2026-07-27). */
  snapshot(): RunSnapshot | null {
    if (state !== 'running' && state !== 'paused') return null;
    const ms = accumulatedMs + (state === 'running' && segmentStart != null ? Date.now() - segmentStart : 0);
    const finalSec = Math.floor(ms / 1000);
    const finalKm  = distanceM / 1000;
    return {
      distanceKm: finalKm,
      elapsedSec: finalSec,
      avgPaceSecPerKm: finalKm >= 0.05 && finalSec > 0 ? Math.round(finalSec / finalKm) : null,
      kcal: estimateKcal(finalKm),
      path: [...path],
      gpsTrack: [...rawTrack],
      startedAtMs: wallStartedAt,
      endedAt: Date.now(),
    };
  },

  /** 'running' | 'paused' | ... — lets non-tracker screens (run-save) know
      whether a live session sits beneath them. */
  getRunState: () => state,

  /** Ends the run and returns its final snapshot (null if nothing was live). */
  stop(): RunSnapshot | null {
    if (state !== 'running' && state !== 'paused') return null;
    if (segmentStart != null) {
      accumulatedMs += Date.now() - segmentStart;
      segmentStart = null;
    }
    setState('ended');
    stopUpdates();
    endLiveActivity();

    const finalSec = Math.floor(accumulatedMs / 1000);
    const finalKm  = distanceM / 1000;
    return {
      distanceKm: finalKm,
      elapsedSec: finalSec,
      avgPaceSecPerKm: finalKm >= 0.05 && finalSec > 0 ? Math.round(finalSec / finalKm) : null,
      kcal: estimateKcal(finalKm),
      path: [...path],
      gpsTrack: [...rawTrack],
      startedAtMs: wallStartedAt,
      endedAt: Date.now(),
    };
  },

  /** Hook-unmount cleanup. Mid-run unmount is nav-locked (tracking.tsx), so
      this normally runs on 'ended'/'idle'; the disk copy is NOT touched — by
      then it holds the final run and belongs to the save flow. */
  teardown(): void {
    if (stillTicker) { clearInterval(stillTicker); stillTicker = null; } // defensive — setState exit normally clears it
    stopUpdates();
    endLiveActivity(); // defensive — idempotent; a dead session must never
                       // leave a live lock-screen card behind
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
  /** 8/3 chip-suppression: stillness evidence accruing in the healthy lane. */
  isStillnessAccruing,
  /** T1 nav: last valid heading (deg, course-over-ground) — null pre-fix. */
  getLastHeading: () => lastHeading,
  /** 8/3 nav: last RAW OS speed (m/s; null = invalid/pre-fix) — the compass-
      fusion source pick reads this, never the gates. */
  getLastSpeedMps: () => lastSpeedMps,
  /** Single-source rolling pace — the hook renders it, the widget receives it. */
  currentPaceSecPerKm,
};
