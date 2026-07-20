import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * FreshRun design tokens — single source of truth.
 *
 * Covers the light theme (the current direction). Dark theme will extend
 * this in a later iteration. Import from here instead of hardcoding hex
 * values in screens.
 */

// ─── Raw palette ─────────────────────────────────────────────────────────────
// These are the atomic hex values. Prefer the semantic `colors` export below.

export const palette = {
  // Greens
  lime400: '#86E244',   // primary CTA / active states
  lime50:  '#EAF9DC',   // light tinted backgrounds, pills
  green700:'#3F8E14',   // dark green — text / icons on lime backgrounds

  // Neutrals
  neutral950: '#111111',
  neutral700: '#3A3A3A',
  neutral500: '#6B6B6B',
  neutral400: '#9A9A9A',
  neutral300: '#ABABAB',
  neutral200: '#E8E8E4',
  neutral100: '#EEEEE9',
  warmWhite:  '#F4F4F1',
  white:      '#FFFFFF',

  // Semantic accents
  blue400:    '#3D8BFF',   // AI advice / info
  amber400:   '#E8A23D',   // sun icon, "보통" verdict
  red500:     '#EF4444',   // danger / like / delete

  // AQI (air quality index) status
  aqiGood:    '#3BA7FF',   // 좋음   — blue
  aqiOk:      '#2FA866',   // 보통   — green
  aqiBad:     '#E8922E',   // 나쁨   — orange
  aqiVeryBad: '#D8463C',   // 매우나쁨 — red
} as const;

// ─── Semantic color tokens ────────────────────────────────────────────────────

/** Route-line two-tone (지연 ruling 2026-07-16): LIGHT #2E7D32 / DARK
    #74E827 — the DARK tone IS the Live Activity lime, so lock screen and map
    stay consistent. Keys on the SYSTEM scheme: the app's only live theme
    mechanism (settings.theme is persist-only — ledgered board item). Dark-
    fixed panels (MiniMap's night canvas, the LA widget) use the dark tone
    unconditionally — panel-keyed, not scheme-keyed (the LA precedent). */
export const routeStroke = (scheme: 'light' | 'dark' | null | undefined): string =>
  scheme === 'dark' ? '#74E827' : '#2E7D32';

export const colors = {
  // Surfaces
  bg:          palette.warmWhite,   // screen background
  surface:     palette.white,       // cards, sheets
  surfaceAlt:  palette.neutral100,  // subtle tint — metric tile bg, SVG ring track

  // Borders
  border:      palette.neutral200,

  // Text
  text:        palette.neutral950,  // headings, values
  sub:         palette.neutral500,  // secondary labels
  faint:       palette.neutral400,  // tertiary / placeholder

  // Accent (lime green)
  accent:      palette.lime400,
  // J1 ruling (2026-07-21): canvas FR_LIGHT.accentText adopted — the tree used
  // #0D1A06 at 12 canvas-verbatim sites while the token held #111111; the
  // canvas value wins (near-invisible on lime). Was palette.neutral950.
  accentText:  '#0D1A06',
  accentDim:   palette.lime50,
  accentGrn:   palette.green700,    // dark-green text / icons on accentDim

  // Semantic
  blue:        palette.blue400,
  sun:         palette.amber400,    // sun icon, warning verdict
  crown:       '#E8B53D',           // 크루장 role badge (debt batch 2 — was inline ×5)
  chart:       '#34B85A',           // J3 ruling: records sparkline green (was inline ×3)
  danger:      palette.red500,

  // AQI status map (index by Korean label)
  aqi: {
    '좋음':    palette.aqiGood,
    '보통':    palette.aqiOk,
    '나쁨':    palette.aqiBad,
    '매우나쁨': palette.aqiVeryBad,
  } as Record<string, string>,

  // UV status map — 기상청 5단계 (BE weather_service _UV_BOUNDS; guide §62).
  // Conventional UV scale colors: green → yellow → orange → red → purple.
  uv: {
    '낮음':    palette.aqiOk,       // green
    '보통':    palette.amber400,    // yellow
    '높음':    palette.aqiBad,      // orange
    '매우높음': palette.aqiVeryBad,  // red
    '위험':    '#8A4FD8',           // purple (single use — no palette entry)
  } as Record<string, string>,
} as const;

