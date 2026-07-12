/**
 * RealMap — Apple Maps (react-native-maps, PROVIDER_DEFAULT: zero keys)
 * replacing the stylized SVG on ≥100px surfaces (owner threshold call
 * 2026-07-08; sub-100px thumbnails and crew surfaces keep MiniMap).
 *
 * Card mode (default): non-interactive — scroll/zoom/pitch/rotate disabled,
 * pointerEvents none, cacheEnabled (iOS renders once then swaps to a static
 * snapshot — the liteMode equivalent on Apple Maps).
 *
 * Two data modes:
 *  - polyline: {lat,lng}[] (API shape — adapted here, nowhere else) →
 *    auto-fit region + route line + start/end markers;
 *  - center: single {lat,lng} → region-only view (e.g. current location).
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { colors as C } from '@/lib/theme';
import type { Coordinate } from '@/types';

const EDGE_PAD = 1.35;       // bounds padding factor for auto-fit
const MIN_DELTA = 0.004;     // never zoom tighter than ~400m
const CENTER_DELTA = 0.008;  // region-only mode span (~800m)

// The one adapter: API {lat,lng} → react-native-maps {latitude,longitude}
const toLatLng = (c: Coordinate) => ({ latitude: c.lat, longitude: c.lng });

function fitRegion(coords: Coordinate[]) {
  const lats = coords.map(c => c.lat);
  const lngs = coords.map(c => c.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * EDGE_PAD, MIN_DELTA),
    longitudeDelta: Math.max((maxLng - minLng) * EDGE_PAD, MIN_DELTA),
  };
}

type Props = {
  height: number;
  borderRadius?: number;
  /** Route geometry (API {lat,lng} shape). ≥2 points required to draw. */
  polyline?: Coordinate[] | null;
  /** Region-only mode — used when no polyline is given. */
  center?: Coordinate | null;
  /** point marker at `center` (집결 장소 previews/detail — a centered-but-
      unmarked map reads as pinless; the native Marker stays truthful under
      any future interactivity) */
  marker?: boolean;
  /** Interactive map (slice-2+ surfaces); card mode when false (default). */
  interactive?: boolean;
};

export function RealMap({ height, borderRadius = 0, polyline, center, marker = false, interactive = false }: Props) {
  const line = polyline && polyline.length >= 2 ? polyline : null;

  const region = useMemo(() => {
    if (line) return fitRegion(line);
    const c = center ?? { lat: 37.5665, lng: 126.978 }; // 서울시청 fallback
    return { latitude: c.lat, longitude: c.lng, latitudeDelta: CENTER_DELTA, longitudeDelta: CENTER_DELTA };
  }, [line, center]);

  return (
    <View
      style={{ height, borderRadius, overflow: 'hidden' }}
      pointerEvents={interactive ? 'auto' : 'none'}
    >
      <MapView
        style={{ flex: 1 }}
        initialRegion={region}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        pitchEnabled={interactive}
        rotateEnabled={interactive}
        cacheEnabled={!interactive}
        showsPointsOfInterest={false}
        toolbarEnabled={false}
      >
        {marker && center && !line && (
          <Marker coordinate={{ latitude: center.lat, longitude: center.lng }} />
        )}
        {line && (
          <>
            <Polyline
              coordinates={line.map(toLatLng)}
              strokeColor={C.accentGrn}
              strokeWidth={4}
              lineCap="round"
              lineJoin="round"
            />
            <Marker coordinate={toLatLng(line[0])} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff', borderWidth: 4, borderColor: C.accentGrn }} />
            </Marker>
            <Marker coordinate={toLatLng(line[line.length - 1])} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: C.accentGrn, borderWidth: 3, borderColor: '#fff' }} />
            </Marker>
          </>
        )}
      </MapView>
    </View>
  );
}
