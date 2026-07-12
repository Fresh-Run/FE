// 신체 정보 — SERVER-backed since S2 (BE ProfileUpdate carries birth_year/
// weight_kg/height_cm/gender; probed 2026-07-13: single-field PATCH, never-
// set = null, bounds 20~300/100~250/1920~2026). Server = source of truth,
// device = per-user cache (identity-store pattern: hydrate-then-correct,
// account-switch keyed). The kcal read path is unchanged and offline-safe:
// estimateKcal reads this cache synchronously.
//
// MIGRATION (one-shot, the feed-prefs precedent — device wins because it's
// the only value a human chose): the pre-S2 GLOBAL key '@fr_local_profile'
// is read once — if the server has no weight, the legacy values PATCH up;
// if both exist and differ, device wins once. Key deleted either way.
// Profile-less accounts (server 404 / first-creation nickname rule) skip
// the upload — onboarding creates the profile properly.
//
// kcal honesty rule survives: `saved` = a human-confirmed weight EXISTS
// (server weight_kg non-null, or a local save) — "—" until then.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { getMyProfile, updateProfile } from '@/lib/profile-api';
import { supabase } from '@/lib/supabase';

const LEGACY_KEY = '@fr_local_profile';
const cacheKey = (uid: string) => `@fr_body:${uid}`;

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

// ── server↔local field mapping ────────────────────────────────────────────────
const G_TO_KR: Record<string, Gender> = { female: '여성', male: '남성', undisclosed: '선택 안 함' };
const G_TO_EN: Record<Gender, 'female' | 'male' | 'undisclosed'> = { '여성': 'female', '남성': 'male', '선택 안 함': 'undisclosed' };

function toServer(f: LocalProfile) {
  return {
    birth_year: f.birthYear.length === 4 ? Number(f.birthYear) : null,
    weight_kg: f.weightKg,
    height_cm: f.heightCm,
    gender: G_TO_EN[f.gender],
  };
}

type LocalProfileStore = {
  fields: LocalProfile;
  hydrated: boolean;
  /** true only when a human-confirmed weight EXISTS (server or local save) —
      the kcal-honesty discriminator (never estimate off an untouched default) */
  saved: boolean;
  hydrate: (force?: boolean) => Promise<void>;
  /** PATCHes the server (source of truth) AND writes the cache. Throws on
      server failure — callers surface it (the value did NOT land). */
  save: (fields: LocalProfile) => Promise<void>;
};

let cacheUid: string | null = null;

function writeCache(fields: LocalProfile, saved: boolean) {
  if (!cacheUid) return;
  AsyncStorage.setItem(cacheKey(cacheUid), JSON.stringify({ fields, saved })).catch(() => {});
}

export const useLocalProfile = create<LocalProfileStore>((set, get) => ({
  fields: DEFAULTS,
  hydrated: false,
  saved: false,

  hydrate: async (force = false) => {
    if (get().hydrated && cacheUid && !force) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id ?? null;
      if (!uid) { set({ hydrated: true }); return; }
      if (cacheUid !== uid) set({ fields: DEFAULTS, saved: false }); // account switch drops state
      cacheUid = uid;

      // 1) first frame from this user's cache (offline-safe kcal)
      try {
        const raw = await AsyncStorage.getItem(cacheKey(uid));
        if (raw) {
          const c = JSON.parse(raw) as { fields: LocalProfile; saved: boolean };
          set({ fields: { ...DEFAULTS, ...c.fields }, saved: !!c.saved });
        }
      } catch { /* unreadable cache — defaults stand */ }

      // 2) server truth (+ the one-shot legacy migration)
      try {
        const p = await getMyProfile();
        let legacy: { fields?: LocalProfile } | null = null;
        try {
          const raw = await AsyncStorage.getItem(LEGACY_KEY);
          if (raw) legacy = { fields: { ...DEFAULTS, ...JSON.parse(raw) } };
        } catch { /* ignore */ }

        if (legacy?.fields && (p.weight_kg == null || legacy.fields.weightKg !== p.weight_kg)) {
          // device wins ONCE — the only human-chosen value
          await updateProfile(toServer(legacy.fields));
          set({ fields: legacy.fields, saved: true });
          writeCache(legacy.fields, true);
        } else if (p.weight_kg != null || p.height_cm != null || p.birth_year != null || p.gender != null) {
          const fields: LocalProfile = {
            birthYear: p.birth_year != null ? String(p.birth_year) : '',
            weightKg: p.weight_kg ?? DEFAULTS.weightKg,
            heightCm: p.height_cm ?? DEFAULTS.heightCm,
            gender: p.gender != null ? (G_TO_KR[p.gender] ?? '선택 안 함') : '선택 안 함',
          };
          const saved = p.weight_kg != null; // kcal honesty keys on weight
          set({ fields, saved });
          writeCache(fields, saved);
        }
        AsyncStorage.removeItem(LEGACY_KEY).catch(() => {});
      } catch {
        // profile-less (404) or offline: cache/defaults stand; the legacy key
        // survives for the next hydrate — never uploaded without a profile row
      }
    } finally {
      set({ hydrated: true });
    }
  },

  save: async (fields) => {
    await updateProfile(toServer(fields)); // server first — throws on failure
    set({ fields, saved: true });
    writeCache(fields, true);
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
