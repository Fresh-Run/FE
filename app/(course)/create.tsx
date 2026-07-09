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
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useCurrentLocation } from '@/hooks/use-current-location';
import { KM_PER_MI } from '@/lib/run-format';
import { useStartPoint } from '@/store/start-point';
import { useSettings } from '@/store/use-settings';
import {
  useGenerateRoute,
  type GeneratedRoute,
  type Waypoint,
} from '@/hooks/use-generate-route';
import { colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

// Canvas-aligned vocab (C2, 2026-07-10): 화장실/공원 in, 지하철역 out.
// Single-select stays — pitstop_keyword takes ONE string ≤50 (canvas
// multi-select cut per contract; parity note in TODO.md).
const PITSTOP_OPTIONS = ['편의점', '화장실', '카페', '공원'] as const;

const VIBE_OPTIONS = [
  '한강변', '조용한 골목', '평탄한 코스',
  '오르막 피하기', '경치 좋은', '야경 명소',
] as const;

// 고급 설정 footer — labels for the invisible generation defaults
const TERRAIN_LABEL = { flat: '평지 우선', mixed: '균형', hill: '언덕 훈련' } as const;
const SURFACE_LABEL = { any: '노면 무관', paved: '포장도로', trail: '트레일' } as const;

type ViewState     = 'form' | 'generating' | 'result';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMin(min: number): string {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return <Text style={st.sectionLabel}>{text}</Text>;
}

function Chip({
  label, active, locked, onPress,
}: { label: string; active: boolean; locked?: boolean; onPress?: () => void }) {
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

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onChange(!on)}
      style={[st.toggleTrack, { backgroundColor: on ? C.accent : C.border }]}
      hitSlop={6}
    >
      <View style={[st.toggleThumb, { transform: [{ translateX: on ? 18 : 0 }] }]} />
    </Pressable>
  );
}

function AdvToggleRow({ label, sub, on, onChange }: {
  label: string; sub: string; on: boolean; onChange: (v: boolean) => void;
}) {
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
  return (
    <View style={st.statTile}>
      <Text style={st.statVal}>{value}</Text>
      <Text style={st.statLabel}>{label}</Text>
    </View>
  );
}

