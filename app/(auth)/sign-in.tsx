import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Icon, Input, Text } from '@/components/ui';
import { useTheme } from '@/contexts/theme';
import { useStore } from '@/store/use-store';

export default function SignInScreen() {
  const { colors } = useTheme();
  const signIn = useStore((s) => s.signIn);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passwordRef = useRef<TextInput>(null);

  async function handleSignIn() {
    setError(null);
    if (!email.trim() || !password) {
      setError('이메일과 비밀번호를 입력해 주세요.');
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
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Icon name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
      </View>

      <View style={styles.content}>
        {/* Heading */}
        <View style={styles.heading}>
          <Text variant="headlineLg" weight="700">로그인</Text>
          <Text variant="bodyMd" color="onSurfaceVariant">
            이메일로 계속하기
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Input
            label="이메일"
            value={email}
            onChangeText={setEmail}
            placeholder="email@example.com"
            keyboardType="email-address"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <Input
            label="비밀번호"
            value={password}
            onChangeText={setPassword}
            placeholder="비밀번호를 입력하세요"
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleSignIn}
            inputRef={passwordRef}
            error={error}
          />
        </View>

        {/* Submit */}
        <Button label="로그인" onPress={handleSignIn} loading={loading} large />

        {/* Switch to sign up */}
        <Pressable onPress={() => router.replace('/(auth)/sign-up')} style={styles.switchLink}>
          <Text variant="bodyMd" color="onSurfaceVariant">
            계정이 없으신가요?{'  '}
            <Text variant="bodyMd" color="primary" weight="600">
              회원가입
            </Text>
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function translateError(msg: string): string {
  if (msg.includes('Invalid login credentials')) return '이메일 또는 비밀번호가 올바르지 않습니다.';
  if (msg.includes('Email not confirmed'))        return '이메일 인증이 필요합니다.';
  if (msg.includes('too many requests'))          return '잠시 후 다시 시도해 주세요.';
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
});
