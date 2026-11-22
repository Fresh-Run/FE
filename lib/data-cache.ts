// Persistent GET cache — redesign item ⑩ slice 1 (2026-11-21). STANDARD (owner):
// a screen opened before paints its last data instantly and refreshes in the
// background; a first-ever open shows a skeleton, never a centered spinner.
//
// Mechanics: every successful apiFetch GET writes its JSON here (lib/api.ts),
// keyed by the request path and scoped by user id. On boot the root layout
// hydrates this user's entries from AsyncStorage into memory ONCE (one
// multiGet, a few ms), so every later read is synchronous — hooks seed their
// initial state from `dcGet(path)` and skip the blank-first branch when it
// hits. Cap: 400 keys, oldest evicted. Keys are user-scoped, so sign-out only
// drops the memory copy (the same account re-signs in warm; another account
// never sees them). Cached rows may carry expired signed photo URLs — the
// image component falls back and the background refresh replaces them.
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = '@fr_dc:';
const MAX_KEYS = 400;

let uid: string | null = null;
let ready = false;
const mem = new Map<string, { v: unknown; at: number }>();
const subs = new Map<string, Set<() => void>>();
/** Notify on writes to `key` (snapshot arrivals etc.). Returns the unsubscribe. */
export function dcSubscribe(key: string, fn: () => void): () => void {
  let set = subs.get(key);
  if (!set) { set = new Set(); subs.set(key, set); }
  set.add(fn);
  return () => { set!.delete(fn); if (set!.size === 0) subs.delete(key); };
}
const fullKey = (k: string) => `${PREFIX}${uid}:${k}`;

/** Load this user's cached GETs into memory. Idempotent per user. */
export async function hydrateDataCache(userId: string): Promise<void> {
  if (uid === userId && ready) return;
  uid = userId; ready = false; mem.clear();
  try {
    const prefix = `${PREFIX}${userId}:`;
    const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(prefix));
    const pairs = keys.length ? await AsyncStorage.multiGet(keys) : [];
    for (const [k, raw] of pairs) {
      if (!raw) continue;
      try { mem.set(k.slice(prefix.length), JSON.parse(raw) as { v: unknown; at: number }); } catch { /* skip a corrupt entry */ }
    }
  } catch { /* storage unavailable — the app runs uncached */ }
  // item ⑫: purge v1 map snapshots (old line style) once per hydrate
  const stale = [...mem.keys()].filter(k => k.startsWith('snap:'));
  if (stale.length) {
    for (const k of stale) mem.delete(k);
    AsyncStorage.multiRemove(stale.map(k => `${PREFIX}${userId}:${k}`)).catch(() => {});
  }
  ready = true;
}

export const dcReady = () => ready;
/** Synchronous read; `undefined` = miss (a cached JSON `null` is a hit). */
export function dcGet<T>(key: string): T | undefined {
  const e = mem.get(key);
  return e ? (e.v as T) : undefined;
}
export function dcAgeMs(key: string): number | null {
  const e = mem.get(key);
  return e ? Date.now() - e.at : null;
}
export function dcSet(key: string, v: unknown): void {
  if (!uid) return;
  const e = { v, at: Date.now() };
  mem.set(key, e);
  AsyncStorage.setItem(fullKey(key), JSON.stringify(e)).catch(() => {});
  subs.get(key)?.forEach(fn => fn());
  if (mem.size > MAX_KEYS) {
    const drop = [...mem.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, mem.size - MAX_KEYS + 40);
    for (const [k] of drop) mem.delete(k);
    AsyncStorage.multiRemove(drop.map(([k]) => fullKey(k))).catch(() => {});
  }
}
/** Sign-out: drop the memory copy only (entries stay on disk under the user's prefix). */
export function dcReset(): void { mem.clear(); ready = false; uid = null; }
