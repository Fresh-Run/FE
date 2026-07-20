/**
 * 출발지 선택 — start-point picker for AI course generation (C1 + S1).
 * Two entry paths: map-tap (owner call 2026-07-10, coordinates directly) and
 * address/place search (S1) via GET /api/places — the backend's Kakao Local
 * keyword proxy. Search is NATIONWIDE (BE 61d7656 two-mode contract: no
 * coords → 전국 정확도순) — the old pan-then-search map-center bias retired
 * with it; the center ref survives only to scale the jump animation.
 *
 * Server validates Korea bounds (lat 33–39, lng 124–132) — out-of-bounds taps
 * disable the confirm CTA instead of letting generation 422. Kakao results
 * are Korea-only inherently; the guard stays as a belt.
 */
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { SEOUL_FALLBACK } from '@/hooks/use-current-location';
import { searchPlaces, type Place } from '@/lib/places-api';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useEndPoint } from '@/store/end-point';
import { useStartPoint } from '@/store/start-point';

const SEARCH_DEBOUNCE_MS = 400;
const SEARCH_MIN_CHARS = 2;

const KOREA_BOUNDS = { latMin: 33, latMax: 39, lngMin: 124, lngMax: 132 };
const inKorea = (lat: number, lng: number) =>
  lat >= KOREA_BOUNDS.latMin && lat <= KOREA_BOUNDS.latMax &&
  lng >= KOREA_BOUNDS.lngMin && lng <= KOREA_BOUNDS.lngMax;

