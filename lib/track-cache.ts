// Session cache of full run tracks for CARD-CLASS surfaces (visual-split
// ruling 2026-07-22: one line everywhere — cards render the full track, the
// ≤36pt thumb is the loading placeholder). Fetch-once by runId (tracks are
// immutable), progressive blocky→smooth as fetches land; failure/offline →
// the thumb stands, honestly. Retires wholesale if 지연 ships the denser
// feed payload (the non-blocking (c) ask).
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { ApiError } from '@/lib/api';
import { getRunTrack } from '@/lib/run-social-api';
import type { Coordinate } from '@/types';

const cache = new Map<string, Coordinate[]>();
const pending = new Set<string>(); // dedupe concurrent card mounts
// Failed-set SOFTENING (latch episode, owner GO 2026-07-22): a 502-burst
// launch window latched a whole session onto thumbs. Failures now EXPIRE
// (TTL) and CLEAR on app-foreground — one bad window can never blind a
// session again; the no-retry-storm intent survives via the TTL.
const FAILED_TTL_MS = 3 * 60_000;
const failed = new Map<string, number>(); // runId → failure timestamp
AppState.addEventListener('change', st => { if (st === 'active') failed.clear(); });
function isFailedFresh(runId: string): boolean {
  const at = failed.get(runId);
  if (at == null) return false;
  if (Date.now() - at < FAILED_TTL_MS) return true;
  failed.delete(runId); // expired — eligible again
  return false;
}

/** The card's line: cached full track when available, else the thumb.
    Pass runId=null to disable (e.g. mapLive off — no fetch, no churn).
    thumb presence gates the fetch (thumb ⟺ track exists, probed rule). */
export function useRunTrackLine(
  runId: string | null | undefined,
  thumb: Coordinate[] | null | undefined,
): { line: Coordinate[] | null; dbg: string } {
  // SANCTIONED TEMP PROBE (reopened arc, 2026-07-23): dbg names each card's
  // actual line source + failure class. STRIPS IN THE FIX COMMIT.
  const [line, setLine] = useState<Coordinate[] | null>(() => (runId && cache.get(runId)) || null);
  const [dbg, setDbg] = useState('init');
  useEffect(() => {
    if (!runId) { setDbg('disabled'); return; }
    const hit = cache.get(runId);
    if (hit) { setLine(hit); setDbg(`cache:${hit.length}pts`); return; }
    if (!thumb || thumb.length < 2) { setDbg('no-thumb'); return; }
    if (isFailedFresh(runId)) { setDbg('failed-fresh'); return; }
    if (pending.has(runId)) { setDbg('pending-other'); return; }
    pending.add(runId);
    setDbg('fetching');
    let alive = true;
    getRunTrack(runId)
      .then(t => {
        if (t.polyline && t.polyline.length >= 2) {
          cache.set(runId, t.polyline);
          if (alive) { setLine(t.polyline); setDbg(`fetched:${t.polyline.length}pts`); }
        } else {
          failed.set(runId, Date.now());
          if (alive) setDbg('empty-track');
        }
      })
      .catch(e => {
        failed.set(runId, Date.now());
        if (alive) setDbg(`failed:${e instanceof ApiError ? e.status : 'net'}`);
      })
      .finally(() => pending.delete(runId));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);
  return { line: line ?? thumb ?? null, dbg };
}