function WaypointRow({ wp, index }: { wp: Waypoint; index: number }) {
  return (
    <View style={st.wpRow}>
      <View style={st.wpIndex}>
        <Text style={st.wpIndexTxt}>{index + 1}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={st.wpName} numberOfLines={1}>{wp.name}</Text>
          {wp.is_pitstop && (
            <View style={st.pitstopBadge}>
              <Text style={st.pitstopTxt}>피스톱</Text>
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

export default function CreateScreen() {
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
  const seedKm = useMemo(() => {
    const { units: u, ai_course } = useSettings.getState().settings;
    const [lo, hi] = u === 'mi' ? [0.5 * KM_PER_MI, 20 * KM_PER_MI] : [1, 30];
    return Math.min(hi, Math.max(lo, ai_course.default_distance_km));
  }, []);
  const [distanceKm, setDistanceKm] = useState(seedKm);
  const units = useSettings(s => s.settings.units);
  const isMi = units === 'mi';
  const distDisplay = isMi ? distanceKm / KM_PER_MI : distanceKm;
  const [pitstop, setPitstop]       = useState<string | null>(null);
  const [vibes, setVibes]           = useState<string[]>([]);

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

  // ── Flow state ──────────────────────────────────────────────────────────────
  const [viewState, setViewState] = useState<ViewState>('form');
  const [route, setRoute]         = useState<GeneratedRoute | null>(null);
  const [genError, setGenError]   = useState<string | null>(null);

  // Ref so cancelled-generation results are silently dropped
  const genCancelledRef = useRef(false);
  // Controller for the in-flight request — cancel actually aborts the fetch
  const genAbortRef = useRef<AbortController | null>(null);

  // ── Vibe toggle ─────────────────────────────────────────────────────────────
  function toggleVibe(v: string) {
    setVibes(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);
  }

  // ── Generation ──────────────────────────────────────────────────────────────
  async function handleGenerate() {
    genCancelledRef.current = false;
    const controller = new AbortController();
    genAbortRef.current = controller;
    setViewState('generating');
    setGenError(null);
    try {
      const noteParts = [...vibes, ...(avoidBusy ? ['번잡한 길 피하기'] : [])];
      const notes = noteParts.length > 0 ? noteParts.join(', ') : null;
      const result = await generate({
        start: startCoord,
        target_distance_km: distanceKm,
        pitstop_keyword: pitstop,
        notes,
        avoid_hills: avoidHills,
      }, controller.signal);
      if (genCancelledRef.current) return;
      setRoute(result);
      setViewState('result');
    } catch (e: unknown) {
      if (genCancelledRef.current) return;
      setGenError(e instanceof Error ? e.message : '코스 생성에 실패했어요');
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
          <Text style={st.genTitle}>AI가 최적의 코스를{'\n'}설계하고 있어요</Text>
          <Text style={st.genSub}>잠시만 기다려 주세요</Text>
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
              <RealMap height={HERO_H + insets.top} polyline={route.polyline} />
            ) : (
              <MiniMap seed={route.summary} height={HERO_H + insets.top} borderRadius={0} polyline={route.polyline} />
            )}
            <LinearGradient
              colors={['rgba(8,12,4,0.0)', 'rgba(8,12,4,0.78)']}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={[StyleSheet.absoluteFillObject, { paddingTop: insets.top + S.sm, paddingHorizontal: S.gutter }]}>
              <Pressable onPress={handleBackToForm} hitSlop={12} style={st.heroBackBtn}>
                <Icon name="arrow-back" size={20} color="#fff" />
              </Pressable>
              <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: S.lg }}>
                <View style={st.aiLabel}>
                  <Icon name="sparkles-outline" size={12} color={C.accentGrn} />
                  <Text style={st.aiLabelTxt}>AI 생성</Text>
                </View>
                <Text style={st.heroTitle} numberOfLines={2}>{route.summary}</Text>
              </View>
            </View>
          </View>

          {/* ── Stats row ──────────────────────────────────────────────────── */}
          <View style={[st.statsRow, shadows.sm]}>
            <StatTile label="거리" value={`${route.total_distance_km.toFixed(1)} km`} />
            <View style={st.statsDivider} />
            <StatTile label="예상 시간" value={fmtMin(estMin)} />
            <View style={st.statsDivider} />
            <StatTile label="경유지" value={`${pitstopCount}곳`} />
          </View>

          {/* ── Waypoints ──────────────────────────────────────────────────── */}
          <View style={{ paddingHorizontal: S.gutter, paddingTop: S.xl }}>
            <Text style={st.resultSectionTitle}>경로</Text>
            <View style={[st.waypointCard, shadows.sm]}>
              {route.waypoints.map((wp, i) => (
                <View key={i}>
                  {i > 0 && <View style={st.wpDivider} />}
                  <WaypointRow wp={wp} index={i} />
                </View>
              ))}
            </View>
          </View>

          {/* ── Notice ─────────────────────────────────────────────────────── */}
          <View style={{ paddingHorizontal: S.gutter, paddingTop: S.md }}>
            <View style={st.noticeCard}>
              <Icon name="information-circle-outline" size={15} color={C.accentGrn} />
              <Text style={st.noticeTxt}>
                경로 저장은 다음 업데이트에서 지원돼요.
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* ── Footer CTAs ────────────────────────────────────────────────── */}
        <View style={[st.resultFooter, { paddingBottom: Math.max(insets.bottom, S.lg) + S.sm }]}>
          <Pressable onPress={handleBackToForm} style={st.secondaryBtn}>
            <Text style={st.secondaryBtnTxt}>다시 설정</Text>
          </Pressable>
          <Pressable
            onPress={() => Alert.alert('준비 중', '러닝 추적은 다음 업데이트에서 지원됩니다.')}
            style={[st.primaryBtn, { flex: 1 }]}
          >
            <Icon name="play" size={18} color={C.accentText} />
            <Text style={st.primaryBtnTxt}>시작하기</Text>
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
        <Text style={st.headerTitle}>코스 설정</Text>
        <Pressable
          onPress={() => {
            setDistanceKm(seedKm);
            setPitstop(null);
            setVibes([]);
            setAvoidHills(seedAvoidHills);
            setAvoidBusy(false);
            useStartPoint.getState().clear();
          }}
          hitSlop={8}
          style={st.resetBtn}
        >
          <Text style={st.resetTxt}>초기화</Text>
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
          <SectionLabel text="목표 거리" />
          <View style={st.distanceDisplay}>
            <Text style={st.distanceValue}>
              {distDisplay.toFixed(1)}
              <Text style={st.distanceUnit}> {isMi ? 'mi' : 'km'}</Text>
            </Text>
            <Text style={st.distanceEst}>약 {fmtMin(estMinForm)} 예상</Text>
          </View>
          <Slider
            style={st.slider}
            minimumValue={isMi ? 0.5 : 1}
            maximumValue={isMi ? 20 : 30}
            step={0.5}
            value={distDisplay}
            onValueChange={v => setDistanceKm(isMi ? v * KM_PER_MI : v)}
            minimumTrackTintColor={C.accent}
            maximumTrackTintColor={C.border}
            thumbTintColor={C.accent}
          />
          <View style={st.sliderLabels}>
            <Text style={st.sliderLabel}>{isMi ? '0.5 mi' : '1 km'}</Text>
            <Text style={st.sliderLabel}>{isMi ? '20 mi' : '30 km'}</Text>
          </View>
        </View>

        <View style={st.sectionDivider} />

        {/* ── Section: 출발지 (C1) ──────────────────────────────────── */}
        <View style={st.section}>
          <SectionLabel text="출발지" />
          <View style={st.startRow}>
            <View style={st.startIcon}>
              <Icon name="locate" size={16} color={C.accentGrn} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.startLabel} numberOfLines={1}>
                {manualStart ? manualStart.label
                  : locationStatus === 'fetching' ? '위치 확인 중...'
                  : locationStatus === 'denied'   ? '서울 중심 (위치 권한 없음)'
                  : placeName}
              </Text>
              <Text style={st.startSub}>{manualStart ? '직접 선택한 위치' : '현재 위치'}</Text>
            </View>
            <Pressable
              onPress={() => router.push({
                pathname: '/(course)/start-picker' as never,
                params: { lat: String(startCoord.lat), lng: String(startCoord.lng) },
              })}
              hitSlop={8}
            >
              <Text style={st.startChangeTxt}>변경</Text>
            </Pressable>
          </View>
          {manualStart && (
            <Pressable onPress={() => useStartPoint.getState().clear()} style={st.gpsRestoreBtn} hitSlop={6}>
              <Icon name="navigate-outline" size={13} color={C.accentGrn} />
              <Text style={st.gpsRestoreTxt}>현재 위치로 재설정</Text>
            </Pressable>
          )}
        </View>

        <View style={st.sectionDivider} />

        {/* ── Section: 경로 유형 ─────────────────────────────────────── */}
        <View style={st.section}>
          <SectionLabel text="경로 유형" />
          <View style={st.routeTypeRow}>
            {/* Loop — always selected this pass */}
            <Pressable style={[st.routeTypeBtn, st.routeTypeBtnActive]}>
              <Icon name="refresh-outline" size={16} color={C.accentGrn} />
              <Text style={[st.routeTypeTxt, { color: C.accentGrn }]}>원점 복귀</Text>
            </Pressable>
            {/* One-way — locked (destination picker is a future item) */}
            <Pressable style={[st.routeTypeBtn, st.routeTypeBtnLocked]} disabled>
              <Icon name="arrow-forward-outline" size={16} color={C.faint} />
              <Text style={[st.routeTypeTxt, { color: C.faint }]}>일방통행</Text>
              <View style={st.lockedBadge}>
                <Icon name="lock-closed-outline" size={9} color={C.faint} />
              </View>
            </Pressable>
          </View>
        </View>

        <View style={st.sectionDivider} />

        {/* ── Section: 분위기 ────────────────────────────────────────── */}
        <View style={st.section}>
          <SectionLabel text="분위기" />
          <Text style={st.sectionHint}>여러 개 선택 가능</Text>
          <View style={st.chipWrap}>
            {VIBE_OPTIONS.map(opt => (
              <Chip
                key={opt}
                label={opt}
                active={vibes.includes(opt)}
                onPress={() => toggleVibe(opt)}
              />
            ))}
          </View>
        </View>

        <View style={st.sectionDivider} />

        {/* ── Section: 고급 설정 accordion (C2) ─────────────────────── */}
        <View style={st.section}>
          <Pressable onPress={() => setAdvOpen(o => !o)} style={st.advHeader} hitSlop={4}>
            <Icon name="options-outline" size={17} color={C.sub} />
            <Text style={st.advHeaderTxt}>고급 설정</Text>
            {!advOpen && <Text style={st.advHeaderHint}>경유지 · 회피</Text>}
            <View style={{ flex: 1 }} />
            <Icon name={advOpen ? 'chevron-up' : 'chevron-down'} size={17} color={C.faint} />
          </Pressable>
          {advOpen && (
            <View style={st.advBody}>
              {/* 경유지 키워드 — single-select → pitstop_keyword */}
              <Text style={st.advSubLabel}>경유지 키워드</Text>
              <View style={st.chipRow}>
                <Chip
                  label="없음"
                  active={pitstop === null}
                  onPress={() => setPitstop(null)}
                />
                {PITSTOP_OPTIONS.map(opt => (
                  <Chip
                    key={opt}
                    label={opt}
                    active={pitstop === opt}
                    onPress={() => setPitstop(prev => prev === opt ? null : opt)}
                  />
                ))}
              </View>

              {/* 회피 — per-request avoid_hills override + notes-append hint */}
              <AdvToggleRow
                label="언덕 피하기"
                sub={`내 설정 기본값: ${seedAvoidHills ? '켬' : '끔'}`}
                on={avoidHills}
                onChange={setAvoidHills}
              />
              <AdvToggleRow
                label="번잡한 길 피하기"
                sub="사람 많은 길을 피해서 추천"
                on={avoidBusy}
                onChange={setAvoidBusy}
              />

              {/* Read-only prefs visibility (owner scope addition 2026-07-10) */}
              <View style={st.advFooter}>
                <Text style={st.advFooterTxt}>
                  내 기본 설정: {[
                    TERRAIN_LABEL[aiPrefs.terrain],
                    SURFACE_LABEL[aiPrefs.surface],
                    aiPrefs.scenic ? '경치 우선' : null,
                    aiPrefs.prefer_loop ? '순환 선호' : null,
                  ].filter(Boolean).join(' · ')}
                </Text>
                <Text style={st.advFooterSub}>프로필 › AI 코스 선호도에서 변경할 수 있어요</Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Sticky CTA ──────────────────────────────────────────────── */}
      <View style={[st.formFooter, { paddingBottom: Math.max(insets.bottom, S.lg) + S.sm }]}>
        <Pressable
          onPress={handleGenerate}
          style={({ pressed }) => [st.primaryBtn, { opacity: pressed ? 0.85 : 1 }]}
        >
          <Icon name="sparkles-outline" size={18} color={C.accentText} />
          <Text style={st.primaryBtnTxt}>코스 생성하기</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Header
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.gutter, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },
  closeBtn:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  resetBtn:    { width: 44, alignItems: 'flex-end', justifyContent: 'center' },
  resetTxt:    { fontSize: 13.5, fontWeight: '600', color: C.sub },

  // Error banner
  errBanner:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: S.gutter, paddingVertical: 10, backgroundColor: '#EF444412', borderBottomWidth: 1, borderBottomColor: '#EF444430' },
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
  routeTypeBtnLocked: { backgroundColor: C.surfaceAlt, opacity: 0.65 },
  routeTypeTxt:       { fontSize: 14.5, fontWeight: '700', letterSpacing: -0.3 },
  lockedBadge:        { position: 'absolute', top: 6, right: 8 },

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
  toggleTrack:    { width: 46, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  toggleThumb:    { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
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
  pitstopBadge: { backgroundColor: '#3D8BFF18', borderRadius: 6, borderWidth: 1, borderColor: '#3D8BFF44', paddingHorizontal: 6, paddingVertical: 2 },
  pitstopTxt:   { fontSize: 10, fontWeight: '800', color: '#3D8BFF', letterSpacing: 0.2 },

  noticeCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accent + '44', borderRadius: R.md, padding: 12 },
  noticeTxt:  { flex: 1, fontSize: 12.5, color: C.accentGrn, letterSpacing: -0.2, lineHeight: 18 },

  resultFooter: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 10, paddingHorizontal: S.gutter, paddingTop: S.md, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border },
});
