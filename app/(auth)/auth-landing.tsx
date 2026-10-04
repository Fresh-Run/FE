// Auth landing — the screen 시작하기 opens (owner ruling 2026-10-03: social
// login first-class). Stack order = the Apple HIG / 4.8 prominence slot:
//   ① Apple native button (full width, top)
//   ② Google slot — hidden while PENDING / BUILD_HAS_GOOGLE_SCHEME=false
//      (no dead control; googleConfigured's double gate, logic unchanged)
//   ③ 또는 divider (the auth-screens.jsx FrDivider grammar)
//   ④ 이메일로 계속하기 — secondary pill → the EXISTING email flow, untouched
// Kakao slot lands with its feature (build 14). Login/signup logic lives in
// the store + hooks/use-social-sign-in; this screen is layout + routing only.
import { GoogleSigninButton } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Icon, Text } from '@/components/ui';
import { useSocialSignIn } from '@/hooks/use-social-sign-in';
import { useTokens } from '@/hooks/use-tokens';
import { googleConfigured } from '@/lib/google-signin';
import { useT } from '@/lib/i18n';
import { useScheme } from '@/store/use-scheme';

export default function AuthLandingScreen() {
  const T = useT();
  const C = useTokens();
  const scheme = useScheme((s) => s.resolved);
  const [error, setError] = useState<string | null>(null);
  const { appleAvailable, handleAppleSignIn, handleGoogleSignIn } = useSocialSignIn(setError);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: C.bg }]} edges={['top', 'bottom']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Icon name="chevron-back" size={24} color={C.text} />
        </Pressable>
      </View>

      <View style={styles.content}>
        {/* Heading */}
        <View style={styles.heading}>
          <Text variant="headlineLg" weight="700">{T('wel.start')}</Text>
          <Text variant="bodyMd" color="sub">{T('wel.sub')}</Text>
        </View>

        <View style={styles.spacer} />

        <View style={styles.stack}>
          {/* ① Apple — native button (HIG), system-localized CONTINUE label.
              Hidden when unavailable (simulator / non-Apple device). */}
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

          {/* ② Google slot — RNGS brand button; hidden while PENDING. */}
          {googleConfigured && (
            <GoogleSigninButton
              size={GoogleSigninButton.Size.Wide}
              color={scheme === 'dark' ? GoogleSigninButton.Color.Light : GoogleSigninButton.Color.Dark}
              onPress={handleGoogleSignIn}
              style={styles.googleBtn}
            />
          )}

          {/* ③ 또는 — only when a social option is actually above it */}
          {(appleAvailable || googleConfigured) && (
            <View style={styles.divider}>
              <View style={[styles.hairline, { backgroundColor: C.border }]} />
              <Text variant="labelSm" color="faint">{T('auth.or')}</Text>
              <View style={[styles.hairline, { backgroundColor: C.border }]} />
            </View>
          )}

          {/* ④ Email — secondary pill → existing sign-up (the old welcome
              CTA's destination; its 로그인 switch link is unchanged). */}
          <Button
            label={T('auth.continueEmail')}
            variant="secondary"
            onPress={() => router.push('/(auth)/sign-up')}
            large
          />

          {error ? (
            <Text variant="labelSm" color="danger" center>{error}</Text>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:     { flex: 1 },
  topBar:   { paddingHorizontal: 12, paddingVertical: 8 },
  backBtn:  { padding: 4, alignSelf: 'flex-start' },
  content:  { flex: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  heading:  { gap: 6 },
  spacer:   { flex: 1 },
  stack:    { gap: 12 },
  // Pill grammar match: ui/Button large ≈ 56pt tall, borderRadius 9999 —
  // the native button can't take 9999, so cornerRadius = height/2.
  appleBtn:  { height: 56, alignSelf: 'stretch' },
  // GSB draws its own chrome — stretch + 56pt approximates the pill grammar.
  googleBtn: { height: 56, alignSelf: 'stretch' },
  divider:  { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 2 },
  hairline: { flex: 1, height: StyleSheet.hairlineWidth },
});
