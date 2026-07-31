/**
 * One-shot handoff for the full route-map view (polylines are too big for
 * route params) — the pending-crew-region pattern: the pushing screen sets,
 * route-map takes-and-clears on mount.
 */
import type { Coordinate } from '@/types';

export type RouteMapPayload = {
  title: string;
  /** Route subject — ≥2 points draws the line viewer. Absent/short → the
      viewer falls to `center` (8/3: 바로뛰기 location expansion joins the
      one cycling viewer; meet-map stays the crew-pin variant). */
  polyline?: Coordinate[];
  /** Point subject (8/3): fullscreen center view with the layer cycle. */
  center?: Coordinate;
  /** Point subject is the USER (blue dot, no pin) — 바로뛰기 card. */
  showsUser?: boolean;
  /** B7: set ONLY when the pushed polyline is the coarse thumb (full track
      not yet loaded at tap time) — route-map fetches and upgrades itself.
      Absent = the geometry is already the best available (no fetch). */
  upgradeRunId?: string;
  /** km/mi markers on the line (run surfaces pass true; course callers off) */
  distanceMarkers?: boolean;
  /** the run's official distance — (b) scaling on the enlarge */
  officialDistanceKm?: number;
};

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
