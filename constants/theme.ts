import { Platform, TextStyle, ViewStyle } from 'react-native';

import { ColorTokens, darkColors, lightColors } from './colors';

export { lightColors, darkColors } from './colors';
export type { ColorTokens } from './colors';

export const spacing = {
  stackSm: 8,
  stackMd: 12,
  gutterMd: 16,
  containerMargin: 20,
  stackLg: 24,
  sectionGap: 32,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 20,
  xxxl: 24,
  full: 9999,
} as const;

type TypeScale =
  | 'headlineXl'
  | 'headlineLg'
  | 'headlineMd'
  | 'bodyLg'
  | 'bodyMd'
  | 'labelLg'
  | 'labelSm'
  | 'statDisplay';

export const typography: Record<TypeScale, TextStyle> = {
  headlineXl:  { fontSize: 34, fontWeight: '700', lineHeight: 41, letterSpacing: -0.4 },
  headlineLg:  { fontSize: 28, fontWeight: '700', lineHeight: 34, letterSpacing: -0.4 },
  headlineMd:  { fontSize: 22, fontWeight: '600', lineHeight: 28, letterSpacing: -0.4 },
  bodyLg:      { fontSize: 17, fontWeight: '400', lineHeight: 22, letterSpacing: -0.4 },
  bodyMd:      { fontSize: 15, fontWeight: '400', lineHeight: 20, letterSpacing: -0.2 },
  labelLg:     { fontSize: 13, fontWeight: '600', lineHeight: 18, letterSpacing:  0   },
  labelSm:     { fontSize: 11, fontWeight: '500', lineHeight: 13, letterSpacing:  0.06},
  statDisplay: { fontSize: 24, fontWeight: '700', lineHeight: 30, letterSpacing:  0.5 },
};

export const elevation: Record<'card' | 'sheet' | 'fab', ViewStyle> = {
  card: Platform.select({
    ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4  }, shadowOpacity: 0.05, shadowRadius: 12 },
    android: { elevation: 2 },
    default: {},
  }) as ViewStyle,
  sheet: Platform.select({
    ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 8  }, shadowOpacity: 0.10, shadowRadius: 24 },
    android: { elevation: 8 },
    default: {},
  }) as ViewStyle,
  fab: Platform.select({
    ios:     { shadowColor: '#006e1c', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.30, shadowRadius: 12 },
    android: { elevation: 10 },
    default: {},
  }) as ViewStyle,
};

export type Theme = {
  dark: boolean;
  colors: ColorTokens;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  elevation: typeof elevation;
};

export const lightTheme: Theme = { dark: false, colors: lightColors, spacing, radius, typography, elevation };
export const darkTheme:  Theme = { dark: true,  colors: darkColors,  spacing, radius, typography, elevation };

/** Legacy scaffold exports so existing scaffold files compile without changes. */
export const Colors = {
  light: { text: '#11181C', background: '#faf9fe', tint: lightColors.primary, icon: '#687076', tabIconDefault: '#687076', tabIconSelected: lightColors.primary },
  dark:  { text: '#e2e2e6', background: '#111418', tint: darkColors.primary,  icon: '#9BA1A6', tabIconDefault: '#9BA1A6', tabIconSelected: darkColors.primary  },
};

export const Fonts = Platform.select({
  ios:     { sans: 'system-ui', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', serif: 'serif', rounded: 'normal', mono: 'monospace' },
  web:     { sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", serif: "Georgia, 'Times New Roman', serif", rounded: "'SF Pro Rounded', sans-serif", mono: "SFMono-Regular, Menlo, Monaco, monospace" },
});
