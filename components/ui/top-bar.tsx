import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { md3 } from '@/lib/theme';
import { Icon } from './icon';
import { Text } from './text';

export function TopBar({
  brand,
  subtitle,
  title,
  onBack,
  actionIcon,
  onAction,
  avatar,
}: {
  brand?: boolean;
  subtitle?: string;
  title?: string;
  onBack?: () => void;
  actionIcon?: string;
  onAction?: () => void;
  avatar?: React.ReactNode;
}) {
  const { colors } = md3;
  const c = colors;

  return (
    <View style={styles.bar}>
      {/* Left: back button or brand */}
      <View style={styles.left}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
            <Icon name="chevron-back" size={24} color={c.onSurface} />
          </Pressable>
        ) : brand ? (
          <View style={styles.brandRow}>
            <View style={[styles.brandIcon, { backgroundColor: c.primaryContainer }]}>
              <Icon name="trending-up" size={16} color={c.onPrimaryContainer} />
            </View>
            <Text variant="headlineMd" color="primary" weight="700">
              FreshRun
            </Text>
          </View>
        ) : null}
      </View>

      {/* Center: title or subtitle */}
      {title ? (
        <Text variant="headlineMd" style={styles.centerTitle}>
          {title}
        </Text>
      ) : subtitle ? (
        <Text variant="labelSm" color="onSurfaceVariant" style={styles.centerTitle}>
          {subtitle}
        </Text>
      ) : null}

      {/* Right: action icon or avatar */}
      <View style={styles.right}>
        {actionIcon ? (
          <Pressable onPress={onAction} hitSlop={12} style={styles.actionBtn}>
            <Icon name={actionIcon} size={24} color={c.onSurface} />
          </Pressable>
        ) : null}
        {avatar ?? null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 4,
  },
  left:  { flex: 1, flexDirection: 'row', alignItems: 'center' },
  right: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  centerTitle: { flex: 2, textAlign: 'center' },
  brandRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandIcon: { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  backBtn:   { padding: 4 },
  actionBtn: { padding: 4 },
});
