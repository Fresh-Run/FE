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

// 푸시 알림 설정 (BE ff58041, guide §284-299, probed live 2026-07-13):
// 12 keys camelCase; PUSH-ONLY gate — in-app GET /notifications is always
// generated regardless (probe: notif.likes OFF, kudos → row still lands).
// runReminder/weekly/pb/marketing store but have NO sender yet (her note);
// push delivery itself starts with the native build (push tokens).
export type NotifSettings = {
  master: boolean;
  crewChallenge: boolean;
  crewNotice: boolean;
  crewChat: boolean;
  crewJoin: boolean;
  likes: boolean;
  comments: boolean;
  followers: boolean;
  runReminder: boolean;
  weekly: boolean;
  pb: boolean;
  marketing: boolean;
};

// v1.5 피드 설정 (BE 8aedc9c, probed live 2026-07-13): allow_* OFF → others'
// kudos/comments 403 {likes_disabled|comments_disabled}; auto_publish is
// client-advisory (drives the run-save draft's default visibility).
export type FeedSettings = {
  auto_publish: boolean;
  allow_likes: boolean;
  allow_comments: boolean;
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
  feed: FeedSettings;
  notif: NotifSettings;
};

export type SettingsPatch = {
  run?: Partial<RunSettings>;
  units?: UserSettings['units'];
  theme?: UserSettings['theme'];
  lang?: UserSettings['lang'];
  ai_course?: Partial<AiCourseSettings>;
  weather?: Partial<WeatherSettings>;
  feed?: Partial<FeedSettings>;
  notif?: Partial<NotifSettings>;
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
  feed: { auto_publish: true, allow_likes: true, allow_comments: true },
  notif: {
    master: true, crewChallenge: true, crewNotice: true, crewChat: true,
    crewJoin: true, likes: true, comments: true, followers: true,
    runReminder: true, weekly: true, pb: true, marketing: false,
  },
};

export function getSettings(): Promise<UserSettings> {
  return apiFetch<UserSettings>('/api/me/settings');
}

export function patchSettings(patch: SettingsPatch): Promise<UserSettings> {
  return apiFetch<UserSettings>('/api/me/settings', { method: 'PATCH', body: patch });
}
