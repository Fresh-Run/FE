/**
 * ⚠ SEOUL-FALLBACK CLASS RULE (occurrences 1–4, documented 2026-07-14):
 * `coordinate` is SEOUL-SEEDED SYNCHRONOUSLY — it is NEVER null, so a
 * truthiness check passes on the fallback before any GPS. Consumers MUST
 * gate on `status === 'granted'` before treating coordinate as the user's
 * position (map centers, nearby queries, weather fetches, API lat/lng).
 * The fallback exists so DISPLAY surfaces never hang — not so logic can
 * mistake 시청 for the user.
 */
import { t } from '@/lib/i18n';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

export type LocationStatus = 'fetching' | 'granted' | 'denied';
export type LocationCoordinate = { lat: number; lng: number };

// Used when permission is denied or location fetch fails.
export const SEOUL_FALLBACK: LocationCoordinate = { lat: 37.5665, lng: 126.9780 };
const SEOUL_FALLBACK_NAME = '서울 중심';

// OS-cached fix acceptance window. 10min matches the weather cache TTL and its
// ~1.1km grid: a fix this fresh can't be wrong enough to matter for any
// consumer (weather, nearby radius, map center) — older returns null and the
// cold Balanced fix stays the only path, exactly the pre-fix behavior.
const LAST_KNOWN_MAX_AGE_MS = 10 * 60 * 1000;

export function useCurrentLocation() {
  const [status, setStatus]         = useState<LocationStatus>('fetching');
  const [coordinate, setCoordinate] = useState<LocationCoordinate>(SEOUL_FALLBACK);
  const [placeName, setPlaceName]   = useState(SEOUL_FALLBACK_NAME);

  useEffect(() => {
    let cancelled = false;

    // Adopt a fix: coords + granted + best-effort reverse geocode (non-blocking,
    // failure silently swallowed).
    const apply = (coord: LocationCoordinate) => {
      setCoordinate(coord);
      setStatus('granted');
      Location.reverseGeocodeAsync({ latitude: coord.lat, longitude: coord.lng })
        .then(([geo]) => {
          if (!cancelled) {
            setPlaceName(geo?.district ?? geo?.subregion ?? geo?.city ?? t('ct.currentLoc'));
          }
        })
        .catch(() => {
          if (!cancelled) setPlaceName(t('ct.currentLoc'));
        });
    };

    (async () => {
      try {
        const { status: perm } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;

        if (perm !== 'granted') {
          // Denied: fall back immediately — form/CTA must never hang waiting for location
          setStatus('denied');
          return;
        }

        // Fast path: paint from the OS-cached fix instead of stalling every
        // mount on a cold Balanced fix (the measured weather-page waterfall —
        // consumers gate on 'granted', so even warm caches waited seconds).
        const last = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
        if (cancelled) return;
        if (last) apply({ lat: last.coords.latitude, lng: last.coords.longitude });

        // Fresh fix refines in the background (or is the only fix when the OS
        // had nothing cached — the pre-fix behavior).
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        apply({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        // A fresh-fix failure must not revoke a fix already adopted from the
        // fast path; with no fix at all, fall back exactly as before.
        if (!cancelled) setStatus(s => (s === 'granted' ? s : 'denied'));
        // coordinate + placeName stay as Seoul fallback values
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return { status, coordinate, placeName };
}
