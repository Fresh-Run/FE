/**
 * Elevation profile (8/8 build, her ③ alt contract) — 활동 상세 + run-post
 * section. Proposed form (checkpoint decision, owner rules): filled area
 * profile — distance on x, altitude on y, accentGrn line over a translucent
 * fill, min/max altitude labels on the left edge, non-interactive v1.
 * Y auto-ranges with a MIN_SPAN_M floor so flat runs don't render as
 * mountains. Stats row beneath: 총 상승 ↗ / 총 하강 ↘ (hysteresis math —
 * lib/elevation.ts owns every constant).
 *
 * NULL-SKIP BY CONSTRUCTION: buildElevationProfile returns null on
 * pre-deploy runs (alt: null everywhere), thin coverage, or degenerate
 * tracks — the component renders NOTHING (no empty-state noise, the
 * spec's tier-1 rule). Callers mount it unconditionally.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { buildElevationProfile, MIN_SPAN_M } from '@/lib/elevation';
import { useT } from '@/lib/i18n';
import { type Tokens, DENSE_MAX_FONT_SCALE } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import type { TrackPoint } from '@/types';

const CHART_H = 110;

export function ElevationChart({ points }: { points: TrackPoint[] | null | undefined }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  const [w, setW] = useState(0); // measured — the section spans its parent
  const profile = useMemo(() => buildElevationProfile(points), [points]);
  if (!profile) return null; // null-skip: no section, no empty state

  const { dists, alts, totalDistM, minAlt, maxAlt, gainM, lossM } = profile;
  // y range with the flat-run floor, symmetric padding
  const span = Math.max(maxAlt - minAlt, MIN_SPAN_M);
  const pad = (span - (maxAlt - minAlt)) / 2;
  const yLo = minAlt - pad, yHi = maxAlt + pad;
  const X = (d: number) => (d / totalDistM) * w;
  const Y = (a: number) => CHART_H - ((a - yLo) / (yHi - yLo)) * CHART_H;

  let line = '';
  if (w > 0) {
    line = dists.map((d, i) => `${i === 0 ? 'M' : 'L'} ${X(d).toFixed(1)} ${Y(alts[i]).toFixed(1)}`).join(' ');
  }
  const area = line ? `${line} L ${w.toFixed(1)} ${CHART_H} L 0 ${CHART_H} Z` : '';

  return (
    <View style={st.wrap} onLayout={e => setW(e.nativeEvent.layout.width)}>
      <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.title}>{T('elv.title')}</Text>
      <View style={{ height: CHART_H }}>
        {w > 0 && (
          <Svg width={w} height={CHART_H}>
            <Path d={area} fill={C.accentGrn} opacity={0.16} />
            <Path d={line} stroke={C.accentGrn} strokeWidth={2} fill="none" strokeLinejoin="round" />
          </Svg>
        )}
        {/* min/max altitude — left edge, faint (whole meters) */}
        <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={[st.axisLbl, { top: 0 }]}>{Math.round(yHi)}m</Text>
        <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={[st.axisLbl, { bottom: 0 }]}>{Math.round(yLo)}m</Text>
      </View>
      <View style={st.statsRow}>
        <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.statLbl}>
          {T('elv.gain')} <Text style={st.statVal}>↗ {gainM}m</Text>
        </Text>
        <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.statLbl}>
          {T('elv.loss')} <Text style={st.statVal}>↘ {lossM}m</Text>
        </Text>
      </View>
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  wrap:     { marginTop: 18 },
  title:    { fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3, marginBottom: 10 },
  axisLbl:  { position: 'absolute', left: 2, fontSize: 10, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },
  statsRow: { flexDirection: 'row', gap: 18, marginTop: 8 },
  statLbl:  { fontSize: 12, fontWeight: '600', color: C.sub, letterSpacing: -0.2 },
  statVal:  { color: C.text, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
