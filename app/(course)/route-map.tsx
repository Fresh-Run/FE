/**
 * 코스 경로 — full-screen in-app route map (owner correction 2026-07-14).
 * The meet-map convention applied to ROUTES: course previews (뛰러 가기
 * generation hero, course-preview hero) tap-to-enlarge into this pannable/
 * zoomable view — the app's tap-to-enlarge grammar (집결 카드, 공지 상세).
 * Route arrives via the one-shot store (polylines don't fit route params);
 * reached without a payload (stale deep-link) → honest empty state.
 */
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RealMap } from '@/components/real-map';
import { Icon } from '@/components/ui';
import { getRunTrack } from '@/lib/run-social-api';
import { colors as C, shadows, spacing as S } from '@/lib/theme';
import { takeRouteMap } from '@/store/route-map';

export default function RouteMapScreen() {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const [payload] = useState(() => takeRouteMap()); // one-shot; survives re-render
  // B7 upgrade decision (owner flag): tapping the hero BEFORE the full track
  // loads must not freeze this view on the coarse thumb — when the payload
  // carries upgradeRunId, fetch the full track and swap it in (silent fail →
  // the thumb stays, honest). key-remount refits the camera on swap.
  const [line, setLine] = useState(payload?.polyline ?? null);
  useEffect(() => {
    const id = payload?.upgradeRunId;
    if (!id) return;
    let cancelled = false;
    getRunTrack(id)
      .then(t => { if (!cancelled && t.polyline.length >= 2) setLine(t.polyline); })
      .catch(() => { /* coarse-but-real stands */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={st.root}>
      {line && line.length >= 2 ? (
        <RealMap
          key={`route-${line.length}`} // remount on the thumb→track swap (camera refit)
          height={winH}
          polyline={line}
          startPin
          interactive
          cache={false}
          borderRadius={0}
        />
      ) : (
        <View style={st.empty}>
          <Icon name="map-outline" size={36} color={C.faint} />
          <Text style={st.emptyTxt}>경로를 불러올 수 없어요</Text>
        </View>
      )}

      <View style={[st.topBar, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.roundBtn}>
          <Icon name="chevron-back" size={20} color={C.text} />
        </Pressable>
        {payload && (
          <View style={st.titlePill}>
            <Icon name="navigate" size={13} color={C.accentGrn} />
            <Text style={st.titleTxt} numberOfLines={1}>{payload.title}</Text>
          </View>
        )}
        <View style={{ width: 40 }} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  topBar:   { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S.lg, gap: 8, zIndex: 2 },
  roundBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', ...shadows.md },
  titlePill:{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, ...shadows.md },
  titleTxt: { flexShrink: 1, fontSize: 14, fontWeight: '700', color: C.text, letterSpacing: -0.3 },

  empty:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTxt: { fontSize: 14, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },
});
