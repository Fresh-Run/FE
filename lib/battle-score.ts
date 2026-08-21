// 배틀 스코어링 엔진 v1 (8/21) — PURE functions, zero server dependency.
// CONTRACT-AGNOSTIC by design: takes any run[] array (the /api/runs shape's
// scoring subset), so it wires unchanged to either a polling approach over
// /api/users/{id}/runs or 지연's future server-aggregated battle totals.
// Server-memory flags (anti-cheat): see the ⚠ notes on milestones/streak —
// a client-computed one-time bonus is replayable across battles until the
// server remembers it; v1 scopes "one-time" to the runs[] window it's given.
//
// Rule set (owner spec 8/21):
//   base        distance_km × 10 — QUALIFY ≥ 1.5km, else the run scores 0
//   completion  +20 per qualified run
//   pace        +5/km (round(5 × distance)) when avg_pace beats the
//               participant's historical baseline (MyStats.all_time pace)
//   milestone   first run ≥5km +30 · first ≥10km +50 — one-time WITHIN the
//               given window (⚠ server memory needed to be anti-cheat-safe)
//   early bird  ran_at local hour < 07:00 → +10
//   streak      multiplier on the TOTAL: ×(1 + 0.05 × min(days, 10)),
//               cap +50% (⚠ longest_streak_days is a monthly-insight stat
//               today — real-time consecutive-day tracking needs her server)

export type BattleRun = {
  id: string;
  ran_at: string;                       // ISO — local-time early-bird read
  distance_km: number;
  duration_sec: number;
  avg_pace_sec_per_km: number | null;
  /** anti-cheat adjusted flag (already on the run record) — flagged runs
      score ZERO (8/21: scoring a server-flagged distance at face value was
      a face-value bug, not a contract question) */
  is_flagged?: boolean;
};

export type BattleParticipant = {
  /** historical avg pace (sec/km) — MyStats.all_time.avg_pace_sec_per_km;
      null = no baseline → pace bonus never awarded (honest, not assumed) */
  baselinePaceSecPerKm: number | null;
  /** consecutive run days — ⚠ v1 source is insights' longest_streak_days */
  streakDays: number;
};

export type RunScore = {
  runId: string;
  qualified: boolean;
  /** true = excluded by the anti-cheat flag (UI renders 미집계, distinctly) */
  flagged: boolean;
  base: number;
  completion: number;
  pace: number;
  milestone: number;
  earlyBird: number;
  /** pre-multiplier sum for this run */
  pts: number;
};

export type BattleScore = {
  totalPts: number;            // multiplier applied, rounded
  rawPts: number;              // pre-multiplier sum
  streakMultiplier: number;    // 1.0–1.5
  runs: RunScore[];
  firstFiveKmRunId: string | null;
  firstTenKmRunId: string | null;
};

const QUALIFY_KM = 1.5;
const STREAK_STEP = 0.05;
const STREAK_CAP_DAYS = 10;

export function scoredRun(
  run: BattleRun,
  participant: BattleParticipant,
  window: { fiveKmTaken: boolean; tenKmTaken: boolean },
): RunScore {
  if (run.is_flagged) {
    return { runId: run.id, qualified: false, flagged: true, base: 0, completion: 0, pace: 0, milestone: 0, earlyBird: 0, pts: 0 };
  }
  const qualified = run.distance_km >= QUALIFY_KM;
  if (!qualified) {
    return { runId: run.id, qualified, flagged: false, base: 0, completion: 0, pace: 0, milestone: 0, earlyBird: 0, pts: 0 };
  }
  const base = Math.round(run.distance_km * 10);
  const completion = 20;
  const beatsBaseline =
    participant.baselinePaceSecPerKm != null &&
    run.avg_pace_sec_per_km != null &&
    run.avg_pace_sec_per_km > 0 && // corrupt/negative pace must not "beat" anything (8/21 harness catch)
    run.avg_pace_sec_per_km < participant.baselinePaceSecPerKm;
  const pace = beatsBaseline ? Math.round(run.distance_km * 5) : 0;
  let milestone = 0;
  if (!window.tenKmTaken && run.distance_km >= 10) milestone += 50;
  if (!window.fiveKmTaken && run.distance_km >= 5) milestone += 30;
  // Early bird reads the RUN'S OWN local clock — the ISO string's literal
  // hour (offset-carrying timestamps ARE the runner's local time; a
  // new Date().getHours() would re-express it in the DEVICE timezone and
  // mis-score cross-TZ — caught by the 8/21 desk harness on a non-KST Mac).
  const hourMatch = /T(\d\d):/.exec(run.ran_at);
  const localHour = hourMatch ? Number(hourMatch[1]) : new Date(run.ran_at).getHours();
  const earlyBird = localHour < 7 ? 10 : 0;
  const pts = base + completion + pace + milestone + earlyBird;
  return { runId: run.id, qualified, flagged: false, base, completion, pace, milestone, earlyBird, pts };
}

/** Chronological walk (one-time milestones bind to the EARLIEST qualifying
    run regardless of input order), then the streak multiplier on the sum. */
export function aggregateScore(runs: BattleRun[], participant: BattleParticipant): BattleScore {
  const ordered = [...runs].sort((a, b) => a.ran_at.localeCompare(b.ran_at) || a.id.localeCompare(b.id)); // id tiebreak — same-second runs get a deterministic milestone holder (8/21 harness catch)
  const window = { fiveKmTaken: false, tenKmTaken: false };
  let firstFiveKmRunId: string | null = null;
  let firstTenKmRunId: string | null = null;
  const scored = ordered.map(r => {
    const s = scoredRun(r, participant, window);
    if (s.qualified && !window.fiveKmTaken && r.distance_km >= 5) { window.fiveKmTaken = true; firstFiveKmRunId = r.id; }
    if (s.qualified && !window.tenKmTaken && r.distance_km >= 10) { window.tenKmTaken = true; firstTenKmRunId = r.id; }
    return s;
  });
  const rawPts = scored.reduce((a, s) => a + s.pts, 0);
  const streakMultiplier = 1 + STREAK_STEP * Math.min(Math.max(participant.streakDays, 0), STREAK_CAP_DAYS);
  return {
    totalPts: Math.round(rawPts * streakMultiplier),
    rawPts,
    streakMultiplier,
    runs: scored,
    firstFiveKmRunId,
    firstTenKmRunId,
  };
}
