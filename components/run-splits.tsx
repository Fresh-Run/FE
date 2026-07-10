/**
 * 구간 기록 + 페이스&고도 — activity-detail enrichment (canvas:
 * FrSplitsTable + FrPaceChart, activity-detail.jsx). Fed by the server's
 * RunSplit[] ({km, sec, elev_gain_m, partial} — probed 2026-07-11).
 *
 * Unit note: split buckets are server-defined PER KM — the Km column keeps
 * km marks in both unit modes (relabeling buckets as miles would be fake
 * precision); only the pace value converts (owner-approved adaptation).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import type { RunSplit } from '@/hooks/use-runs';
import { fmtPaceIn } from '@/lib/run-format';
import { colors as C, radius as R, shadows } from '@/lib/theme';
import type { UserSettings } from '@/lib/settings-api';

type Units = UserSettings['units'];

// ─── 구간 기록 — Strava-style table ───────────────────────────────────────────

export function SplitsTable({ splits, units }: { splits: RunSplit[]; units: Units }) {
  if (splits.length === 0) return null;
  const fastest = Math.min(...splits.map(s => s.sec));
  const slowest = Math.max(...splits.map(s => s.sec));
  const range = Math.max(1, slowest - fastest);

  return (
    <View style={[st.card, shadows.sm]}>
      <View style={st.headRow}>
        <Text style={[st.headTxt, { width: 34 }]}>Km</Text>
        <Text style={[st.headTxt, { width: 52 }]}>페이스</Text>
        <View style={{ flex: 1 }} />
        <Text style={st.headTxt}>고도</Text>
      </View>
      {splits.map((s, i) => {
        const frac = 0.3 + 0.7 * (1 - (s.sec - fastest) / range); // faster → longer bar
        const isFast = s.sec === fastest && splits.length > 1;
        const label = s.partial ? s.km.toFixed(1) : String(Math.round(s.km));
        return (
          <View key={i} style={st.row}>
            <Text style={[st.kmTxt, { width: 34 }]}>{label}</Text>
            <Text style={[st.paceTxt, { width: 52 }]}>{fmtPaceIn(s.sec, units)}</Text>
            <View style={st.barTrack}>
              <View style={[st.bar, { width: `${frac * 100}%` as `${number}%`, opacity: isFast ? 1 : 0.55 }]}>
                {isFast && <Text style={st.fastTag}>⚡</Text>}
              </View>
            </View>
            <Text style={st.elevTxt}>
              {s.elev_gain_m == null ? '—' : s.elev_gain_m > 0 ? `+${s.elev_gain_m}` : String(s.elev_gain_m)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── 페이스 & 고도 chart — SVG port of FrPaceChart ────────────────────────────

const W = 320, H = 150, PAD_L = 6, PAD_R = 6, PAD_T = 12, PAD_B = 22;

export function PaceElevChart({ splits }: { splits: RunSplit[] }) {
  if (splits.length < 2) return null;
  const paces = splits.map(s => s.sec);
  const elevs = splits.map(s => s.elev_gain_m ?? 0);
  const n = paces.length;
  const innerW = W - PAD_L - PAD_R, innerH = H - PAD_T - PAD_B;
  const bw = innerW / n;
  const pMin = Math.min(...paces), pMax = Math.max(...paces);
  const pRange = Math.max(1, pMax - pMin);
  // Bar height: faster (lower sec) → taller. Normalize 0.4..1 (canvas math)
  const barH = (p: number) => innerH * (0.4 + (1 - (p - pMin) / pRange) * 0.6);
  const eMax = Math.max(...elevs, 1);
  const ePts = elevs.map((e, i): [number, number] => [
    PAD_L + bw * (i + 0.5),
    PAD_T + innerH - (e / eMax) * innerH * 0.72,
  ]);
  let eD = '';
  ePts.forEach((p, i) => {
    if (i === 0) { eD = `M ${p[0].toFixed(1)} ${p[1].toFixed(1)}`; return; }
    const prev = ePts[i - 1];
    const mx = (prev[0] + p[0]) / 2;
    eD += ` C ${mx.toFixed(1)} ${prev[1].toFixed(1)}, ${mx.toFixed(1)} ${p[1].toFixed(1)}, ${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  });

  return (
    <View style={[st.card, shadows.sm]}>
      <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
        {[0.25, 0.5, 0.75].map(g => (
          <Line
            key={g}
            x1={PAD_L} y1={PAD_T + innerH * g} x2={W - PAD_R} y2={PAD_T + innerH * g}
            stroke={C.border} strokeWidth={1} strokeDasharray="2 6"
          />
        ))}
        {paces.map((p, i) => {
          const h = barH(p), x = PAD_L + bw * i + bw * 0.16, w = bw * 0.68, y = PAD_T + innerH - h;
          return (
            <Rect
              key={i} x={x} y={y} width={w} height={h} rx={Math.min(6, w / 2)}
              fill={C.accent} opacity={0.5 + 0.5 * (1 - (p - pMin) / pRange)}
            />
          );
        })}
        <Path d={eD} fill="none" stroke={C.faint} strokeWidth={2.2} strokeDasharray="5 4" strokeLinecap="round" />
        {ePts.map((p, i) => <Circle key={i} cx={p[0]} cy={p[1]} r={2.4} fill={C.sub} />)}
        {splits.map((s, i) => (
          <SvgText
            key={i}
            x={PAD_L + bw * (i + 0.5)} y={H - 6}
            textAnchor="middle" fontSize={10} fontWeight="600" fill={C.faint}
          >
            {s.partial ? s.km.toFixed(1) : `${Math.round(s.km)}km`}
          </SvgText>
        ))}
      </Svg>
      <View style={st.legendRow}>
        <View style={st.legendItem}>
          <View style={st.legendSwatch} />
          <Text style={st.legendTxt}>페이스</Text>
        </View>
        <View style={st.legendItem}>
          <View style={st.legendDash} />
          <Text style={st.legendTxt}>고도</Text>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.xl, padding: 14, marginTop: 12 },

  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 9, borderBottomWidth: 1, borderBottomColor: C.border },
  headTxt: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3, color: C.faint, textTransform: 'uppercase' },

  row:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  kmTxt:    { fontSize: 13, fontWeight: '700', color: C.text, fontVariant: ['tabular-nums'] },
  paceTxt:  { fontSize: 12.5, fontWeight: '600', color: C.sub, fontVariant: ['tabular-nums'] },
  barTrack: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  bar:      { height: 14, borderRadius: 7, backgroundColor: C.accent, minWidth: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  fastTag:  { fontSize: 9, marginRight: 3 },
  elevTxt:  { width: 38, textAlign: 'right', fontSize: 12.5, fontWeight: '600', color: C.faint, fontVariant: ['tabular-nums'] },

  legendRow:    { flexDirection: 'row', gap: 16, marginTop: 6, paddingLeft: 2 },
  legendItem:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 11, height: 11, borderRadius: 3, backgroundColor: C.accent },
  legendDash:   { width: 14, height: 0, borderTopWidth: 2.2, borderStyle: 'dashed', borderTopColor: C.faint },
  legendTxt:    { fontSize: 12, fontWeight: '600', color: C.sub },
});
