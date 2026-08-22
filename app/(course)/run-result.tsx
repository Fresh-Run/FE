/**
 * 수고했어요 — post-run record + share (B2 redesign, canvas FrRunDone
 * run-save.jsx; 07-07 locked decisions applied 2026-07-14).
 *
 * REMOVED BY DESIGN (07-07 owner+backend decisions, restated in the B2
 * checkpoint): the 2-tap mood-feedback section (liked/tags — submitFeedback
 * stays in the lib, uncalled) · the 4 platform share buttons (→ single
 * 공유하기 → the OS share sheet) · the AI insight card (never built here) ·
 * the run-saved confirmation screen (this screen IS the confirmation; the
 * file retired).
 *
 * KEPT (infra invisible to the canvas but load-bearing): save-on-entry
 * safety net + duplicate guard + honest error/retry · the 50m too-short
 * gate · photo attach-after strip · exit lock (buttons are the only exits)
 * · PB celebration overlay · the no-pending redirect.
 *
 * DATA: splits + elevation computed CLIENT-SIDE from the tracker's own raw
 * gps track (lib/run-metrics — proven math); comparison rows from GET
 * /me/stats fetched AFTER the save (counts include this run). Stats fetch
 * fails → the vs-myself card and nth-line hide honestly (no theater).
 */
import { LinearGradient } from 'expo-linear-gradient';
import { router, useNavigation } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage } from '@/lib/error-copy';
import { t, useT, tfIn, useLang } from '@/lib/i18n';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line as SvgLine, Rect as SvgRect, Text as SvgText } from 'react-native-svg';

