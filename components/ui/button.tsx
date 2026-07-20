import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { md3 } from '@/lib/theme';
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
  const { colors, elevation } = md3;
  const c = colors;

  const bg: Record<Variant, string> = {
    primary:   c.primary,
    secondary: c.surfaceContainerLowest,
    tertiary:  'transparent',
    inverse:   c.inversePrimary,
  };

  const fg: Record<Variant, string> = {
    primary:   c.onPrimary,
    secondary: c.onSurface,
    tertiary:  c.primary,
    inverse:   c.onPrimaryFixed,
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg[variant],
          borderColor: variant === 'secondary' ? c.outlineVariant : 'transparent',
          borderWidth: variant === 'secondary' ? 1 : 0,
          paddingVertical: large ? 18 : 14,
          opacity: disabled ? 0.5 : pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        variant === 'primary' ? elevation.fab : undefined,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg[variant]} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={large ? 22 : 18} color={fg[variant]} /> : null}
          <Text variant={large ? 'bodyLg' : 'labelLg'} color={fg[variant]}>
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