// ─── Shadows ─────────────────────────────────────────────────────────────────
// Use directly in StyleSheet or spread into a style object.
// Each entry includes both iOS `shadow*` props and Android `elevation`.

export const shadows = {
  sm: {
    shadowColor:   '#000000',
    shadowOpacity: 0.05 as number,
    shadowRadius:  8,
    shadowOffset:  { width: 0, height: 2 },
    elevation:     1,
  },
  md: {
    shadowColor:   '#000000',
    shadowOpacity: 0.06 as number,
    shadowRadius:  12,
    shadowOffset:  { width: 0, height: 4 },
    elevation:     2,
  },
  lg: {
    shadowColor:   '#000000',
    shadowOpacity: 0.10 as number,
    shadowRadius:  20,
    shadowOffset:  { width: 0, height: 8 },
    elevation:     4,
  },
} as const;

/** Colored drop-shadow used for accent CTA buttons (e.g. "러닝 시작하기"). */
export function accentShadow(color: string) {
  return {
    shadowColor:   color,
    shadowOpacity: 0.38,
    shadowRadius:  14,
    shadowOffset:  { width: 0, height: 6 },
    elevation:     6,
  } as const;
}

// ─── Border radii ─────────────────────────────────────────────────────────────

export const radius = {
  sm:   8,
  md:   12,
  lg:   16,   // metric tiles, AI advice card, CTA button
  xl:   20,   // feed cards, main cards
  xxl:  24,   // bottom sheets
  pill: 9999, // tags, badges, strip
} as const;

// ─── Spacing ──────────────────────────────────────────────────────────────────

export const spacing = {
  xs:     4,
  sm:     8,
  md:     12,
  lg:     16,
  xl:     20,
  xxl:    24,
  gutter: 20,  // horizontal screen padding
} as const;

// ─── Typography ───────────────────────────────────────────────────────────────
// Pure style objects — spread into Text component styles.

export const type = {
  heroTemp:   { fontSize: 62, fontWeight: '300' as const, letterSpacing: -3, lineHeight: 72 },
  displayLg:  { fontSize: 42, fontWeight: '700' as const, letterSpacing: -1.8 },
  displayMd:  { fontSize: 34, fontWeight: '700' as const, letterSpacing: -1.5 },
  headingLg:  { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.7 },
  headingMd:  { fontSize: 18, fontWeight: '700' as const, letterSpacing: -0.5 },
  headingSm:  { fontSize: 15, fontWeight: '700' as const, letterSpacing: -0.4 },
  labelLg:    { fontSize: 13, fontWeight: '600' as const, letterSpacing: -0.2 },
  labelMd:    { fontSize: 12, fontWeight: '600' as const, letterSpacing: -0.1 },
  labelSm:    { fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.1 },
  bodyMd:     { fontSize: 14, fontWeight: '400' as const, letterSpacing: -0.3, lineHeight: 20 },
  metricLg:   { fontSize: 19, fontWeight: '700' as const, letterSpacing: -0.5 },
  metricSm:   { fontSize: 12, fontWeight: '700' as const },
  ctaLabel:   { fontSize: 16, fontWeight: '700' as const, letterSpacing: -0.3 },
  ringScore:  { fontSize: 34, fontWeight: '700' as const, letterSpacing: -1.5 },
} as const;

