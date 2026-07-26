/**
 * 집결 장소 pick — center-pin map picker (공지 composer, #6).
 *
 * NO canvas drawing exists for a coordinate picker (location-picker.jsx is
 * the region-hierarchy filter for 둘러보기) — this is the proposed design,
 * stated in the checkpoint: a pannable map under a FIXED center pin (the
 * standard pick idiom — drag the map, not the marker), a 현재 위치 button
 * (the canvas region-picker's 현재 위치 사용 idiom), and a confirm bar.
 *
 * Client-side bbox validation mirrors her server rule (lat 33~39 / lng
 * 124~132, BE 7ec4a96) — out-of-Korea centers disable 선택 with an inline
 * caption, cheaper than the 422 round-trip (which the submit path still
 * renders honestly if a race fires it).
 */
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CurrentLocationButton } from '@/components/current-location-button';
import { Icon } from '@/components/ui';
import { SEOUL_FALLBACK } from '@/hooks/use-current-location';
import { searchPlaces, type Place } from '@/lib/places-api';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useScheme } from '@/store/use-scheme';

// her server bbox (422 outside) — mirrored client-side
const KR_BBOX = { latMin: 33, latMax: 39, lngMin: 124, lngMax: 132 };
export function inKoreaBbox(lat: number, lng: number): boolean {
  return lat >= KR_BBOX.latMin && lat <= KR_BBOX.latMax && lng >= KR_BBOX.lngMin && lng <= KR_BBOX.lngMax;
}

