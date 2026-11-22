// Screen open → first data paint timing — redesign item ⑩ (2026-11-21). The desk
// cannot measure device render time, so the ranked screens record it here and
// the settings footer shows the last 30 on a long-press. Ships in every build
// (no __DEV__ gate — the owner measures on TestFlight); in-memory only.
import { useEffect, useRef } from 'react';

type Entry = { screen: string; ms: number; cached: boolean };
const log: Entry[] = [];

/** Call once per screen instance; `painted` flips true when real data is on screen. */
export function useScreenTiming(screen: string, painted: boolean, cached = false): void {
  const t0 = useRef(Date.now());
  const done = useRef(false);
  useEffect(() => {
    if (!painted || done.current) return;
    done.current = true;
    log.unshift({ screen, ms: Date.now() - t0.current, cached });
    if (log.length > 30) log.length = 30;
  }, [painted, screen, cached]);
}

export function timingReport(): string {
  return log.length ? log.map(e => `${e.screen}  ${e.ms} ms${e.cached ? '  (cache)' : ''}`).join('\n') : '—';
}
