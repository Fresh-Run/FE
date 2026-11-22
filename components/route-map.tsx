/**
 * RouteMap — item ⑩-2 (2026-11-21, owner-corrected the same day): the one map
 * door for route maps on cards and thumbnails.
 *
 * Paint order (owner standard):
 *  1. SNAPSHOT — a map this device rendered before (same run, size, scheme)
 *     is a plain image on the first frame. No MapKit.
 *  2. NEUTRAL TILE — otherwise a flat surface-colored tile. Nothing drawn on
 *     it: no route outline, no placeholder art (owner ruling).
 *  3. LIVE — when the track is ready and the render pool grants a slot
 *     (≤ 3 native maps at once, viewable cards first), the native map mounts
 *     INVISIBLE, and once the tiles have painted it simply appears, complete,
 *     with the line already on it. No fade. ~0.9 s later it freezes a card
 *     snapshot + a 160² square snapshot into the data cache (next mount =
 *     image; list thumbs of the same run = image) and releases its slot, so
 *     off-screen cards get rendered before the user scrolls to them.
 *
 * `live={false}` = snapshot-or-tile only (the feed's 88 overlay, which
 * picks up the square snapshot its own card produces via dcSubscribe).
 */
import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { RealMap } from '@/components/real-map';
import { useTokens } from '@/hooks/use-tokens';
import { dcGet, dcSet, dcSubscribe } from '@/lib/data-cache';
import { useMapSlot } from '@/lib/map-pool';
import { useScheme } from '@/store/use-scheme';
import type { Coordinate } from '@/types';

const TILE_SETTLE_MS = 300;   // after onMapReady: let the tiles paint before showing
const SLOT_TIMEOUT_MS = 8000; // a map that never snapshots still frees its slot

type Props = {
  id: string;
  polyline?: Coordinate[] | null;
  line?: Coordinate[] | null;
  pending?: boolean;
  height: number;
  width?: number;
  borderRadius?: number;
  /** may render a native map (pool-bounded); false = snapshot-or-tile only */
  live?: boolean;
  /** 0 = viewable now (renders first), 1 = next in line */
  priority?: 0 | 1;
  square?: boolean;
  distanceMarkers?: boolean;
  units?: 'km' | 'mi';
  officialDistanceKm?: number;
  cache?: boolean;
};

export function RouteMap({ id, polyline, line, pending = false, height, width, borderRadius = 0, live = true, priority = 1, square = false, distanceMarkers, units, officialDistanceKm, cache = true }: Props) {
  const C = useTokens();
  const scheme = useScheme(s => s.resolved);
  const [w, setW] = useState(width ?? 0);
  const geom = line && line.length >= 2 ? line : polyline && polyline.length >= 2 ? polyline : null;
  const keyCard = `snap:${id}:c${w}x${height}:${scheme}`;
  const keySq = `snap:${id}:sq:${scheme}`;
  const key = square ? keySq : keyCard;
  const [snap, setSnap] = useState<string | null>(() => dcGet<string>(key) ?? null);
  useEffect(() => {
    setSnap(dcGet<string>(key) ?? null);
    return dcSubscribe(key, () => setSnap(dcGet<string>(key) ?? null));
  }, [key]);

  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(false);
  const wanted = live && !snap && !!geom && !pending && w > 0 && !done;
  const slot = useMapSlot(wanted, priority);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!slot) return;
    timer.current = setTimeout(() => setDone(true), SLOT_TIMEOUT_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [slot]);

  return (
    <View style={{ height, borderRadius, overflow: 'hidden', backgroundColor: C.surfaceAlt }} onLayout={width == null ? e => setW(Math.round(e.nativeEvent.layout.width)) : undefined}>
      {snap ? (
        <Image
          source={{ uri: snap }}
          style={{ width: '100%', height }}
          contentFit="cover"
          cachePolicy="memory"
          transition={0}
          onError={() => { dcSet(key, null); setSnap(null); }}
        />
      ) : null}
      {!snap && slot && geom && (
        <View style={[StyleSheet.absoluteFillObject, { opacity: shown ? 1 : 0 }]} pointerEvents="none">
          <RealMap
            height={height}
            polyline={geom}
            cache={cache}
            distanceMarkers={distanceMarkers}
            units={units}
            officialDistanceKm={officialDistanceKm}
            onReady={() => { setTimeout(() => setShown(true), TILE_SETTLE_MS); }}
            onSnapshot={({ card, square: sq }) => {
              if (card) dcSet(keyCard, card);
              if (sq) dcSet(keySq, sq);
              // keep THIS map on screen (no swap to the image mid-view); the
              // snapshot serves the next mount. Free the pool slot now.
              setDone(true);
            }}
          />
        </View>
      )}
    </View>
  );
}
