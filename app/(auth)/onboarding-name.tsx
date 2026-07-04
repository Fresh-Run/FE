import { router } from 'expo-router';
import React, { useState } from 'react';
import { Keyboard, StyleSheet, TouchableWithoutFeedback, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Icon, Input, Text } from '@/components/ui';
import { useTheme } from '@/contexts/theme';
import { useStore } from '@/store/use-store';

export default function OnboardingNameScreen() {
  const { colors } = useTheme();
  const setDisplayName = useStore((s) => s.setDisplayName);
  const session = useStore((s) => s.session);

  const emailPrefix = session?.user?.email?.split('@')[0] ?? '';
  const [name, setName] = useState(emailPrefix);
  const [error, setError] = useState<string | null>(null);

  function handleContinue() {
    const trimmed = name.trim();
    if (!trimmed) { setError('닉네임을 입력해 주세요.'); return; }
    if (trimmed.length < 2) { setError('닉네임은 2자 이상이어야 합니다.'); return; }
    if (trimmed.length > 20) { setError('닉네임은 20자 이하로 설정해 주세요.'); return; }
    setDisplayName(trimmed);
    router.replace('/(tabs)');
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView
        style={[styles.root, { backgroundColor: colors.background }]}
        edges={['top', 'bottom']}
      >
        <View style={styles.content}>
          {/* Icon */}
          <View style={[styles.iconCircle, { backgroundColor: colors.primaryContainer }]}>
            <Icon name="person" size={36} color={colors.onPrimaryContainer} />
          </View>

          {/* Heading */}
          <View style={styles.heading}>
            <Text variant="headlineLg" weight="700" center>
              환영합니다! 👋
            </Text>
            <Text variant="bodyMd" color="onSurfaceVariant" center>
              앱에서 사용할 닉네임을 설정해 주세요.{'\n'}나중에 언제든지 변경할 수 있습니다.
            </Text>
          </View>

          {/* Name input */}
          <Input
            label="닉네임"
            value={name}
            onChangeText={(v) => { setName(v); setError(null); }}
            placeholder="예: 달리는 춘식이"
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleContinue}
            error={error}
          />

          {/* Character count hint */}
          <Text variant="labelSm" color="onSurfaceVariant" style={styles.hint}>
            {name.trim().length} / 20자
          </Text>
        </View>

        {/* CTA pinned to bottom */}
        <View style={styles.footer}>
          <Button label="FreshRun 시작하기" onPress={handleContinue} large />
        </View>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1 },
  content:    { flex: 1, paddingHorizontal: 24, paddingTop: 48, gap: 24 },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading:  { gap: 10 },
  hint:     { textAlign: 'right' },
  footer:   { paddingHorizontal: 24, paddingBottom: 16 },
});
