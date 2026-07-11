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
const nameKey  = (uid: string) => `@fr_display_name:${uid}`;
const photoKey = (uid: string) => `@fr_photo_url:${uid}`;
const LEGACY_NAME_KEY = '@fr_display_name';

type Store = {
  // ─── Auth ────────────────────────────────────────────────────────────────
  session: Session | null;
  sessionLoading: boolean;
  displayName: string | null;
  /** Own avatar photo (public URL, ?v= cache-busted). Same identity-stable
      semantics as displayName: per-user cached for instant paint, server
      truth corrects on every sync, drops to null on account change — the
      correct photo or initials, never someone else's photo. Renderers must
      fall back to initials on Image error (deleted/stale storage object). */
  photoUrl: string | null;
  /** Onboarding gate (plan A): true = /me/profile resolved null (fresh
      signup OR legacy profile-less account) → _layout routes to 회원정보.
      null = unknown/offline (fail-open — never lock users out on network
      errors). Flips false on profile fetch success or creation. */
  profileMissing: boolean | null;
  markProfileCreated: () => void;

  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  setDisplayName: (name: string) => void;
  setPhotoUrl: (url: string | null) => void;
  /** Cache-first + GET /me/profile server truth for the greeting name + avatar. */
  _syncIdentity: (uid: string) => Promise<void>;
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
  photoUrl: null,
  profileMissing: null,
  _hydrated: false,

  markProfileCreated: () => set({ profileMissing: false }),

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
    // Per-user name/photo caches persist (instant paint on the next sign-in
    // of the same account); only the in-memory values clear.
    set({ session: null, displayName: null, photoUrl: null });
  },

  setDisplayName: (name) => {
    set({ displayName: name });
    const uid = get().session?.user.id;
    if (uid) AsyncStorage.setItem(nameKey(uid), name).catch(() => {});
  },

  setPhotoUrl: (url) => {
    set({ photoUrl: url });
    const uid = get().session?.user.id;
    if (!uid) return;
    if (url) AsyncStorage.setItem(photoKey(uid), url).catch(() => {});
    else AsyncStorage.removeItem(photoKey(uid)).catch(() => {});
  },

  // Cache-first + server-truth: the per-user cached name/photo paint
  // instantly, then GET /me/profile corrects both (fire-and-forget, silent
  // on failure — null is the skeleton case, never a wrong identity).
  _syncIdentity: async (uid: string) => {
    try {
      const [cachedName, cachedPhoto] = await Promise.all([
        AsyncStorage.getItem(nameKey(uid)),
        AsyncStorage.getItem(photoKey(uid)),
      ]);
      if (get().session?.user.id === uid) {
        set({
          ...(cachedName ? { displayName: cachedName } : {}),
          ...(cachedPhoto ? { photoUrl: cachedPhoto } : {}),
        });
      }
    } catch { /* unreadable cache — server fetch below still runs */ }
    try {
      // p can be null for profile-less accounts (e.g. fresh sign-in that
      // never completed onboarding — probed live on testrun 2026-07-09)
      const p = await apiFetch<{ nickname: string | null; avatar_url: string | null } | null>('/api/me/profile');
      if (get().session?.user.id !== uid) return; // account switched mid-flight
      // Onboarding gate signal (plan A): null profile = the 회원정보 gate
      // fires; a real profile clears it. Errors leave it null (fail-open).
      set({ profileMissing: p === null });
      if (p?.nickname) {
        set({ displayName: p.nickname });
        AsyncStorage.setItem(nameKey(uid), p.nickname).catch(() => {});
      }
      // Photo: server truth INCLUDING removal — a null avatar_url on a real
      // profile clears the cached URL (photo deleted / stale cache).
      if (p) {
        set({ photoUrl: p.avatar_url });
        if (p.avatar_url) AsyncStorage.setItem(photoKey(uid), p.avatar_url).catch(() => {});
        else AsyncStorage.removeItem(photoKey(uid)).catch(() => {});
      }
    } catch { /* offline/404 — cached values (or skeleton null) stand */ }
  },

  hydrate: async () => {
    if (get()._hydrated) return;
    set({ _hydrated: true });
    AsyncStorage.removeItem(LEGACY_NAME_KEY).catch(() => {}); // bleed source, retired

    try {
      const { data } = await supabase.auth.getSession();
      set({ session: data.session, sessionLoading: false });
      if (data.session) get()._syncIdentity(data.session.user.id);
    } catch {
      set({ session: null, sessionLoading: false });
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      // Identity-stable rule: on an ACCOUNT CHANGE the previous name AND
      // photo drop before the new sync lands (null → skeleton/initials,
      // never a wrong identity). Same-user events (TOKEN_REFRESHED etc.)
      // keep both — no flicker.
      const accountChanged = session?.user.id !== get().session?.user.id;
      set({
        session,
        ...(accountChanged ? { displayName: null, photoUrl: null, profileMissing: null } : {}),
        ...(!session ? { profileMissing: null } : {}),
      });
      // Login/account-switch must always refetch per-user server state;
      // sign-out must drop it (no tier/settings bleed across accounts).
      if (session) {
        if (accountChanged) get()._syncIdentity(session.user.id);
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
    set({ session: null, displayName: null, photoUrl: null });
  },
}));