import { MiniMap } from '@/components/mini-map';
import { PbCelebration } from '@/components/pb-celebration';
import { RealMap } from '@/components/real-map';
import { Icon } from '@/components/ui';
import { distUnit, fmtDist, fmtDuration, fmtPaceIn, paceUnit } from '@/lib/run-format';
import { computeElevGain, computeKmSplits } from '@/lib/run-metrics';
import { uploadRunPhotos } from '@/lib/run-photos';
import { saveRun, type NewRecord, type SavedRun } from '@/lib/runs-api';
import { getMyStats, type MyStats } from '@/lib/stats-api';
import { maybeWriteRunToHealth } from '@/lib/health';
import { accentShadow, radius as R, shadows, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { clearPendingRun, getPendingDraft, getPendingRun, getSavedResult } from '@/store/pending-run';
import { useSettings } from '@/store/use-settings';
import { useStore } from '@/store/use-store';

type SaveState = 'saving' | 'saved' | 'error' | 'skipped';

const MIN_SAVE_KM = 0.05; // 50m floor (owner spec, 2026-07-11 outing)

// ─── 구간 페이스 chart — canvas FrDoneSplits ported to RN Svg ─────────────────
function SplitsChart({ splits, avg }: { splits: number[]; avg: number }) {
  const C = useTokens();
  const T = useT(); // slice-5a sweep: the 평균 SvgText was the file's last ko literal
  const W = 320, H = 108, padT = 16, padB = 20, padL = 4, padR = 4;
  const n = splits.length, innerW = W - padL - padR, innerH = H - padT - padB;
  const bw = innerW / n;
  const pMin = Math.min(...splits), pMax = Math.max(...splits);
  const range = Math.max(1, pMax - pMin);
  const barH = (p: number) => { const fast = 1 - (p - pMin) / range; return innerH * (0.42 + fast * 0.58); };
  const fastest = splits.indexOf(pMin);
  const avgClamped = Math.min(pMax, Math.max(pMin, avg));
  const avgY = padT + innerH - barH(avgClamped);
  return (
    <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
      {splits.map((p, i) => {
        const h = barH(p), x = padL + bw * i + bw * 0.18, w = bw * 0.64, y = padT + innerH - h;
        const isFast = i === fastest;
        return (
          <React.Fragment key={i}>
            <SvgRect
              x={x} y={y} width={w} height={h} rx={Math.min(6, w / 2)}
              fill={isFast ? C.accentGrn : C.accent}
              opacity={isFast ? 1 : 0.45 + 0.4 * (1 - (p - pMin) / range)}
            />
            {isFast && (
              <SvgText x={x + w / 2} y={y - 5} textAnchor="middle" fontSize="9.5" fontWeight="800" fill={C.accentGrn}>
                {t('res.best')}
              </SvgText>
            )}
          </React.Fragment>
        );
      })}
      <SvgLine x1={padL} y1={avgY} x2={W - padR} y2={avgY} stroke={C.sub} strokeWidth="1.4" strokeDasharray="4 4" opacity="0.7" />
      <SvgText x={W - padR} y={avgY - 4} textAnchor="end" fontSize="9" fontWeight="700" fill={C.faint}>{T('res.avgMark')}</SvgText>
      {splits.map((_, i) => (
        <SvgText key={`x${i}`} x={padL + bw * (i + 0.5)} y={H - 5} textAnchor="middle" fontSize="9.5" fontWeight="600" fill={C.faint}>
          {i + 1}km
        </SvgText>
      ))}
    </Svg>
  );
}

export default function RunResultScreen() {
  const lang = useLang(); // 8/6 back-sweep: render tfIn anchor
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const displayName = useStore(s => s.displayName) ?? t('home.runner');

  const [run] = useState(() => getPendingRun());
  // 러닝 저장 (compose) owns the POST — normal flow arrives pre-saved.
  const [preSaved] = useState(() => getSavedResult());
  const units = useSettings(s => s.settings.units);
  const tooShort = !run || run.distanceKm < MIN_SAVE_KM;

  // ── Save state (safety net only; duplicate-guarded) ────────────────────────
  const [saveState, setSaveState] = useState<SaveState>(
    preSaved ? 'saved' : tooShort ? 'skipped' : 'saving',
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const savedRunRef = useRef<SavedRun | null>(preSaved);
  const inFlightRef = useRef(false);
  const [pbRecords, setPbRecords] = useState<NewRecord[] | null>(
    preSaved?.new_records && preSaved.new_records.length > 0 ? preSaved.new_records : null,
  );

  const doSave = useCallback(async () => {
    if (!run || tooShort) return;
    if (savedRunRef.current) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSaveState('saving');
    setSaveError(null);
    try {
      const saved = await saveRun({
        distanceKm: run.distanceKm,
        durationSec: run.elapsedSec,
        avgPaceSecPerKm: run.avgPaceSecPerKm,
        routeId: run.course?.id ?? null,
        gpsTrack: run.gpsTrack,
        // 8/7-8/8 safety-net thread: the crew-banner choice AND the tag ×
        // removal ride the crash-safe draft (pending-run) — the omissions
        // here meant server default ON / a removed tag re-tagged on the
        // crash-recovery save
        ...(run.crewSession && getPendingDraft().tagKept
          ? { crewId: run.crewSession.crewId, announcementId: run.crewSession.announcementId, showCrew: getPendingDraft().showCrew }
          : {}),
      });
      savedRunRef.current = saved;
      setSaveState('saved');
      // ③: mirror into Apple Health (opt-in gated, fire-and-forget) — the
      // safety-net save path gets the same hook as the compose path
      maybeWriteRunToHealth(run);
      if (saved.new_records && saved.new_records.length > 0) setPbRecords(saved.new_records);
    } catch (e: unknown) {
      setSaveError(errorMessage(e));
      setSaveState('error');
    } finally {
      inFlightRef.current = false;
    }
  }, [run, tooShort]);

  useEffect(() => { doSave(); }, [doSave]);

  // ── 사진 attach-after — unchanged carryover ─────────────────────────────────
  const [photoUris] = useState<string[]>(() => getPendingDraft().photos);
  const [photoState, setPhotoState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [photoDone, setPhotoDone] = useState(0);
  const photoStartedRef = useRef(false);

  const doAttachPhotos = useCallback(async () => {
    const runId = savedRunRef.current?.id;
    if (!runId || photoUris.length === 0) return;
    setPhotoState('uploading');
    setPhotoDone(0);
    try {
      await uploadRunPhotos(runId, photoUris, done => setPhotoDone(Math.min(done, photoUris.length)));
      setPhotoState('done');
    } catch {
      setPhotoState('error');
    }
  }, [photoUris]);

  useEffect(() => {
    if (saveState !== 'saved' || photoStartedRef.current) return;
    photoStartedRef.current = true;
    doAttachPhotos();
  }, [saveState, doAttachPhotos]);

  // ── /me/stats — AFTER the save so counts include this run ──────────────────
  const [stats, setStats] = useState<MyStats | null>(null);
  useEffect(() => {
    if (saveState !== 'saved') return;
    let cancelled = false;
    getMyStats()
      .then(sv => { if (!cancelled) setStats(sv); })
      .catch(() => { /* comparison card hides honestly */ });
    return () => { cancelled = true; };
  }, [saveState]);

  // ── Client-side metrics from the raw track ─────────────────────────────────
  const splits = useMemo(() => computeKmSplits(run?.gpsTrack), [run?.gpsTrack]);
  const elevGain = useMemo(() => computeElevGain(run?.gpsTrack), [run?.gpsTrack]);
  const avgPace = run?.avgPaceSecPerKm
    ?? (splits.length ? Math.round(splits.reduce((a, b) => a + b, 0) / splits.length) : 0);

  // ── vs-myself derivations (stats-gated; each line only when its data exists) ─
  const paceBase = stats?.month.avg_pace_sec_per_km ?? null;
  const paceDiff = paceBase != null && avgPace > 0 ? paceBase - avgPace : null;
  const pbGap = useMemo(() => {
    // canvas framing kept with real data: within striking distance of the
    // 5km best (records.best_5k probed live) — run must plausibly compare
    const best5k = stats?.records.best_5k?.value;
    if (best5k == null || !run || run.distanceKm < 4.5 || avgPace <= 0) return null;
    const gap = Math.round(avgPace * 5 - best5k);
    return gap > 0 && gap <= 60 ? gap : null;
  }, [stats, run, avgPace]);
  const negSplit = splits.length >= 2 && splits[splits.length - 1] < splits[0];
  const nightRun = (() => { const h = new Date().getHours(); return h >= 21 || h < 4; })();
  const monthLongest = stats?.month.longest_run_km != null && run != null && run.distanceKm >= 1
    && run.distanceKm >= stats.month.longest_run_km; // post-save month includes this run
  const chips = ([
    monthLongest && ['🔥', t('res.monthLongest')],
    negSplit && ['⚡', t('res.negSplit')],
    nightRun && ['🌙', t('res.nightRun')],
  ].filter(Boolean) as [string, string][]).slice(0, 2);

  // ── No pending run → nothing to show ───────────────────────────────────────
  useEffect(() => {
    if (!run) router.replace('/(tabs)' as any);
  }, [run]);

  // ── Exit lock — the buttons are the only exits ──────────────────────────────
  const exitingRef = useRef(false);
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: false });
    return navigation.addListener('beforeRemove', e => {
      if (!exitingRef.current) e.preventDefault();
    });
  }, [navigation]);

  const finish = () => {
    const leave = () => {
      exitingRef.current = true;
      clearPendingRun();
      router.replace('/(tabs)/records' as any); // canvas: 완료 → Records tab
    };
    if (saveState === 'error') {
      Alert.alert(t('res.unsavedTitle'), t('res.unsavedBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('res.leave'), style: 'destructive', onPress: leave },
      ]);
      return;
    }
    leave();
  };

  const shareRun = async () => {
    if (!run) return;
    // Share-card composer door (Slice 1, 2026-07-24): a SAVED run opens the
    // composer; an unsaved run (save error) keeps the old text-share — the
    // honest fallback, since the composer needs the server run.
    const savedId = savedRunRef.current?.id;
    if (savedId) {
      router.push({ pathname: '/share-card' as never, params: { runId: savedId } });
      return;
    }
    const title = savedRunRef.current?.title ?? run.course?.title ?? t('res.runner');
    const pace = avgPace > 0 ? fmtPaceIn(avgPace, units) + paceUnit(units) : null;
    const msg = [
      `${title} — FreshRun`,
      tfIn(lang, 'res.shareMsg', { d: `${fmtDist(run.distanceKm, units, 2)}${distUnit(units)}`, t: fmtDuration(run.elapsedSec) }) + (pace ? tfIn(lang, 'res.sharePace', { p: pace }) : ''),
    ].join('\n');
    try { await Share.share({ message: msg }); } catch { /* user dismissed */ }
  };

  if (!run) return null;

  return (
    <View style={st.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
        {/* ── Header — canvas: 수고했어요 🎉 + nth run ── */}
        <View style={{ alignItems: 'center', paddingTop: insets.top + 26, paddingHorizontal: 24 }}>
          <Text style={st.title}>{t('res.title')}</Text>
          {stats != null && stats.all_time.run_count > 0 && (
            <Text style={st.nth}>{tfIn(lang, 'res.nth', { n: stats.all_time.run_count })}</Text>
          )}
        </View>

        {/* ── Record card — map + 총 거리 overlay + branding ── */}
        <View style={{ paddingHorizontal: 24, paddingTop: 20 }}>
          <View style={[st.recordCard, shadows.md]}>
            {run.path.length >= 2
              ? <RealMap height={230} borderRadius={0} polyline={run.path} cache={false} distanceMarkers units={units} officialDistanceKm={run.distanceKm} />
              : <MiniMap seed="run-result" height={230} borderRadius={0} />}
            <LinearGradient
              colors={['rgba(8,12,4,0.62)', 'rgba(8,12,4,0.1)', 'rgba(8,12,4,0.85)']}
              locations={[0, 0.42, 1]}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />
            <View style={st.cardTop} pointerEvents="none">
              <Text style={st.cardDistLbl}>{t('res.totalDist')}</Text>
              <Text style={st.cardDist}>
                {fmtDist(run.distanceKm, units, 2)}
                <Text style={st.cardDistUnit}> {distUnit(units)}</Text>
              </Text>
            </View>
            <View style={st.cardBottom} pointerEvents="none">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Icon name="sparkles" size={13} color="#7CF03D" />
                <Text style={st.cardBrand}>FreshRun</Text>
              </View>
              <Text style={st.cardUser}>@{displayName}</Text>
            </View>
          </View>
        </View>

        {/* ── Stat row — 시간 / 페이스 / kcal (honest-kcal: '—' without weight) ── */}
        <View style={st.statRow}>
          {([
            [fmtDuration(run.elapsedSec), t('res.time')],
            [run.avgPaceSecPerKm != null ? fmtPaceIn(run.avgPaceSecPerKm, units) : "--'--\"", t('res.pace')],
            [run.kcal != null ? String(run.kcal) : '—', 'kcal'],
          ] as [string, string][]).map(([val, label], i) => (
            <View key={label} style={[st.statCell, i > 0 && st.statCellBorder]}>
              <Text style={st.statVal}>{val}</Text>
              <Text style={st.statLbl}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={{ paddingHorizontal: 24 }}>
          {/* ── Save + photo status strips (infra carryover, honest states) ── */}
          {saveState === 'saving' && (
            <View style={st.saveRow}><ActivityIndicator size="small" color={C.faint} /><Text style={st.saveRowTxt}>{t('res.saving')}</Text></View>
          )}
          {saveState === 'saved' && (
            <View style={st.saveRow}><Icon name="checkmark-circle" size={15} color={C.accentGrn} /><Text style={[st.saveRowTxt, { color: C.accentGrn }]}>{t('res.saved')}</Text></View>
          )}
          {saveState === 'error' && (
            <View style={st.errCard}>
              <Icon name="alert-circle-outline" size={15} color={C.danger} />
              <Text style={st.errTxt} numberOfLines={2}>{saveError}</Text>
              <Pressable onPress={doSave} style={st.retryBtn} hitSlop={6}><Text style={st.retryTxt}>{t('common.retry')}</Text></Pressable>
            </View>
          )}
          {saveState === 'skipped' && (
            <View style={st.saveRow}><Icon name="information-circle-outline" size={15} color={C.faint} /><Text style={st.saveRowTxt}>{t('res.tooShort')}</Text></View>
          )}
          {photoState === 'uploading' && (
            <View style={st.saveRow}><ActivityIndicator size="small" color={C.faint} /><Text style={st.saveRowTxt}>{tfIn(lang, 'res.photoUploading', { a: Math.min(photoDone + 1, photoUris.length), b: photoUris.length })}</Text></View>
          )}
          {photoState === 'done' && (
            <View style={st.saveRow}><Icon name="checkmark-circle" size={15} color={C.accentGrn} /><Text style={[st.saveRowTxt, { color: C.accentGrn }]}>{tfIn(lang, 'res.photoDone', { n: photoUris.length })}</Text></View>
          )}
          {photoState === 'error' && (
            <View style={st.errCard}>
              <Icon name="alert-circle-outline" size={15} color={C.danger} />
              <Text style={st.errTxt} numberOfLines={2}>{t('res.photoFail')}</Text>
              <Pressable onPress={doAttachPhotos} style={st.retryBtn} hitSlop={6}><Text style={st.retryTxt}>{t('common.retry')}</Text></Pressable>
            </View>
          )}

          {/* ── 구간 페이스 — bars + 평균 baseline + ⚡최고 구간 ── */}
          {splits.length >= 2 && (
            <View style={{ marginTop: 20 }}>
              <Text style={st.sectionLbl}>{t('res.splits')}</Text>
              <View style={[st.splitsCard, shadows.sm]} pointerEvents="none">
                <SplitsChart splits={splits} avg={avgPace} />
              </View>
            </View>
          )}

          {/* ── vs myself — stats-gated comparison rows ── */}
          {stats != null && (
            <View style={[st.vsCard, shadows.sm]}>
              {paceDiff != null && (
                <View style={[st.vsRow, { borderBottomWidth: 1, borderBottomColor: C.border }]}>
                  <Icon name="speedometer-outline" size={15} color={C.sub} />
                  <Text style={st.vsLbl}>{t('res.avgPace')}</Text>
                  <Text style={[st.vsVal, paceDiff > 5 && { color: C.accentGrn }]}>
                    {paceDiff > 5 ? tfIn(lang, 'res.paceFaster', { s: paceDiff })
                      : paceDiff < -5 ? t('res.paceRelaxed')
                      : t('res.paceSimilar')}
                  </Text>
                </View>
              )}
              <View style={[st.vsRow, pbGap != null && { borderBottomWidth: 1, borderBottomColor: C.border }]}>
                <Icon name="calendar-outline" size={15} color={C.sub} />
                <Text style={st.vsLbl}>{t('res.thisWeek')}</Text>
                <Text style={st.vsVal}>{tfIn(lang, 'res.weekLine', { km: stats.week.total_distance_km, n: stats.week.run_count })}</Text>
              </View>
              {pbGap != null && (
                <View style={st.vsRow}>
                  <Icon name="medal-outline" size={15} color={C.accentGrn} />
                  <Text style={st.vsLbl}>{t('res.pb')}</Text>
                  <Text style={[st.vsVal, { color: C.accentGrn }]}>{tfIn(lang, 'res.pbLine', { s: pbGap })}</Text>
                </View>
              )}
            </View>
          )}

          {/* ── highlight chips — conditional, max 2 ── */}
          {chips.length > 0 && (
            <View style={st.chipRow}>
              {chips.map(([e, lbl]) => (
                <View key={lbl} style={st.chip}><Text style={st.chipTxt}>{e} {lbl}</Text></View>
              ))}
            </View>
          )}

          {/* ── 누적 상승 고도 — hidden without altitude data (≥5m honesty floor) ── */}
          {elevGain != null && elevGain >= 5 && (
            <View style={[st.elevRow, shadows.sm]}>
              <Icon name="trending-up-outline" size={16} color={C.sub} />
              <Text style={st.elevLbl}>{t('res.elev')}</Text>
              <Text style={st.elevVal}>↗ {elevGain}m</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Actions — 공유하기 (secondary) + 완료 (primary) ── */}
      <View style={[st.footer, { paddingBottom: Math.max(insets.bottom, 12) + 14 }]}>
        {!tooShort && (
          <Pressable onPress={shareRun} style={({ pressed }) => [st.shareBtn, shadows.sm, pressed && { opacity: 0.85 }]}>
            <Icon name="share-outline" size={17} color={C.text} />
            <Text style={st.shareTxt}>{t('res.share')}</Text>
          </Pressable>
        )}
        <Pressable onPress={finish} style={({ pressed }) => [st.doneBtn, accentShadow(C.accent), pressed && { opacity: 0.9 }]}>
          <Text style={st.doneTxt}>{t('res.done')}</Text>
        </Pressable>
      </View>

      {/* PB celebration — CTA-only dismissal, reveals the record beneath */}
      <PbCelebration records={pbRecords} units={units} onClose={() => setPbRecords(null)} />
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  title: { fontSize: 25, fontWeight: '700', letterSpacing: -0.7, color: C.text },
  nth:   { fontSize: 14, color: C.sub, letterSpacing: -0.3, marginTop: 8 },

  recordCard: { borderRadius: 22, overflow: 'hidden', backgroundColor: '#0C1206' },
  cardTop:    { position: 'absolute', top: 16, left: 0, right: 0, alignItems: 'center' },
  cardDistLbl:{ fontSize: 12.5, fontWeight: '600', color: 'rgba(255,255,255,0.75)', letterSpacing: -0.2 },
  cardDist:   { fontSize: 40, fontWeight: '800', color: '#fff', letterSpacing: -1.5, marginTop: 2 },
  cardDistUnit:{ fontSize: 16, fontWeight: '700', color: '#7CF03D' },
  cardBottom: { position: 'absolute', left: 16, right: 16, bottom: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardBrand:  { fontSize: 12, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  cardUser:   { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },

  statRow:  { flexDirection: 'row', paddingHorizontal: 24, paddingTop: 16 },
  statCell: { flex: 1, alignItems: 'center' },
  statCellBorder: { borderLeftWidth: 1, borderLeftColor: C.border },
  statVal:  { fontSize: 17, fontWeight: '700', color: C.text, letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  statLbl:  { fontSize: 11, color: C.faint, marginTop: 3 },

  saveRow:    { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12, paddingHorizontal: 2 },
  saveRowTxt: { fontSize: 12.5, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },
  errCard:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: C.danger + '12', borderWidth: 1, borderColor: C.danger + '30', borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 10 },
  errTxt:   { flex: 1, fontSize: 12.5, color: C.danger, letterSpacing: -0.2 },
  retryBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.sm, backgroundColor: C.surface, borderWidth: 1, borderColor: C.danger + '55' },
  retryTxt: { fontSize: 12, fontWeight: '700', color: C.danger },

  sectionLbl: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, color: C.faint, textTransform: 'uppercase', paddingBottom: 8, paddingLeft: 2 },
  splitsCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10 },

  vsCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 15, marginTop: 12 },
  vsRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11 },
  vsLbl:  { fontSize: 13, fontWeight: '600', color: C.sub, letterSpacing: -0.2 },
  vsVal:  { marginLeft: 'auto', fontSize: 13.5, fontWeight: '700', color: C.text, letterSpacing: -0.2 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip:    { backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accent + '44', borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 6 },
  chipTxt: { fontSize: 12.5, fontWeight: '700', color: C.accentGrn, letterSpacing: -0.2 },

  elevRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 12 },
  elevLbl: { fontSize: 13.5, fontWeight: '600', color: C.text, letterSpacing: -0.2 },
  elevVal: { marginLeft: 'auto', fontSize: 14, fontWeight: '700', color: C.accentGrn, letterSpacing: -0.2 },

  footer:   { paddingTop: 14, paddingHorizontal: 24, gap: 10, backgroundColor: C.bg },
  shareBtn: { height: 50, borderRadius: 15, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  shareTxt: { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  doneBtn:  { height: 56, borderRadius: 16, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  doneTxt:  { fontSize: 16.5, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },
});
