// In-memory handoff of a finished run from tracking → run-result → run-saved.
// The GPS path can be hundreds of points — too big for router params.
// Peek (not consume) so re-renders/remounts don't lose it; the post-run
// screens clear it on exit.

import type { Coordinate } from '@/types';

export type PendingRun = {
  distanceKm: number;
  elapsedSec: number;
  avgPaceSecPerKm: number | null;
  kcal: number;
  path: Coordinate[]; // client-side only — SEAM (path upload), see lib/runs-api.ts
  endedAt: number;
};

let pending: PendingRun | null = null;

export function setPendingRun(run: PendingRun): void {
  pending = run;
}

export function getPendingRun(): PendingRun | null {
  return pending;
}

export function clearPendingRun(): void {
  pending = null;
}
