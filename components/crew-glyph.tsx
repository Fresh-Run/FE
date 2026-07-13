/**
 * Crew identity fallback tile (canvas FrCrewCard / FrCrewDetail default
 * cover): dark-green gradient + lime users glyph. Owner ruling 2026-07-14:
 * crews are people, not places — the imageless default is NEVER a MiniMap.
 * Stated adaptation: the canvas's radial lime accent has no RN equivalent
 * (expo-linear-gradient is linear-only) — approximated by the same diagonal
 * #1C2F10 → #0C1206 pair. `glyph={false}` = the hero-band variant (gradient
 * wash only — the hero's identity glyph is its separate icon tile).
 */
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';

import { Icon } from '@/components/ui';

export function CrewGlyph({ height, borderRadius = 0, iconSize = 22, glyph = true }: {
  height: number;
  borderRadius?: number;
  iconSize?: number;
  glyph?: boolean;
}) {
  return (
    <LinearGradient
      colors={['#1C2F10', '#0C1206']}
      start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 1 }}
      style={{ height, borderRadius, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
    >
      {glyph && <Icon name="people" size={iconSize} color="#7CF03D" />}
    </LinearGradient>
  );
}
