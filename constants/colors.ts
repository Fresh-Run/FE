/**
 * FreshRun MD3 color tokens — light and dark palettes.
 * Source: "Fresh Green" design system, ported from FreshRunAI reference app.
 */

export type ColorTokens = {
  background: string;
  onBackground: string;
  surface: string;
  surfaceDim: string;
  surfaceBright: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  onSurface: string;
  onSurfaceVariant: string;
  surfaceVariant: string;
  inverseSurface: string;
  inverseOnSurface: string;
  outline: string;
  outlineVariant: string;
  surfaceTint: string;

  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  inversePrimary: string;
  primaryFixed: string;
  primaryFixedDim: string;
  onPrimaryFixed: string;
  onPrimaryFixedVariant: string;

  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;

  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;

  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;

  amber: string;
  neon: string;
  scrim: string;
};

export const lightColors: ColorTokens = {
  background: '#faf9fe',
  onBackground: '#1a1b1f',
  surface: '#faf9fe',
  surfaceDim: '#dad9df',
  surfaceBright: '#faf9fe',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f4f3f8',
  surfaceContainer: '#eeedf3',
  surfaceContainerHigh: '#e9e7ed',
  surfaceContainerHighest: '#e3e2e7',
  onSurface: '#1a1b1f',
  onSurfaceVariant: '#3d4a3a',
  surfaceVariant: '#e3e2e7',
  inverseSurface: '#2f3034',
  inverseOnSurface: '#f1f0f5',
  outline: '#6d7b68',
  outlineVariant: '#bbcbb5',
  surfaceTint: '#006e1c',

  primary: '#006e1c',
  onPrimary: '#ffffff',
  primaryContainer: '#32d74b',
  onPrimaryContainer: '#005814',
  inversePrimary: '#42e355',
  primaryFixed: '#70ff76',
  primaryFixedDim: '#42e355',
  onPrimaryFixed: '#002204',
  onPrimaryFixedVariant: '#005313',

  secondary: '#5f5e60',
  onSecondary: '#ffffff',
  secondaryContainer: '#e2dfe1',
  onSecondaryContainer: '#636264',

  tertiary: '#005bc1',
  onTertiary: '#ffffff',
  tertiaryContainer: '#9bbbff',
  onTertiaryContainer: '#00489b',

  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',

  amber: '#f59e0b',
  neon: '#42e355',
  scrim: 'rgba(0,0,0,0.5)',
};

export const darkColors: ColorTokens = {
  background: '#111418',
  onBackground: '#e2e2e6',
  surface: '#111418',
  surfaceDim: '#111418',
  surfaceBright: '#36393e',
  surfaceContainerLowest: '#0c0e12',
  surfaceContainerLow: '#1a1b1f',
  surfaceContainer: '#1e2023',
  surfaceContainerHigh: '#282a2e',
  surfaceContainerHighest: '#333539',
  onSurface: '#e2e2e6',
  onSurfaceVariant: '#c3c8bd',
  surfaceVariant: '#43483f',
  inverseSurface: '#e2e2e6',
  inverseOnSurface: '#2f3034',
  outline: '#8d9389',
  outlineVariant: '#43483f',
  surfaceTint: '#42e355',

  primary: '#42e355',
  onPrimary: '#003910',
  primaryContainer: '#005313',
  onPrimaryContainer: '#70ff76',
  inversePrimary: '#006e1c',
  primaryFixed: '#70ff76',
  primaryFixedDim: '#42e355',
  onPrimaryFixed: '#002204',
  onPrimaryFixedVariant: '#005313',

  secondary: '#c8c6c8',
  onSecondary: '#303031',
  secondaryContainer: '#474649',
  onSecondaryContainer: '#e4e2e4',

  tertiary: '#adc6ff',
  onTertiary: '#002f66',
  tertiaryContainer: '#00489b',
  onTertiaryContainer: '#d8e2ff',

  error: '#ffb4ab',
  onError: '#690005',
  errorContainer: '#93000a',
  onErrorContainer: '#ffdad6',

  amber: '#fbbf24',
  neon: '#42e355',
  scrim: 'rgba(0,0,0,0.6)',
};
