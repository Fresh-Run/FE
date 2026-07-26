/**
 * 지점 N fill — the label-shape slice (armed 2026-07-22, fired on her
 * priority ask). Resolves real place names for PLACEHOLDER waypoints only
 * (lib/waypoint-names.ts owns the eligibility rules) via the app's
 * established reverse-geocode lane: Apple `Location.reverseGeocodeAsync`
 * (the run-save `area` / start-picker tap-label / placeName source — no
 * quota, no key in the bundle, no server dependency; the guide's Kakao
 * suggestion would need a client key or a proxy the server explicitly
 * doesn't provide, §215).
 *
 * One resolve per coordinate EVER: in-memory map + persisted
 * @fr_wp_names cache (insertion-capped). Geocode returns nothing useful
 * → the server label survives as the honest floor. Sequential resolves —
 * Apple's geocoder dislikes bursts, and courses carry ≤ a handful.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import { isNeutralWaypointName, labelFromGeocode, waypointCacheKey } from '@/lib/waypoint-names';
import { type Coordinate } from '@/hooks/use-generate-route';

const STORE_KEY = '@fr_wp_names';
const CACHE_CAP = 300;

let mem: Record<string, string> | null = null;
let hydrating: Promise<Record<string, string>> | null = null;

async function loadCache(): Promise<Record<string, string>> {
  if (mem) return mem;
  if (!hydrating) {
    hydrating = AsyncStorage.getItem(STORE_KEY)
      .then(raw => { mem = raw ? (JSON.parse(raw) as Record<string, string>) : {}; return mem; })
      .catch(() => { mem = {}; return mem; });
  }
  return hydrating;
}

function persistCache(cache: Record<string, string>) {
  const keys = Object.keys(cache);
  // insertion-order cap — drop oldest entries beyond CACHE_CAP
  if (keys.length > CACHE_CAP) {
    for (const k of keys.slice(0, keys.length - CACHE_CAP)) delete cache[k];
  }
  AsyncStorage.setItem(STORE_KEY, JSON.stringify(cache)).catch(() => { /* cache is best-effort */ });
}

type Wp = { name: string; coordinate: Coordinate; is_pitstop: boolean };

/**
 * Returns resolved display names keyed by waypointCacheKey — progressive
 * (names appear as they resolve). Non-eligible waypoints never enter the
 * map; render with `resolved[key] ?? wp.name`.
 */
export function useWaypointNames(waypoints: Wp[] | undefined): Record<string, string> {
  const [resolved, setResolved] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!waypoints?.length) return;
    let cancelled = false;
    (async () => {
      const cache = await loadCache();
      let dirty = false;
      for (const wp of waypoints) {
        if (cancelled) break;
        if (wp.is_pitstop || !isNeutralWaypointName(wp.name)) continue;
        const key = waypointCacheKey(wp.coordinate);
        let name: string | null = cache[key] ?? null;
        if (!name) {
          try {
            const [geo] = await Location.reverseGeocodeAsync({
              latitude: wp.coordinate.lat, longitude: wp.coordinate.lng,
            });
            name = labelFromGeocode(geo);
          } catch { name = null; } // geocode miss → server label stands
          if (name) { cache[key] = name; dirty = true; }
        }
        if (name && !cancelled) setResolved(prev => ({ ...prev, [key]: name }));
      }
      if (dirty && !cancelled) persistCache(cache);
    })();
    return () => { cancelled = true; };
  }, [waypoints]);

  return resolved;
}
