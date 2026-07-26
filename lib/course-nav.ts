/**
 * T1 course navigation math (ruled 2026-07-26) — pure geometry, no deps.
 * nearestOnCourse: min distance from a point to the course POLYLINE
 * (point-to-SEGMENT, not vertices — 331m T-map segments would lie by up to
 * ~165m at vertex granularity). Equirectangular projection per segment is
 * exact enough at run scale (<1km spans, error ≪ the 30-40m threshold).
 */
import type { Coordinate } from '@/types';

const M_PER_DEG_LAT = 111_320;

export function nearestOnCourse(
  course: readonly Coordinate[],
  p: Coordinate,
): { segIndex: number; distM: number; alongM: number } {
  if (course.length === 0) return { segIndex: 0, distM: Infinity, alongM: 0 };
  const kx = Math.cos((p.lat * Math.PI) / 180) * M_PER_DEG_LAT;
  const ky = M_PER_DEG_LAT;
  const px = p.lng * kx, py = p.lat * ky;
  let best = Infinity, bestIdx = 0, bestAlong = 0, cum = 0;
  for (let i = 0; i < Math.max(1, course.length - 1); i++) {
    const a = course[i], b = course[Math.min(i + 1, course.length - 1)];
    const ax = a.lng * kx, ay = a.lat * ky;
    const bx = b.lng * kx, by = b.lat * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const segLen = Math.sqrt(len2);
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const qx = ax + t * dx, qy = ay + t * dy;
    const d = Math.hypot(px - qx, py - qy);
    if (d < best) { best = d; bestIdx = i; bestAlong = cum + t * segLen; }
    cum += segLen;
  }
  return { segIndex: bestIdx, distM: best, alongM: bestAlong };
}

/** Total course length in meters (equirect per segment — same scale truth). */
export function courseLengthM(course: readonly Coordinate[]): number {
  let cum = 0;
  for (let i = 1; i < course.length; i++) {
    const a = course[i - 1], b = course[i];
    const kx = Math.cos((a.lat * Math.PI) / 180) * M_PER_DEG_LAT;
    cum += Math.hypot((b.lat - a.lat) * M_PER_DEG_LAT, (b.lng - a.lng) * kx);
  }
  return cum;
}

/** Off-course hysteresis (ruled ~30-40m): OFF beyond 40m, back ON inside
    25m — a boundary-hugging runner never flaps the banner. */
export const OFF_COURSE_ENTER_M = 40;
export const OFF_COURSE_EXIT_M = 25;

/** T1.5: the point d meters ahead of c along headingDeg (0=N, clockwise) —
    centering the camera HERE puts the runner low on screen, road-ahead
    filling the view (the nav convention: look forward, not at your feet). */
export function pointAhead(c: Coordinate, headingDeg: number, dM: number): Coordinate {
  const th = (headingDeg * Math.PI) / 180;
  return {
    lat: c.lat + (dM * Math.cos(th)) / M_PER_DEG_LAT,
    lng: c.lng + (dM * Math.sin(th)) / (M_PER_DEG_LAT * Math.cos((c.lat * Math.PI) / 180)),
  };
}
