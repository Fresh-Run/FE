// Funnel v1 (2026-07-21 owner ruling) — post-free-run nudge state + the
// generation-degradation guard. A nudge into a slow/failing generator
// ANTI-converts (지연's caveat), so the nudge self-suppresses on recent
// failures. Everything is device-local AsyncStorage; the health-endpoint
// nicety stays deliberately UNSPENT — the client's own attempt outcomes
// are the v1 signal.
//
// Pure decision logic is exported separately from the storage wrappers so
// the rules are desk-provable without a device.
import AsyncStorage from '@react-native-async-storage/async-storage';

const NUDGE_TS_KEY = '@fr_course_nudge_ts';
const GEN_RING_KEY = '@fr_gen_outcomes';

const NUDGE_COOLDOWN_MS = 7 * 24 * 3600 * 1000; // ≥7-day stamp (owner ruling)
const DEGRADE_WINDOW_MS = 24 * 3600 * 1000;
const RING_SIZE = 3;

export type GenOutcome = { ok: boolean; t: number };

/** Degraded = ≥2 of the last 3 recorded attempts failed within 24h.
    Feasibility rejections (OneWayTooFar 422) are never recorded — they are
    deterministic user-input outcomes, not generator health. */
export function isDegraded(ring: GenOutcome[], now: number): boolean {
  const fails = ring.slice(-RING_SIZE).filter(o => !o.ok && now - o.t <= DEGRADE_WINDOW_MS);
  return fails.length >= 2;
}

/** Nudge cooldown: never shown, or last shown ≥7 days ago. */
export function nudgeDue(lastShownTs: number | null, now: number): boolean {
  return lastShownTs == null || now - lastShownTs >= NUDGE_COOLDOWN_MS;
}

async function readRing(): Promise<GenOutcome[]> {
  try {
    const raw = await AsyncStorage.getItem(GEN_RING_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Record a generation attempt outcome (success or non-feasibility failure).
    Fire-and-forget at call sites — storage errors never surface. */
export async function recordGenOutcome(ok: boolean): Promise<void> {
  try {
    const ring = [...(await readRing()), { ok, t: Date.now() }].slice(-RING_SIZE);
    await AsyncStorage.setItem(GEN_RING_KEY, JSON.stringify(ring));
  } catch { /* best-effort */ }
}

/** The full nudge gate: cooldown ∧ ¬degraded. Courseness ('this run was
    free') and save-success are the CALLER's gates — they live in run state. */
export async function shouldShowPostRunNudge(): Promise<boolean> {
  try {
    const [tsRaw, ring] = await Promise.all([AsyncStorage.getItem(NUDGE_TS_KEY), readRing()]);
    const ts = tsRaw ? Number(tsRaw) : null;
    const now = Date.now();
    return nudgeDue(Number.isFinite(ts as number) ? ts : null, now) && !isDegraded(ring, now);
  } catch {
    return false; // storage broken → no nudge, never a crash
  }
}

/** Stamp the cooldown when the nudge is SHOWN (not on tap) — the ≥7-day rule
    is anti-nag: an ignored chip must NOT reappear after the next free run. */
export async function stampPostRunNudge(): Promise<void> {
  try {
    await AsyncStorage.setItem(NUDGE_TS_KEY, String(Date.now()));
  } catch { /* best-effort */ }
}
