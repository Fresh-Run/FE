import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Coordinate } from '@/types';

const NEON = '#42e355';
const W = 300;

function coordsToPath(coords: Coordinate[], h: number): string {
  if (coords.length < 2) return '';
  const lats = coords.map((c) => c.lat);
  const lngs = coords.map((c) => c.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const latR = maxLat - minLat || 0.001;
  const lngR = maxLng - minLng || 0.001;
  const pad = 20;
  return coords.reduce((acc, c, i) => {
    const x = pad + ((c.lng - minLng) / lngR) * (W - pad * 2);
    const y = h - pad - ((c.lat - minLat) / latR) * (h - pad * 2);
    return i === 0 ? `M${x.toFixed(1)},${y.toFixed(1)}` : `${acc} L${x.toFixed(1)},${y.toFixed(1)}`;
  }, '');
}

export function RoutePolyline({
  coords,
  height = 200,
  demoPath,
}: {
  coords?: Coordinate[];
  height?: number;
  demoPath?: string;
}) {
  const pathD = demoPath ?? (coords ? coordsToPath(coords, height) : '');

  return (
    <View style={{ height, backgroundColor: '#0c1a10' }}>
      <Svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="xMidYMid meet">
        {pathD ? (
          <>
            <Path d={pathD} stroke={NEON} strokeWidth={8}   fill="none" opacity={0.15} strokeLinecap="round" />
            <Path d={pathD} stroke={NEON} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : null}
      </Svg>
    </View>
  );
}
