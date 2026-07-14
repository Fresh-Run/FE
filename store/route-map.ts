/**
 * One-shot handoff for the full route-map view (polylines are too big for
 * route params) — the pending-crew-region pattern: the pushing screen sets,
 * route-map takes-and-clears on mount.
 */
import type { Coordinate } from '@/types';

export type RouteMapPayload = { title: string; polyline: Coordinate[] };

let pending: RouteMapPayload | null = null;

export function setRouteMap(p: RouteMapPayload): void {
  pending = p;
}

/** Read-and-clear — route-map consumes once on mount. */
export function takeRouteMap(): RouteMapPayload | null {
  const p = pending;
  pending = null;
  return p;
}
