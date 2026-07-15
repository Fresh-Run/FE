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

export type LiveActivityAction = 'pause' | 'stop';

/** ④c: taps on the Live Activity's 일시정지/종료 buttons. The intent runs in
    the app process and the module forwards it here; tracking.tsx routes the
    action into the SAME handlers its on-screen buttons use. No-op remover on
    Android / module-less builds. */
export function addLiveActivityActionListener(
  fn: (action: LiveActivityAction) => void,
): { remove: () => void } {
  if (!native) return { remove: () => {} };
  const sub = (native as unknown as {
    addListener: (event: string, l: (e: { action: string }) => void) => { remove: () => void };
  }).addListener('onAction', e => {
    if (e.action === 'pause' || e.action === 'stop') fn(e.action);
  });
  return sub;
}
