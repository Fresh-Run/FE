// Elevation profile math (8/8 build — her ③ contract, deployed 8/5):
// polyline[].alt in 0.1m rounds; null/absent = the client never sent (old
// runs serve alt: null on every point). HER TEST-PINNED GUARANTEE, cited:
// altitude is display/analysis ONLY — it never touches distance, filter, or
// verification math server-side; nothing here feeds back into any of ours
// either (pure derivation, render-only consumers).
//
// All constants are field-tunable and live here, top-of-file.

import type { TrackPoint } from '@/types';

/** Interior null-alt gap runs up to this many points are linearly
    interpolated between real neighbors (server-simplified lines put points
    ~50-100m apart on real runs → ≤5 pts ≈ a few hundred meters). Longer
    gaps are BRIDGED (their points carry no fabricated y — the segment
    connects across), with the coverage floor below as the abuse guard. */
export const GAP_INTERP_MAX_PTS = 5;
/** Real (non-null) alt coverage required before a chart renders at all —
    below this the section null-skips like a pre-deploy run. */
export const MIN_ALT_COVERAGE = 0.7;
/** Centered moving-average window (odd; raw GPS altitude multipath teeth).
    Both the DRAWN line and the gain/loss stats run on the smoothed series
    (the stats necessity is desk-convicted — see HYSTERESIS_M). */
export const SMOOTH_WINDOW = 5;
/** Hysteresis for ascent/descent accumulation on the SMOOTHED series —
    only swings beyond this count (the standard fitness-app approach;
    without it GPS noise inflates 총 상승 absurdly). Desk-convicted 8/8:
    raw-series hysteresis FAILS on alternating ±2m teeth (4m point-to-point
    swings beat any ~2-3m threshold) — smoothing first flattens the teeth,
    hysteresis then gates the residual drift. Proofs 4/4: teeth→0/0 ·
    +20m gradual→18 · 30up/30down noisy→27/26 · random jitter→0/0. */
export const HYSTERESIS_M = 2.5;
/** v2 Y-range (8/3 owner field critique — the 30m fixed floor read
    21m→-9m over ~12m of real variation, flattening the story):
    span = max(actualRange × SPAN_PAD, MIN_SPAN_M). A 12m run shows real
    shape; a dead-flat run still doesn't render as mountains. */
export const SPAN_PAD = 1.3;
export const MIN_SPAN_M = 8;

export type ElevationProfile = {
  /** cumulative distance (m) per drawn point */
  dists: number[];
  /** SMOOTHED altitude (m) per drawn point — the line */
  alts: number[];
  totalDistM: number;
  minAlt: number; // of the smoothed series (chart range)
  maxAlt: number;
  /** hysteresis-gated totals from the SMOOTHED series, whole meters */
  gainM: number;
  lossM: number;
};

function distM(a: TrackPoint, b: TrackPoint): number {
  // equirectangular approximation — exact enough at run scale, matches the
  // cos(lat)-corrected convention used by routePath
  const kx = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  const dx = (b.lng - a.lng) * kx * 111_320;
  const dy = (b.lat - a.lat) * 110_540;
  return Math.sqrt(dx * dx + dy * dy);
}

/** null → chart section must not render (null-skip: pre-deploy runs, thin
    coverage, degenerate tracks). */
export function buildElevationProfile(points: TrackPoint[] | null | undefined): ElevationProfile | null {
  if (!points || points.length < 2) return null;
  const real = points.filter(p => p.alt != null);
  if (real.length < 2 || real.length / points.length < MIN_ALT_COVERAGE) return null;

  // cumulative distances over the FULL point list (x is geometry-true even
  // where alt is missing)
  const cum: number[] = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + distM(points[i - 1], points[i]));
  const totalDistM = cum[cum.length - 1];
  if (totalDistM <= 0) return null;

  // gap fill: interior null runs ≤ GAP_INTERP_MAX_PTS get linear interp by
  // distance between the real neighbors; longer runs stay null (bridged).
  // Leading/trailing nulls are trimmed (no neighbor to anchor them).
  const alt: (number | null)[] = points.map(p => (p.alt == null ? null : p.alt));
  let i = 0;
  while (i < alt.length) {
    if (alt[i] != null) { i++; continue; }
    let j = i;
    while (j < alt.length && alt[j] == null) j++;
    const prev = i - 1, next = j; // real neighbors (or out of range)
    if (prev >= 0 && next < alt.length && j - i <= GAP_INTERP_MAX_PTS) {
      const a0 = alt[prev]!, a1 = alt[next]!;
      const d0 = cum[prev], d1 = cum[next];
      for (let k = i; k < j; k++) {
        const f = d1 > d0 ? (cum[k] - d0) / (d1 - d0) : 0;
        alt[k] = a0 + (a1 - a0) * f;
      }
    }
    i = j;
  }

  // drawn series = points with a resolved altitude
  const dists: number[] = [];
  const raw: number[] = [];
  for (let k = 0; k < alt.length; k++) {
    if (alt[k] != null) { dists.push(cum[k]); raw.push(alt[k]!); }
  }
  if (raw.length < 2) return null;

  // smoothing (line only) — centered moving average, window clamped at ends
  const half = Math.floor(SMOOTH_WINDOW / 2);
  const alts = raw.map((_, k) => {
    const lo = Math.max(0, k - half), hi = Math.min(raw.length - 1, k + half);
    let s = 0;
    for (let m = lo; m <= hi; m++) s += raw[m];
    return s / (hi - lo + 1);
  });

  // hysteresis gain/loss on the SMOOTHED series (see HYSTERESIS_M note —
  // raw-series gating fails on alternating teeth): a pivot advances only
  // when the excursion beyond it exceeds HYSTERESIS_M; the committed delta
  // lands in gain or loss and the pivot moves to the extreme
  let gain = 0, loss = 0, pivot = alts[0];
  for (let k = 1; k < alts.length; k++) {
    const d = alts[k] - pivot;
    if (d >= HYSTERESIS_M) { gain += d; pivot = alts[k]; }
    else if (d <= -HYSTERESIS_M) { loss += -d; pivot = alts[k]; }
  }

  return {
    dists,
    alts,
    totalDistM,
    minAlt: Math.min(...alts),
    maxAlt: Math.max(...alts),
    gainM: Math.round(gain),
    lossM: Math.round(loss),
  };
}
