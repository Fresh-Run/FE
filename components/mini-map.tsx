import { routeStroke } from '@/lib/theme';
import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { frHash } from '@/lib/fr-hash';
import type { Coordinate } from '@/types';

interface MiniMapProps {
  seed: string;
  height?: number;
  borderRadius?: number;
  /** Real route geometry. When provided, the neon path and start/end markers
      are projected from these coords; the seeded background stays. */
  polyline?: Coordinate[];
}

export function MiniMap({ seed, height = 172, borderRadius = 0, polyline }: MiniMapProps) {
  const data = useMemo(() => {
    const rnd = frHash(seed);
    const W = 300, H = 300, pad = 46;
    const n = 5 + Math.floor(rnd() * 3);
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      pts.push([pad + rnd() * (W - 2 * pad), pad + rnd() * (H - 2 * pad)]);
    }
    let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i], p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    const start = pts[0], end = pts[pts.length - 1];
    const roads: [number, number, number, number, boolean][] = [];
    for (let i = 0; i < 4; i++) {
      const horiz = rnd() > 0.5;
      const o = 40 + rnd() * 220;
      roads.push(horiz ? [0, o, W, o, i % 2 === 0] : [o, 0, o, H, i % 2 === 0]);
    }
    const hasRiver = rnd() > 0.45;
    const river = hasRiver ? {
      y1:   60  + rnd() * 60,
      cp1y: 120 + rnd() * 40,
      cp2y: 40  + rnd() * 40,
      y2:   150 + rnd() * 60,
    } : null;

    // Real geometry overrides the seeded fake path (background stays seeded).
    // Straight segments, not curves — this is actual GPS shape, don't smooth it.
    if (polyline && polyline.length >= 2) {
      const lats = polyline.map(c => c.lat);
      const lngs = polyline.map(c => c.lng);
      const minLat = Math.min(...lats), latR = (Math.max(...lats) - minLat) || 0.001;
      const minLng = Math.min(...lngs), lngR = (Math.max(...lngs) - minLng) || 0.001;
      const px = (c: Coordinate) => pad + ((c.lng - minLng) / lngR) * (W - 2 * pad);
      const py = (c: Coordinate) => H - pad - ((c.lat - minLat) / latR) * (H - 2 * pad);
      const realD = polyline
        .map((c, i) => `${i === 0 ? 'M' : 'L'} ${px(c).toFixed(1)} ${py(c).toFixed(1)}`)
        .join(' ');
      const first = polyline[0], last = polyline[polyline.length - 1];
      return { W, H, d: realD, start: [px(first), py(first)] as [number, number], end: [px(last), py(last)] as [number, number], roads, river };
    }

    return { W, H, d, start, end, roads, river };
  }, [seed, polyline]);

  const { W, H, d, start, end, roads, river } = data;
  // 지연 palette ruling: the neon dies. This panel is dark-fixed (night
  // canvas), so it takes the DARK tone unconditionally — the LA precedent.
  const accent = routeStroke('dark');

  return (
    <View style={{ width: '100%', height, backgroundColor: '#0C0F14', overflow: 'hidden', borderRadius }}>
      <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
        <Rect width={W} height={H} fill="#0C0F14" />
        {river && (
          <Path
            d={`M -10 ${river.y1.toFixed(1)} C 90 ${river.cp1y.toFixed(1)}, 180 ${river.cp2y.toFixed(1)}, ${W + 10} ${river.y2.toFixed(1)}`}
            stroke="#15364A" strokeWidth={26} fill="none" strokeOpacity={0.7} strokeLinecap="round"
          />
        )}
        {roads.map((r, i) => (
          <Line key={i} x1={r[0]} y1={r[1]} x2={r[2]} y2={r[3]} stroke="#1C2230" strokeWidth={r[4] ? 8 : 5} />
        ))}
        <Path d={d} stroke={accent} strokeOpacity={0.22} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <Path d={d} stroke={accent} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <Circle cx={start[0]} cy={start[1]} r={7} fill="#0C0F14" stroke={accent} strokeWidth={4} />
        <Circle cx={end[0]} cy={end[1]} r={8} fill={accent} />
      </Svg>
    </View>
  );
}
