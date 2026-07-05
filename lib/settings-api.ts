// User settings — GET/PATCH /api/me/settings per docs/API_GUIDE.md §프로필.
// GET always returns the complete defaults-merged object; PATCH deep-merges
// only the keys sent (unknown keys → 422, profile-less user → 404).

import { apiFetch } from '@/lib/api';

export type RunSettings = {
  auto_pause: boolean;
  voice_cue: boolean;
  haptics: boolean;
  keep_screen_on: boolean;
};

export type AiCourseSettings = {
  terrain: 'flat' | 'mixed' | 'hill';
  default_distance_km: number;
  scenic: boolean;
  avoid_hills: boolean;
  prefer_loop: boolean;
  surface: 'any' | 'paved' | 'trail';
};

export type WeatherSettings = {
  avoid_dust: boolean;
  dust_level_pm10: number;
  avoid_heat: boolean;
  heat_temp_c: number;
  avoid_rain: boolean;
};

export type UserSettings = {
  run: RunSettings;
  units: 'km' | 'mi';
  theme: 'light' | 'dark';
  lang: 'ko' | 'en';
  ai_course: AiCourseSettings;
  weather: WeatherSettings;
};

export type SettingsPatch = {
  run?: Partial<RunSettings>;
  units?: UserSettings['units'];
  theme?: UserSettings['theme'];
  lang?: UserSettings['lang'];
  ai_course?: Partial<AiCourseSettings>;
  weather?: Partial<WeatherSettings>;
};

// Server defaults (guide §4 설정 기본값 표) — the pre-sync first frame.
export const DEFAULT_SETTINGS: UserSettings = {
  run: { auto_pause: true, voice_cue: true, haptics: true, keep_screen_on: false },
  units: 'km',
  theme: 'light',
  lang: 'ko',
  ai_course: {
    terrain: 'mixed',
    default_distance_km: 5.0,
    scenic: true,
    avoid_hills: false,
    prefer_loop: true,
    surface: 'any',
  },
  weather: {
    avoid_dust: true,
    dust_level_pm10: 80,
    avoid_heat: true,
    heat_temp_c: 28,
    avoid_rain: false,
  },
};

export function getSettings(): Promise<UserSettings> {
  return apiFetch<UserSettings>('/api/me/settings');
}

export function patchSettings(patch: SettingsPatch): Promise<UserSettings> {
  return apiFetch<UserSettings>('/api/me/settings', { method: 'PATCH', body: patch });
}
