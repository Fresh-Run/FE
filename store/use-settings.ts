// Settings store — the guide's prescribed pattern (§4 theme/lang 구현 힌트):
// first frame from the AsyncStorage cache, then server truth via GET on
// hydrate; writes are optimistic PATCHes with rollback on failure.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { ApiError } from '@/lib/api';
import {
  DEFAULT_SETTINGS,
  getSettings,
  patchSettings,
  type AiCourseSettings,
  type AudioCoachSettings,
  type FeedSettings,
  type NotifSettings,
  type RunSettings,
  type UserSettings,
} from '@/lib/settings-api';
import { supabase } from '@/lib/supabase';

// Per-user cache key — settings must not bleed across account switches.
const cacheKey = (uid: string) => `@fr_settings:${uid}`;

let cacheUid: string | null = null;

function cache(settings: UserSettings) {
  if (!cacheUid) return;
  AsyncStorage.setItem(cacheKey(cacheUid), JSON.stringify(settings)).catch(() => {});
}

type SettingsStore = {
  settings: UserSettings;
  /** true once a server GET has succeeded this session */
  synced: boolean;
  /** Cache-then-server load. Idempotent per session; safe to call from any
      screen that needs settings. Never throws. force=true re-fetches even
      when synced (auth change). */
  hydrate: (force?: boolean) => Promise<void>;
  /** Reset to defaults (sign-out / account switch). */
  reset: () => void;
  /** Optimistic toggle write; resolves false (and rolls back) on failure. */
  setRunSetting: (key: keyof RunSettings, value: boolean) => Promise<boolean>;
  /** Optimistic feed-settings write (v1.5) — same contract as setRunSetting. */
  setFeedSetting: (key: keyof FeedSettings, value: boolean) => Promise<boolean>;
  /** Optimistic push-notif toggle write — same contract as setRunSetting. */
  setNotifSetting: (key: keyof NotifSettings, value: boolean) => Promise<boolean>;
  /** Optimistic units write; resolves false (and rolls back) on failure. */
  setUnits: (units: UserSettings['units']) => Promise<boolean>;
  /** Optimistic theme write; resolves false (and rolls back) on failure.
      T1: persist-only — rendering is the 다크 렌더링 sweep (TODO.md T2). */
  setTheme: (theme: UserSettings['theme']) => Promise<boolean>;
  /** Optimistic lang write; persist-only — runtime i18n is a later item. */
  setLang: (lang: UserSettings['lang']) => Promise<boolean>;
  /** Optimistic ai_course partial write; resolves false (and rolls back) on
      failure. Consumed server-side by POST /routes/generate when the request
      body omits a field (guide: body > 내 설정 > 서버 기본값). */
  setAiCourse: (patch: Partial<AiCourseSettings>) => Promise<boolean>;
  /** Optimistic audio_coach partial write (server-migration slice
      2026-07-23) — same contract as setAiCourse. */
  setAudioCoach: (patch: Partial<AudioCoachSettings>) => Promise<boolean>;
};

let hydrating = false;

