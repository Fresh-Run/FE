import React from 'react';
import { StyleProp, Text as RNText, TextStyle } from 'react-native';

import { useTokens } from '@/hooks/use-tokens';
import { md3, type Tokens } from '@/lib/theme';

type Variant = 'headlineXl' | 'headlineLg' | 'headlineMd' | 'bodyLg' | 'bodyMd' | 'labelLg' | 'labelSm' | 'statDisplay';

export function Text({
  children,
  variant = 'bodyMd',
  color,
  weight,
  center,
  style,
  numberOfLines,
  maxFontSizeMultiplier,
}: {
  children?: React.ReactNode;
  variant?: Variant;
  /** App token name (e.g. 'sub', 'accentGrn') or a raw color string. */
  color?: keyof Tokens | (string & {});
  weight?: TextStyle['fontWeight'];
  center?: boolean;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  /** Dynamic-Type clamp passthrough (8/3 ruling) — dense-UI callers cap at
      DENSE_MAX_FONT_SCALE; reading copy omits it and scales free. */
  maxFontSizeMultiplier?: number;
}) {
  const C = useTokens();
  const { typography } = md3; // scheme-neutral legacy layout tokens

  const looked = color != null && color in C ? C[color as keyof Tokens] : undefined;
  const resolvedColor =
    color == null ? C.text : typeof looked === 'string' ? looked : color;

  return (
    <RNText
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
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
