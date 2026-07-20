import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from './text';

export function StatTile({
  value,
  unit,
  label,
  align = 'center',
  valueColor,
  labelColor,
  big,
}: {
  value: string | number;
  unit?: string;
  label: string;
  align?: 'left' | 'center';
  valueColor?: string;
  labelColor?: string;
  big?: boolean;
}) {
  return (
    <View style={[styles.tile, align === 'left' ? styles.left : styles.center]}>
      <View style={styles.valueRow}>
        <Text
          variant={big ? 'headlineLg' : 'statDisplay'}
          color={valueColor ?? 'onSurface'}
          weight="700"
        >
          {String(value)}
        </Text>
        {unit ? (
          <Text variant="labelLg" color={valueColor ?? 'onSurfaceVariant'} style={styles.unit}>
            {unit}
          </Text>
        ) : null}
      </View>
      <Text variant="labelSm" color={labelColor ?? 'onSurfaceVariant'}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile:     { gap: 2 },
  center:   { alignItems: 'center' },
  left:     { alignItems: 'flex-start' },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  unit:     { marginBottom: 3 },
});
