// Shared weather source — one fetch for strip/chooser/detail. 10min TTL,
// AsyncStorage cache keyed on ~1km-rounded coords. Quiet failure contract:
// errors are swallowed — consumers render last-cached data or dashes,
// never an error screen (weather is ambient).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';

import { useCurrentLocation } from '@/hooks/use-current-location';
import { getWeather, type WeatherResponse } from '@/lib/weather-api';

const TTL_MS = 10 * 60 * 1000;
// 2dp ≈ 1.1km grid — close enough for weather, coarse enough to cache-hit
const roundCoord = (v: number) => Math.round(v * 100) / 100;
const cacheKey = (lat: number, lng: number) => `@fr_weather:${roundCoord(lat)},${roundCoord(lng)}`;

type CacheEntry = { data: WeatherResponse; at: number };

export function useWeather() {
  const { coordinate, placeName } = useCurrentLocation();
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const fetchedAtRef = useRef(0);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    if (!coordinate || busyRef.current) return;
    if (Date.now() - fetchedAtRef.current < TTL_MS) return; // fresh enough
    busyRef.current = true;
    const key = cacheKey(coordinate.lat, coordinate.lng);
    try {
      // 1) cache first (instant paint + offline answer)
      if (!weather) {
        try {
          const raw = await AsyncStorage.getItem(key);
          if (raw) {
            const entry = JSON.parse(raw) as CacheEntry;
            setWeather(entry.data);
            if (Date.now() - entry.at < TTL_MS) {
              fetchedAtRef.current = entry.at;
              return; // cache is fresh — skip the network round-trip
            }
          }
        } catch { /* unreadable cache — fall through to network */ }
      }
      // 2) network; failure keeps whatever we have (quiet contract)
      const data = await getWeather(coordinate.lat, coordinate.lng);
      fetchedAtRef.current = Date.now();
      setWeather(data);
      AsyncStorage.setItem(key, JSON.stringify({ data, at: fetchedAtRef.current } satisfies CacheEntry)).catch(() => {});
    } catch { /* offline / upstream outage — cached or null stands */ }
    finally { busyRef.current = false; }
  }, [coordinate, weather]);

  // Mount + focus (TTL-gated inside load)
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return { weather, placeName };
}
