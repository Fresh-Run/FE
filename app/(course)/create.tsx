/**
 * 코스 설정 + AI 생성 — Course creation screen.
 * Presented as fullScreenModal over the tab bar (wired from fresh-tab-bar.tsx).
 *
 * View states:
 *   'form'       — user configures inputs
 *   'generating' — real backend call (use-generate-route.ts); cancellable
 *   'result'     — generated route preview; "다시 설정" returns to form,
 *                  "시작하기" is a placeholder for the tracking screen item
 *
 * Result hero renders the real route geometry via MiniMap's polyline prop
 * (dark+neon stylized aesthetic — no real base map by design decision).
 */
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t, tf } from '@/lib/i18n';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiniMap } from '@/components/mini-map';
import { RealMap } from '@/components/real-map';
import { Icon } from '@/components/ui';
import { Toggle } from '@/components/toggle';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { useWaypointNames } from '@/hooks/use-waypoint-names';
import { waypointCacheKey } from '@/lib/waypoint-names';
import { distUnit, fmtDist, KM_PER_MI } from '@/lib/run-format';
import { haversineKm } from '@/lib/run-metrics';
import { setActiveCourse } from '@/store/active-course';
import { useEndPoint } from '@/store/end-point';
import { setRouteMap } from '@/store/route-map';
import { useStartPoint } from '@/store/start-point';
import { useSettings } from '@/store/use-settings';
import {
  LOOP_MIN_TARGET_KM,
  LoopTooShortError,
  OneWayTooFarError,
  useGenerateRoute,
  type GeneratedRoute,
  type Waypoint,
} from '@/hooks/use-generate-route';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';

// ─── Constants ────────────────────────────────────────────────────────────────

// Canvas-aligned vocab (C2, 2026-07-10): 화장실/공원 in, 지하철역 out.
// Single-select stays — pitstop_keyword takes ONE string ≤50 (canvas
// multi-select cut per contract; parity note in TODO.md).
const PITSTOP_OPTIONS = ['편의점', '화장실', '카페', '공원'] as const;

// 고급 설정 footer — labels for the invisible generation defaults
const TERRAIN_KEY = { flat: 'terrain.flat', mixed: 'terrain.mixed', hill: 'terrain.hill' } as const; // keys — render-time (static-capture rule)
const SURFACE_KEY = { any: 'surface.any', paved: 'surface.paved', trail: 'surface.trail' } as const;
// PITSTOP display labels — the VALUES stay Korean (server Kakao keywords, data not UI)
const PITSTOP_LABEL_KEY = { '편의점': 'pit.convenience', '화장실': 'pit.restroom', '카페': 'pit.cafe', '공원': 'pit.park' } as const;

type ViewState     = 'form' | 'generating' | 'result';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Friendly-rounded shortfall for the undershoot invitation (지연 copy,
    2026-07-23). km mode: <1km → meters in 50m steps ("600m"), ≥1km → 0.1km
    ("1.2km"). mi mode: 0.1mi steps ("0.4mi"). target_missed only fires
    beyond the ±0.5km 보장, so the value never rounds to zero in km mode;
    the mi floor guards the 0.31mi minimum from displaying as 0.3→ fine,
    but a sub-step value clamps UP to one step (never "0 부족"). */
function fmtShortfall(km: number, units: 'km' | 'mi'): string {
  if (units === 'mi') {
    const mi = Math.max(0.1, Math.round((km / KM_PER_MI) * 10) / 10);
    return `${mi.toFixed(1)}mi`;
  }
  const m = Math.max(50, Math.round((km * 1000) / 50) * 50);
  if (m < 1000) return `${m}m`; // boundary keyed on the ROUNDED value: 975m → "1.0km", not "1000m"
  return `${(Math.round(km * 10) / 10).toFixed(1)}km`;
}

function fmtMin(min: number): string {
  if (min < 60) return tf('crt.min', { n: min });
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? tf('crt.hour', { h }) : tf('crt.hourMin', { h, m });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  const st = useStyles(makeSt);
  return <Text style={st.sectionLabel}>{text}</Text>;
}

function Chip({
  label, active, locked, onPress,
}: { label: string; active: boolean; locked?: boolean; onPress?: () => void }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  return (
    <Pressable
      onPress={locked ? undefined : onPress}
      disabled={locked}
      style={[st.chip, active && st.chipActive, locked && st.chipLocked]}
    >
      {locked && <Icon name="lock-closed-outline" size={11} color={C.faint} />}
      <Text style={[st.chipTxt, active ? st.chipTxtActive : locked ? st.chipTxtLocked : undefined]}>
        {label}
      </Text>
    </Pressable>
  );
}

// Toggle — shared house component now (components/toggle.tsx, 2026-07-23):
// gated buzz-when-ON rides there; the local copy is retired.

