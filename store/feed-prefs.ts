// Device-local feed preferences — 프로필 설정's 러닝 자동 게시 toggle.
//
// autoPost drives the DEFAULT visibility a new run-save draft opens with:
// ON → 전체 공개 (the current behavior, default), OFF → 비공개. It is a
// device-local default, not server state — the per-run 공개 범위 picker on
// the save screen always wins. Same cache pattern as use-local-profile.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { RunVisibility } from '@/lib/runs-api';

const CACHE_KEY = '@fr_feed_prefs';

type FeedPrefsStore = {
  autoPost: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setAutoPost: (v: boolean) => void;
};

export const useFeedPrefs = create<FeedPrefsStore>((set, get) => ({
  autoPost: true,
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw != null) set({ autoPost: JSON.parse(raw).autoPost !== false });
    } catch { /* defaults stand */ }
    set({ hydrated: true });
  },
  setAutoPost: (v: boolean) => {
    set({ autoPost: v });
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ autoPost: v })).catch(() => {});
  },
}));

/** Default visibility for a fresh run-save draft (read at pending-run reset). */
export function defaultRunVisibility(): RunVisibility {
  return useFeedPrefs.getState().autoPost ? 'public' : 'private';
}
