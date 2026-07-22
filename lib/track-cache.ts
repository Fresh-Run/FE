// Session cache of full run tracks for CARD-CLASS surfaces (visual-split
// ruling 2026-07-22: one line everywhere — cards render the full track, the
// ≤36pt thumb is the loading placeholder). Fetch-once by runId (tracks are
// immutable), progressive blocky→smooth as fetches land; failure/offline →
// the thumb stands, honestly. Retires wholesale if 지연 ships the denser
// feed payload (the non-blocking (c) ask).
import { useEffect, useState } from 'react';

import { getRunTrack } from '@/lib/run-social-api';
import type { Coordinate } from '@/types';

const cache = new Map<string, Coordinate[]>();
const pending = new Set<string>(); // dedupe concurrent card mounts
const failed = new Set<string>();  // no per-session retry storms

/** The card's line: cached full track when available, else the thumb.
    Pass runId=null to disable (e.g. mapLive off — no fetch, no churn).
    thumb presence gates the fetch (thumb ⟺ track exists, probed rule). */
export function useRunTrackLine(
  runId: string | null | undefined,
  thumb: Coordinate[] | null | undefined,
): Coordinate[] | null {
  const [line, setLine] = useState<Coordinate[] | null>(() => (runId && cache.get(runId)) || null);
  useEffect(() => {
    if (!runId) return;
    const hit = cache.get(runId);
    if (hit) { setLine(hit); return; }
    if (!thumb || thumb.length < 2 || failed.has(runId) || pending.has(runId)) return;
    pending.add(runId);
    let alive = true;
    getRunTrack(runId)
      .then(t => {
        if (t.polyline && t.polyline.length >= 2) {
          cache.set(runId, t.polyline);
          if (alive) setLine(t.polyline);
        } else {
          failed.add(runId);
        }
      })
      .catch(() => failed.add(runId))
      .finally(() => pending.delete(runId));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);
  return line ?? thumb ?? null;
}
