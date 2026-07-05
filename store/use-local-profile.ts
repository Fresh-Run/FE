// Device-local personal-info fields — 출생 연도 / 체중 / 키 / 성별.
//
// OWNER OVERRIDE (2026-07-06): these four fields exist in the design but not
// yet in the backend profile schema (asks forwarded to 지연). They persist in
// AsyncStorage only — same cache pattern as use-settings.
// TODO(S2): swap the storage target to PATCH /me/profile the day her
// birth_year / weight_kg / height_cm / gender fields land. The UI reads this
// store's shape and should not need to change.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const CACHE_KEY = '@fr_local_profile';

export type Gender = '여성' | '남성' | '선택 안 함';

export type LocalProfile = {
  birthYear: string; // '' or 4 digits
  weightKg: number;
  heightCm: number;
  gender: Gender;
};

const DEFAULTS: LocalProfile = {
  birthYear: '',
  weightKg: 60,
  heightCm: 170,
  gender: '선택 안 함',
};

type LocalProfileStore = {
  fields: LocalProfile;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  save: (fields: LocalProfile) => Promise<void>;
};

export const useLocalProfile = create<LocalProfileStore>((set, get) => ({
  fields: DEFAULTS,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) set({ fields: { ...DEFAULTS, ...JSON.parse(raw) } });
    } catch { /* unreadable cache — defaults stand */ }
    set({ hydrated: true });
  },

  save: async (fields) => {
    set({ fields });
    try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(fields)); } catch { /* best-effort */ }
  },
}));
