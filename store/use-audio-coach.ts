/**
 * 오디오 코치 detail settings — DEVICE-LOCAL (AsyncStorage persist).
 * Deliberately NOT on PATCH /me/settings: her UserSettings schema has no
 * audio_coach group, and unknown keys don't ride guarded PATCHes (지연 ask
 * ledgered — migrate when she adds the group). The MASTER switch is the
 * existing server-persisted settings.run.voice_cue (finally live).
 * Canvas FrAudioCoach defaults: 거리·페이스 on, 칼로리 off.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const KEY = '@fr_audio_coach';

export type AudioCoachSettings = {
  intervalKm: number; // 안내 간격 0.5–3 (canvas slider)
  rate: number;       // 말하기 속도 0.6–1.6 (expo-speech rate)
  items: { dist: boolean; pace: boolean; kcal: boolean };
};

const DEFAULTS: AudioCoachSettings = {
  intervalKm: 1,
  rate: 1.0,
  items: { dist: true, pace: true, kcal: false },
};

type Store = AudioCoachSettings & {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  set: (patch: Partial<AudioCoachSettings>) => void;
  setItem: (k: keyof AudioCoachSettings['items'], v: boolean) => void;
};

export const useAudioCoach = create<Store>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) {
        const c = JSON.parse(raw) as Partial<AudioCoachSettings>;
        set({ ...DEFAULTS, ...c, items: { ...DEFAULTS.items, ...(c.items ?? {}) } });
      }
    } catch { /* defaults stand */ }
    set({ hydrated: true });
  },

  set: (patch) => {
    set(patch);
    const { intervalKm, rate, items } = { ...get(), ...patch };
    AsyncStorage.setItem(KEY, JSON.stringify({ intervalKm, rate, items })).catch(() => {});
  },

  setItem: (k, v) => {
    const items = { ...get().items, [k]: v };
    get().set({ items });
  },
}));
