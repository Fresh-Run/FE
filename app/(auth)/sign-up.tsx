import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import { t, useT } from '@/lib/i18n';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Icon, Input, Text } from '@/components/ui';
import { useTokens } from '@/hooks/use-tokens';
import { useStore } from '@/store/use-store';

export default function SignUpScreen() {
  const T = useT();
  const C = useTokens();
  const signUp = useStore((s) => s.signUp);

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  const passwordRef = useRef<TextInput>(null);
  const confirmRef  = useRef<TextInput>(null);

  async function handleSignUp() {
    setError(null);
    if (!email.trim()) { setError(t('auth.enterEmail')); return; }
    if (password.length < 8) { setError(t('auth.pwMin')); return; }
    if (password !== confirm)  { setError(t('auth.pwMismatch')); return; }

    setLoading(true);
    const err = await signUp(email.trim().toLowerCase(), password);
    setLoading(false);
    if (err) {
      setError(translateError(err));
      return;
    }
    // Confirm-email ON: no session until the mail link is tapped — park on
    // the verify screen (sign-in after confirming re-enters normally).
    // Confirm-email OFF (pre-flip): session exists → the original path.
    if (!useStore.getState().session) {
      router.replace({
        pathname: '/(auth)/verify-email',
        params: { email: email.trim().toLowerCase(), reason: 'signup' },
      } as never);
      return;
    }
    router.replace('/(auth)/onboarding-name');
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
          <Text variant="headlineLg" weight="700">{T('auth.signup')}</Text>
          <Text variant="bodyMd" color="sub">
            {T('auth.createEmail')}
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
            placeholder={T('auth.pwHint')}
            secureTextEntry
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            inputRef={passwordRef}
          />
          <Input
            label={T('auth.pwConfirm')}
            value={confirm}
            onChangeText={setConfirm}
            placeholder={T('auth.pwConfirmPlaceholder')}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleSignUp}
            inputRef={confirmRef}
            error={error}
          />
        </View>

        {/* Submit */}
        <Button label={T('auth.signup')} onPress={handleSignUp} loading={loading} large />

        {/* Switch to sign in */}
        <Pressable onPress={() => router.replace('/(auth)/sign-in')} style={styles.switchLink}>
          <Text variant="bodyMd" color="sub">
            {T('auth.hasAccount')}{'  '}
            <Text variant="bodyMd" color="accentGrn" weight="600">
              {T('auth.login')}
            </Text>
          </Text>
        </Pressable>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Store returns the GoTrue error CODE when present (message fallback) —
// branches match both.
function translateError(msg: string): string {
  if (msg === 'user_already_exists' || msg === 'email_exists'
    || msg.includes('already registered') || msg.includes('already been registered')) return t('auth.emailTaken');
  if (msg === 'weak_password'     || msg.includes('password'))      return t('auth.pwWeak');
  if (msg === 'validation_failed' || msg.includes('invalid email')) return t('auth.emailInvalid');
  return msg;
}

const styles = StyleSheet.create({
  root:       { flex: 1 },
  topBar:     { paddingHorizontal: 12, paddingVertical: 8 },
  backBtn:    { padding: 4, alignSelf: 'flex-start' },
  content:    { flex: 1, paddingHorizontal: 24, paddingTop: 16, gap: 24 },
  heading:    { gap: 6 },
  form:       { gap: 16 },
  switchLink: { alignItems: 'center', paddingVertical: 8 },
});
