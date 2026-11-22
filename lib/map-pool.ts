// Off-screen map render pool — item ⑩-2 fix (owner, 2026-11-21): "render and
// snapshot the maps for the next few cards off-screen before I scroll to
// them". Every RouteMap that lacks a snapshot asks for a slot; at most
// MAX_LIVE native maps render at once (viewable cards first, then mount
// order), each releasing its slot once its snapshot is frozen (or after a
// timeout). Lists therefore snapshot themselves progressively in the
// background with a bounded MapKit footprint, and a card the user scrolls
// to is usually already an image.
import { useEffect, useState } from 'react';

const MAX_LIVE = 3;
type Waiter = { id: number; priority: number; grant: () => void };
let seq = 0;
let active = 0;
const queue: Waiter[] = [];

function pump() {
  while (active < MAX_LIVE && queue.length) {
    queue.sort((a, b) => a.priority - b.priority || a.id - b.id);
    const w = queue.shift()!;
    active += 1;
    w.grant();
  }
}

/** Returns true once this component holds a render slot. Release happens on
    `wanted` turning false or on unmount. `priority` 0 = viewable, 1 = next. */
export function useMapSlot(wanted: boolean, priority = 1): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!wanted) return;
    let granted = false;
    const me: Waiter = { id: ++seq, priority, grant: () => { granted = true; setHeld(true); } };
    queue.push(me);
    pump();
    return () => {
      if (granted) { active = Math.max(0, active - 1); pump(); }
      else { const i = queue.indexOf(me); if (i >= 0) queue.splice(i, 1); }
      setHeld(false);
    };
  }, [wanted, priority]);
  return held;
}
