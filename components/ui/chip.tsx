import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { md3 } from '@/lib/theme';
import { Icon } from './icon';
import { Text } from './text';

type Tone = 'neutral' | 'primary' | 'dark';

export function Chip({
  label,
  icon,
  selected,
  onPress,
  tone = 'neutral',
}: {
  label: string;
  icon?: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: Tone;
}) {
  const { colors } = md3;
  const c = colors;

  const bg =
    tone === 'dark'
      ? selected
        ? 'rgba(0,0,0,0.7)'
        : 'rgba(0,0,0,0.45)'
      : tone === 'primary'
      ? selected
        ? c.primary
        : c.primaryContainer + '33'
      : selected
      ? c.surfaceContainerHighest
      : c.surfaceContainerLow;

  const fg =
    tone === 'dark'
      ? '#ffffff'
      : tone === 'primary'
      ? selected
        ? c.onPrimary
        : c.primary
      : selected
      ? c.onSurface
      : c.onSurfaceVariant;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, { backgroundColor: bg }]}
    >
      {icon ? <Icon name={icon} size={14} color={fg} /> : null}
      <Text variant="labelSm" color={fg} weight="600">
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
  },
});
