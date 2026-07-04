import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '@/lib/supabase';

const DISPLAY_NAME_KEY = '@fr_display_name';

type Store = {
  // ─── Auth ────────────────────────────────────────────────────────────────
  session: Session | null;
  sessionLoading: boolean;
  displayName: string | null;

  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  setDisplayName: (name: string) => void;
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
    await AsyncStorage.removeItem(DISPLAY_NAME_KEY);
    set({ session: null, displayName: null });
  },

  setDisplayName: (name) => {
    set({ displayName: name });
    AsyncStorage.setItem(DISPLAY_NAME_KEY, name).catch(() => {});
  },

  hydrate: async () => {
    if (get()._hydrated) return;
    set({ _hydrated: true });

    try {
      const [{ data }, storedName] = await Promise.all([
        supabase.auth.getSession(),
        AsyncStorage.getItem(DISPLAY_NAME_KEY).catch(() => null),
      ]);
      set({ session: data.session, displayName: storedName, sessionLoading: false });
    } catch {
      set({ session: null, sessionLoading: false });
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session });
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
