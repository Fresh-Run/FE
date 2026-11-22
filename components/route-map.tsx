/**
 * RouteMap — item ⑩-2 (2026-11-21): the one map door for cards and thumbnails.
 *
 * Paint order (owner standard — no slow maps, no half-loaded map):
 *  1. SNAPSHOT: a map rendered on this device before (same run, size, scheme)
 *     comes back as a plain image on the first frame — no MapKit at all.
 *  2. CURTAIN: otherwise the route-shaped SVG (MiniMap) paints instantly from
 *     the row's thumb polyline — the placeholder the owner asked for.
 *  3. LIVE (only when `live`): once the track is ready (not `pending`) the
 *     native map mounts UNDER the curtain at opacity 0, fades in ~300 ms after
 *     it reports ready (tiles painted), and ~0.9 s later freezes a snapshot
 *     (card size + a 160² square for list thumbs) into the data cache for the
 *     next mount. The line is never drawn before the track exists, and the
 *     tiles are never shown before they loaded.
 *
 * List surfaces pass `live={false}`: snapshot or SVG, never MapKit — the
 * 기록 rows, posts grid, feed overlay thumb and saved-course rows mount no
 * native maps anymore (MapKit stays on the viewable full-size card and the
 * detail heroes, which are where the square snapshots get produced).
 */
import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { MiniMap } from '@/components/mini-map';
import { RealMap } from '@/components/real-map';
import { dcGet, dcSet } from '@/lib/data-cache';
import { useScheme } from '@/store/use-scheme';
import type { Coordinate } from '@/types';

type Props = {
  /** cache identity — run id or route id */
  id: string;
  /** thumb geometry from the row (curtain + region) */
  polyline?: Coordinate[] | null;
  /** full track when fetched (null = use the thumb) */
  line?: Coordinate[] | null;
  /** track fetch in flight — the live map waits (no half-loaded line) */
  pending?: boolean;
  height: number;
  /** known width (skips a layout pass); measured otherwise */
  width?: number;
  borderRadius?: number;
  /** may mount a native map (viewable card / hero); false = snapshot-or-SVG only */
  live?: boolean;
  /** use the square snapshot variant (thumbnails) */
  square?: boolean;
  distanceMarkers?: boolean;
  units?: 'km' | 'mi';
  officialDistanceKm?: number;
  /** RealMap static-snapshot flag (heroes pass false) */
  cache?: boolean;
};

export function RouteMap({ id, polyline, line, pending = false, height, width, borderRadius = 0, live = false, square = false, distanceMarkers, units, officialDistanceKm, cache = true }: Props) {
  const scheme = useScheme(s => s.resolved);
  const [w, setW] = useState(width ?? 0);
  const geom = line && line.length >= 2 ? line : polyline && polyline.length >= 2 ? polyline : null;
  const keyCard = `snap:${id}:c${w}x${height}:${scheme}`;
  const keySq = `snap:${id}:sq:${scheme}`;
  const key = square ? keySq : keyCard;
  const [snap, setSnap] = useState<string | null>(() => dcGet<string>(key) ?? null);
  useEffect(() => { setSnap(dcGet<string>(key) ?? null); }, [key]);

  const opacity = useRef(new Animated.Value(0)).current;
  const onReady = () => {
    setTimeout(() => Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }).start(), 300);
  };
  const canLive = live && !snap && !!geom && !pending && w > 0;

  return (
    <View style={{ height, borderRadius, overflow: 'hidden' }} onLayout={width == null ? e => setW(Math.round(e.nativeEvent.layout.width)) : undefined}>
      {snap ? (
        <Image
          source={{ uri: snap }}
          style={{ width: '100%', height }}
          contentFit="cover"
          cachePolicy="memory"
          transition={0}
          onError={() => { dcSet(key, null); setSnap(null); }}
        />
      ) : (
        <MiniMap seed={id} height={height} borderRadius={0} polyline={geom ?? undefined} />
      )}
      {canLive && (
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity }]} pointerEvents="none">
          <RealMap
            height={height}
            polyline={geom}
            cache={cache}
            distanceMarkers={distanceMarkers}
            units={units}
            officialDistanceKm={officialDistanceKm}
            onReady={onReady}
            onSnapshot={({ card, square: sq }) => {
              if (card) dcSet(keyCard, card);
              if (sq) dcSet(keySq, sq);
            }}
          />
        </Animated.View>
      )}
    </View>
  );
}
