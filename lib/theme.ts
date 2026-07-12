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
  accentText:  palette.neutral950,  // text on lime backgrounds
  accentDim:   palette.lime50,
  accentGrn:   palette.green700,    // dark-green text / icons on accentDim

  // Semantic
  blue:        palette.blue400,
  sun:         palette.amber400,    // sun icon, warning verdict
  crown:       '#E8B53D',           // 크루장 role badge (debt batch 2 — was inline ×5)
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
