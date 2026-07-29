import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MediaCarousel } from '@/components/media-carousel';
import { PhotoViewer } from '@/components/photo-viewer';
import { ScreenshotShareOffer } from '@/components/screenshot-share-offer';
import { setRouteMap } from '@/store/route-map';
import { PaceChart, SplitsTable } from '@/components/run-splits';
import { Icon } from '@/components/ui';
// MiniMap fallback now lives inside MediaCarousel (no polyline → seed map)
import { useRunDetail } from '@/hooks/use-runs';
import { t, tf, useT } from '@/lib/i18n';
import { deleteRun } from '@/lib/runs-api';
import { useRunTrack } from '@/lib/track-cache';
import { distUnit, fmtDist, fmtDuration, fmtPaceIn, fmtWhen, timeTitle } from '@/lib/run-format';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { KCAL_PER_KG_KM, useLocalProfile } from '@/store/use-local-profile';
import { useSettings } from '@/store/use-settings';

// ACSM flat-running approximation: ~1.036 kcal per kg per km. Shown only
// with a USER-CONFIRMED weight (owner rule: never guess off the default),
// always labeled 추정.

// ─── Stat tile ────────────────────────────────────────────────────────────────

function StatTile({
  icon, label, value, unit, accent = false, hint,
}: {
  icon: string; label: string; value: string; unit?: string; accent?: boolean; hint?: string;
}) {
  const C = useTokens();
  const st = useStyles(makeSt);
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
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  const insets = useSafeAreaInsets();
  const { runId } = useLocalSearchParams<{ runId: string }>();
  const { run, loading, error, refetch } = useRunDetail(runId ?? null);
  const units = useSettings(s => s.settings.units);

  // kcal 추정 — only with a user-confirmed local weight (saved flag)
  const lpFields = useLocalProfile(s => s.fields);
  const lpSaved  = useLocalProfile(s => s.saved);
  useEffect(() => { useLocalProfile.getState().hydrate(); }, []);

  // Hero line — the SHARED (a) cache lane (hero-joins ruling 2026-07-23:
  // ALL surfaces match the real track). Instant from session cache when the
  // user arrived through a card; failed-TTL + foreground-clear come free;
  // the per-screen B7 fetch/retry machinery retires. `track` name kept —
  // null when the line is still the thumb (drives the upgradeRunId handoff).
  const { line: heroLine, pending: heroPending } = useRunTrack(run?.id ?? null, run?.polyline_thumb);
  const track = heroLine !== null && heroLine !== (run?.polyline_thumb ?? null) ? heroLine : null;

  // Refetch on focus (silent — useRunDetail's SWR-lite): returning from
  // 러닝 편집 shows the new title/visibility/memo without a spinner flash
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  // ── 러닝 삭제 (own-run screen by contract, same as 편집) ────────────────────
  // 지연's instruction: no recovery — the dialog IS the last gate, honest
  // cascade copy. 404 = already gone = success (deleteRun's transport).
  const [delOpen, setDelOpen] = useState(false);
  // ⑦: photo tap-to-enlarge — B7's grammar extended to photo slides
  const [photoViewIdx, setPhotoViewIdx] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  async function doDelete() {
    if (deleting || !run) return;
    setDeleting(true);
    try {
      await deleteRun(run.id);
      setDelOpen(false);
      // The run (and this stack's screens for it) no longer exist —
      // land on the 기록 tab (crew-delete-modal's exit grammar)
      router.dismissAll?.();
      router.replace('/(tabs)/records' as never);
    } catch (e: unknown) {
      setDeleting(false);
      Alert.alert(t('annd.delFailT'), e instanceof Error ? e.message : t('runSave.saveFailBody'));
    }
  }

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
          <Text style={st.stateTxt}>{error ?? T('rp.notFound')}</Text>
          <Pressable onPress={refetch} style={st.retryBtn}>
            <Text style={st.retryTxt}>{T('common.retry')}</Text>
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
            distanceMarkers
            units={units}
            officialDistanceKm={run.distance_km}
            // thumb-first (B7 SWR grammar): the ≤36pt thumb paints INSTANTLY
            // from the payload; the server-simplified full track replaces it
            // when the fetch lands. Failed/offline → the thumb stays (real
            // geometry, just coarser — no error theater).
            polyline={heroLine ?? run.polyline_thumb ?? null}
            lineHidden={heroPending}
            seed={run.id}
            photos={run.photos ?? []}
            onPhotoPress={i => setPhotoViewIdx(i)}
            height={HERO_H + insets.top}
            onMapPress={() => {
              const line = track ?? run.polyline_thumb;
              if (!line || line.length < 2) return;
              setRouteMap({ title: run.title ?? timeTitle(run.ran_at), polyline: line, distanceMarkers: true, officialDistanceKm: run.distance_km, ...(track ? {} : { upgradeRunId: run.id }) });
              router.push('/(course)/route-map' as never);
            }}
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
              {/* 공유 + 편집 + 삭제 (own-run screen by contract) — the
                  screen's action idiom is header icon buttons; the share-card
                  composer door joins it (Slice 1, 2026-07-24) */}
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <Pressable
                  onPress={() => router.push({ pathname: '/share-card' as never, params: { runId: run.id } })}
                  hitSlop={12}
                  style={st.backBtn}
                >
                  <Icon name="share-outline" size={19} color="#fff" />
                </Pressable>
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
                <Pressable onPress={() => setDelOpen(true)} hitSlop={12} style={st.backBtn}>
                  <Icon name="trash-outline" size={19} color="#fff" />
                </Pressable>
              </View>
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
            <StatTile icon="location-outline" label={T('runSave.statDist')} value={dist} unit={distUnit(units)} accent />
            <StatTile icon="time-outline"     label={T('runSave.statTime')} value={dur} />
          </View>
          <View style={[st.tileRow, { marginTop: 10 }]}>
            <StatTile icon="speedometer-outline" label={T('res.avgPace')} value={pace} />
            <StatTile
              icon="flame-outline"
              label={T('act.kcalLabel')}
              value={kcal ?? '—'}
              unit={kcal ? 'kcal' : undefined}
              hint={kcal ? undefined : T('act.kcalHint')}
            />
          </View>

          {/* 조정됨 caption — server ±10% recompute (guide §148: is_flagged
              → distance_km replaced, original kept in distance_km_reported).
              Quiet, informational; own-run screen so the field is real. */}
          {run.is_flagged ? (
            <View style={st.flaggedRow}>
              <Icon name="information-circle-outline" size={13} color={C.faint} />
              <Text style={st.flaggedTxt}>
                {T('act.adjusted')}
                {run.distance_km_reported != null ? tf('act.adjustedVal', { v: `${fmtDist(run.distance_km_reported, units, 2)}${distUnit(units)}` }) : ''}
              </Text>
            </View>
          ) : null}

          {/* 구간 기록 — hidden entirely on splitless (sub-km/trackless) runs */}
          {splits.length > 0 && (
            <>
              <Text style={st.sectionTitle}>{T('act.sectionSplits')}</Text>
              <SplitsTable splits={splits} units={units} />
            </>
          )}

          {/* 페이스 차트 — needs at least two splits (elevation parked, 지연 ⓑ) */}
          {splits.length >= 2 && (
            <>
              <Text style={st.sectionTitle}>{T('act.sectionPace')}</Text>
              {/* The Strava quartet COMPLETES (v88 consumption 2026-07-23):
                  run.moving_sec (=Σ splits.moving_sec, stops excluded) pairs
                  with duration_sec as the elapsed side — the split-sum
                  refusal retires. Fallbacks: old runs serve moving_sec=null
                  → 이동 시간 falls back to duration_sec (the pre-v88 label
                  semantics). 평균 페이스 = moving-based where served (her
                  recommended default), avg_pace fallback. Caveat ledgered:
                  duration_sec is client-reported and OUR tracker freezes the
                  clock on manual pause — 총 시간 undercounts paused
                  stretches until a wall-clock field exists. */}
              <View style={[st.paceStatsCard, shadows.sm]}>
                {([
                  [T('res.avgPace'), run.moving_sec != null && run.distance_km > 0
                    ? fmtPaceIn(Math.round(run.moving_sec / run.distance_km), units)
                    : run.avg_pace_sec_per_km != null ? fmtPaceIn(run.avg_pace_sec_per_km, units) : '--'],
                  [T('act.movingTime'), fmtDuration(run.moving_sec ?? run.duration_sec)],
                  [T('act.totalTime'), fmtDuration(run.duration_sec)],
                  [T('act.bestLap'), (() => {
                    const full = splits.filter(s => !s.partial);
                    return full.length ? fmtPaceIn(Math.min(...full.map(s => s.moving_sec ?? s.sec)), units) : '--';
                  })()],
                ] as [string, string][]).map(([label, val], i) => (
                  <View key={label} style={[st.paceStatCell, i > 0 && st.paceStatBorder]}>
                    <Text style={st.paceStatVal}>{val}</Text>
                    <Text style={st.paceStatLbl}>{label}</Text>
                  </View>
                ))}
              </View>
              <PaceChart splits={splits} units={units} />
            </>
          )}

          {/* Notes — only when present */}
          {run.notes ? (
            <View style={[st.notesCard, shadows.sm]}>
              <View style={st.notesHeader}>
                <Icon name="create-outline" size={14} color={C.faint} />
                <Text style={st.notesLabel}>{T('act.memo')}</Text>
              </View>
              <Text style={st.notesTxt}>{run.notes}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* 삭제 confirm — the crew-해체 modal's grammar (icon circle · honest
          cascade body · destructive red · 취소). No recovery: this IS the
          last gate (지연's instruction). */}
      {/* slice 3: screenshot → composer offer (own-run screen by contract) */}
      <ScreenshotShareOffer runId={run.id} />

      {photoViewIdx !== null && (
        <PhotoViewer
          visible
          photos={run.photos ?? []}
          initialIndex={photoViewIdx}
          onClose={() => setPhotoViewIdx(null)}
        />
      )}

      <Modal visible={delOpen} transparent animationType="fade" onRequestClose={() => !deleting && setDelOpen(false)}>
        <View style={st.delRoot}>
          <Pressable style={st.delBackdrop} onPress={() => !deleting && setDelOpen(false)} />
          <View style={st.delCard}>
            <View style={st.delIconWrap}>
              <Icon name="trash-outline" size={26} color={C.danger} />
            </View>
            <Text style={st.delTitle}>{T('rp.delAsk')}</Text>
            <Text style={st.delBody}>{T('rp.delBody')}</Text>
            <Pressable onPress={doDelete} disabled={deleting} style={st.delBtn}>
              {deleting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={st.delBtnTxt}>{T('rp.delete')}</Text>}
            </Pressable>
            <Pressable onPress={() => !deleting && setDelOpen(false)} style={st.delCancelBtn}>
              <Text style={st.delCancelTxt}>{T('common.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeSt = (C: Tokens) => StyleSheet.create({
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

  paceStatsCard: { flexDirection: 'row', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.xl, paddingVertical: 13, marginTop: 12 },
  paceStatCell:  { flex: 1, alignItems: 'center', gap: 3 },
  paceStatBorder:{ borderLeftWidth: 1, borderLeftColor: C.border },
  paceStatVal:   { fontSize: 14, fontWeight: '700', color: C.text, letterSpacing: -0.4, fontVariant: ['tabular-nums'] }, // 4-up fit (총 시간 joined — h:mm:ss widths)
  paceStatLbl:   { fontSize: 10.5, color: C.faint, letterSpacing: -0.1 },
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
  // 삭제 modal — style grammar mirrored from components/crew-delete-modal.tsx
  delRoot:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  delBackdrop:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  delCard:      { width: '100%', backgroundColor: C.surface, borderRadius: 22, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 18 },
  delIconWrap:  { alignSelf: 'center', width: 54, height: 54, borderRadius: R.pill, backgroundColor: C.danger + '1A', alignItems: 'center', justifyContent: 'center' },
  delTitle:     { fontSize: 19, fontWeight: '700', color: C.text, letterSpacing: -0.5, textAlign: 'center', marginTop: 16 },
  delBody:      { fontSize: 13.5, lineHeight: 20, color: C.sub, textAlign: 'center', letterSpacing: -0.3, marginTop: 8, marginHorizontal: 8 },
  delBtn:       { height: 52, borderRadius: 14, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  delBtnTxt:    { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: -0.3 },
  delCancelBtn: { height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  delCancelTxt: { fontSize: 15, fontWeight: '700', color: C.sub, letterSpacing: -0.3 },
});