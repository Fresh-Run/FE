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
  /** true only when the user has SAVED the personal-info form at least once —
      the discriminator between a user-confirmed weight and the untouched
      default (never guess kcal off a default weight — owner rule 2026-07-11) */
  saved: boolean;
  hydrate: () => Promise<void>;
  save: (fields: LocalProfile) => Promise<void>;
};

export const useLocalProfile = create<LocalProfileStore>((set, get) => ({
  fields: DEFAULTS,
  hydrated: false,
  saved: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) set({ fields: { ...DEFAULTS, ...JSON.parse(raw) }, saved: true });
    } catch { /* unreadable cache — defaults stand */ }
    set({ hydrated: true });
  },

  save: async (fields) => {
    set({ fields, saved: true });
    try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(fields)); } catch { /* best-effort */ }
  },
}));

// ─── kcal model (debt batch 2, owner ruling: MET×weight EVERYWHERE) ──────────
// Single source: ~1.036 kcal per kg per km (flat-terrain running MET
// approximation — the 활동 상세 model, now app-wide; the flat 62/km died).
export const KCAL_PER_KG_KM = 1.036;

/** MET×weight estimate; null when no user-confirmed weight exists (saved
    flag) — surfaces render "—"/hint, never a fabricated number. */
export function estimateKcal(distanceKm: number): number | null {
  const s = useLocalProfile.getState();
  if (!s.saved || !(s.fields.weightKg > 0)) return null;
  return Math.round(KCAL_PER_KG_KM * s.fields.weightKg * distanceKm);
}
