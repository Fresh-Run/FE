// Client-side run metrics from the RAW gps track (B2 수고했어요):
// km splits (sec/km, t-interpolated at boundaries) + elevation gain (alt).
// The track is the tracker's own record — no server dependency.
import type { GpsPoint } from '@/lib/runs-api';

function haversineM(a: GpsPoint, b: GpsPoint): number {
  const R = 6371000;
  const p1 = (a.lat * Math.PI) / 180, p2 = (b.lat * Math.PI) / 180;
  const dp = ((b.lat - a.lat) * Math.PI) / 180, dl = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Full-km split paces (sec per km). Boundary times linearly interpolated
    within the crossing segment; the trailing partial km is dropped (a split
    is a completed kilometer). <2 usable points → []. */
export function computeKmSplits(track: GpsPoint[] | undefined): number[] {
  if (!track || track.length < 2) return [];
  const splits: number[] = [];
  let cum = 0;               // meters
  let nextKm = 1000;
  let lastCrossT = track[0].t;
  for (let i = 1; i < track.length; i++) {
    const seg = haversineM(track[i - 1], track[i]);
    if (seg <= 0) continue;
    while (cum + seg >= nextKm) {
      const f = (nextKm - cum) / seg; // fraction into this segment
      const tCross = track[i - 1].t + (track[i].t - track[i - 1].t) * f;
      splits.push(Math.round((tCross - lastCrossT) / 1000));
      lastCrossT = tCross;
      nextKm += 1000;
    }
    cum += seg;
  }
  return splits.filter(s => s > 0);
}

/** Cumulative POSITIVE elevation gain (m) from point altitudes. Per-step
    |delta| ≥ 30m is discarded as a GPS altitude spike; sub-1m rises are
    noise and ignored. null when the track carries no altitude data. */
export function computeElevGain(track: GpsPoint[] | undefined): number | null {
  if (!track) return null;
  let gain = 0, seen = false, prev: number | null = null;
  for (const p of track) {
    if (p.alt == null) continue;
    seen = true;
    if (prev != null) {
      const d = p.alt - prev;
      if (Math.abs(d) < 30 && d >= 1) gain += d;
    }
    prev = p.alt;
  }
  return seen ? Math.round(gain) : null;
}
