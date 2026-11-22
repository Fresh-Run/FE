// Display-only geometry for route lines — item ⑫ (2026-11-21). NEVER written
// back: the stored track, the thumb and the distance are untouched.
//
//  roundCorners — stored tracks are Douglas-Peucker simplified (5 m) into
//    ~60 m straight legs; a spline through them can bulge off the street
//    (owner ruling: no spline on stored tracks). Legs stay straight; each
//    corner is replaced by a small arc of radius ≤ RADIUS_M (a few meters,
//    clamped to 45 % of the shorter leg), so the line stays on the road and
//    only the vertex loses its hard point. Near-straight vertices are left.
//
//  smoothLive — the in-run path arrives as raw fixes every ≥ 5 m: light
//    jitter smoothing only — drop fixes < 3 m apart, then a 1-2-1 moving
//    average on interior points; the first and the last two points stay
//    exact so the runner's dot sits on the true position.
import type { Coordinate } from '@/types';

const M_PER_DEG_LAT = 111_320;
const RADIUS_M = 4;
const MIN_TURN_DEG = 8;
const ARC_STEPS = 4;
const MAX_OUT = 2000;

type XY = { x: number; y: number };
function toXY(c: Coordinate, lat0: number): XY {
  const k = Math.cos((lat0 * Math.PI) / 180) * M_PER_DEG_LAT;
  return { x: c.lng * k, y: c.lat * M_PER_DEG_LAT };
}
function toLL(p: XY, lat0: number): Coordinate {
  const k = Math.cos((lat0 * Math.PI) / 180) * M_PER_DEG_LAT;
  return { lat: p.y / M_PER_DEG_LAT, lng: p.x / k };
}
const dist = (a: XY, b: XY) => Math.hypot(b.x - a.x, b.y - a.y);

/** Straight legs, corners rounded with a ≤ RADIUS_M arc (quadratic, vertex = control). */
export function roundCorners(pts: readonly Coordinate[], radiusM = RADIUS_M): Coordinate[] {
  if (pts.length < 3 || pts.length > MAX_OUT / 2) return [...pts];
  const lat0 = pts[0].lat;
  const P = pts.map(c => toXY(c, lat0));
  const out: XY[] = [P[0]];
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], v = P[i], b = P[i + 1];
    const l1 = dist(a, v), l2 = dist(v, b);
    if (l1 < 0.5 || l2 < 0.5) { out.push(v); continue; }
    const u1 = { x: (a.x - v.x) / l1, y: (a.y - v.y) / l1 };
    const u2 = { x: (b.x - v.x) / l2, y: (b.y - v.y) / l2 };
    const turn = Math.acos(Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y)));
    const turnDeg = 180 - (turn * 180) / Math.PI;
    if (turnDeg < MIN_TURN_DEG) { out.push(v); continue; }
    const r = Math.min(radiusM, 0.45 * l1, 0.45 * l2);
    const p1 = { x: v.x + u1.x * r, y: v.y + u1.y * r };
    const p2 = { x: v.x + u2.x * r, y: v.y + u2.y * r };
    for (let s = 0; s <= ARC_STEPS; s++) {
      const t = s / ARC_STEPS, mt = 1 - t;
      out.push({ x: mt * mt * p1.x + 2 * mt * t * v.x + t * t * p2.x, y: mt * mt * p1.y + 2 * mt * t * v.y + t * t * p2.y });
    }
  }
  out.push(P[P.length - 1]);
  return out.map(p => toLL(p, lat0));
}

/** Light jitter smoothing for the live path (display only). */
export function smoothLive(pts: readonly Coordinate[]): Coordinate[] {
  if (pts.length < 3) return [...pts];
  const lat0 = pts[0].lat;
  const P = pts.map(c => toXY(c, lat0));
  const kept: XY[] = [P[0]];
  for (let i = 1; i < P.length; i++) if (dist(P[i], kept[kept.length - 1]) >= 3 || i === P.length - 1) kept.push(P[i]);
  if (kept.length < 3) return kept.map(p => toLL(p, lat0));
  const out: XY[] = kept.map((p, i) => {
    if (i === 0 || i >= kept.length - 2) return p;
    const a = kept[i - 1], b = kept[i + 1];
    return { x: 0.25 * a.x + 0.5 * p.x + 0.25 * b.x, y: 0.25 * a.y + 0.5 * p.y + 0.25 * b.y };
  });
  return out.map(p => toLL(p, lat0));
}
