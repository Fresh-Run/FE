/**
 * ⚠ SEOUL-FALLBACK CLASS RULE (occurrences 1–4, documented 2026-07-14):
 * `coordinate` is SEOUL-SEEDED SYNCHRONOUSLY — it is NEVER null, so a
 * truthiness check passes on the fallback before any GPS. Consumers MUST
 * gate on `status === 'granted'` before treating coordinate as the user's
 * position (map centers, nearby queries, weather fetches, API lat/lng).
 * The fallback exists so DISPLAY surfaces never hang — not so logic can
 * mistake 시청 for the user.
 */
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

export type LocationStatus = 'fetching' | 'granted' | 'denied';
export type LocationCoordinate = { lat: number; lng: number };

// Used when permission is denied or location fetch fails.
export const SEOUL_FALLBACK: LocationCoordinate = { lat: 37.5665, lng: 126.9780 };
const SEOUL_FALLBACK_NAME = '서울 중심';

export function useCurrentLocation() {
  const [status, setStatus]         = useState<LocationStatus>('fetching');
  const [coordinate, setCoordinate] = useState<LocationCoordinate>(SEOUL_FALLBACK);
  const [placeName, setPlaceName]   = useState(SEOUL_FALLBACK_NAME);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { status: perm } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;

        if (perm !== 'granted') {
          // Denied: fall back immediately — form/CTA must never hang waiting for location
          setStatus('denied');
          return;
        }

        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;

        const coord = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoordinate(coord);
        setStatus('granted'); // resolve status before reverse-geocode (non-blocking)

        // Best-effort reverse geocode for display name; failure is silently swallowed
        Location.reverseGeocodeAsync({ latitude: coord.lat, longitude: coord.lng })
          .then(([geo]) => {
            if (!cancelled) {
              setPlaceName(geo?.district ?? geo?.subregion ?? geo?.city ?? '현재 위치');
            }
          })
          .catch(() => {
            if (!cancelled) setPlaceName('현재 위치');
          });

      } catch {
        if (!cancelled) setStatus('denied');
        // coordinate + placeName stay as Seoul fallback values
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return { status, coordinate, placeName };
}