export const useSettings = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  synced: false,

  hydrate: async (force = false) => {
    if (hydrating || (get().synced && !force)) return;
    hydrating = true;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      cacheUid = session?.user.id ?? null;
      if (!cacheUid) return; // signed out — defaults stand

      // 1) First frame from this user's cache (works offline)
      try {
        const raw = await AsyncStorage.getItem(cacheKey(cacheUid));
        if (raw) set({ settings: { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } });
      } catch { /* unreadable cache — defaults stand */ }

      // 2) Server truth
      try {
        const server = await getSettings();
        // ONE-SHOT feed-prefs migration (v1.5): the legacy device-local
        // autoPost pref moves to settings.feed.auto_publish. DEVICE WINS —
        // the server value is a backfill default nobody chose; the device
        // pref was an explicit choice in our UI. Key deleted either way.
        let merged = server;
        try {
          const legacyRaw = await AsyncStorage.getItem('@fr_feed_prefs');
          if (legacyRaw != null) {
            const legacyAutoPost = JSON.parse(legacyRaw).autoPost !== false;
            if (legacyAutoPost !== server.feed.auto_publish) {
              merged = await patchSettings({ feed: { auto_publish: legacyAutoPost } });
            }
            AsyncStorage.removeItem('@fr_feed_prefs').catch(() => {});
          }
        } catch { /* unreadable legacy — server stands */ }
        // ONE-SHOT audio-coach migration (server group landed; probed live
        // 2026-07-23). SEED DIRECTION, owner-ruled: the DEVICE's lived
        // values migrate UP on first sync — they were explicit choices
        // (the owner's 0.5 / 지연's 1.5, the twin detents); the server's
        // inert seeds never stomp them. Only differing fields ride the
        // PATCH; the key is deleted only after success (failure → the
        // whole block retries next hydrate, the feed-prefs precedent).
        try {
          const legacyRaw = await AsyncStorage.getItem('@fr_audio_coach');
          if (legacyRaw != null) {
            const c = JSON.parse(legacyRaw) as {
              intervalKm?: number; rate?: number;
              items?: { dist?: boolean; pace?: boolean; kcal?: boolean };
            };
            const up: Partial<AudioCoachSettings> = {};
            if (typeof c.intervalKm === 'number' && c.intervalKm !== merged.audio_coach.cue_interval_km) up.cue_interval_km = c.intervalKm;
            if (typeof c.rate === 'number' && c.rate !== merged.audio_coach.rate) up.rate = c.rate;
            if (typeof c.items?.dist === 'boolean' && c.items.dist !== merged.audio_coach.announce_distance) up.announce_distance = c.items.dist;
            if (typeof c.items?.pace === 'boolean' && c.items.pace !== merged.audio_coach.announce_pace) up.announce_pace = c.items.pace;
            if (typeof c.items?.kcal === 'boolean' && c.items.kcal !== merged.audio_coach.announce_calories) up.announce_calories = c.items.kcal;
            if (Object.keys(up).length > 0) merged = await patchSettings({ audio_coach: up });
            AsyncStorage.removeItem('@fr_audio_coach').catch(() => {});
          }
        } catch { /* unreadable legacy or PATCH failure — retry next hydrate */ }
        set({ settings: merged, synced: true });
        cache(merged);
      } catch (e) {
        // Profile-less 404: server would return defaults on profile creation
        // anyway — treat current (defaults/cache) as good, don't crash.
        // 401/offline: keep cache/defaults; next hydrate() retries.
        if (e instanceof ApiError && e.status === 404) set({ synced: true });
      }
    } finally {
      hydrating = false;
    }
  },

  reset: () => {
    cacheUid = null;
    set({ settings: DEFAULT_SETTINGS, synced: false });
  },

  setRunSetting: async (key, value) => {
    const prev = get().settings;
    const next = { ...prev, run: { ...prev.run, [key]: value } };
    set({ settings: next }); // optimistic
    cache(next);
    try {
      const server = await patchSettings({ run: { [key]: value } });
      set({ settings: server, synced: true });
      cache(server);
      return true;
    } catch {
      set({ settings: prev }); // rollback
      cache(prev);
      return false;
    }
  },

  setFeedSetting: async (key, value) => {
    const prev = get().settings;
    const next = { ...prev, feed: { ...prev.feed, [key]: value } };
    set({ settings: next }); // optimistic
    cache(next);
    try {
      const server = await patchSettings({ feed: { [key]: value } });
      set({ settings: server, synced: true });
      cache(server);
      return true;
    } catch {
      set({ settings: prev }); // rollback
      cache(prev);
      return false;
    }
  },

  setNotifSetting: async (key, value) => {
    const prev = get().settings;
    const next = { ...prev, notif: { ...prev.notif, [key]: value } };
    set({ settings: next }); // optimistic
    cache(next);
    try {
      const server = await patchSettings({ notif: { [key]: value } });
      set({ settings: server, synced: true });
      cache(server);
      return true;
    } catch {
      set({ settings: prev }); // rollback
      cache(prev);
      return false;
    }
  },

  setUnits: async (units) => {
    const prev = get().settings;
    const next = { ...prev, units };
    set({ settings: next }); // optimistic
    cache(next);
    try {
      const server = await patchSettings({ units });
      set({ settings: server, synced: true });
      cache(server);
      return true;
    } catch {
      set({ settings: prev }); // rollback
      cache(prev);
      return false;
    }
  },

  setTheme: async (theme) => {
    const prev = get().settings;
    const next = { ...prev, theme };
    set({ settings: next }); // optimistic
    cache(next);
    try {
      const server = await patchSettings({ theme });
      set({ settings: server, synced: true });
      cache(server);
      return true;
    } catch {
      set({ settings: prev }); // rollback
      cache(prev);
      return false;
    }
  },

  setLang: async (lang) => {
    const prev = get().settings;
    const next = { ...prev, lang };
    set({ settings: next }); // optimistic
    cache(next);
    try {
      const server = await patchSettings({ lang });
      set({ settings: server, synced: true });
      cache(server);
      return true;
    } catch {
      set({ settings: prev }); // rollback
      cache(prev);
      return false;
    }
  },

  setAiCourse: async (patch) => {
    const prev = get().settings;
    const next = { ...prev, ai_course: { ...prev.ai_course, ...patch } };
    set({ settings: next }); // optimistic
    cache(next);
    try {
      const server = await patchSettings({ ai_course: patch });
      set({ settings: server, synced: true });
      cache(server);
      return true;
    } catch {
      set({ settings: prev }); // rollback
      cache(prev);
      return false;
    }
  },

  setAudioCoach: async (patch) => {
    const prev = get().settings;
    const next = { ...prev, audio_coach: { ...prev.audio_coach, ...patch } };
    set({ settings: next }); // optimistic
    cache(next);
    try {
      const server = await patchSettings({ audio_coach: patch });
      set({ settings: server, synced: true });
      cache(server);
      return true;
    } catch {
      set({ settings: prev }); // rollback
      cache(prev);
      return false;
    }
  },
}));