// ═════════════════════════════════════════════════════════════════════════════
// LEGACY MD3 TOKENS — LIGHT-FROZEN (dark-mode Phase 0, 2026-07-20)
//
// The scaffold-era theme system (contexts/theme + constants/*) followed the OS
// scheme and put the app in a half-dark state (dark auth + light main — four
// symptoms, owner-observed). Phase 0 ruling: that system DIES; its light
// values move here VERBATIM so the auth screens + ui scaffold components
// render pixel-identically while consuming the same single source of truth.
// The MD3 vocabulary itself retires in the dark-mode epic's Phase 1
// (tokenization onto `colors` above) — do not add new consumers.
// ═════════════════════════════════════════════════════════════════════════════

export type ColorTokens = {
  background: string; onBackground: string;
  surface: string; surfaceDim: string; surfaceBright: string;
  surfaceContainerLowest: string; surfaceContainerLow: string; surfaceContainer: string;
  surfaceContainerHigh: string; surfaceContainerHighest: string;
  onSurface: string; onSurfaceVariant: string; surfaceVariant: string;
  inverseSurface: string; inverseOnSurface: string;
  outline: string; outlineVariant: string; surfaceTint: string;
  primary: string; onPrimary: string; primaryContainer: string; onPrimaryContainer: string;
  inversePrimary: string; primaryFixed: string; primaryFixedDim: string;
  onPrimaryFixed: string; onPrimaryFixedVariant: string;
  secondary: string; onSecondary: string; secondaryContainer: string; onSecondaryContainer: string;
  tertiary: string; onTertiary: string; tertiaryContainer: string; onTertiaryContainer: string;
  error: string; onError: string; errorContainer: string; onErrorContainer: string;
  amber: string; neon: string; scrim: string;
};

const md3Colors: ColorTokens = {
  background: '#faf9fe', onBackground: '#1a1b1f',
  surface: '#faf9fe', surfaceDim: '#dad9df', surfaceBright: '#faf9fe',
  surfaceContainerLowest: '#ffffff', surfaceContainerLow: '#f4f3f8', surfaceContainer: '#eeedf3',
  surfaceContainerHigh: '#e9e7ed', surfaceContainerHighest: '#e3e2e7',
  onSurface: '#1a1b1f', onSurfaceVariant: '#3d4a3a', surfaceVariant: '#e3e2e7',
  inverseSurface: '#2f3034', inverseOnSurface: '#f1f0f5',
  outline: '#6d7b68', outlineVariant: '#bbcbb5', surfaceTint: '#006e1c',
  primary: '#006e1c', onPrimary: '#ffffff', primaryContainer: '#32d74b', onPrimaryContainer: '#005814',
  inversePrimary: '#42e355', primaryFixed: '#70ff76', primaryFixedDim: '#42e355',
  onPrimaryFixed: '#002204', onPrimaryFixedVariant: '#005313',
  secondary: '#5f5e60', onSecondary: '#ffffff', secondaryContainer: '#e2dfe1', onSecondaryContainer: '#636264',
  tertiary: '#005bc1', onTertiary: '#ffffff', tertiaryContainer: '#9bbbff', onTertiaryContainer: '#00489b',
  error: '#ba1a1a', onError: '#ffffff', errorContainer: '#ffdad6', onErrorContainer: '#93000a',
  amber: '#f59e0b', neon: '#42e355', scrim: 'rgba(0,0,0,0.5)',
};

const md3Spacing = { stackSm: 8, stackMd: 12, gutterMd: 16, containerMargin: 20, stackLg: 24, sectionGap: 32 } as const;
const md3Radius  = { sm: 4, md: 8, lg: 12, xl: 16, xxl: 20, xxxl: 24, full: 9999 } as const;

