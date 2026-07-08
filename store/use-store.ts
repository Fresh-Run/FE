import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { apiFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useQuota } from '@/store/use-quota';
import { useSettings } from '@/store/use-settings';

// Per-user key (2026-07-09): the old global '@fr_display_name' let one
// account's name bleed into the next after a switch — the home-greeting
// "러너"/wrong-name bug. Server truth now backfills on every hydrate/login.
const nameKey = (uid: string) => `@fr_display_name:${uid}`;
const LEGACY_NAME_KEY = '@fr_display_name';

type Store = {
  // ─── Auth ────────────────────────────────────────────────────────────────
  session: Session | null;
  sessionLoading: boolean;
  displayName: string | null;

  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  setDisplayName: (name: string) => void;
  /** Cache-first + GET /me/profile server truth for the greeting name. */
  _syncDisplayName: (uid: string) => Promise<void>;
  hydrate: () => Promise<void>;

  // DEV-only: bypass auth without a real Supabase session
  _devBypassAuth: () => void;
  _devSignOut: () => void;
  _hydrated: boolean;
};

export const useStore = create<Store>((set, get) => ({
  // ─── State ───────────────────────────────────────────────────────────────
  session: null,
  sessionLoading: true,
  displayName: null,
  _hydrated: false,

  // ─── Auth actions ────────────────────────────────────────────────────────
  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return error.message;
    set({ session: data.session });
    return null;
  },

  signUp: async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return error.message;
    // If email confirmation is disabled in Supabase dashboard, session is set immediately.
    if (data.session) set({ session: data.session });
    return null;
  },

  signOut: async () => {
    await supabase.auth.signOut();
    // Per-user name caches persist (instant paint on the next sign-in of
    // the same account); only the in-memory value clears.
    set({ session: null, displayName: null });
  },

  setDisplayName: (name) => {
    set({ displayName: name });
    const uid = get().session?.user.id;
    if (uid) AsyncStorage.setItem(nameKey(uid), name).catch(() => {});
  },

  // Cache-first + server-truth: the per-user cached name paints instantly,
  // then GET /me/profile corrects it (fire-and-forget, silent on failure —
  // a null displayName is the skeleton case, never a wrong name).
  _syncDisplayName: async (uid: string) => {
    try {
      const cached = await AsyncStorage.getItem(nameKey(uid));
      if (cached && get().session?.user.id === uid) set({ displayName: cached });
    } catch { /* unreadable cache — server fetch below still runs */ }
    try {
      // p can be null for profile-less accounts (e.g. fresh sign-in that
      // never completed onboarding — probed live on testrun 2026-07-09)
      const p = await apiFetch<{ nickname: string | null } | null>('/api/me/profile');
      if (get().session?.user.id !== uid) return; // account switched mid-flight
      if (p?.nickname) {
        set({ displayName: p.nickname });
        AsyncStorage.setItem(nameKey(uid), p.nickname).catch(() => {});
      }
    } catch { /* offline/404 — cached value (or skeleton null) stands */ }
  },

  hydrate: async () => {
    if (get()._hydrated) return;
    set({ _hydrated: true });
    AsyncStorage.removeItem(LEGACY_NAME_KEY).catch(() => {}); // bleed source, retired

    try {
      const { data } = await supabase.auth.getSession();
      set({ session: data.session, sessionLoading: false });
      if (data.session) get()._syncDisplayName(data.session.user.id);
    } catch {
      set({ session: null, sessionLoading: false });
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      // Identity-stable rule: on an ACCOUNT CHANGE the previous name drops
      // before the new sync lands (null → skeleton, never a wrong name).
      // Same-user events (TOKEN_REFRESHED etc.) keep the name — no flicker.
      const accountChanged = session?.user.id !== get().session?.user.id;
      set({ session, ...(accountChanged ? { displayName: null } : {}) });
      // Login/account-switch must always refetch per-user server state;
      // sign-out must drop it (no tier/settings bleed across accounts).
      if (session) {
        if (accountChanged) get()._syncDisplayName(session.user.id);
        useQuota.getState().hydrate(true);
        useSettings.getState().hydrate(true);
      } else {
        useQuota.getState().reset();
        useSettings.getState().reset();
      }
    });
  },

  // ─── Dev helpers (stripped by tree-shaking in production) ────────────────
  _devBypassAuth: () => {
    const mockSession = {
      access_token: 'dev_mock_access_token',
      refresh_token: 'dev_mock_refresh_token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: 'dev-user-00000000',
        email: 'dev@freshrun.app',
        role: 'authenticated',
        aud: 'authenticated',
        created_at: new Date().toISOString(),
        app_metadata: {},
        user_metadata: {},
      },
    } as unknown as Session;
    set({ session: mockSession, displayName: 'Dev Runner', sessionLoading: false });
  },

  _devSignOut: () => {
    set({ session: null, displayName: null });
  },
}));
