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

/** Course tangent (nav v5.1, 8/3): the bearing of the course segment
    nearest to p, toward the course's FORWARD direction (the next vertex in
    course order; duplicate vertices are walked over). Null on degenerate
    courses. Consumed by the nav camera's bearing ladder — ORIENTATION
    only, same rendering-only boundary as snapToCourse. */
export function courseTangentAt(course: readonly Coordinate[], p: Coordinate): number | null {
  if (course.length < 2) return null;
  const { segIndex } = nearestOnCourse(course, p);
  const a = course[segIndex];
  let j = segIndex + 1;
  while (j < course.length && course[j].lat === a.lat && course[j].lng === a.lng) j++;
  if (j >= course.length) return null; // tail of duplicates — no direction
  const b = course[j];
  const kx = Math.cos((a.lat * Math.PI) / 180);
  const deg = (Math.atan2((b.lng - a.lng) * kx, b.lat - a.lat) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** DISPLAY-ONLY route snap (nav v2, 8/3): the nearest on-course point when
    p is within maxM of the line, else null. HARD BOUNDARY (stated here and
    in the ledger): this is consumed by the nav CAMERA/fixed-arrow rendering
    ALONE — raw GPS keeps driving tracking, distance, pace, verification,
    and the off-route machinery (the alt-guarantee separation grammar).
    Leaving the line past maxM un-snaps naturally; off-route detection is
    untouched by construction (it reads nearestOnCourse on the RAW fix). */
export function snapToCourse(course: readonly Coordinate[], p: Coordinate, maxM: number): Coordinate | null {
  if (course.length < 2) return null;
  const kx = Math.cos((p.lat * Math.PI) / 180) * M_PER_DEG_LAT;
  const ky = M_PER_DEG_LAT;
  const px = p.lng * kx, py = p.lat * ky;
  let best = Infinity, bx0 = 0, by0 = 0;
  for (let i = 0; i < course.length - 1; i++) {
    const a = course[i], b = course[i + 1];
    const ax = a.lng * kx, ay = a.lat * ky;
    const bx = b.lng * kx, by = b.lat * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const qx = ax + t * dx, qy = ay + t * dy;
    const d = Math.hypot(px - qx, py - qy);
    if (d < best) { best = d; bx0 = qx; by0 = qy; }
  }
  if (best > maxM) return null;
  return { lat: by0 / ky, lng: bx0 / kx };
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


/** 8/3 nav-completion: the sub-polyline from alongM to alongM+spanM — the
    "next 300m" emphasis band (distanceCrossings interpolation class: exact
    points cut on the segments, vertices between collected). spanM is
    FIELD-TUNABLE (walk judges the band length). */
export function sliceAhead(
  course: readonly Coordinate[],
  alongM: number,
  spanM: number,
): Coordinate[] {
  if (course.length < 2) return [];
  const endM = alongM + spanM;
  const out: Coordinate[] = [];
  let cum = 0;
  for (let i = 0; i < course.length - 1; i++) {
    const a = course[i], b = course[i + 1];
    const kx = Math.cos((a.lat * Math.PI) / 180) * M_PER_DEG_LAT;
    const segLen = Math.hypot((b.lat - a.lat) * M_PER_DEG_LAT, (b.lng - a.lng) * kx);
    const segStart = cum, segEnd = cum + segLen;
    if (segEnd >= alongM && segStart <= endM && segLen > 0) {
      const t0 = Math.max(0, (alongM - segStart) / segLen);
      const t1 = Math.min(1, (endM - segStart) / segLen);
      const p0 = { lat: a.lat + (b.lat - a.lat) * t0, lng: a.lng + (b.lng - a.lng) * t0 };
      const p1 = { lat: a.lat + (b.lat - a.lat) * t1, lng: a.lng + (b.lng - a.lng) * t1 };
      if (out.length === 0) out.push(p0);
      out.push(t1 < 1 ? p1 : b);
      if (segEnd >= endM) break;
    }
    cum = segEnd;
  }
  return out;
}

/** 8/3 nav-completion: first geometry-detected turn ahead of alongM.
    WINDOWED bearing walk — generated routes have dense vertices, so raw
    per-vertex angles produce phantom turns; bearings are measured over
    TURN_WINDOW_M spans and successive spans compared. |delta| >= TURN_ANGLE_DEG
    flags the junction. BOTH constants FIELD-TUNABLE (the walk judges marker
    honesty — a false "turn" erodes trust faster than a missed one).
    Geometry can say "turn in 120m"; names/landmarks stay T2. */
export const TURN_WINDOW_M = 15;
export const TURN_ANGLE_DEG = 38;

export function nextTurn(
  course: readonly Coordinate[],
  alongM: number,
): { point: Coordinate; distM: number; dir: 'left' | 'right' } | null {
  if (course.length < 3) return null;
  // cumulative vertex distances (equirect per segment — house scale truth)
  const cumAt: number[] = [0];
  for (let i = 1; i < course.length; i++) {
    const a = course[i - 1], b = course[i];
    const kx = Math.cos((a.lat * Math.PI) / 180) * M_PER_DEG_LAT;
    cumAt.push(cumAt[i - 1] + Math.hypot((b.lat - a.lat) * M_PER_DEG_LAT, (b.lng - a.lng) * kx));
  }
  const bearing = (a: Coordinate, b: Coordinate): number => {
    const kx = Math.cos((a.lat * Math.PI) / 180);
    return (Math.atan2((b.lng - a.lng) * kx, b.lat - a.lat) * 180) / Math.PI;
  };
  // windowed spans starting from the first vertex past alongM
  let i = cumAt.findIndex(c => c > alongM);
  if (i < 1) return null;
  let prevBearing: number | null = null;
  let spanStart = i - 1;
  while (i < course.length) {
    // grow the window to >= TURN_WINDOW_M
    let j = i;
    while (j < course.length - 1 && cumAt[j] - cumAt[spanStart] < TURN_WINDOW_M) j++;
    if (cumAt[j] - cumAt[spanStart] < TURN_WINDOW_M) break; // tail too short
    const br = bearing(course[spanStart], course[j]);
    if (prevBearing != null) {
      const delta = ((br - prevBearing + 540) % 360) - 180;
      if (Math.abs(delta) >= TURN_ANGLE_DEG) {
        return {
          point: course[spanStart],
          distM: Math.max(0, cumAt[spanStart] - alongM),
          dir: delta > 0 ? 'right' : 'left',
        };
      }
    }
    prevBearing = br;
    spanStart = j;
    i = j + 1;
  }
  return null;
}
