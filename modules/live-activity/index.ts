// JS bridge for the Live Activity native module (④a). Loaded via
// requireOptionalNativeModule: resolves null on Android and on any build
// that predates the module — every call degrades to a no-op, so this file
// is safe to ship in JS that older runtimes could theoretically load
// (belt-and-suspenders under the 1.0.1 runtime bump).
import { requireOptionalNativeModule } from 'expo-modules-core';

type LiveActivityNative = {
  isSupported(): boolean;
  startActivity(startedAtMs: number): boolean;
  updateActivity(
    startedAtMs: number,
    pausedAtMs: number | null,
    distanceM: number,
    paceSecPerKm: number | null,
    kcal: number | null,
    route: number[],
  ): Promise<void>;
  endActivity(): Promise<void>;
};

const native = requireOptionalNativeModule<LiveActivityNative>('LiveActivity');

/** iOS ≥16.2 with the per-app Live Activities toggle on; false elsewhere. */
export function isLiveActivitySupported(): boolean {
  try { return native?.isSupported() ?? false; } catch { return false; }
}

/** Start the run activity (foreground only — beginRunning is). Fire-and-
    forget: failure (unsupported / user-disabled / LA limit) never breaks
    the run. */
export function startLiveActivity(startedAtMs: number): void {
  try { native?.startActivity(startedAtMs); } catch { /* never break the run */ }
}

/** ④b: push fresh stats. route = normalized interleaved [x,y] pairs in 0…1
    SCREEN space (y down — flip latitude), ≤50 points (4 KB state cap). */
export function updateLiveActivity(state: {
  startedAtMs: number;
  pausedAtMs?: number | null;
  distanceM: number;
  paceSecPerKm?: number | null;
  kcal?: number | null;
  route?: number[];
}): void {
  native?.updateActivity(
    state.startedAtMs,
    state.pausedAtMs ?? null,
    state.distanceM,
    state.paceSecPerKm ?? null,
    state.kcal ?? null,
    state.route ?? [],
  ).catch(() => {});
}

/** End every run activity — idempotent, safe to call defensively. */
export function endLiveActivity(): void {
  native?.endActivity().catch(() => {});
}
