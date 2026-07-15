/**
 * Apple 건강 연동 opt-in (③ Slice C) — DEVICE-LOCAL (AsyncStorage persist),
 * the use-audio-coach pattern. Deliberately NOT on PATCH /me/settings: the
 * server has no health field (지연-confirmed greenfield) and HealthKit
 * authorization is per-device by nature — a server flag would lie on the
 * user's other devices. `enabled` means "the user opted in AND the auth
 * sheet was presented"; iOS hides per-type write denial by design, so this
 * is honestly an opt-in record, not a grant record.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const KEY = '@fr_health_sync';

type Store = {
  enabled: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setEnabled: (v: boolean) => void;
};

export const useHealth = create<Store>((set, get) => ({
  enabled: false,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      set({ enabled: raw === '1', hydrated: true });
    } catch {
      set({ hydrated: true }); // default off stands
    }
  },

  setEnabled: (v: boolean) => {
    set({ enabled: v });
    AsyncStorage.setItem(KEY, v ? '1' : '0').catch(() => {});
  },
}));
