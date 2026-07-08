// 날씨 + 러닝지수 — GET /api/weather?lat&lng (guide §날씨; staging-probed
// 2026-07-08). App → FastAPI → OpenWeather; the key lives server-side.
// pm blocks are nullable on partial upstream outage. `area` comes back
// romanized — display names stay client-side (Apple reverse geocode).
import { apiFetch } from '@/lib/api';

export type AqiBlock = { value: number; grade: string } | null;

export type WeatherResponse = {
  area: string | null;
  temp_c: number;
  feels_like_c: number;
  condition: string;      // 한글 (구름조금 …)
  condition_code: number; // OpenWeather code — icon mapping
  humidity_pct: number;
  wind_ms: number;
  rain_1h_mm: number | null;
  pm25: AqiBlock;
  pm10: AqiBlock;
  running_index: {
    score: number; // 0–100
    label: string;
    comment: string;
    personalized: boolean;
  };
  fetched_at: string;
};

export function getWeather(lat: number, lng: number): Promise<WeatherResponse> {
  return apiFetch<WeatherResponse>(`/api/weather?lat=${lat}&lng=${lng}`);
}

/** Verdict tone from the running-index score (owner thresholds 2026-07-08). */
export type WeatherTone = 'good' | 'ok' | 'bad';
export function weatherTone(score: number): WeatherTone {
  if (score >= 70) return 'good';
  if (score >= 40) return 'ok';
  return 'bad';
}
