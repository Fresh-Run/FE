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
  /** 기상청 5단계 grade 낮음/보통/높음/매우높음/위험 (guide §62); null on
      partial upstream outage → hide the tile */
  uv: AqiBlock;
  /** BE 2bd2855 (probed live 2026-07-15) — night icon branch + UV collapse */
  is_day: boolean;
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

/** OpenWeather condition_code → Ionicons name + tint (W2, home strip).
    Code families per OpenWeather docs: 2xx thunder, 3xx drizzle, 5xx rain,
    6xx snow, 7xx atmosphere, 800 clear, 80x clouds. Night branch (is_day
    false, BE 2bd2855): the sun families swap to moon variants — weather
    with its own iconography (rain/snow/thunder/fog) stays. */
export function weatherIcon(code: number, isDay = true): { name: string; color: string } {
  if (code >= 200 && code < 300) return { name: 'thunderstorm', color: '#8A7BD8' };
  if (code >= 300 && code < 600) return { name: 'rainy',        color: '#3BA7FF' };
  if (code >= 600 && code < 700) return { name: 'snow',         color: '#9DB2C8' };
  if (code >= 700 && code < 800) return { name: 'cloud-outline', color: '#9DA6B4' }; // mist/fog/haze
  if (code === 800)              return isDay ? { name: 'sunny', color: '#E8A23D' } : { name: 'moon', color: '#8FA3C8' };
  if (code <= 802)               return isDay ? { name: 'partly-sunny', color: '#E8A23D' } : { name: 'cloudy-night', color: '#8FA3C8' };
  return { name: 'cloudy', color: '#9DA6B4' }; // 803–804 broken/overcast
}
