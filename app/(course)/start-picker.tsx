/**
 * 출발지 선택 — map-tap start-point picker for AI course generation (C1).
 * Owner call 2026-07-10: map-tap on react-native-maps (zero keys) instead of
 * the canvas FrLocationPicker admin drill-down — coordinates are what the API
 * wants, and this avoids the Apple forward-geocode quality risk + a nationwide
 * 동 dataset (parity note in TODO.md). Label via the same Apple reverse-geocode
 * path use-current-location already uses.
 *
 * Server validates Korea bounds (lat 33–39, lng 124–132) — out-of-bounds taps
 * disable the confirm CTA instead of letting generation 422.
 */
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { SEOUL_FALLBACK } from '@/hooks/use-current-location';
import { colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';
import { useStartPoint } from '@/store/start-point';

const KOREA_BOUNDS = { latMin: 33, latMax: 39, lngMin: 124, lngMax: 132 };
const inKorea = (lat: number, lng: number) =>
  lat >= KOREA_BOUNDS.latMin && lat <= KOREA_BOUNDS.latMax &&
  lng >= KOREA_BOUNDS.lngMin && lng <= KOREA_BOUNDS.lngMax;

export default function StartPickerScreen() {
  const insets = useSafeAreaInsets();
  // Initial region: the form's current effective start (passed as params)
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const initLat = Number(params.lat) || SEOUL_FALLBACK.lat;
  const initLng = Number(params.lng) || SEOUL_FALLBACK.lng;

  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);
  const [label, setLabel]   = useState<string | null>(null);
  // Monotonic id so a slow reverse-geocode can't overwrite a newer tap's label
  const geocodeSeq = useRef(0);

  function onMapPress(lat: number, lng: number) {
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
    useStartPoint.getState().setPoint({ ...picked, label: label ?? '선택한 위치' });
    router.back();
  }

  return (
    <View style={st.root}>
      <MapView
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

      {/* App bar (overlay) */}
      <View style={[st.appBar, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={[st.backBtn, shadows.sm]}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <View style={[st.titleBadge, shadows.sm]}>
          <Text style={st.titleTxt}>출발지 선택</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Bottom card */}
      <View style={[st.bottomCard, shadows.md, { paddingBottom: Math.max(insets.bottom, S.md) + S.sm }]}>
        {picked === null ? (
          <View style={st.hintRow}>
            <Icon name="locate" size={16} color={C.accentGrn} />
            <Text style={st.hintTxt}>지도를 탭해서 출발지를 선택하세요</Text>
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
          <Text style={[st.confirmTxt, !canConfirm && { color: C.faint }]}>이 위치에서 출발</Text>
        </Pressable>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:   { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.gutter },
  backBtn:  { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  titleBadge: { flex: 1, marginHorizontal: 10, alignSelf: 'center', alignItems: 'center', backgroundColor: C.surface, borderRadius: R.pill, paddingVertical: 9 },
  titleTxt:   { fontSize: 14.5, fontWeight: '700', letterSpacing: -0.3, color: C.text },

  pickedMarker: { width: 18, height: 18, borderRadius: 9, backgroundColor: C.accentGrn, borderWidth: 4, borderColor: '#fff' },

  bottomCard: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.bg, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, paddingHorizontal: S.gutter, paddingTop: S.lg },
  hintRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: S.md },
  hintTxt:   { fontSize: 14, color: C.sub, letterSpacing: -0.3 },
  pickedTxt: { flex: 1, fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },

  confirmBtn:         { height: 54, borderRadius: R.lg, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  confirmBtnDisabled: { backgroundColor: C.surfaceAlt, borderWidth: 1.5, borderColor: C.border },
  confirmTxt:         { fontSize: 15.5, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },
});
