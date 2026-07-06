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
  /** Optimistic units write; resolves false (and rolls back) on failure. */
  setUnits: (units: UserSettings['units']) => Promise<boolean>;
  /** Optimistic theme write; resolves false (and rolls back) on failure.
      T1: persist-only — rendering is the 다크 렌더링 sweep (TODO.md T2). */
  setTheme: (theme: UserSettings['theme']) => Promise<boolean>;
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
        set({ settings: server, synced: true });
        cache(server);
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
}));
