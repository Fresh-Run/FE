// Session cache of full run tracks for CARD-CLASS surfaces (visual-split
// ruling 2026-07-22: one line everywhere — cards render the full track, the
// ≤36pt thumb is the loading placeholder). Fetch-once by runId (tracks are
// immutable), progressive blocky→smooth as fetches land; failure/offline →
// the thumb stands, honestly. Retires wholesale if 지연 ships the denser
// feed payload (the non-blocking (c) ask).
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { getRunTrack } from '@/lib/run-social-api';
import type { Coordinate, TrackPoint } from '@/types';

const cache = new Map<string, TrackPoint[]>();
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

/** No-swap render policy (owner ruling 2026-07-23: real track only, no
    intermediate blocky line — a line that appears once, correct, beats a
    line that transforms). States:
    - READY  → { line: fullTrack, pending: false }  (cache hit = first frame)
    - LOADING→ { line: null,      pending: true  }  (caller hides the line,
                thumb still frames the map region)
    - FAILED / disabled / trackless → { line: thumb, pending: false }
                (the thumb is the best REAL geometry available and will not
                swap later — coarse-but-stable beats empty-forever; a TTL
                retry succeeding is the one rare later-swap, accepted). */
export function useRunTrack(
  runId: string | null | undefined,
  thumb: Coordinate[] | null | undefined,
): { line: TrackPoint[] | null; pending: boolean } {
  const [track, setTrack] = useState<TrackPoint[] | null>(() => (runId && cache.get(runId)) || null);
  const [inFlight, setInFlight] = useState(false);
  useEffect(() => {
    if (!runId) return;
    const hit = cache.get(runId);
    if (hit) { setTrack(hit); setInFlight(false); return; }
    if (!thumb || thumb.length < 2 || isFailedFresh(runId)) return;
    let alive = true;
    setInFlight(true);
    if (!pending.has(runId)) {
      pending.add(runId);
      getRunTrack(runId)
        .then(t => {
          if (t.polyline && t.polyline.length >= 2) {
            cache.set(runId, t.polyline);
            if (alive) setTrack(t.polyline);
          } else {
            failed.set(runId, Date.now());
          }
        })
        .catch(() => failed.set(runId, Date.now()))
        .finally(() => { pending.delete(runId); if (alive) setInFlight(false); });
    } else {
      // another mount owns the fetch — poll-free: our card shows the gap
      // until this effect re-runs (remount/focus); rare same-run-twice case
      setInFlight(false);
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);
  if (track) return { line: track, pending: false };
  if (inFlight) return { line: null, pending: true };
  return { line: thumb ?? null, pending: false };
}

/** Pre-warm (owner ruling ③): lists know their runIds at data-arrival —
    fire the fetches BEFORE cards mount/paint so most cards are track-ready
    before the eye lands. Same cache/pending/failed gates; fire-and-forget;
    capped. */
export function prewarmTracks(runIds: (string | null | undefined)[], cap = 10): void {
  let fired = 0;
  for (const id of runIds) {
    if (!id || fired >= cap) break;
    if (cache.has(id) || pending.has(id) || isFailedFresh(id)) continue;
    pending.add(id);
    fired += 1;
    getRunTrack(id)
      .then(t => {
        if (t.polyline && t.polyline.length >= 2) cache.set(id, t.polyline);
        else failed.set(id, Date.now());
      })
      .catch(() => failed.set(id, Date.now()))
      .finally(() => pending.delete(id));
  }
}
