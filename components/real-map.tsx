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
  /** route-map terrain toggle (8/1): 'hybrid' = satellite+labels. Undefined
      = standard — every card-mode consumer unchanged. */
  mapType?: 'standard' | 'hybrid';
  /** POI/store labels (8/1 field fix): default FALSE — the card minis'
      deliberate clean-thumbnail suppression. route-map opts in; applies to
      standard AND hybrid (the flag suppressed both). */
  showsPoi?: boolean;
  /** Native compass reposition (route-map v2): DELTA from MapKit's default
      top-right origin (AIRMap adds it to the frame — verified in source).
      iOS/Apple only; undefined = native default. */
  compassOffset?: { x: number; y: number };
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
  /** No-swap policy (2026-07-23): polyline frames the REGION but nothing
      line-derived draws (line/dots/markers) — the track appears once,
      complete, when the caller flips this off. */
  lineHidden?: boolean;
  /** 8/21 waypoint markers: numbered circles at course waypoints (①②③ —
      matches the route list). `title` = the waypoint's name → native callout
      on tap where the map is interactive (card mode is pointerEvents-none,
      so callouts are structurally inert there — tap-to-enlarge is the door).
      Names stay the served neutral placeholders (real-POI-only rule). */
  waypointMarkers?: { lat: number; lng: number; label: string; title?: string }[];
};

export function RealMap({ height, borderRadius = 0, polyline, center, marker = false, startPin = false, showsUser = false, interactive = false, cache = true, distanceMarkers = false, units = 'km', officialDistanceKm, lineHidden = false, mapType, showsPoi = false, compassOffset, waypointMarkers }: Props) {
  // 지연 two-tone — keys on the RESOLVED scheme since Phase 5 (manual 다크
  // gets the dark stroke; 시스템 mode behaves as before via the store).
  // Map-theme binding (2026-07-22): the map obeys the APP's scheme picker,
  // not the OS — same `resolved` input routeStroke already consumes (unify,
  // not conflict: night-canvas fixtures + courseStroke key on it too).
  const resolved = useScheme(s => s.resolved);
  // hybrid addendum (8/1): the satellite base is scheme-independent (dark
  // imagery under any app theme), so the stroke keys to the IMAGERY, not
  // the theme — hybrid always gets the dark-scheme lime.
  const stroke = mapType === 'hybrid' ? routeStroke('dark') : routeStroke(resolved);
  // 8/3 CRASH CLASS (her triage: AIRMap insertReactSubview nil via the
  // new-arch legacy interop — a MapView child resolving nil at mount; her
  // payload sweep showed ZERO nils, so the nil is manufactured client-side):
  // ① the line is FINITE-GUARDED — any malformed vertex (undefined/NaN
  //   lat/lng from any payload shape, generated or owner-curated canonical)
  //   is filtered BEFORE a Marker/Polyline can mount on it;
  // ② every conditional child below is TERNARY-TO-NULL (never a bare &&
  //   that could leak a non-boolean into native children);
  // ③ the Fragment wrapper inside MapView is DECOMPOSED — under interop an
  //   unexpected wrapper in the children walk is a nil-insert candidate.
  const line = useMemo(() => {
    if (!polyline || polyline.length < 2) return null;
    const clean = polyline.filter(c => c != null && Number.isFinite(c.lat) && Number.isFinite(c.lng));
    return clean.length >= 2 ? clean : null;
  }, [polyline]);
  // P1 나일-가드 (9/8, ASC 빌드-11 크래시): 8/3 ①룰의 웨이포인트 누락분 —
  // 라인은 finite-필터를 받는데 마커 좌표는 raw로 네이티브에 갔다. null/NaN
  // 멤버 좌표의 Marker = nil 네이티브 뷰 제조 (AIRMap insertReactSubview:
  // atIndex: object cannot be nil — AIRMap.m:138). 라인과 동일 이디엄으로
  // 마운트 전 여과 — 3 소비 표면 (create 히어로 · preview · 실전 소비처
  // 전부)이 이 초크포인트 하나로 커버된다.
  const wps = useMemo(
    () => (waypointMarkers ?? []).filter(w => w != null && Number.isFinite(w.lat) && Number.isFinite(w.lng)),
    [waypointMarkers],
  );
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
  // Legibility re-pair (owner finding 2026-07-22: route-color FILL
  // camouflaged the circles against the line itself). Inversion: scheme
  // surface fill · route color as number ink + ring — identity via ink,
  // separation-from-line via fill, edge-vs-tiles carried by the ring.
  const markerFill = resolved === 'dark' ? '#15171C' : '#fff'; // surface family

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
        mapType={mapType}
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
        showsPointsOfInterest={showsPoi}
        compassOffset={compassOffset}
        toolbarEnabled={false}
      >
        {marker && center && !line ? (
          <Marker coordinate={{ latitude: center.lat, longitude: center.lng }} />
        ) : null}
        {line && !lineHidden ? (
          <Polyline
            coordinates={line.map(toLatLng)}
            strokeColor={stroke}
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
          />
        ) : null}
        {line && !lineHidden ? (
          startPin ? (
            <Marker coordinate={toLatLng(line[0])} />
          ) : (
            <Marker coordinate={toLatLng(line[0])} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff', borderWidth: 4, borderColor: stroke }} />
            </Marker>
          )
        ) : null}
        {line && !lineHidden ? (
          <Marker coordinate={toLatLng(line[line.length - 1])} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: stroke, borderWidth: 3, borderColor: '#fff' }} />
          </Marker>
        ) : null}
        {/* km markers — default tracksViewChanges (the dots' proven config):
            the ={false} "optimization" snapshotted an EMPTY bitmap at mount
            (the known iOS pitfall, convicted by the in-file control group
            2026-07-22) */}
        {wps.length > 0 ? wps.map(w => (
          <Marker key={`wp-${w.label}`} coordinate={{ latitude: w.lat, longitude: w.lng }} anchor={{ x: 0.5, y: 0.5 }} title={w.title}>
            <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 4, backgroundColor: stroke, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#0D1A06' }}>{w.label}</Text>
            </View>
          </Marker>
        )) : null}
        {line && !lineHidden ? crossings.map(c => (
          <Marker key={`km-${c.n}`} coordinate={{ latitude: c.lat, longitude: c.lng }} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={{ minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 3, backgroundColor: markerFill, borderWidth: 2, borderColor: stroke, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: stroke }}>{c.n}</Text>
            </View>
          </Marker>
        )) : null}
      </MapView>
    </View>
  );
}
