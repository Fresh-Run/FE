/**
 * Elevation profile (her ③ alt contract) — 활동 상세 ONLY (8/3 owner-record
 * ruling: the shape doctrine applied — public-shaped surfaces don't carry
 * analysis-grade personal data; the original both-surfaces build was
 * specced then superseded, run-post removed). Form: filled area
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
import Svg, { Line, Path } from 'react-native-svg';

import { buildElevationProfile, MIN_SPAN_M, SPAN_PAD } from '@/lib/elevation';
import { useT } from '@/lib/i18n';
import { distUnit, KM_PER_MI, type Units } from '@/lib/run-format';
import { type Tokens, DENSE_MAX_FONT_SCALE } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import type { TrackPoint } from '@/types';

const CHART_H = 110;
/** x-axis label sparse rule (v2): whole-unit marks every 1 up to this
    total, every 5 beyond (a 12km run shows 5·10, not eleven labels) */
const X_DENSE_MAX_UNITS = 10;

export function ElevationChart({ points, units = 'km' }: { points: TrackPoint[] | null | undefined; units?: Units }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  const [w, setW] = useState(0); // measured — the section spans its parent
  const profile = useMemo(() => buildElevationProfile(points), [points]);
  if (!profile) return null; // null-skip: no section, no empty state

  const { dists, alts, totalDistM, minAlt, maxAlt, gainM, lossM } = profile;
  // v2 ADAPTIVE y range (owner field critique 8/3 — the fixed 30m floor
  // flattened a ~12m run into 21m→-9m labels): real range × SPAN_PAD with
  // an 8m dead-flat floor, symmetric padding
  const range = maxAlt - minAlt;
  const span = Math.max(range * SPAN_PAD, MIN_SPAN_M);
  const pad = (span - range) / 2;
  const yLo = minAlt - pad, yHi = maxAlt + pad;
  const X = (d: number) => (d / totalDistM) * w;
  const Y = (a: number) => CHART_H - ((a - yLo) / (yHi - yLo)) * CHART_H;
  // v2 x-axis: whole-unit km/mi marks (existing distance vocabulary — no
  // new keys; unit-aware via the app's units setting)
  const unitM = units === 'mi' ? KM_PER_MI * 1000 : 1000;
  const totalUnits = totalDistM / unitM;
  const xInterval = totalUnits > X_DENSE_MAX_UNITS ? 5 : 1;
  const xMarks: number[] = [];
  for (let k = xInterval; k <= totalUnits; k += xInterval) xMarks.push(k);

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
            {xMarks.map(k => (
              <Line key={k} x1={X(k * unitM)} x2={X(k * unitM)} y1={0} y2={CHART_H} stroke={C.border} strokeWidth={1} opacity={0.6} />
            ))}
            <Path d={area} fill={C.accentGrn} opacity={0.16} />
            <Path d={line} stroke={C.accentGrn} strokeWidth={2} fill="none" strokeLinejoin="round" />
          </Svg>
        )}
        {/* min/max altitude — left edge, faint (whole meters) */}
        <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={[st.axisLbl, { top: 0 }]}>{Math.round(yHi)}m</Text>
        <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={[st.axisLbl, { bottom: 0 }]}>{Math.round(yLo)}m</Text>
      </View>
      {/* x labels — their own 14px strip under the chart, aligned to the marks */}
      {w > 0 && xMarks.length > 0 && (
        <View style={st.xLabelStrip}>
          {xMarks.map(k => (
            <Text key={k} maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={[st.xLbl, { left: X(k * unitM) - 16 }]}>
              {k}{distUnit(units)}
            </Text>
          ))}
        </View>
      )}
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
  xLabelStrip: { height: 14 },
  xLbl: { position: 'absolute', width: 32, textAlign: 'center', fontSize: 9, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },
  statsRow: { flexDirection: 'row', gap: 18, marginTop: 8 },
  statLbl:  { fontSize: 12, fontWeight: '600', color: C.sub, letterSpacing: -0.2 },
  statVal:  { color: C.text, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
