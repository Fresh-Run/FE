import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MediaCarousel } from '@/components/media-carousel';
import { PaceElevChart, SplitsTable } from '@/components/run-splits';
import { Icon } from '@/components/ui';
// MiniMap fallback now lives inside MediaCarousel (no polyline → seed map)
import { useRunDetail } from '@/hooks/use-runs';
import { getRunTrack } from '@/lib/run-social-api';
import { distUnit, fmtDist, fmtDuration, fmtPaceIn, fmtWhen, timeTitle } from '@/lib/run-format';
import { colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';
import { KCAL_PER_KG_KM, useLocalProfile } from '@/store/use-local-profile';
import { useSettings } from '@/store/use-settings';
import type { Coordinate } from '@/types';

// ACSM flat-running approximation: ~1.036 kcal per kg per km. Shown only
// with a USER-CONFIRMED weight (owner rule: never guess off the default),
// always labeled 추정.

// ─── Stat tile ────────────────────────────────────────────────────────────────

function StatTile({
  icon, label, value, unit, accent = false, hint,
}: {
  icon: string; label: string; value: string; unit?: string; accent?: boolean; hint?: string;
}) {
  return (
    <View style={[st.tile, shadows.sm]}>
      <View style={st.tileTop}>
        <Icon name={icon} size={13} color={accent ? C.accentGrn : C.faint} />
        <Text style={st.tileLabel}>{label}</Text>
      </View>
      <Text style={[st.tileValue, accent && { color: C.accentGrn }]}>
        {value}
        {unit ? <Text style={st.tileUnit}> {unit}</Text> : null}
      </Text>
      {hint ? <Text style={st.tileHint}>{hint}</Text> : null}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

const HERO_H = 200;

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const { runId } = useLocalSearchParams<{ runId: string }>();
  const { run, loading, error, refetch } = useRunDetail(runId ?? null);
  const units = useSettings(s => s.settings.units);

  // kcal 추정 — only with a user-confirmed local weight (saved flag)
  const lpFields = useLocalProfile(s => s.fields);
  const lpSaved  = useLocalProfile(s => s.saved);
  useEffect(() => { useLocalProfile.getState().hydrate(); }, []);

  // Real track hero — fetched when the run reports has_track.
  // Retry-on-refocus (SWR-lite, audit finding): a failed fetch marks
  // trackFailed; the next screen focus re-attempts, so one bad fetch never
  // leaves a tracked run stylized for the whole visit.
  const [track, setTrack] = useState<Coordinate[] | null>(null);
  const [trackFailed, setTrackFailed] = useState(false);
  const [trackAttempt, setTrackAttempt] = useState(0);
  useEffect(() => {
    if (!run?.has_track || !run.id) return;
    let cancelled = false;
    setTrackFailed(false);
    getRunTrack(run.id)
      .then(t => { if (!cancelled) setTrack(t.polyline); })
      .catch(() => { if (!cancelled) setTrackFailed(true); }); // seed fallback stands until refocus
    return () => { cancelled = true; };
  }, [run?.has_track, run?.id, trackAttempt]);
  useFocusEffect(useCallback(() => {
    if (trackFailed) setTrackAttempt(a => a + 1);
  }, [trackFailed]));

  // Refetch on focus (silent — useRunDetail's SWR-lite): returning from
  // 러닝 편집 shows the new title/visibility/memo without a spinner flash
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[st.root, { paddingTop: insets.top }]}>
        <View style={st.loadingWrap}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      </View>
    );
  }

  // ── Error / not found ──────────────────────────────────────────────────────
  if (error || !run) {
    return (
      <View style={[st.root, { paddingTop: insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={[st.backBtnLight, { margin: S.lg }]}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <View style={st.centeredState}>
          <Icon name="warning-outline" size={36} color={C.faint} />
          <Text style={st.stateTxt}>{error ?? '기록을 찾을 수 없어요'}</Text>
          <Pressable onPress={refetch} style={st.retryBtn}>
            <Text style={st.retryTxt}>다시 시도</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const dist  = fmtDist(run.distance_km, units, 2);
  const dur   = fmtDuration(run.duration_sec);
  const pace  = run.avg_pace_sec_per_km != null ? fmtPaceIn(run.avg_pace_sec_per_km, units) : '--';
  const when  = fmtWhen(run.ran_at);
  const title = run.title ?? timeTitle(run.ran_at);

  const splits = run.splits ?? [];
  const kcal = lpSaved && lpFields.weightKg > 0
    ? String(Math.round(KCAL_PER_KG_KM * lpFields.weightKg * run.distance_km))
    : null;

  return (
    <View style={st.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 48 }}
      >
        {/* ── Hero — real track (+ photos) via MediaCarousel; trackless runs
               keep the seed-stylized fallback inside the carousel ── */}
        <View style={[st.hero, { height: HERO_H + insets.top }]}>
          <MediaCarousel
            polyline={track}
            seed={run.id}
            photos={run.photos ?? []}
            height={HERO_H + insets.top}
          />
          <LinearGradient
            colors={['rgba(8,12,4,0.0)', 'rgba(8,12,4,0.72)']}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
          {/* Back button sits in safe area; box-none keeps carousel swipes alive */}
          <View
            style={[StyleSheet.absoluteFillObject, { paddingTop: insets.top + S.sm }]}
            pointerEvents="box-none"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S.gutter }}>
              <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
                <Icon name="arrow-back" size={20} color="#fff" />
              </Pressable>
              {/* 편집 (edit-run slice) — own-run screen by contract */}
              <Pressable
                onPress={() => router.push({
                  pathname: '/(records)/edit-run' as never,
                  params: { runId: run.id },
                })}
                hitSlop={12}
                style={st.backBtn}
              >
                <Icon name="create-outline" size={19} color="#fff" />
              </Pressable>
            </View>
          </View>
        </View>

        {/* ── Content ───────────────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: S.gutter, paddingTop: S.lg }}>

          {/* Date line */}
          <View style={st.whenRow}>
            <View style={st.greenDot} />
            <Text style={st.whenTxt}>{when}</Text>
          </View>

          {/* Title */}
          <Text style={st.titleTxt}>{title}</Text>

          {/* Stat grid 2×2 (canvas FrActivityDetail) */}
          <View style={st.tileRow}>
            <StatTile icon="location-outline" label="거리" value={dist} unit={distUnit(units)} accent />
            <StatTile icon="time-outline"     label="시간" value={dur} />
          </View>
          <View style={[st.tileRow, { marginTop: 10 }]}>
            <StatTile icon="speedometer-outline" label="평균 페이스" value={pace} />
            <StatTile
              icon="flame-outline"
              label="소모 칼로리 (추정)"
              value={kcal ?? '—'}
              unit={kcal ? 'kcal' : undefined}
              hint={kcal ? undefined : '체중 입력 시 표시'}
            />
          </View>

          {/* 조정됨 caption — server ±10% recompute (guide §148: is_flagged
              → distance_km replaced, original kept in distance_km_reported).
              Quiet, informational; own-run screen so the field is real. */}
          {run.is_flagged ? (
            <View style={st.flaggedRow}>
              <Icon name="information-circle-outline" size={13} color={C.faint} />
              <Text style={st.flaggedTxt}>
                GPS 검증으로 거리가 조정됐어요
                {run.distance_km_reported != null ? ` (기록값 ${fmtDist(run.distance_km_reported, units, 2)}${distUnit(units)})` : ''}
              </Text>
            </View>
          ) : null}

          {/* 구간 기록 — hidden entirely on splitless (sub-km/trackless) runs */}
          {splits.length > 0 && (
            <>
              <Text style={st.sectionTitle}>구간 기록</Text>
              <SplitsTable splits={splits} units={units} />
            </>
          )}

          {/* 페이스 & 고도 — needs at least two splits to chart */}
          {splits.length >= 2 && (
            <>
              <Text style={st.sectionTitle}>페이스 & 고도 분석</Text>
              <PaceElevChart splits={splits} />
            </>
          )}

          {/* Notes — only when present */}
          {run.notes ? (
            <View style={[st.notesCard, shadows.sm]}>
              <View style={st.notesHeader}>
                <Icon name="create-outline" size={14} color={C.faint} />
                <Text style={st.notesLabel}>메모</Text>
              </View>
              <Text style={st.notesTxt}>{run.notes}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Hero
  hero:       { overflow: 'hidden' },
  backBtn:    { width: 40, height: 40, borderRadius: R.pill, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  backBtnLight:{ width: 40, height: 40, borderRadius: R.pill, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },

  // Content
  whenRow:  { flexDirection: 'row', alignItems: 'center', gap: 7 },
  greenDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accentGrn },
  whenTxt:  { fontSize: 12.5, fontWeight: '600', color: C.sub, letterSpacing: -0.2 },
  titleTxt: { fontSize: 23, fontWeight: '700', letterSpacing: -0.7, color: C.text, marginTop: S.sm },

  // Stat tiles
  tileRow:   { flexDirection: 'row', gap: 10, marginTop: S.lg },
  flaggedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, paddingHorizontal: 2 },
  flaggedTxt: { fontSize: 11.5, color: C.faint, letterSpacing: -0.2, flexShrink: 1 },
  tile:      { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, padding: 13 },
  tileTop:   { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 7 },
  tileLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2, color: C.faint, textTransform: 'uppercase' },
  tileValue: { fontSize: 18, fontWeight: '700', letterSpacing: -0.5, color: C.text },
  tileUnit:  { fontSize: 11, fontWeight: '600', color: C.faint },
  tileHint:  { fontSize: 10.5, color: C.faint, letterSpacing: -0.2, marginTop: 3 },

  sectionTitle: { fontSize: 15, fontWeight: '700', letterSpacing: -0.4, color: C.text, marginTop: S.xl },

  // Notes
  notesCard:   { marginTop: S.lg, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, padding: S.md },
  notesHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  notesLabel:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.2, color: C.faint, textTransform: 'uppercase' },
  notesTxt:    { fontSize: 14, lineHeight: 21, color: C.sub, letterSpacing: -0.2 },

  // States
  centeredState: { paddingTop: 60, alignItems: 'center', gap: 12 },
  stateTxt:      { fontSize: 14, fontWeight: '600', color: C.faint, letterSpacing: -0.2, textAlign: 'center' },
  retryBtn:      { paddingHorizontal: 20, paddingVertical: 10, borderRadius: R.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  retryTxt:      { fontSize: 14, fontWeight: '700', color: C.text },
});
