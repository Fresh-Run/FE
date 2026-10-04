// Social sign-in handlers (Apple + Google) — extracted VERBATIM from
// app/(auth)/sign-in.tsx on 2026-10-03 (auth-entry redesign, owner ruling
// 10/3): the new auth landing renders the same buttons first-class, and the
// login page keeps them as an alternative — ONE implementation for both.
// Nothing in the bodies changed; only the home moved (setError is injected
// by the caller so each screen owns its own error line).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useRef, useState } from 'react';

import { configureGoogleSignin } from '@/lib/google-signin';
import { t } from '@/lib/i18n';
import { useStore } from '@/store/use-store';

// Apple sends fullName/email ONLY on the very first authorization — cache
// them on arrival or they're gone (subsequent credentials carry null).
const APPLE_IDENTITY_KEY = '@fr_apple_identity';

export function useSocialSignIn(setError: (e: string | null) => void) {
  const signInWithApple = useStore((s) => s.signInWithApple);
  const signInWithGoogle = useStore((s) => s.signInWithGoogle);

  // Default false = hidden until the module says otherwise (simulator /
  // non-Apple device / Android: isAvailableAsync resolves false — no button).
  const [appleAvailable, setAppleAvailable] = useState(false);
  const appleBusy = useRef(false);
  const googleBusy = useRef(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
    configureGoogleSignin(); // no-op while client IDs are PENDING
  }, []);

  async function handleAppleSignIn() {
    if (appleBusy.current) return;
    appleBusy.current = true;
    setError(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      // First-authorization-only fields: persist when present, never
      // overwrite the cache with the nulls of later sign-ins.
      const given = credential.fullName?.givenName ?? null;
      const family = credential.fullName?.familyName ?? null;
      if (given || family || credential.email) {
        AsyncStorage.setItem(
          APPLE_IDENTITY_KEY,
          JSON.stringify({ givenName: given, familyName: family, email: credential.email }),
        ).catch(() => {});
      }
      if (!credential.identityToken) {
        setError(t('auth.appleFailed'));
        return;
      }
      const err = await signInWithApple(credential.identityToken);
      if (err) setError(t('auth.appleFailed'));
      // On success the auth guard in _layout.tsx redirects to (tabs) — the
      // exact same path the email flow rides (session → guard).
    } catch (e: unknown) {
      // User dismissed Apple's sheet — a choice, not an error.
      if ((e as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return;
      setError(t('auth.appleFailed'));
    } finally {
      appleBusy.current = false;
    }
  }

  async function handleGoogleSignIn() {
    if (googleBusy.current) return;
    googleBusy.current = true;
    setError(null);
    try {
      const response = await GoogleSignin.signIn();
      // RNGS v16: dismissal is a RESPONSE type, not a throw — a choice,
      // not an error (the Apple ERR_REQUEST_CANCELED twin).
      if (response.type === 'cancelled') return;
      const idToken = response.data.idToken;
      if (!idToken) {
        setError(t('auth.googleFailed'));
        return;
      }
      const err = await signInWithGoogle(idToken);
      if (err) setError(t('auth.googleFailed'));
      // On success the auth guard in _layout.tsx redirects to (tabs).
    } catch (e: unknown) {
      // Legacy-throw cancel path kept for belt (pre-v16 grammar).
      if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) return;
      setError(t('auth.googleFailed'));
    } finally {
      googleBusy.current = false;
    }
  }

  return { appleAvailable, handleAppleSignIn, handleGoogleSignIn };
}
