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
): { segIndex: number; distM: number } {
  if (course.length === 0) return { segIndex: 0, distM: Infinity };
  const kx = Math.cos((p.lat * Math.PI) / 180) * M_PER_DEG_LAT;
  const ky = M_PER_DEG_LAT;
  const px = p.lng * kx, py = p.lat * ky;
  let best = Infinity, bestIdx = 0;
  for (let i = 0; i < Math.max(1, course.length - 1); i++) {
    const a = course[i], b = course[Math.min(i + 1, course.length - 1)];
    const ax = a.lng * kx, ay = a.lat * ky;
    const bx = b.lng * kx, by = b.lat * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const qx = ax + t * dx, qy = ay + t * dy;
    const d = Math.hypot(px - qx, py - qy);
    if (d < best) { best = d; bestIdx = i; }
  }
  return { segIndex: bestIdx, distM: best };
}

/** Off-course hysteresis (ruled ~30-40m): OFF beyond 40m, back ON inside
    25m — a boundary-hugging runner never flaps the banner. */
export const OFF_COURSE_ENTER_M = 40;
export const OFF_COURSE_EXIT_M = 25;
