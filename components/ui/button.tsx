import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { accentShadow, DENSE_MAX_FONT_SCALE } from '@/lib/theme';
import { useTokens } from '@/hooks/use-tokens';
import { Icon } from './icon';
import { Text } from './text';

type Variant = 'primary' | 'secondary' | 'tertiary' | 'inverse';

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  fullWidth = true,
  large = false,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  large?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  // md3-colors retired (dark-mode batch 4): app tokens, canvas-true —
  // primary = lime CTA + dark-green-black text (the app's CTA grammar).
  const C = useTokens();

  const bg: Record<Variant, string> = {
    primary:   C.accent,
    secondary: C.surface,
    tertiary:  'transparent',
    inverse:   C.accent,
  };

  const fg: Record<Variant, string> = {
    primary:   C.accentText,
    secondary: C.text,
    tertiary:  C.accentGrn,
    inverse:   C.accentText,
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg[variant],
          borderColor: variant === 'secondary' ? C.border : 'transparent',
          borderWidth: variant === 'secondary' ? 1 : 0,
          paddingVertical: large ? 18 : 14,
          opacity: disabled ? 0.5 : pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        variant === 'primary' ? accentShadow(C.accent) : undefined,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg[variant]} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={large ? 22 : 18} color={fg[variant]} /> : null}
          <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} variant={large ? 'bodyLg' : 'labelLg'} color={fg[variant]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
