import React from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { useTheme } from '@/contexts/theme';
import { Icon } from './icon';
import { Text } from './text';

export function ToggleRow({
  label,
  description,
  icon,
  value,
  onValueChange,
}: {
  label: string;
  description?: string;
  icon?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const { colors } = useTheme();
  const c = colors;

  return (
    <View style={styles.row}>
      {icon ? (
        <View style={[styles.iconWrap, { backgroundColor: c.surfaceContainer }]}>
          <Icon name={icon} size={18} color={c.onSurfaceVariant} />
        </View>
      ) : null}
      <View style={styles.labelGroup}>
        <Text variant="bodyMd" weight="500">{label}</Text>
        {description ? (
          <Text variant="labelSm" color="onSurfaceVariant">{description}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: c.surfaceContainerHigh, true: c.primary }}
        thumbColor={c.surfaceContainerLowest}
      />
    </View>
  );
}

export function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const { colors, elevation } = useTheme();
  const c = colors;

  return (
    <View style={[styles.segment, { backgroundColor: c.surfaceContainerLow }]}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            style={[
              styles.segmentBtn,
              active ? [{ backgroundColor: c.surfaceContainerLowest }, elevation.card] : undefined,
            ]}
          >
            <Text variant="labelLg" color={active ? 'onSurface' : 'onSurfaceVariant'}>
              {opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelGroup: { flex: 1, gap: 2 },
  segment: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 9999,
  },
  segmentBtn: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9999,
    alignItems: 'center',
  },
});