export function PlacePickSheet({ visible, initial, onClose, onPick }: {
  visible: boolean;
  /** existing coords (edit mode) — the pin opens here and WINS over the
      runner's location; null = resolve current location first (Seoul only
      on DENIED — the tracking screen's granted-key fix, same race) */
  initial: { lat: number; lng: number } | null;
  onClose: () => void;
  onPick: (coords: { lat: number; lng: number }) => void;
}) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const resolved = useScheme(s => s.resolved); // map obeys the app scheme picker

  // start region resolves BEFORE the map renders — no Seoul-then-jump
  const [startRegion, setStartRegion] = useState<{ lat: number; lng: number } | null>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number }>(SEOUL_FALLBACK);
  // 주소 autocomplete — the start-picker transplant (S1 mechanics verbatim:
  // /api/places Kakao proxy, 400ms debounce, 2-char floor, monotonic
  // stale-guard; null = dropdown hidden, [] = quiet empty state)
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const searchSeq = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valid = inKoreaBbox(center.lat, center.lng);

  useEffect(() => {
    if (!visible) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const q = query.trim();
    if (q.length < 2) {
      searchSeq.current++; // invalidate any in-flight search
      setResults(null);
      return;
    }
    const seq = ++searchSeq.current;
    debounceTimer.current = setTimeout(() => {
      searchPlaces(q) // nationwide mode — relevance-sorted (the 출발지 path)
        .then(rows => { if (searchSeq.current === seq) setResults(rows); })
        // silent-fail to the empty state — search is auxiliary, panning always works
        .catch(() => { if (searchSeq.current === seq) setResults([]); });
    }, 400);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [query, visible]);

  function pickResult(pl: Place) {
    setResults(null);
    setQuery(pl.name);
    mapRef.current?.animateToRegion({
      latitude: pl.coordinate.lat, longitude: pl.coordinate.lng,
      latitudeDelta: 0.008, longitudeDelta: 0.008,
    }, 350);
    // fine-tune stays available — the landed pin is just the new center,
    // and the SAME bbox guard governs it via onRegionChangeComplete
  }

  useEffect(() => {
    if (!visible) return;
    setQuery(''); setResults(null);
    if (initial) { setStartRegion(initial); setCenter(initial); return; } // edit pin wins
    if (startRegion) return; // already resolved this session
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') { // the granted-key rule — never latch the fallback
          const pos = await Location.getCurrentPositionAsync({});
          if (!cancelled) {
            const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setStartRegion(here); setCenter(here);
            return;
          }
        }
      } catch { /* GPS miss → fallback below */ }
      if (!cancelled) { setStartRegion(SEOUL_FALLBACK); setCenter(SEOUL_FALLBACK); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initial]);

  function onRegionChange(r: Region) {
    setCenter({ lat: r.latitude, lng: r.longitude });
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={st.root}>
        {startRegion === null ? (
          <View style={st.resolving}>
            <ActivityIndicator size="large" color={C.accent} />
            <Text style={st.resolvingTxt}>내 위치 찾는 중…</Text>
          </View>
        ) : (
        <MapView
          ref={mapRef}
          userInterfaceStyle={resolved}
          style={StyleSheet.absoluteFillObject}
          initialRegion={{
            latitude: startRegion.lat, longitude: startRegion.lng,
            latitudeDelta: 0.012, longitudeDelta: 0.012,
          }}
          onRegionChangeComplete={onRegionChange}
          showsPointsOfInterest
          showsUserLocation
        />
        )}

        {/* fixed center pin — the map moves underneath */}
        {startRegion !== null && (
        <View pointerEvents="none" style={st.pinWrap}>
          <Icon name="location" size={38} color={C.danger} />
          <View style={st.pinDot} />
        </View>
        )}

        {/* app bar over the map */}
        <View style={[st.topBar, { paddingTop: insets.top + 6 }]}>
          <Pressable onPress={onClose} hitSlop={12} style={st.roundBtn}>
            <Icon name="close" size={20} color={C.text} />
          </Pressable>
          <View style={st.titlePill}><Text style={st.titleTxt}>집결 장소 선택</Text></View>
          {/* shared 현재 위치 affordance (moves the view; the center pin is
              the map center, so the pick follows the recenter here by design
              — the center-pin idiom's semantics, unlike tap-to-place) */}
          <CurrentLocationButton
            onFix={c => mapRef.current?.animateToRegion({
              latitude: c.lat, longitude: c.lng,
              latitudeDelta: 0.01, longitudeDelta: 0.01,
            }, 350)}
          />
        </View>

        {/* 주소 autocomplete (start-picker idiom) */}
        <View style={[st.searchWrap, { top: insets.top + 56 }]}>
          <View style={[st.searchBox, shadows.md]}>
            <Icon name="search" size={16} color={C.faint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="주소·장소 검색"
              placeholderTextColor={C.faint}
              style={st.searchInput}
            />
            {query.length > 0 && (
              <Pressable onPress={() => { setQuery(''); setResults(null); }} hitSlop={8}>
                <Icon name="close-circle" size={16} color={C.faint} />
              </Pressable>
            )}
          </View>
          {results !== null && (
            <View style={[st.resultsCard, shadows.md]}>
              {results.length === 0 ? (
                <Text style={st.resultsEmpty}>주소를 찾지 못했어요 — 지도를 움직여 선택해 주세요</Text>
              ) : (
                <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 264 }}>
                  {results.map((pl, i) => (
                    <Pressable
                      key={`${pl.name}-${i}`}
                      onPress={() => pickResult(pl)}
                      style={({ pressed }) => [st.resultRow, pressed && { opacity: 0.6 }, i > 0 && st.resultRowBorder]}
                    >
                      <Icon name="location-outline" size={16} color={C.accentGrn} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={st.resultName} numberOfLines={1}>{pl.name}</Text>
                        <Text style={st.resultSub} numberOfLines={1}>
                          {[pl.category, pl.address].filter(Boolean).join(' · ') || '—'}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          )}
        </View>

        {/* confirm bar */}
        <View style={[st.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
          {!valid && (
            <Text style={st.bboxWarn}>한국 내 위치만 선택할 수 있어요</Text>
          )}
          <Pressable
            onPress={valid ? () => onPick(center) : undefined}
            disabled={!valid}
            style={[st.pickBtn, !valid && st.pickBtnOff]}
          >
            <Text style={[st.pickTxt, !valid && { color: C.faint }]}>이 위치로 선택</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  pinWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', marginTop: -34 },
  pinDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: C.danger, marginTop: -4, opacity: 0.55 },

  resolving:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  resolvingTxt: { fontSize: 13, fontWeight: '600', color: C.sub, letterSpacing: -0.2 },

  searchWrap:  { position: 'absolute', left: S.gutter, right: S.gutter, gap: 6 },
  searchBox:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: R.md, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, fontSize: 14, color: C.text, letterSpacing: -0.2, paddingVertical: 0 },
  resultsCard:     { backgroundColor: C.surface, borderRadius: R.md, overflow: 'hidden' },
  resultsEmpty:    { textAlign: 'center', fontSize: 12.5, fontWeight: '600', color: C.sub, letterSpacing: -0.2, paddingVertical: 14, paddingHorizontal: 12 },
  resultRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  resultRowBorder: { borderTopWidth: 1, borderTopColor: C.border },
  resultName:      { fontSize: 14, fontWeight: '600', color: C.text, letterSpacing: -0.3 },
  resultSub:       { fontSize: 11.5, color: C.faint, letterSpacing: -0.2, marginTop: 1 },

  topBar:   { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S.lg },
  roundBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', ...shadows.md },
  titlePill:{ backgroundColor: C.surface, borderRadius: R.pill, paddingHorizontal: 16, paddingVertical: 9, ...shadows.md },
  titleTxt: { fontSize: 14, fontWeight: '700', color: C.text, letterSpacing: -0.3 },

  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: S.gutter, paddingTop: 12, gap: 8 },
  bboxWarn:  { textAlign: 'center', fontSize: 12.5, fontWeight: '700', color: C.danger, letterSpacing: -0.2, backgroundColor: C.surface, borderRadius: R.pill, paddingVertical: 7, ...shadows.sm },
  pickBtn:    { height: 54, borderRadius: 15, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', ...shadows.md },
  pickBtnOff: { backgroundColor: C.surfaceAlt },
  pickTxt:    { fontSize: 15.5, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },
});
