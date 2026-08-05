// Tier/quota store — cache-then-server pattern: per-user AsyncStorage first
// frame, server truth on hydrate. A failed sync NEVER silently downgrades:
// last-known/cached tier is held, syncError is set (+ console.warn), and
// recovery paths (pull-to-refresh, auth change) re-hydrate with force.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { t } from '@/lib/i18n';
import { getQuota, type AiGenerationQuota } from '@/lib/quota-api';
import { supabase } from '@/lib/supabase';

const DEFAULT_QUOTA: AiGenerationQuota = {
  used: 0, limit: 3, remaining: 3, reset_at: null, unlimited: false,
};

// Cache is keyed by user id — a previous account's tier must never bleed
// into the next session on this device.
const cacheKey = (uid: string) => `@fr_quota:${uid}`;

type QuotaStore = {
  tier: string;
  isPremium: boolean;
  aiGeneration: AiGenerationQuota;
  /** true once a server GET has succeeded for the current user this session */
  synced: boolean;
  /** last hydrate failure (message) — null when healthy; never silently free */
  syncError: string | null;
  /** Cache-then-server load. Idempotent per session; never throws.
      force=true re-fetches even when already synced (refresh, auth change). */
  hydrate: (force?: boolean) => Promise<void>;
  /** Reset to defaults (sign-out / account switch). */
  reset: () => void;
};

let hydrating = false;

export const useQuota = create<QuotaStore>((set, get) => ({
  tier: 'free',
  isPremium: false,
  aiGeneration: DEFAULT_QUOTA,
  synced: false,
  syncError: null,

  hydrate: async (force = false) => {
    if (hydrating || (get().synced && !force)) return;
    hydrating = true;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id;
      if (!uid) return; // signed out — defaults stand, no error

      // 1) First frame from this user's cache (works offline)
      try {
        const raw = await AsyncStorage.getItem(cacheKey(uid));
        if (raw) {
          const c = JSON.parse(raw);
          set({ tier: c.tier ?? 'free', isPremium: c.tier === 'premium', aiGeneration: c.ai_generation ?? DEFAULT_QUOTA });
        }
      } catch { /* unreadable cache — current state stands */ }

      // 2) Server truth
      try {
        const server = await getQuota();
        set({
          tier: server.tier,
          isPremium: server.tier === 'premium',
          aiGeneration: server.ai_generation,
          synced: true,
          syncError: null,
        });
        AsyncStorage.setItem(cacheKey(uid), JSON.stringify(server)).catch(() => {});
      } catch (e) {
        const msg = e instanceof Error ? e.message : t('err.tierLoad');
        // Visible, never silent: keep last-known/cached tier, record the failure.
        console.warn(`[quota] sync FAILED — holding last-known tier '${get().tier}': ${msg}`);
        set({ syncError: msg });
      }
    } finally {
      hydrating = false;
    }
  },

  reset: () => {
    set({ tier: 'free', isPremium: false, aiGeneration: DEFAULT_QUOTA, synced: false, syncError: null });
  },
}));
