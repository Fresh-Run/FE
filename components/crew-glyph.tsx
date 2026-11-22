/**
 * Crew identity fallback tile (canvas FrCrewCard / FrCrewDetail default
 * cover). Owner ruling 2026-07-14: crews are people, not places — the
 * imageless default is NEVER a MiniMap. Redesign palette (2026-11-21): the
 * dark-green gradient + lime glyph are retired — a flat neutral-fill tile
 * with an ink glyph, scheme-aware through the tokens. `glyph={false}` = the
 * hero-band variant (tile only — the hero's identity glyph is its own tile).
 */
import React from 'react';
import { View } from 'react-native';

import { Icon } from '@/components/ui';
import { useTokens } from '@/hooks/use-tokens';

export function CrewGlyph({ height, borderRadius = 0, iconSize = 22, glyph = true }: {
  height: number;
  borderRadius?: number;
  iconSize?: number;
  glyph?: boolean;
}) {
  const C = useTokens();
  return (
    <View style={{ height, borderRadius, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: C.surfaceAlt }}>
      {glyph && <Icon name="people" size={iconSize} color={C.faint} />}
    </View>
  );
}
