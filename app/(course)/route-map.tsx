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
import { useT } from '@/lib/i18n';
import { getRunTrack } from '@/lib/run-social-api';
import { shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useSettings } from '@/store/use-settings';
import { takeRouteMap } from '@/store/route-map';

export default function RouteMapScreen() {
  const C = useTokens();
  const T = useT();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const [payload] = useState(() => takeRouteMap()); // one-shot; survives re-render
  // v2 THREE-STATE LAYER CYCLE · v3 REORDER (owner-ruled 2026-08-03):
  // ① labeled (default — POI/street names showing on open) → ② clean →
  // ③ satellite → ①. Per-visit; resets to ① labeled on re-entry.
  // NON-STICKY by ruling (8/3): per-visit reset is the design, not a gap.
  const [layer, setLayer] = useState<'clean' | 'labeled' | 'satellite'>('labeled');
  const { width: winW } = useWindowDimensions();
  const units = useSettings(s2 => s2.settings.units);
  // B7 upgrade decision (owner flag): tapping the hero BEFORE the full track
  // loads must not freeze this view on the coarse thumb — when the payload
  // carries upgradeRunId, fetch the full track and swap it in (silent fail →
  // the thumb stays, honest). key-remount refits the camera on swap.
  const [line, setLine] = useState(payload?.polyline ?? null);
  const centerMode = !!payload?.center; // 8/3: point-subject lane (바로뛰기)
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
          mapType={layer === 'satellite' ? 'hybrid' : 'standard'}
          showsPoi={layer !== 'clean'}
          // compass → bottom-left: DELTA from MapKit's top-right default
          // (origin ≈ winW−53 right, near-top). x pulls to ~16px from the
          // left edge; y drops it above the home indicator. Walk tunes.
          compassOffset={{ x: -(winW - 69), y: winH - insets.top - insets.bottom - 140 }}
          distanceMarkers={payload?.distanceMarkers}
          units={units}
          officialDistanceKm={payload?.officialDistanceKm}
          cache={false}
          borderRadius={0}
        />
      ) : centerMode ? (
        // 8/3 point-subject lane: the 바로뛰기 location card expands HERE now
        // (was meet-map user-mode, which had no labels and no cycle) — one
        // viewer, one cycle implementation. Same layer props as the route
        // lane; blue dot instead of a route.
        <RealMap
          height={winH}
          center={payload!.center}
          showsUser={payload?.showsUser}
          marker={!payload?.showsUser}
          interactive
          mapType={layer === 'satellite' ? 'hybrid' : 'standard'}
          showsPoi={layer !== 'clean'}
          compassOffset={{ x: -(winW - 69), y: winH - insets.top - insets.bottom - 140 }}
          cache={false}
          borderRadius={0}
        />
      ) : (
        <View style={st.empty}>
          <Icon name="map-outline" size={36} color={C.faint} />
          <Text style={st.emptyTxt}>{T('rm.loadFail')}</Text>
        </View>
      )}

      <View style={[st.topBar, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.roundBtn}>
          <Icon name="chevron-back" size={20} color={C.text} />
        </Pressable>
        {payload && (
          <View style={st.titlePill}>
            <Icon name={centerMode ? 'locate' : 'navigate'} size={13} color={C.accentGrn} />
            <Text style={st.titleTxt} numberOfLines={1}>{payload.title}</Text>
          </View>
        )}
        {/* layer cycle — icon reflects state: clean=layers-outline,
            labeled=layers (filled), satellite=globe-outline. Icon-only
            (zero keys); a11y hardcoded ko per this slice-7 file. */}
        <Pressable
          onPress={() => setLayer(l => l === 'labeled' ? 'clean' : l === 'clean' ? 'satellite' : 'labeled')}
          hitSlop={12}
          style={st.roundBtn}
          accessibilityLabel={layer === 'clean' ? T('rm.layerClean') : layer === 'labeled' ? T('rm.layerLabeled') : T('rm.layerSat')}
        >
          <Icon name={layer === 'clean' ? 'layers-outline' : layer === 'labeled' ? 'layers' : 'globe-outline'} size={19} color={C.text} />
        </Pressable>
      </View>
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  topBar:   { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S.lg, gap: 8, zIndex: 2 },
  roundBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', ...shadows.md },
  titlePill:{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, ...shadows.md },
  titleTxt: { flexShrink: 1, fontSize: 14, fontWeight: '700', color: C.text, letterSpacing: -0.3 },

  empty:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTxt: { fontSize: 14, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },
});
