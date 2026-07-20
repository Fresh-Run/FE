import React from 'react';
import { StyleProp, Text as RNText, TextStyle } from 'react-native';

import { md3 } from '@/lib/theme';
import { type ColorTokens } from '@/lib/theme';

type Variant = 'headlineXl' | 'headlineLg' | 'headlineMd' | 'bodyLg' | 'bodyMd' | 'labelLg' | 'labelSm' | 'statDisplay';

export function Text({
  children,
  variant = 'bodyMd',
  color,
  weight,
  center,
  style,
  numberOfLines,
}: {
  children?: React.ReactNode;
  variant?: Variant;
  color?: keyof ColorTokens | (string & {});
  weight?: TextStyle['fontWeight'];
  center?: boolean;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const { colors, typography } = md3;

  const resolvedColor =
    color == null
      ? colors.onSurface
      : color in colors
      ? colors[color as keyof ColorTokens]
      : color;

  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[
        typography[variant],
        { color: resolvedColor },
        weight ? { fontWeight: weight } : null,
        center ? { textAlign: 'center' } : null,
        style,
      ]}
    >
      {children}
    </RNText>
  );
}