const md3Typography = {
  headlineXl:  { fontSize: 34, fontWeight: '700', lineHeight: 41, letterSpacing: -0.4 },
  headlineLg:  { fontSize: 28, fontWeight: '700', lineHeight: 34, letterSpacing: -0.4 },
  headlineMd:  { fontSize: 22, fontWeight: '600', lineHeight: 28, letterSpacing: -0.4 },
  bodyLg:      { fontSize: 17, fontWeight: '400', lineHeight: 22, letterSpacing: -0.4 },
  bodyMd:      { fontSize: 15, fontWeight: '400', lineHeight: 20, letterSpacing: -0.2 },
  labelLg:     { fontSize: 13, fontWeight: '600', lineHeight: 18, letterSpacing: 0 },
  labelSm:     { fontSize: 11, fontWeight: '500', lineHeight: 13, letterSpacing: 0.06 },
  statDisplay: { fontSize: 24, fontWeight: '700', lineHeight: 30, letterSpacing: 0.5 },
} satisfies Record<string, TextStyle>;

const md3Elevation: Record<'card' | 'sheet' | 'fab', ViewStyle> = {
  card: Platform.select({
    ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12 },
    android: { elevation: 2 },
    default: {},
  }) as ViewStyle,
  sheet: Platform.select({
    ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.10, shadowRadius: 24 },
    android: { elevation: 8 },
    default: {},
  }) as ViewStyle,
  fab: Platform.select({
    ios:     { shadowColor: '#006e1c', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.30, shadowRadius: 12 },
    android: { elevation: 10 },
    default: {},
  }) as ViewStyle,
};

/** The frozen light theme object — same shape the old useTheme() returned. */
export const md3 = {
  dark: false as const,
  colors: md3Colors,
  spacing: md3Spacing,
  radius: md3Radius,
  typography: md3Typography,
  elevation: md3Elevation,
};

// ─── Dark palette (dark-mode epic Phase 1, 2026-07-20) ───────────────────────
// Source: canvas FR_DARK (auth-ui.jsx, the canonical page's theme object) +
// the components' `c.dark ? c.accent : '#3F8E14'` ternary (accentGrn).
// Status colors (blue/sun/aqi) are scheme-INVARIANT per canvas usage (rendered
// unbranched in dark frames). DERIVED placeholders (no canvas source — each is
// ledgered canvas debt until 지연's uncovered palettes land): crown, uv map.
// USER-FACING RESOLUTION IS PINNED LIGHT until phases 3–4 are whole — this
// palette is reachable only via the hidden dev override (store/use-scheme).

/** Widened token shape — both palettes satisfy it; factories take this. */
export type Tokens = {
  [K in keyof typeof colors]: (typeof colors)[K] extends Record<string, string>
    ? Record<string, string>
    : string;
};

export const darkColors: Tokens = {
  // Surfaces (canvas FR_DARK)
  bg:         '#0E0F12',
  surface:    '#15171C',
  surfaceAlt: '#1B1E24',
  border:     '#24282F',
  // Text (canvas FR_DARK)
  text:  '#F2F3F0',
  sub:   '#9A9EA5',
  faint: '#6A6F77',
  // Accent (canvas FR_DARK; accentGrn via the components' dark ternary)
  accent:     '#63C23A',
  accentText: '#0B1505',
  accentDim:  '#18260D',
  accentGrn:  '#63C23A',
  // Semantic — blue/sun scheme-invariant per canvas; danger from FR_DARK;
  // crown DERIVED (no canvas source — canvas debt)
  blue:   palette.blue400,
  sun:    palette.amber400,
  crown:  '#E8B53D',
  chart:  '#34B85A',   // DERIVED placeholder (J3) — canvas debt with crown/uv
  danger: '#F0635A',
  // Status maps — aqi invariant per canvas FR_AQI_COLOR (unbranched in dark);
  // uv DERIVED (app-only ruling, no canvas source — canvas debt)
  aqi: {
    '좋음':    palette.aqiGood,
    '보통':    palette.aqiOk,
    '나쁨':    palette.aqiBad,
    '매우나쁨': palette.aqiVeryBad,
  },
  uv: {
    '낮음':    palette.aqiOk,
    '보통':    palette.amber400,
    '높음':    palette.aqiBad,
    '매우높음': palette.aqiVeryBad,
    '위험':    '#8A4FD8',
  },
};
