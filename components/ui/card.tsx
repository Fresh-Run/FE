import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

import { md3 } from '@/lib/theme';

export function Card({
  children,
  style,
  padded = true,
  radius,
  elevated = true,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  radius?: number;
  elevated?: boolean;
}) {
  const { colors, spacing, radius: r, elevation } = md3;

  return (
    <View
      style={[
        {
          backgroundColor: colors.surfaceContainerLowest,
          borderRadius: radius ?? r.xxl,
          borderWidth: 1,
          borderColor: colors.outlineVariant + '33',
          padding: padded ? spacing.gutterMd : 0,
        },
        elevated ? elevation.card : undefined,
        style,
      ]}
    >
      {children}
    </View>
  );
}