export default function StartPickerScreen() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  // Initial region: the form's current effective start (passed as params).
  // target=end (v2.3 one-way unlock) reuses this screen verbatim as the
  // 도착지 picker — same map-tap + search machinery, writes to the end store.
  const params = useLocalSearchParams<{ lat?: string; lng?: string; target?: string }>();
  const isEnd = params.target === 'end';
  const initLat = Number(params.lat) || SEOUL_FALLBACK.lat;
  const initLng = Number(params.lng) || SEOUL_FALLBACK.lng;

  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);
  const [label, setLabel]   = useState<string | null>(null);
  // Monotonic id so a slow reverse-geocode can't overwrite a newer tap's label
  const geocodeSeq = useRef(0);

  // ── Address search (S1) ────────────────────────────────────────────────────
  const [query, setQuery]     = useState('');
  // null = list hidden; [] = completed search with no hits (empty state)
  const [results, setResults] = useState<Place[] | null>(null);
  const searchSeq = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Visible-map center — used only to scale the result-jump animation
  // (nationwide results can be a cross-country hop from the current view)
  const centerRef = useRef({ lat: initLat, lng: initLng });
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const q = query.trim();
    if (q.length < SEARCH_MIN_CHARS) {
      searchSeq.current++; // invalidate any in-flight search
      setResults(null);
      return;
    }
    const seq = ++searchSeq.current;
    debounceTimer.current = setTimeout(() => {
      searchPlaces(q) // nationwide mode — no coords, relevance-sorted
        .then(rows => { if (searchSeq.current === seq) setResults(rows); })
        // Silent-fail to the empty state — search is auxiliary, map-tap always works
        .catch(() => { if (searchSeq.current === seq) setResults([]); });
    }, SEARCH_DEBOUNCE_MS);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [query]);

  function pickResult(place: Place) {
    geocodeSeq.current++; // a pending map-tap reverse-geocode must not overwrite
    setPicked(place.coordinate);
    setLabel(place.name);  // Kakao place name beats a reverse-geocoded label
    setResults(null);
    Keyboard.dismiss();
    // Cross-country hops (nationwide results) get a slower flight so the
    // context change reads; nearby picks keep the snappy 350ms.
    const jumpDeg = Math.max(
      Math.abs(place.coordinate.lat - centerRef.current.lat),
      Math.abs(place.coordinate.lng - centerRef.current.lng),
    );
    mapRef.current?.animateToRegion({
      latitude: place.coordinate.lat,
      longitude: place.coordinate.lng,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, jumpDeg > 0.5 ? 900 : 350); // 0.5° ≈ 50km
  }

  function onMapPress(lat: number, lng: number) {
    setResults(null);
    Keyboard.dismiss();
    setPicked({ lat, lng });
    setLabel(null);
    const seq = ++geocodeSeq.current;
    Location.reverseGeocodeAsync({ latitude: lat, longitude: lng })
      .then(([geo]) => {
        if (geocodeSeq.current !== seq) return;
        const name = [geo?.city, geo?.district ?? geo?.street ?? geo?.subregion]
          .filter(Boolean).join(' ');
        setLabel(name || '선택한 위치');
      })
      .catch(() => { if (geocodeSeq.current === seq) setLabel('선택한 위치'); });
  }

  const outOfBounds = picked !== null && !inKorea(picked.lat, picked.lng);
  const canConfirm = picked !== null && !outOfBounds;

  function confirm() {
    if (!picked) return;
    const store = isEnd ? useEndPoint : useStartPoint;
    store.getState().setPoint({ ...picked, label: label ?? '선택한 위치' });
    router.back();
  }

  return (
    <View style={st.root}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={{
          latitude: initLat,
          longitude: initLng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        onPress={e => {
          const { latitude, longitude } = e.nativeEvent.coordinate;
          onMapPress(latitude, longitude);
        }}
        onRegionChangeComplete={r => {
          centerRef.current = { lat: r.latitude, lng: r.longitude };
        }}
        showsUserLocation
        showsPointsOfInterest={false}
        toolbarEnabled={false}
      >
        {picked && (
          <Marker coordinate={{ latitude: picked.lat, longitude: picked.lng }} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={st.pickedMarker} />
          </Marker>
        )}
      </MapView>

      {/* App bar (overlay): back + search field (S1) */}
      <View style={[st.appBar, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={[st.backBtn, shadows.sm]}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <View style={[st.searchField, shadows.sm]}>
          <Icon name="search" size={16} color={C.faint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="장소·주소 검색"
            placeholderTextColor={C.faint}
            style={st.searchInput}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => { setQuery(''); setResults(null); }} hitSlop={8}>
              <Icon name="close-circle" size={16} color={C.faint} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Search results card (S1) */}
      {results !== null && (
        <View style={[st.resultsCard, shadows.md, { top: insets.top + 58 }]}>
          {results.length === 0 ? (
            <Text style={st.resultsEmpty}>검색 결과가 없어요</Text>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 264 }}>
              {results.map((p, i) => (
                <Pressable
                  key={`${p.name}-${i}`}
                  onPress={() => pickResult(p)}
                  style={({ pressed }) => [st.resultRow, pressed && { opacity: 0.6 }, i > 0 && st.resultRowBorder]}
                >
                  <Icon name="location-outline" size={16} color={C.accentGrn} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.resultName} numberOfLines={1}>{p.name}</Text>
                    <Text style={st.resultSub} numberOfLines={1}>
                      {[p.category, p.address].filter(Boolean).join(' · ') || '—'}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Bottom card */}
      <View style={[st.bottomCard, shadows.md, { paddingBottom: Math.max(insets.bottom, S.md) + S.sm }]}>
        {picked === null ? (
          <View style={st.hintRow}>
            <Icon name="locate" size={16} color={C.accentGrn} />
            <Text style={st.hintTxt}>{isEnd ? '지도를 탭해서 도착지를 선택하세요' : '지도를 탭해서 출발지를 선택하세요'}</Text>
          </View>
        ) : (
          <View style={st.hintRow}>
            <Icon name="location" size={16} color={outOfBounds ? C.danger : C.accentGrn} />
            <Text style={[st.pickedTxt, outOfBounds && { color: C.danger }]} numberOfLines={1}>
              {outOfBounds ? '국내 위치만 지원해요' : (label ?? '주소 확인 중...')}
            </Text>
          </View>
        )}
        <Pressable
          onPress={confirm}
          disabled={!canConfirm}
          style={({ pressed }) => [st.confirmBtn, !canConfirm && st.confirmBtnDisabled, pressed && canConfirm && { opacity: 0.85 }]}
        >
          <Text style={[st.confirmTxt, !canConfirm && { color: C.faint }]}>{isEnd ? '이 위치로 도착' : '이 위치에서 출발'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:   { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: S.gutter },
  backBtn:  { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },

  // Search (S1)
  searchField: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, backgroundColor: C.surface, borderRadius: R.pill, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontSize: 14.5, color: C.text, letterSpacing: -0.3, paddingVertical: 0 },
  resultsCard:     { position: 'absolute', left: S.gutter, right: S.gutter, backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  resultsEmpty:    { textAlign: 'center', paddingVertical: 18, fontSize: 13.5, color: C.faint, letterSpacing: -0.2 },
  resultRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  resultRowBorder: { borderTopWidth: 1, borderTopColor: C.border },
  resultName:      { fontSize: 14.5, fontWeight: '600', color: C.text, letterSpacing: -0.3 },
  resultSub:       { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },

  pickedMarker: { width: 18, height: 18, borderRadius: 9, backgroundColor: C.accentGrn, borderWidth: 4, borderColor: '#fff' },

  bottomCard: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.bg, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, paddingHorizontal: S.gutter, paddingTop: S.lg },
  hintRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: S.md },
  hintTxt:   { fontSize: 14, color: C.sub, letterSpacing: -0.3 },
  pickedTxt: { flex: 1, fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },

  confirmBtn:         { height: 54, borderRadius: R.lg, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  confirmBtnDisabled: { backgroundColor: C.surfaceAlt, borderWidth: 1.5, borderColor: C.border },
  confirmTxt:         { fontSize: 15.5, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },
});
