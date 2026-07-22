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
import React, { useMemo, useRef } from 'react';
import { Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { KM_PER_MI } from '@/lib/run-format';
import { distanceCrossings } from '@/lib/run-metrics';
import { routeStroke } from '@/lib/theme';
import { useScheme } from '@/store/use-scheme';
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
  /** Native blue user-location dot (뛰러 가기 location card + its enlarged
      view). Renders in non-interactive card mode too (the dot is a native
      map layer, not a touch affordance) — but it arrives ASYNC, so cards
      showing it should pass cache={false} (the hero-class snapshot rule)
      or the snapshot can freeze dotless. Requires location permission —
      callers already gate on a resolved coordinate. */
  showsUser?: boolean;
  /** 출발지 PIN (owner correction 2026-07-14): a proper native pin at the
      route start instead of the subtle start dot — course previews looked
      unfinished without it. Feed cards keep the dots (unchanged). */
  startPin?: boolean;
  /** Static-snapshot optimization (iOS renders once → freezes to an image).
      Great for LISTS of thumbnails (scroll perf), but on an async-mounted
      HERO it can freeze a blank frame before Apple tiles load (polyline over
      blank tiles). Pass false on single hero maps. Default true; forced off
      when interactive. */
  cache?: boolean;
  /** km/mi markers on the route line (NRC-style, 2026-07-22) — OFF by
      default so feed minis stay clean; detail/result/enlarge surfaces opt
      in. Positions interpolated on the drawn segments (lib/run-metrics). */
  distanceMarkers?: boolean;
  /** unit for the markers (defaults km) — callers pass the settings unit */
  units?: 'km' | 'mi';
  /** (b) ruling: the run's OFFICIAL distance — crossings scale to it so the
      map tells the record's story (absent = as-drawn). */
  officialDistanceKm?: number;
};

export function RealMap({ height, borderRadius = 0, polyline, center, marker = false, startPin = false, showsUser = false, interactive = false, cache = true, distanceMarkers = false, units = 'km', officialDistanceKm }: Props) {
  // 지연 two-tone — keys on the RESOLVED scheme since Phase 5 (manual 다크
  // gets the dark stroke; 시스템 mode behaves as before via the store).
  // Map-theme binding (2026-07-22): the map obeys the APP's scheme picker,
  // not the OS — same `resolved` input routeStroke already consumes (unify,
  // not conflict: night-canvas fixtures + courseStroke key on it too).
  const resolved = useScheme(s => s.resolved);
  const stroke = routeStroke(resolved);
  const line = polyline && polyline.length >= 2 ? polyline : null;
  const mapRef = useRef<MapView>(null);

  const region = useMemo(() => {
    if (line) return fitRegion(line);
    const c = center ?? { lat: 37.5665, lng: 126.978 }; // 서울시청 fallback
    return { latitude: c.lat, longitude: c.lng, latitudeDelta: CENTER_DELTA, longitudeDelta: CENTER_DELTA };
  }, [line, center]);

  // Frame the track AFTER the map is ready (the tracking-screen pattern).
  // initialRegion alone is a one-shot mount hint that races the async tile
  // load — on the detail hero (async-mounted, larger, cacheEnabled) the iOS
  // static snapshot could freeze BEFORE Apple tiles rendered → polyline over
  // blank tiles. fitToCoordinates on ready forces a post-init camera set that
  // renders tiles into the (re)snapshot. No-op-equivalent for the feed cards
  // that already framed correctly.
  // km/mi markers — interpolated ON the drawn segments; circle = the route
  // stroke's own color family so they read as part of the line, number ink
  // = accentText-class on the dark-lime stroke / white on the light green
  // (contrast desk-proven ≥3:1 both). Markers use DEFAULT tracksViewChanges
  // — the ={false} flag snapshots an empty bitmap at mount (convicted
  // 2026-07-22); re-render cost at ≤30 static markers is trivial.
  const crossings = useMemo(
    () => (distanceMarkers && line ? distanceCrossings(line, units === 'mi' ? KM_PER_MI : 1, officialDistanceKm) : []),
    [distanceMarkers, line, units, officialDistanceKm],
  );
  const markerInk = resolved === 'dark' ? '#0D1A06' : '#fff';

  const onMapReady = () => {
    if (!line) return;
    mapRef.current?.fitToCoordinates(line.map(toLatLng), {
      edgePadding: { top: 24, right: 24, bottom: 24, left: 24 },
      animated: false,
    });
  };

  return (
    <View
      style={{ height, borderRadius, overflow: 'hidden' }}
      pointerEvents={interactive ? 'auto' : 'none'}
    >
      <MapView
        ref={mapRef}
        userInterfaceStyle={resolved}
        style={{ flex: 1 }}
        initialRegion={region}
        onMapReady={onMapReady}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        pitchEnabled={interactive}
        rotateEnabled={interactive}
        cacheEnabled={cache && !interactive}
        showsUserLocation={showsUser}
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
              strokeColor={stroke}
              strokeWidth={4}
              lineCap="round"
              lineJoin="round"
            />
            {startPin ? (
              <Marker coordinate={toLatLng(line[0])} />
            ) : (
              <Marker coordinate={toLatLng(line[0])} anchor={{ x: 0.5, y: 0.5 }}>
                <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff', borderWidth: 4, borderColor: stroke }} />
              </Marker>
            )}
            <Marker coordinate={toLatLng(line[line.length - 1])} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: stroke, borderWidth: 3, borderColor: '#fff' }} />
            </Marker>
            {/* km markers — default tracksViewChanges (the dots' proven
                config): the ={false} "optimization" snapshotted an EMPTY
                bitmap at mount (the known iOS pitfall, convicted by the
                in-file control group 2026-07-22) */}
            {crossings.map(c => (
              <Marker key={`km-${c.n}`} coordinate={{ latitude: c.lat, longitude: c.lng }} anchor={{ x: 0.5, y: 0.5 }}>
                <View style={{ minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 3, backgroundColor: stroke, borderWidth: 1.5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: markerInk }}>{c.n}</Text>
                </View>
              </Marker>
            ))}
          </>
        )}
      </MapView>
    </View>
  );
}
