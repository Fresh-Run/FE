import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { t, useT } from '@/lib/i18n';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Icon, Input, Text } from '@/components/ui';
import { useTokens } from '@/hooks/use-tokens';
import { useScheme } from '@/store/use-scheme';
import { useStore } from '@/store/use-store';

// Apple sends fullName/email ONLY on the very first authorization — cache
// them on arrival or they're gone (subsequent credentials carry null).
const APPLE_IDENTITY_KEY = '@fr_apple_identity';

export default function SignInScreen() {
  const T = useT();
  const C = useTokens();
  const scheme = useScheme((s) => s.resolved);
  const signIn = useStore((s) => s.signIn);
  const signInWithApple = useStore((s) => s.signInWithApple);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Default false = hidden until the module says otherwise (simulator /
  // non-Apple device / Android: isAvailableAsync resolves false — no button).
  const [appleAvailable, setAppleAvailable] = useState(false);
  const appleBusy = useRef(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

  const passwordRef = useRef<TextInput>(null);

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

  async function handleSignIn() {
    setError(null);
    if (!email.trim() || !password) {
      setError(t('auth.enterBoth'));
      return;
    }
    setLoading(true);
    const err = await signIn(email.trim().toLowerCase(), password);
    setLoading(false);
    if (err) {
      setError(translateError(err));
    }
    // On success the auth guard in _layout.tsx redirects to (tabs) automatically.
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: C.bg }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Icon name="chevron-back" size={24} color={C.text} />
        </Pressable>
      </View>

      <View style={styles.content}>
        {/* Heading */}
        <View style={styles.heading}>
          <Text variant="headlineLg" weight="700">{T('auth.login')}</Text>
          <Text variant="bodyMd" color="sub">
            {T('auth.continueEmail')}
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Input
            label={T('auth.email')}
            value={email}
            onChangeText={setEmail}
            placeholder="email@example.com"
            keyboardType="email-address"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <Input
            label={T('auth.password')}
            value={password}
            onChangeText={setPassword}
            placeholder={T('auth.pwPlaceholder')}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleSignIn}
            inputRef={passwordRef}
            error={error}
          />
        </View>

        {/* Submit */}
        <Button label={T('auth.login')} onPress={handleSignIn} loading={loading} large />

        {/* Apple Sign In — native button required by Apple HIG; it draws its
            own system-localized label ("Apple로 계속하기" / "Continue with
            Apple" via buttonType CONTINUE). Hidden when unavailable. */}
        {appleAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={
              scheme === 'dark'
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={28}
            style={styles.appleBtn}
            onPress={handleAppleSignIn}
          />
        )}


        {/* Switch to sign up */}
        <Pressable onPress={() => router.replace('/(auth)/sign-up')} style={styles.switchLink}>
          <Text variant="bodyMd" color="sub">
            {T('auth.noAccount')}{'  '}
            <Text variant="bodyMd" color="accentGrn" weight="600">
              {T('auth.signup')}
            </Text>
          </Text>
        </Pressable>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function translateError(msg: string): string {
  if (msg.includes('Invalid login credentials')) return t('auth.badCreds');
  if (msg.includes('Email not confirmed'))        return t('auth.emailUnverified');
  if (msg.includes('too many requests'))          return t('auth.tryLater');
  return msg;
}

const styles = StyleSheet.create({
  root:      { flex: 1 },
  topBar:    { paddingHorizontal: 12, paddingVertical: 8 },
  backBtn:   { padding: 4, alignSelf: 'flex-start' },
  content:   { flex: 1, paddingHorizontal: 24, paddingTop: 16, gap: 24 },
  heading:   { gap: 6 },
  form:      { gap: 16 },
  switchLink:{ alignItems: 'center', paddingVertical: 8 },
  // Pill grammar match: ui/Button large ≈ 56pt tall, borderRadius 9999 —
  // the native button can't take 9999, so cornerRadius = height/2.
  appleBtn:  { height: 56, alignSelf: 'stretch' },
});