function AdvToggleRow({ label, sub, on, onChange }: {
  label: string; sub: string; on: boolean; onChange: (v: boolean) => void;
}) {
  const st = useStyles(makeSt);
  return (
    <View style={st.advToggleRow}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={st.advToggleLabel}>{label}</Text>
        <Text style={st.advToggleSub}>{sub}</Text>
      </View>
      <Toggle on={on} onChange={onChange} />
    </View>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  const st = useStyles(makeSt);
  return (
    <View style={st.statTile}>
      <Text style={st.statVal}>{value}</Text>
      <Text style={st.statLabel}>{label}</Text>
    </View>
  );
}

function WaypointRow({ wp, index, displayName }: { wp: Waypoint; index: number; displayName?: string }) {
  const st = useStyles(makeSt);
  return (
    <View style={st.wpRow}>
      <View style={st.wpIndex}>
        <Text style={st.wpIndexTxt}>{index + 1}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={st.wpName} numberOfLines={1}>{displayName ?? wp.name}</Text>
          {wp.is_pitstop && (
            <View style={st.pitstopBadge}>
              <Text style={st.pitstopTxt}>{t('pit.badge')}</Text>
            </View>
          )}
        </View>
        {wp.description
          ? <Text style={st.wpDesc} numberOfLines={1}>{wp.description}</Text>
          : null
        }
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

const HERO_H = 210;

// Loop floor sync (error-lane slice 2026-07-23): the mi-mode slider floor is
// the smallest 0.5mi detent that COVERS the km floor (1.5mi ≥ 2.0km) — a
// detent below it would still 422.
const LOOP_MIN_MI = Math.ceil((LOOP_MIN_TARGET_KM / KM_PER_MI) * 2) / 2;

export default function CreateScreen() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const { generate } = useGenerateRoute();

  // ── Form state ──────────────────────────────────────────────────────────────
  // distanceKm stays km-internal (payload unit); the slider is UNIT-NATIVE
  // (owner design change 2026-07-06): km mode 1–30km, mi mode 0.5–20mi with
  // mi steps. Backend bound verified: target_distance_km gt=0 le=100 — 20mi
  // (32.19km) fits, no clamp needed. Unit switches preserve physical distance
  // because only the km value is stored.
  // Seed from settings.ai_course.default_distance_km: the server consults it
  // only when the body omits distance, and this form always sends it — so the
  // pref lands here as the slider's initial value instead. Clamped to the
  // active unit's slider range; pre-sync cold start = server default (5.0).
  // AI-banner tap-direct (M build, 2026-07-22): ?auto=1&seedKm= — the banner's
  // derived distance outranks the pref seed, same clamp. (Note: the parked
  // funnel-v1 branch carries its own seedKm intake — merge point when it
  // unparks, flagged.)
  const { seedKm: seedParam, auto: autoParam } = useLocalSearchParams<{ seedKm?: string; auto?: string }>();
  const seedKm = useMemo(() => {
    const { units: u, ai_course } = useSettings.getState().settings;
    // seed lo = the LOOP floor (the form mounts in loop mode; a sub-floor
    // pref/banner seed would land on an illegal detent)
    const [lo, hi] = u === 'mi' ? [LOOP_MIN_MI * KM_PER_MI, 20 * KM_PER_MI] : [LOOP_MIN_TARGET_KM, 30];
    const fromBanner = seedParam ? Number(seedParam) : NaN;
    const base = Number.isFinite(fromBanner) && fromBanner > 0 ? fromBanner : ai_course.default_distance_km;
    return Math.min(hi, Math.max(lo, base));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [distanceKm, setDistanceKm] = useState(seedKm);
  const units = useSettings(s => s.settings.units);
  const isMi = units === 'mi';
  const distDisplay = isMi ? distanceKm / KM_PER_MI : distanceKm;
  const [pitstop, setPitstop]       = useState<string | null>(null);

  // ── 고급 설정 (C2) ──────────────────────────────────────────────────────────
  // 언덕 피하기 seeds from settings.ai_course and is ALWAYS sent as a body
  // override (this-request-only; never PATCHes settings). 초기화 → seed.
  const seedAvoidHills = useMemo(() => useSettings.getState().settings.ai_course.avoid_hills, []);
  const [avoidHills, setAvoidHills] = useState(seedAvoidHills);
  // 번잡한 길 피하기 has no structured field — travels as a notes hint
  // (contract-sanctioned free-form channel, owner call ② 2026-07-10)
  const [avoidBusy, setAvoidBusy]   = useState(false);
  const [advOpen, setAdvOpen]       = useState(false);
  // Live prefs for the read-only defaults footer
  const aiPrefs = useSettings(s => s.settings.ai_course);

  // ── Location — shared hook handles permission + fallback ────────────────────
  const { status: locationStatus, coordinate: gpsCoord, placeName } = useCurrentLocation();
  // Manual override from the start-picker (C1); cleared when the form unmounts
  // so the next session starts back on GPS
  const manualStart = useStartPoint(s => s.point);
  useEffect(() => () => useStartPoint.getState().clear(), []);
  const startCoord = manualStart ? { lat: manualStart.lat, lng: manualStart.lng } : gpsCoord;

  // ── 일방통행 (v2.3 unlock) ──────────────────────────────────────────────────
  // end is sent ONLY in one-way mode (the server's one-way semantics key on
  // end PRESENCE — prefer_loop stays settings-backed and untouched).
  const [oneWay, setOneWay] = useState(false);
  const manualEnd = useEndPoint(s => s.point);
  useEffect(() => () => useEndPoint.getState().clear(), []);
  const endCoord = manualEnd ? { lat: manualEnd.lat, lng: manualEnd.lng } : null;
  // Feasibility pre-warn — mirrors the server gate exactly (422 when
  // |start−end| > target×0.8; min = d/0.8, 0.1-올림) so the local warn and
  // the server's answer can't disagree beyond float dust.
  const straightKm  = oneWay && endCoord ? haversineKm(startCoord, endCoord) : null;
  const minTargetKm = straightKm != null ? Math.ceil((straightKm / 0.8) * 10) / 10 : null;
  const endTooFar   = straightKm != null && straightKm > distanceKm * 0.8;
  const sliderMaxKm = isMi ? 20 * KM_PER_MI : 30;

  // ── Flow state ──────────────────────────────────────────────────────────────
  // auto mode opens ON the generating shell (single round-trip — nothing
  // between tap and generation); the effect below fires the real call the
  // moment a REAL location resolves (granted-key rule — never the Seoul
  // fallback: the banner's 지금-위치 promise). DENIED drops to the form,
  // the honest fallback surface. Cancel also lands on the form.
  const [autoMode] = useState(autoParam === '1');
  const [viewState, setViewState] = useState<ViewState>(autoParam === '1' ? 'generating' : 'form');
  const [route, setRoute]         = useState<GeneratedRoute | null>(null);
  // 지점 N fill — placeholder waypoints get real names (label-shape slice);
  // top-level call (hooks rule), no-ops until a route exists
  const wpNames = useWaypointNames(route?.waypoints);
  const [genError, setGenError]   = useState<string | null>(null);
  // Target captured at request time — the miss banner's delta must compare
  // against what was actually asked, not the (resettable) slider state.
  const [genTargetKm, setGenTargetKm] = useState(0);

  // Ref so cancelled-generation results are silently dropped
  const genCancelledRef = useRef(false);
  // Controller for the in-flight request — cancel actually aborts the fetch
  const genAbortRef = useRef<AbortController | null>(null);

  // ── Generation ──────────────────────────────────────────────────────────────
  // banner tap-direct auto-fire — once, on real location (M build)
  const autoFiredRef = useRef(false);
  useEffect(() => {
    if (!autoMode || autoFiredRef.current) return;
    if (manualStart == null && locationStatus === 'denied') {
      autoFiredRef.current = true;
      setViewState('form'); // no honest location → the form is the fallback
      return;
    }
    if (manualStart == null && locationStatus !== 'granted') return; // still resolving
    autoFiredRef.current = true;
    handleGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMode, locationStatus, manualStart]);

  async function handleGenerate() {
    if (oneWay && !endCoord) return; // CTA is disabled; belt for the retry paths
    genCancelledRef.current = false;
    const controller = new AbortController();
    genAbortRef.current = controller;
    setViewState('generating');
    setGenError(null);
    setGenTargetKm(distanceKm);
    try {
      // 분위기 removed (owner ruling 2026-07-16) — `notes` survives for the
      // 회피 hints; the generator's Runner-preferences line now carries only these
      const noteParts = avoidBusy ? ['번잡한 길 피하기'] : [];
      const notes = noteParts.length > 0 ? noteParts.join(', ') : null;
      const result = await generate({
        start: startCoord,
        target_distance_km: distanceKm,
        pitstop_keyword: pitstop,
        notes,
        avoid_hills: avoidHills,
        end: oneWay ? endCoord : null,
      }, controller.signal);
      if (genCancelledRef.current) return;
      setRoute(result);
      setViewState('result');
    } catch (e: unknown) {
      if (genCancelledRef.current) return;
      if (e instanceof OneWayTooFarError) {
        // Server min is authoritative (guide: feed it into the slider
        // suggestion) — the inline warn row's 설정 chip carries the fix.
        setGenError(tf('crt.oneWayTooFar', { d: `${fmtDist(e.minTargetKm, units, 1)}${distUnit(units)}` }));
      } else if (e instanceof LoopTooShortError) {
        // Loop floor — the slider floor already mirrors the server gate, so
        // this fires only on drift (server raised its floor). Copy composed
        // here, unit-aware, from the server's authoritative min.
        setGenError(tf('crt.loopTooShort', { d: `${fmtDist(e.minTargetKm, units, 1)}${distUnit(units)}` }));
      } else {
        setGenError(e instanceof Error ? e.message : t('crt.genFail'));
      }
      setViewState('form');
    } finally {
      genAbortRef.current = null;
    }
  }

  function handleCancelGen() {
    genCancelledRef.current = true;
    genAbortRef.current?.abort();
    setViewState('form');
  }

  function handleBackToForm() {
    setViewState('form');
    setRoute(null);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // GENERATING
  // ══════════════════════════════════════════════════════════════════════════════
  if (viewState === 'generating') {
    return (
      <View style={[st.root, { paddingTop: insets.top }]}>
        {/* Cancel button */}
        <Pressable onPress={handleCancelGen} hitSlop={12} style={[st.closeBtn, { margin: S.gutter }]}>
          <Icon name="close" size={20} color={C.text} />
        </Pressable>
        <View style={st.genCenter}>
          <View style={st.genIcon}>
            <Icon name="leaf-outline" size={32} color={C.accentGrn} />
          </View>
          <ActivityIndicator size="large" color={C.accent} style={{ marginTop: S.lg }} />
          <Text style={st.genTitle}>{t('crt.genTitle')}</Text>
          <Text style={st.genSub}>{t('crt.genSub')}</Text>
          {/* tap-direct: the derived params, visible (M build spec) */}
          {autoMode && (
            <Text style={st.genSub}>{tf('crt.genAuto', { d: `${fmtDist(distanceKm, units, 1)}${distUnit(units)}` })}</Text>
          )}
        </View>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // RESULT
  // ══════════════════════════════════════════════════════════════════════════════
  if (viewState === 'result' && route) {
    const pitstopCount = route.waypoints.filter(w => w.is_pitstop).length;
    const estMin = route.estimated_duration_min ?? Math.round(route.total_distance_km * 6.5);
    const deltaKm = route.total_distance_km - genTargetKm;

    return (
      <View style={st.root}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          {/* ── Map hero — real route geometry on Apple Maps (slice 1);
                 MiniMap stays as the no-geometry fallback ── */}
          <View style={[st.hero, { height: HERO_H + insets.top }]}>
            {route.polyline && route.polyline.length >= 2 ? (
              // hero (not a list thumbnail) — cache=false for live tiles, same
              // class as the run-detail hero. startPin = 출발지 (owner ③a);
              // tap → full route map (the app's tap-to-enlarge grammar, ③b)
              <Pressable onPress={() => {
                setRouteMap({ title: route.summary, polyline: route.polyline! });
                router.push('/(course)/route-map' as never);
              }}>
                <RealMap height={HERO_H + insets.top} polyline={route.polyline} startPin cache={false} />
              </Pressable>
            ) : (
              <MiniMap seed={route.summary} height={HERO_H + insets.top} borderRadius={0} polyline={route.polyline} />
            )}
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(8,12,4,0.0)', 'rgba(8,12,4,0.78)']}
              style={StyleSheet.absoluteFillObject}
            />
            <View pointerEvents="box-none" style={[StyleSheet.absoluteFillObject, { paddingTop: insets.top + S.sm, paddingHorizontal: S.gutter }]}>
              <Pressable onPress={handleBackToForm} hitSlop={12} style={st.heroBackBtn}>
                <Icon name="arrow-back" size={20} color="#fff" />
              </Pressable>
              <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: S.lg }}>
                <View style={st.aiLabel}>
                  <Icon name="sparkles-outline" size={12} color={C.accentGrn} />
                  <Text style={st.aiLabelTxt}>{t('crt.aiGen')}</Text>
                </View>
                <Text style={st.heroTitle} numberOfLines={2}>{route.summary}</Text>
              </View>
            </View>
          </View>

          {/* ── Stats row ──────────────────────────────────────────────────── */}
          <View style={[st.statsRow, shadows.sm]}>
            <StatTile label={t('runSave.statDist')} value={`${route.total_distance_km.toFixed(1)} km`} />
            <View style={st.statsDivider} />
            <StatTile label={t('crt.estTime')} value={fmtMin(estMin)} />
            <View style={st.statsDivider} />
            <StatTile label={t('crt.pitstops')} value={tf('crt.nPlaces', { n: pitstopCount })} />
          </View>

          {/* ── 거리 보장 안내 — ±0.5km 계약(BE)의 "정직한 표시" 절반: 전패
                 최선 후보(target_missed)는 오차를 밝히고 다시 생성을 권한다 ── */}
          {route.target_missed && (
            <View style={{ paddingHorizontal: S.gutter, paddingTop: S.md }}>
              <View style={st.missCard}>
                <Icon name="alert-circle-outline" size={16} color={C.sun} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.missTitle}>{t('crt.missTitle')}</Text>
                  {/* Undershoot = action-framed (지연 copy upgrade 2026-07-23):
                      the shortfall becomes an invitation, friendly-rounded
                      (fmtShortfall). Overshoot keeps the factual delta line. */}
                  <Text style={st.missSub}>
                    {deltaKm < 0
                      ? tf('crt.missShort', { d: fmtShortfall(-deltaKm, units) })
                      : tf('crt.missOver', { req: `${fmtDist(genTargetKm, units, 1)}${distUnit(units)}`, got: `${fmtDist(route.total_distance_km, units, 1)}${distUnit(units)}`, delta: `${fmtDist(deltaKm, units, 1)}${distUnit(units)}` })}
                  </Text>
                </View>
                <Pressable onPress={handleGenerate} hitSlop={6} style={({ pressed }) => [st.missRetryBtn, pressed && { opacity: 0.7 }]}>
                  <Text style={st.missRetryTxt}>{t('crt.regen')}</Text>
                </Pressable>
              </View>
            </View>
          )}
          {route.radius_expanded && (
            <View style={{ paddingHorizontal: S.gutter, paddingTop: S.md }}>
              <View style={st.noticeCard}>
                <Icon name="information-circle-outline" size={15} color={C.accentGrn} />
                <Text style={st.noticeTxt}>{t('crt.radiusExpanded')}</Text>
              </View>
            </View>
          )}

          {/* ── Waypoints ──────────────────────────────────────────────────── */}
          <View style={{ paddingHorizontal: S.gutter, paddingTop: S.xl }}>
            <Text style={st.resultSectionTitle}>{t('crt.route')}</Text>
            <View style={[st.waypointCard, shadows.sm]}>
              {route.waypoints.map((wp, i) => (
                <View key={i}>
                  {i > 0 && <View style={st.wpDivider} />}
                  <WaypointRow wp={wp} index={i} displayName={wpNames[waypointCacheKey(wp.coordinate)]} />
                </View>
              ))}
            </View>
          </View>

          {/* ── Notice — generation-exit discoverability (코스 공개 slice):
                 routes persist server-side at generation; the old "저장은 다음
                 업데이트에서" copy was stale the moment 내 코스 shipped ── */}
          <View style={{ paddingHorizontal: S.gutter, paddingTop: S.md }}>
            <View style={st.noticeCard}>
              <Icon name="information-circle-outline" size={15} color={C.accentGrn} />
              <Text style={st.noticeTxt}>
                {t('crt.autoSaved')}
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* ── Footer CTAs ────────────────────────────────────────────────── */}
        <View style={[st.resultFooter, { paddingBottom: Math.max(insets.bottom, S.lg) + S.sm }]}>
          <Pressable onPress={handleBackToForm} style={st.secondaryBtn}>
            <Text style={st.secondaryBtnTxt}>{t('crt.adjust')}</Text>
          </Pressable>
          <Pressable
            // route_id (BE v116): the generated course's stored row id rides
            // into the run link. Null only on the server's save-failure edge
            // (course still serves) — guard, don't expect.
            onPress={() => {
              setActiveCourse({
                id: route.route_id ?? null,
                title: route.summary,
                distanceKm: route.total_distance_km,
                polyline: route.polyline ?? null,
              });
              router.replace('/(course)/tracking' as any);
            }}
            style={[st.primaryBtn, { flex: 1 }]}
          >
            <Icon name="play" size={18} color={C.accentText} />
            <Text style={st.primaryBtnTxt}>{t('crt.start')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // FORM
  // ══════════════════════════════════════════════════════════════════════════════
  const estMinForm = Math.round(distanceKm * 6.5);

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={st.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.closeBtn}>
          <Icon name="close" size={20} color={C.text} />
        </Pressable>
        <Text style={st.headerTitle}>{t('crt.header')}</Text>
        <Pressable
          onPress={() => {
            setDistanceKm(seedKm);
            setPitstop(null);
            setAvoidHills(seedAvoidHills);
            setAvoidBusy(false);
            useStartPoint.getState().clear();
          }}
          hitSlop={8}
          style={st.resetBtn}
        >
          <Text style={st.resetTxt}>{t('crt.reset')}</Text>
        </Pressable>
      </View>

      {/* ── Error banner (shown after failed generation) ─────────────── */}
      {genError && (
        <View style={st.errBanner}>
          <Icon name="alert-circle-outline" size={14} color={C.danger} />
          <Text style={st.errBannerTxt} numberOfLines={2}>{genError}</Text>
          <Pressable onPress={() => setGenError(null)} hitSlop={8}>
            <Icon name="close" size={14} color={C.danger} />
          </Pressable>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 108 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Section: 목표 거리 ─────────────────────────────────────── */}
        <View style={st.section}>
          <SectionLabel text={t('crt.targetDist')} />
          <View style={st.distanceDisplay}>
            <Text style={st.distanceValue}>
              {distDisplay.toFixed(1)}
              <Text style={st.distanceUnit}> {isMi ? 'mi' : 'km'}</Text>
            </Text>
            <Text style={st.distanceEst}>{tf('crt.estAbout', { t: fmtMin(estMinForm) })}</Text>
          </View>
          {/* Route-type-scoped floor (checkpoint resolution 2026-07-23):
              loop mode mirrors the server's loop gate (LOOP_MIN_TARGET_KM —
              stop selling detents the server 422s); 일방통행 keeps 1km/0.5mi
              — its own end-distance gate governs there and short
              point-to-point runs are legal. */}
          <Slider
            style={st.slider}
            minimumValue={oneWay ? (isMi ? 0.5 : 1) : (isMi ? LOOP_MIN_MI : LOOP_MIN_TARGET_KM)}
            maximumValue={isMi ? 20 : 30}
            step={0.5}
            value={distDisplay}
            onValueChange={v => setDistanceKm(isMi ? v * KM_PER_MI : v)}
            minimumTrackTintColor={C.accent}
            maximumTrackTintColor={C.border}
            thumbTintColor={C.accent}
          />
          <View style={st.sliderLabels}>
            <Text style={st.sliderLabel}>
              {oneWay ? (isMi ? '0.5 mi' : '1 km') : (isMi ? `${LOOP_MIN_MI} mi` : `${LOOP_MIN_TARGET_KM} km`)}
            </Text>
            <Text style={st.sliderLabel}>{isMi ? '20 mi' : '30 km'}</Text>
          </View>
        </View>

        <View style={st.sectionDivider} />

        {/* ── Section: 출발지 (C1) ──────────────────────────────────── */}
        <View style={st.section}>
          <SectionLabel text={t('crt.startSection')} />
          <View style={st.startRow}>
            <View style={st.startIcon}>
              <Icon name="locate" size={16} color={C.accentGrn} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.startLabel} numberOfLines={1}>
                {manualStart ? manualStart.label
                  : locationStatus === 'fetching' ? t('crt.locating')
                  : locationStatus === 'denied'   ? t('crt.seoulDenied')
                  : placeName}
              </Text>
              <Text style={st.startSub}>{manualStart ? t('crt.startManual') : t('crt.startCurrent')}</Text>
            </View>
            <Pressable
              onPress={() => router.push({
                pathname: '/(course)/start-picker' as never,
                params: { lat: String(startCoord.lat), lng: String(startCoord.lng) },
              })}
              hitSlop={8}
            >
              <Text style={st.startChangeTxt}>{t('crt.change')}</Text>
            </Pressable>
          </View>
          {manualStart && (
            <Pressable onPress={() => useStartPoint.getState().clear()} style={st.gpsRestoreBtn} hitSlop={6}>
              <Icon name="navigate-outline" size={13} color={C.accentGrn} />
              <Text style={st.gpsRestoreTxt}>{t('crt.gpsRestore')}</Text>
            </Pressable>
          )}
        </View>

        <View style={st.sectionDivider} />

        {/* ── Section: 경로 유형 (일방통행 LIVE — v2.3 unlock; the 준비 중
               pill died here) ────────────────────────────────────────────── */}
        <View style={st.section}>
          <SectionLabel text={t('crt.routeType')} />
          <View style={st.routeTypeRow}>
            <Pressable
              onPress={() => {
                setOneWay(false);
                // one-way→loop with a sub-floor target: the slider would
                // DISPLAY the floor while state stayed below it (a silent
                // 422 in waiting) — clamp the state to the floor explicitly
                if (distanceKm < LOOP_MIN_TARGET_KM) setDistanceKm(LOOP_MIN_TARGET_KM);
              }}
              style={[st.routeTypeBtn, !oneWay && st.routeTypeBtnActive]}
            >
              <Icon name="refresh-outline" size={16} color={!oneWay ? C.accentGrn : C.faint} />
              <Text style={[st.routeTypeTxt, { color: !oneWay ? C.accentGrn : C.faint }]}>{t('crt.loop')}</Text>
            </Pressable>
            <Pressable onPress={() => setOneWay(true)} style={[st.routeTypeBtn, oneWay && st.routeTypeBtnActive]}>
              <Icon name="arrow-forward-outline" size={16} color={oneWay ? C.accentGrn : C.faint} />
              <Text style={[st.routeTypeTxt, { color: oneWay ? C.accentGrn : C.faint }]}>{t('crt.oneWay')}</Text>
            </Pressable>
          </View>

          {/* 도착지 — 출발지 row grammar; picker is start-picker in target=end
              mode. Feasibility pre-warn mirrors the server's v2.3 gate. */}
          {oneWay && (
            <>
              <View style={st.startRow}>
                <View style={st.startIcon}>
                  <Icon name="flag-outline" size={16} color={C.accentGrn} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.startLabel} numberOfLines={1}>
                    {manualEnd ? manualEnd.label : t('crt.pickEnd')}
                  </Text>
                  <Text style={st.startSub}>{t('crt.endLabel')}</Text>
                </View>
                <Pressable
                  onPress={() => router.push({
                    pathname: '/(course)/start-picker' as never,
                    params: {
                      lat: String((endCoord ?? startCoord).lat),
                      lng: String((endCoord ?? startCoord).lng),
                      target: 'end',
                    },
                  })}
                  hitSlop={8}
                >
                  <Text style={st.startChangeTxt}>{manualEnd ? t('crt.change') : t('crt.select')}</Text>
                </Pressable>
              </View>
              {endTooFar && minTargetKm != null && (
                <View style={st.feasWarn}>
                  <Icon name="alert-circle-outline" size={14} color={C.sun} />
                  <Text style={st.feasWarnTxt} numberOfLines={2}>
                    {tf('crt.feasWarn', { d: `${fmtDist(minTargetKm, units, 1)}${distUnit(units)}` })}
                  </Text>
                  {minTargetKm <= sliderMaxKm && (
                    <Pressable onPress={() => setDistanceKm(minTargetKm)} hitSlop={6} style={({ pressed }) => [st.feasFixBtn, pressed && { opacity: 0.7 }]}>
                      <Text style={st.feasFixTxt}>{tf('crt.feasFix', { d: `${fmtDist(minTargetKm, units, 1)}${distUnit(units)}` })}</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </>
          )}
        </View>

        <View style={st.sectionDivider} />

{/* ── Section: 고급 설정 accordion (C2) ─────────────────────── */}
        <View style={st.section}>
          <Pressable onPress={() => setAdvOpen(o => !o)} style={st.advHeader} hitSlop={4}>
            <Icon name="options-outline" size={17} color={C.sub} />
            <Text style={st.advHeaderTxt}>{t('crt.advanced')}</Text>
            {!advOpen && <Text style={st.advHeaderHint}>{t('crt.advHint')}</Text>}
            <View style={{ flex: 1 }} />
            <Icon name={advOpen ? 'chevron-up' : 'chevron-down'} size={17} color={C.faint} />
          </Pressable>
          {advOpen && (
            <View style={st.advBody}>
              {/* 경유지 키워드 — single-select → pitstop_keyword */}
              <Text style={st.advSubLabel}>{t('crt.pitKeyword')}</Text>
              <View style={st.chipRow}>
                <Chip
                  label={t('pit.none')}
                  active={pitstop === null}
                  onPress={() => setPitstop(null)}
                />
                {PITSTOP_OPTIONS.map(opt => (
                  <Chip
                    key={opt}
                    label={t(PITSTOP_LABEL_KEY[opt])}
                    active={pitstop === opt}
                    onPress={() => setPitstop(prev => prev === opt ? null : opt)}
                  />
                ))}
              </View>

              {/* 회피 — per-request avoid_hills override + notes-append hint */}
              <AdvToggleRow
                label={t('crt.avoidHills')}
                sub={tf('crt.myDefault', { v: seedAvoidHills ? t('common.on') : t('common.off') })}
                on={avoidHills}
                onChange={setAvoidHills}
              />
              <AdvToggleRow
                label={t('crt.avoidBusy')}
                sub={t('crt.avoidBusySub')}
                on={avoidBusy}
                onChange={setAvoidBusy}
              />

              {/* Read-only prefs visibility (owner scope addition 2026-07-10) */}
              <View style={st.advFooter}>
                <Text style={st.advFooterTxt}>
                  {t('crt.myDefaults')}{[
                    t(TERRAIN_KEY[aiPrefs.terrain]),
                    t(SURFACE_KEY[aiPrefs.surface]),
                    aiPrefs.scenic ? t('crt.scenic') : null,
                    aiPrefs.prefer_loop ? t('crt.preferLoop') : null,
                  ].filter(Boolean).join(' · ')}
                </Text>
                <Text style={st.advFooterSub}>{t('crt.defaultsFooter')}</Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Sticky CTA — gated on a picked 도착지 in one-way mode ────── */}
      <View style={[st.formFooter, { paddingBottom: Math.max(insets.bottom, S.lg) + S.sm }]}>
        <Pressable
          onPress={handleGenerate}
          disabled={oneWay && !endCoord}
          style={({ pressed }) => [st.primaryBtn, oneWay && !endCoord && { backgroundColor: C.surfaceAlt }, { opacity: pressed ? 0.85 : 1 }]}
        >
          <Icon name="sparkles-outline" size={18} color={oneWay && !endCoord ? C.faint : C.accentText} />
          <Text style={[st.primaryBtnTxt, oneWay && !endCoord && { color: C.faint }]}>
            {oneWay && !endCoord ? t('crt.pickEnd') : t('crt.generate')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Header
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.gutter, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },
  closeBtn:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  resetBtn:    { width: 44, alignItems: 'flex-end', justifyContent: 'center' },
  resetTxt:    { fontSize: 13.5, fontWeight: '600', color: C.sub },

  // Error banner
  errBanner:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: S.gutter, paddingVertical: 10, backgroundColor: C.danger + '12', borderBottomWidth: 1, borderBottomColor: C.danger + '30' },
  errBannerTxt: { flex: 1, fontSize: 13, color: C.danger, letterSpacing: -0.2 },

  // Sections
  section:        { paddingHorizontal: S.gutter, paddingVertical: S.lg },
  sectionDivider: { height: 1, backgroundColor: C.border, marginHorizontal: S.gutter },
  sectionLabel:   { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: C.faint, textTransform: 'uppercase', marginBottom: S.md },
  sectionHint:    { fontSize: 11.5, color: C.faint, letterSpacing: -0.2, marginTop: -8, marginBottom: S.sm },

  // Distance
  distanceDisplay: { alignItems: 'center', paddingVertical: S.md },
  distanceValue:   { fontSize: 52, fontWeight: '700', letterSpacing: -2, color: C.text, lineHeight: 60 },
  distanceUnit:    { fontSize: 22, fontWeight: '600', color: C.sub },
  distanceEst:     { fontSize: 13.5, color: C.faint, marginTop: 4, letterSpacing: -0.3 },
  slider:          { width: '100%', height: 40 },
  sliderLabels:    { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  sliderLabel:     { fontSize: 11, color: C.faint, fontWeight: '600' },

  // Route type
  routeTypeRow:       { flexDirection: 'row', gap: 10 },
  routeTypeBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 48, borderRadius: R.lg, borderWidth: 1.5, borderColor: C.border, position: 'relative' },
  routeTypeBtnActive: { borderColor: C.accent, backgroundColor: C.accentDim },
  routeTypeTxt:       { fontSize: 14.5, fontWeight: '700', letterSpacing: -0.3 },

  // 일방통행 feasibility pre-warn (warning lane C.sun — the miss-banner class)
  feasWarn:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, backgroundColor: C.sun + '14', borderWidth: 1, borderColor: C.sun + '44', borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 10 },
  feasWarnTxt: { flex: 1, fontSize: 12.5, color: C.sub, letterSpacing: -0.2, lineHeight: 17 },
  feasFixBtn:  { backgroundColor: C.surface, borderWidth: 1, borderColor: C.sun + '66', borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 6 },
  feasFixTxt:  { fontSize: 12, fontWeight: '700', color: C.text, letterSpacing: -0.2 },

  // Chips (single and multi-select)
  chipRow:       { flexDirection: 'row', flexWrap: 'nowrap', gap: 8 },
  chipWrap:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:          { height: 36, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 4 },
  chipActive:    { backgroundColor: C.accentDim, borderColor: C.accent },
  chipLocked:    { backgroundColor: C.surfaceAlt, opacity: 0.55 },
  chipTxt:       { fontSize: 13.5, fontWeight: '600', letterSpacing: -0.2, color: C.sub },
  chipTxtActive: { color: C.accentGrn },
  chipTxtLocked: { color: C.faint },

  // 출발지 row (C1)
  startRow:       { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: 13, paddingVertical: 11 },
  startIcon:      { width: 34, height: 34, borderRadius: 17, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  startLabel:     { fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  startSub:       { fontSize: 11.5, color: C.faint, letterSpacing: -0.2, marginTop: 2 },
  startChangeTxt: { fontSize: 12.5, fontWeight: '700', color: C.sub, letterSpacing: -0.2, padding: 4 },
  gpsRestoreBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 2 },
  gpsRestoreTxt:  { fontSize: 12.5, fontWeight: '700', color: C.accentGrn, letterSpacing: -0.2 },

  // 고급 설정 accordion (C2)
  advHeader:     { flexDirection: 'row', alignItems: 'center', gap: 9 },
  advHeaderTxt:  { fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  advHeaderHint: { fontSize: 12, color: C.faint, letterSpacing: -0.2 },
  advBody:       { paddingTop: S.md },
  advSubLabel:   { fontSize: 12, fontWeight: '700', color: C.faint, letterSpacing: -0.2, marginBottom: S.sm },
  advToggleRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: S.lg },
  advToggleLabel: { fontSize: 14.5, fontWeight: '600', color: C.text, letterSpacing: -0.3 },
  advToggleSub:   { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 3 },
  advFooter:    { marginTop: S.lg, backgroundColor: C.surfaceAlt, borderRadius: R.md, padding: 12 },
  advFooterTxt: { fontSize: 12.5, color: C.sub, letterSpacing: -0.2, lineHeight: 18 },
  advFooterSub: { fontSize: 11.5, color: C.faint, letterSpacing: -0.2, marginTop: 4 },

  // Form footer
  formFooter: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: S.gutter, paddingTop: S.md, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border },

  // Shared buttons
  primaryBtn:    { height: 56, borderRadius: R.lg, backgroundColor: C.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  primaryBtnTxt: { fontSize: 16, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },
  secondaryBtn:  { height: 56, borderRadius: R.lg, backgroundColor: C.surfaceAlt, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: S.xl },
  secondaryBtnTxt: { fontSize: 15, fontWeight: '700', color: C.sub, letterSpacing: -0.3 },

  // ── Generating ──────────────────────────────────────────────────────────────
  genCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: S.gutter, gap: S.sm },
  genIcon:   { width: 72, height: 72, borderRadius: 36, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center', ...shadows.sm },
  genTitle:  { fontSize: 20, fontWeight: '700', letterSpacing: -0.6, color: C.text, textAlign: 'center', marginTop: S.lg, lineHeight: 28 },
  genSub:    { fontSize: 14, color: C.faint, letterSpacing: -0.2, marginTop: 6 },

  // ── Result ──────────────────────────────────────────────────────────────────
  hero:        { overflow: 'hidden' },
  heroBackBtn: { width: 40, height: 40, borderRadius: R.pill, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  aiLabel:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  aiLabelTxt:  { fontSize: 11, fontWeight: '800', color: C.accentGrn, letterSpacing: 0.3 },
  heroTitle:   { fontSize: 20, fontWeight: '700', color: '#fff', letterSpacing: -0.5, lineHeight: 26 },

  statsRow:     { flexDirection: 'row', backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  statTile:     { flex: 1, alignItems: 'center', paddingVertical: 16 },
  statVal:      { fontSize: 19, fontWeight: '700', letterSpacing: -0.5, color: C.text },
  statLabel:    { fontSize: 11, color: C.faint, marginTop: 3 },
  statsDivider: { width: 1, backgroundColor: C.border, marginVertical: 10 },

  resultSectionTitle: { fontSize: 15, fontWeight: '700', letterSpacing: -0.4, color: C.text, marginBottom: 12 },

  waypointCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.xl, overflow: 'hidden' },
  wpRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  wpDivider:    { height: 1, backgroundColor: C.border, marginHorizontal: 16 },
  wpIndex:      { width: 24, height: 24, borderRadius: 12, backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accent + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  wpIndexTxt:   { fontSize: 11, fontWeight: '800', color: C.accentGrn },
  wpName:       { fontSize: 14.5, fontWeight: '700', letterSpacing: -0.3, color: C.text },
  wpDesc:       { fontSize: 12.5, color: C.faint, letterSpacing: -0.2, marginTop: 2 },
  pitstopBadge: { backgroundColor: C.blue + '18', borderRadius: 6, borderWidth: 1, borderColor: C.blue + '44', paddingHorizontal: 6, paddingVertical: 2 },
  pitstopTxt:   { fontSize: 10, fontWeight: '800', color: C.blue, letterSpacing: 0.2 },

  noticeCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accent + '44', borderRadius: R.md, padding: 12 },
  noticeTxt:  { flex: 1, fontSize: 12.5, color: C.accentGrn, letterSpacing: -0.2, lineHeight: 18 },

  // 거리 미스 배너 — 경고 톤(C.sun): 오류(danger)도 정보(accent)도 아닌 주의
  missCard:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.sun + '14', borderWidth: 1, borderColor: C.sun + '44', borderRadius: R.md, padding: 12 },
  missTitle:    { fontSize: 13, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  missSub:      { fontSize: 12, color: C.sub, letterSpacing: -0.2, marginTop: 2 },
  missRetryBtn: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.sun + '66', borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 7 },
  missRetryTxt: { fontSize: 12.5, fontWeight: '700', color: C.text, letterSpacing: -0.2 },

  resultFooter: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 10, paddingHorizontal: S.gutter, paddingTop: S.md, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border },
});
