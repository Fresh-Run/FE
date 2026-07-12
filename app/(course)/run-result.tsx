/**
 * 러닝 완료 — post-run result + 2-tap feedback (bundle: course-flow.jsx screen 6).
 *
 * The run saves on entry (POST /api/runs) — skipping feedback still saves.
 * Duplicate guard: once we hold a run id we never re-POST; 다시 시도 only
 * fires from the error state. If a save times out AFTER the server wrote,
 * a retry could still duplicate — accepted risk (no idempotency key in the
 * contract yet).
 *
 * Back-navigation is blocked (gesture + hardware): the only exits are
 * 홈으로 (confirms first if the run failed to save) and 저장하고 완료.
 * Feedback chips use the server FeedbackTag vocabulary — the enum is the
 * single source of truth, superseding the bundle's chip labels.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { router, useNavigation } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { PbCelebration } from '@/components/pb-celebration';
import { Icon } from '@/components/ui';
import { distUnit, fmtDist, fmtDuration, fmtPaceIn, paceUnit } from '@/lib/run-format';
import { uploadRunPhotos } from '@/lib/run-photos';
import {
  NEGATIVE_TAGS,
  POSITIVE_TAGS,
  saveRun,
  submitFeedback,
  type NewRecord,
  type SavedRun,
} from '@/lib/runs-api';
import { accentShadow, colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';
import { clearPendingRun, getPendingDraft, getPendingRun, getSavedResult } from '@/store/pending-run';
import { useSettings } from '@/store/use-settings';
import { useStore } from '@/store/use-store';

type Verdict = 'good' | 'bad';
type SaveState = 'saving' | 'saved' | 'error' | 'skipped';

const MIN_SAVE_KM = 0.05; // 50m floor (owner spec, 2026-07-11 outing) — GPS noise can fake sub-50m "runs"; contract requires distance_km > 0

export default function RunResultScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const displayName = useStore(s => s.displayName) ?? '러너';

  const [run] = useState(() => getPendingRun());
  // 러닝 저장 (compose) now owns the POST — normal flow arrives pre-saved.
  const [preSaved] = useState(() => getSavedResult());
  const units = useSettings(s => s.settings.units);
  const tooShort = !run || run.distanceKm < MIN_SAVE_KM; // gate stays km-internal

  // ── Save state (legacy save-on-entry kept as a safety net only) ─────────────
  const [saveState, setSaveState] = useState<SaveState>(
    preSaved ? 'saved' : tooShort ? 'skipped' : 'saving',
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const savedRunRef = useRef<SavedRun | null>(preSaved);
  const inFlightRef = useRef(false);
  // PB celebration — from the compose screen's save response (or legacy path)
  const [pbRecords, setPbRecords] = useState<NewRecord[] | null>(
    preSaved?.new_records && preSaved.new_records.length > 0 ? preSaved.new_records : null,
  );

  const doSave = useCallback(async () => {
    if (!run || tooShort) return;
    if (savedRunRef.current) return; // duplicate guard — we already hold an id
    if (inFlightRef.current) return; // no concurrent POSTs
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
      });
      savedRunRef.current = saved;
      setSaveState('saved');
      if (saved.new_records && saved.new_records.length > 0) setPbRecords(saved.new_records);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : '저장에 실패했어요');
      setSaveState('error');
    } finally {
      inFlightRef.current = false;
    }
  }, [run, tooShort]);

  useEffect(() => { doSave(); }, [doSave]);

  // ── 사진 attach-after (R2'): the run save NEVER waits on photos. Once we
  // hold a run id, the ≤3 pre-re-encoded draft URIs upload sequentially
  // (3-step cycle per photo, PATCH photos[] at the end). Failure is honest
  // and local to this strip — the run stays saved, 다시 시도 re-runs the
  // whole cycle (upload-urls re-issue, the PATCH replaces). ─────────────────
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

  // No pending run (e.g. cold navigation to this route) → nothing to show.
  useEffect(() => {
    if (!run) router.replace('/(tabs)' as any);
  }, [run]);

  // ── Exit lock: back means nothing here; buttons are the only exits ─────────
  const exitingRef = useRef(false);
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: false });
    return navigation.addListener('beforeRemove', e => {
      if (!exitingRef.current) e.preventDefault();
    });
  }, [navigation]);

  const exitTo = (dest: 'home' | 'saved-screen') => {
    exitingRef.current = true;
    if (dest === 'home') {
      clearPendingRun();
      router.replace('/(tabs)' as any);
    } else {
      const saved = savedRunRef.current!;
      router.replace({
        pathname: '/(course)/run-saved' as any,
        params: {
          runId: saved.id,
          liked: verdict === 'good' ? '1' : '0',
          ranAt: saved.ran_at,
          dist: String(run?.distanceKm ?? 0),
          durSec: String(run?.elapsedSec ?? 0),
          title: run?.course?.title ?? '',
        },
      });
    }
  };

  const goHome = () => {
    if (saveState === 'error') {
      Alert.alert('저장되지 않았어요', '이 러닝은 아직 저장되지 않았어요. 저장 없이 나갈까요?', [
        { text: '취소', style: 'cancel' },
        { text: '나가기', style: 'destructive', onPress: () => exitTo('home') },
      ]);
      return;
    }
    exitTo('home');
  };

  // ── Feedback ────────────────────────────────────────────────────────────────
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [fbSubmitting, setFbSubmitting] = useState(false);
  const [fbError, setFbError] = useState<string | null>(null);

  const pickVerdict = (v: Verdict) => { setVerdict(v); setTags([]); };
  const toggleTag = (t: string) =>
    setTags(x => (x.includes(t) ? x.filter(y => y !== t) : [...x, t]));

  const saveAndFinish = async () => {
    if (!verdict || !savedRunRef.current || fbSubmitting) return;
    setFbSubmitting(true);
    setFbError(null);
    try {
      await submitFeedback(savedRunRef.current.id, verdict === 'good', tags);
      exitTo('saved-screen');
    } catch (e: unknown) {
      setFbError(e instanceof Error ? e.message : '피드백 전송에 실패했어요');
    } finally {
      setFbSubmitting(false);
    }
  };

  if (!run) return null;

  const pool = verdict === 'good' ? POSITIVE_TAGS : NEGATIVE_TAGS;
  const canFinish = verdict !== null && saveState === 'saved' && !fbSubmitting;

  return (
    <View style={st.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
        {/* ── Hero: real recorded path on the stylized map ── */}
        <View style={{ height: 240 }}>
          <MiniMap seed="run-result" height={240} borderRadius={0} polyline={run.path} />
          <LinearGradient
            colors={['rgba(10,13,18,0.5)', 'rgba(10,13,18,0.1)', C.bg]}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={[st.donePill, { bottom: 14 }]}>
            <Icon name="checkmark" size={14} color={C.accentGrn} />
            <Text style={st.donePillTxt}>러닝 완료!</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: S.gutter }}>
          <Text style={st.title}>수고했어요, {displayName}님</Text>
          <Text style={st.subtitle} numberOfLines={1}>
            {preSaved?.title ?? (run.course ? run.course.title : `자유 러닝 · ${fmtDist(run.distanceKm, units, 2)}${distUnit(units)}`)}
          </Text>

          {/* ── Stats ── */}
          <View style={st.statsRow}>
            {([
              [fmtDist(run.distanceKm, units, 2), distUnit(units), '거리'],
              [fmtDuration(run.elapsedSec), '', '시간'],
              [run.avgPaceSecPerKm != null ? fmtPaceIn(run.avgPaceSecPerKm, units) : "--'--\"", paceUnit(units), '페이스'],
              [run.kcal != null ? String(run.kcal) : '—', 'kcal', '칼로리'],
            ] as [string, string, string][]).map(([val, unit, label], i) => (
              <View key={i} style={st.statTile}>
                <Text style={st.statVal}>
                  {val}{unit ? <Text style={st.statUnit}> {unit}</Text> : null}
                </Text>
                <Text style={st.statLbl}>{label}</Text>
              </View>
            ))}
          </View>

          {/* ── Save status ── */}
          {saveState === 'saving' && (
            <View style={st.saveRow}>
              <ActivityIndicator size="small" color={C.faint} />
              <Text style={st.saveRowTxt}>기록 저장 중…</Text>
            </View>
          )}
          {saveState === 'saved' && (
            <View style={st.saveRow}>
              <Icon name="checkmark-circle" size={15} color={C.accentGrn} />
              <Text style={[st.saveRowTxt, { color: C.accentGrn }]}>기록에 저장됨</Text>
            </View>
          )}
          {saveState === 'error' && (
            <View style={st.errCard}>
              <Icon name="alert-circle-outline" size={15} color={C.danger} />
              <Text style={st.errTxt} numberOfLines={2}>{saveError}</Text>
              <Pressable onPress={doSave} style={st.retryBtn} hitSlop={6}>
                <Text style={st.retryTxt}>다시 시도</Text>
              </Pressable>
            </View>
          )}
          {saveState === 'skipped' && (
            <View style={st.saveRow}>
              <Icon name="information-circle-outline" size={15} color={C.faint} />
              <Text style={st.saveRowTxt}>너무 짧은 러닝은 저장되지 않아요</Text>
            </View>
          )}

          {/* ── 사진 attach strip — independent of the run's save state ── */}
          {photoState === 'uploading' && (
            <View style={st.saveRow}>
              <ActivityIndicator size="small" color={C.faint} />
              <Text style={st.saveRowTxt}>
                사진 업로드 중 ({Math.min(photoDone + 1, photoUris.length)}/{photoUris.length})
              </Text>
            </View>
          )}
          {photoState === 'done' && (
            <View style={st.saveRow}>
              <Icon name="checkmark-circle" size={15} color={C.accentGrn} />
              <Text style={[st.saveRowTxt, { color: C.accentGrn }]}>사진 {photoUris.length}장 첨부됨</Text>
            </View>
          )}
          {photoState === 'error' && (
            <View style={st.errCard}>
              <Icon name="alert-circle-outline" size={15} color={C.danger} />
              <Text style={st.errTxt} numberOfLines={2}>사진 업로드에 실패했어요 — 기록은 저장됐어요</Text>
              <Pressable onPress={doAttachPhotos} style={st.retryBtn} hitSlop={6}>
                <Text style={st.retryTxt}>다시 시도</Text>
              </Pressable>
            </View>
          )}

          {/* ── Feedback card ── */}
          {!tooShort && (
            <View style={[st.fbCard, shadows.sm]}>
              <Text style={st.fbTitle}>이 코스 어땠나요?</Text>
              <Text style={st.fbSub}>다음 추천이 더 좋아져요</Text>
              <View style={st.verdictRow}>
                <Pressable
                  onPress={() => pickVerdict('good')}
                  style={[st.verdictBtn, verdict === 'good' && { borderColor: C.accent, backgroundColor: C.accentDim }]}
                >
                  <Icon name={verdict === 'good' ? 'heart' : 'heart-outline'} size={20} color={verdict === 'good' ? C.accentGrn : C.sub} />
                  <Text style={[st.verdictTxt, verdict === 'good' && { color: C.accentGrn }]}>좋았어요</Text>
                </Pressable>
                <Pressable
                  onPress={() => pickVerdict('bad')}
                  style={[st.verdictBtn, verdict === 'bad' && { borderColor: C.danger, backgroundColor: C.danger + '14' }]}
                >
                  <View style={{ transform: [{ rotate: '180deg' }] }}>
                    <Icon name="heart-outline" size={20} color={verdict === 'bad' ? C.danger : C.sub} />
                  </View>
                  <Text style={[st.verdictTxt, verdict === 'bad' && { color: C.danger }]}>별로였어요</Text>
                </Pressable>
              </View>
              {verdict && (
                <View style={{ marginTop: 16 }}>
                  <Text style={st.tagPrompt}>{verdict === 'good' ? '무엇이 좋았나요?' : '무엇이 별로였나요?'}</Text>
                  <View style={st.tagWrap}>
                    {pool.map(t => {
                      const on = tags.includes(t);
                      const col = verdict === 'good' ? C.accent : C.danger;
                      const txtCol = verdict === 'good' ? C.accentGrn : C.danger;
                      return (
                        <Pressable
                          key={t}
                          onPress={() => toggleTag(t)}
                          style={[st.tagChip, on && { borderColor: col, backgroundColor: verdict === 'good' ? C.accentDim : C.danger + '14' }]}
                        >
                          <Text style={[st.tagTxt, on && { color: txtCol }]}>{t}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
              {fbError && (
                <View style={[st.errCard, { marginTop: 12 }]}>
                  <Icon name="alert-circle-outline" size={15} color={C.danger} />
                  <Text style={st.errTxt} numberOfLines={2}>{fbError}</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Footer ── */}
      <View style={[st.footer, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
        <Pressable onPress={goHome} style={({ pressed }) => [st.homeBtn, { opacity: pressed ? 0.85 : 1 }]}>
          <Text style={st.homeTxt}>홈으로</Text>
        </Pressable>
        {!tooShort && (
          <Pressable
            onPress={saveAndFinish}
            disabled={!canFinish}
            style={[st.finishBtn, canFinish ? accentShadow(C.accent) : null, { opacity: canFinish ? 1 : 0.4 }]}
          >
            {fbSubmitting
              ? <ActivityIndicator size="small" color={C.accentText} />
              : <Text style={st.finishTxt}>저장하고 완료</Text>}
          </Pressable>
        )}
      </View>

      {/* PB celebration — CTA-only dismissal, reveals run-result beneath */}
      <PbCelebration records={pbRecords} units={units} onClose={() => setPbRecords(null)} />
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  donePill:    { position: 'absolute', left: S.gutter, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accent + '77', borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 6 },
  donePillTxt: { fontSize: 12.5, fontWeight: '700', color: C.accentGrn, letterSpacing: -0.2 },

  title:    { fontSize: 24, fontWeight: '700', letterSpacing: -0.6, color: C.text, marginTop: 6 },
  subtitle: { fontSize: 14, color: C.sub, letterSpacing: -0.3, marginTop: 6 },

  statsRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  statTile: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 4, alignItems: 'center' },
  statVal:  { fontSize: 16, fontWeight: '700', color: C.text, letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  statUnit: { fontSize: 9.5, color: C.faint, fontWeight: '600' },
  statLbl:  { fontSize: 10.5, color: C.faint, marginTop: 3 },

  saveRow:    { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12, paddingHorizontal: 2 },
  saveRowTxt: { fontSize: 12.5, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },

  errCard:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: C.danger + '12', borderWidth: 1, borderColor: C.danger + '30', borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 10 },
  errTxt:   { flex: 1, fontSize: 12.5, color: C.danger, letterSpacing: -0.2 },
  retryBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.sm, backgroundColor: C.surface, borderWidth: 1, borderColor: C.danger + '55' },
  retryTxt: { fontSize: 12, fontWeight: '700', color: C.danger },

  fbCard:     { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 18, marginTop: 16 },
  fbTitle:    { fontSize: 15.5, fontWeight: '700', color: C.text, letterSpacing: -0.4, textAlign: 'center' },
  fbSub:      { fontSize: 12.5, color: C.faint, letterSpacing: -0.2, textAlign: 'center', marginTop: 5 },
  verdictRow: { flexDirection: 'row', gap: 11, marginTop: 16 },
  verdictBtn: { flex: 1, height: 56, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surfaceAlt, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  verdictTxt: { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  tagPrompt:  { fontSize: 12.5, fontWeight: '600', color: C.sub, letterSpacing: -0.2, marginBottom: 10 },
  tagWrap:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip:    { height: 38, paddingHorizontal: 14, borderRadius: R.pill, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  tagTxt:     { fontSize: 13, fontWeight: '600', color: C.text, letterSpacing: -0.2 },

  footer:    { flexDirection: 'row', gap: 10, paddingTop: 12, paddingHorizontal: S.gutter, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg },
  homeBtn:   { flex: 1, height: 54, borderRadius: 15, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  homeTxt:   { fontSize: 15.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  finishBtn: { flex: 2, height: 54, borderRadius: 15, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  finishTxt: { fontSize: 15.5, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },
});
