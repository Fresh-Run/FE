import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Icon, Input, Text } from '@/components/ui';
import { md3 } from '@/lib/theme';
import { useStore } from '@/store/use-store';

export default function SignUpScreen() {
  const { colors } = md3;
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
    if (!email.trim()) { setError('이메일을 입력해 주세요.'); return; }
    if (password.length < 8) { setError('비밀번호는 8자 이상이어야 합니다.'); return; }
    if (password !== confirm)  { setError('비밀번호가 일치하지 않습니다.'); return; }

    setLoading(true);
    const err = await signUp(email.trim().toLowerCase(), password);
    setLoading(false);
    if (err) {
      setError(translateError(err));
      return;
    }
    // Navigate to onboarding regardless of whether the session exists yet.
    router.replace('/(auth)/onboarding-name');
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Icon name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
      </View>

      <View style={styles.content}>
        {/* Heading */}
        <View style={styles.heading}>
          <Text variant="headlineLg" weight="700">회원가입</Text>
          <Text variant="bodyMd" color="onSurfaceVariant">
            이메일로 계정 만들기
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
            placeholder="8자 이상"
            secureTextEntry
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            inputRef={passwordRef}
          />
          <Input
            label="비밀번호 확인"
            value={confirm}
            onChangeText={setConfirm}
            placeholder="비밀번호를 다시 입력하세요"
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleSignUp}
            inputRef={confirmRef}
            error={error}
          />
        </View>

        {/* Submit */}
        <Button label="회원가입" onPress={handleSignUp} loading={loading} large />

        {/* Switch to sign in */}
        <Pressable onPress={() => router.replace('/(auth)/sign-in')} style={styles.switchLink}>
          <Text variant="bodyMd" color="onSurfaceVariant">
            이미 계정이 있으신가요?{'  '}
            <Text variant="bodyMd" color="primary" weight="600">
              로그인
            </Text>
          </Text>
        </Pressable>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function translateError(msg: string): string {
  if (msg.includes('already registered') || msg.includes('already been registered')) return '이미 사용 중인 이메일입니다.';
  if (msg.includes('password'))           return '비밀번호가 너무 약합니다. 더 복잡하게 설정해 주세요.';
  if (msg.includes('invalid email'))      return '올바른 이메일 형식이 아닙니다.';
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
