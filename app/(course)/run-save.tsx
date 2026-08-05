/**
 * 러닝 저장 — pre-save compose screen (canvas redesign 2026-07-07).
 * Flow: hold-stop → HERE (title/memo/공개 범위 compose) → POST /runs fires
 * from 저장 → 수고했어요 (run-result receives the already-saved response).
 *
 * Contract (BE 2af3715, live-probed): title ≤60 / notes ≤2000 / visibility
 * public|followers|private. Post-save editing now exists too (edit-run
 * slice, PATCH /runs/{id}) — composing here remains the primary path.
 *
 * Crash safety: the run + typed fields (photos included) persist to
 * AsyncStorage (store/pending-run) — an app kill mid-compose is recoverable
 * at next launch. Back-nav is locked; the exits are 저장 or 러닝 삭제하기.
 *
 * 사진 추가 (R2', guide §110): pick ≤3 → EXIF-stripping re-encode AT PICK
 * TIME (hard rule — storage keeps whatever we send, probed) → thumbnails
 * here, upload happens post-save on 수고했어요 (photo failure never blocks
 * the run save). 동영상 = v2 per the standing ruling — the row says 사진.
 */
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, useNavigation } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RealMap } from '@/components/real-map';
import { Icon } from '@/components/ui';
import { errorMessage } from '@/lib/error-copy';
import { distUnit, fmtDist, fmtDuration, fmtPaceIn, fmtWhen, paceUnit, timeTitle } from '@/lib/run-format';
import { MAX_RUN_PHOTOS, reencodeForUpload } from '@/lib/run-photos';
import { maybeWriteRunToHealth } from '@/lib/health';
import { t, useLang, useT, tfIn } from '@/lib/i18n';
import { runSession } from '@/store/run-session';
import { saveRun, type RunVisibility } from '@/lib/runs-api';
import { radius as R, spacing as S, type Tokens, DENSE_MAX_FONT_SCALE} from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import {
  clearPendingRun,
  getPendingDraft,
  getPendingRun,
  markSaved,
  updatePendingDraft,
} from '@/store/pending-run';
import { useSettings } from '@/store/use-settings';

const MIN_SAVE_KM = 0.05; // 50m floor (owner spec, 2026-07-11 outing) — GPS noise can fake sub-50m "runs"
const MAP_HIDE_BELOW_KM = 0.3;

/** Call-time (NOT module-scope const — the dark-epic static-capture class,
    reborn for strings: a const would freeze one language at import). Shared
    vocabulary with edit-run. */
export function visibilityOptions(): { value: RunVisibility; label: string; sub: string }[] {
  return [
    { value: 'public',    label: t('vis.public'),    sub: t('vis.publicSub') },
    { value: 'followers', label: t('vis.followers'), sub: t('vis.followersSub') },
    { value: 'private',   label: t('vis.private'),   sub: t('vis.privateSub') },
  ];
}

const visibilityLabel = (v: RunVisibility) =>
  visibilityOptions().find(o => o.value === v)?.label ?? t('vis.public');

export default function RunSaveScreen() {
  const C = useTokens();
  const lang = useLang(); // compiler-visible locale for the date/title formatters (2026-08-03 formatter-cache fix)
  const st = useStyles(makeSt);
  const T = useT(); // reactive — a language flip repaints the screen
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const units = useSettings(s => s.settings.units);

  const [run] = useState(() => getPendingRun());
  const initialDraft = useRef(getPendingDraft()).current;
  const [title, setTitle]           = useState(initialDraft.title);
  const [memo, setMemo]             = useState(initialDraft.memo);
  const [visibility, setVisibility] = useState<RunVisibility>(initialDraft.visibility);
  const [photos, setPhotos]         = useState<string[]>(initialDraft.photos);
  const [picking, setPicking]       = useState(false);
  const [sheetOpen, setSheetOpen]     = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [saving, setSaving]           = useState(false);
  const savedOnceRef = useRef(false); // duplicate-save guard (moved with the POST)

  // L1 정기런 tag — a FACT about this run (started via 크루 러닝 시작), not a
  // setting. Shown as a removable line; × revokes it for this save (removal
  // sticks). Removed → crew_id/announcement_id omitted → saves as a normal run.
  const crewSession = run?.crewSession;
  // 8/8: seeded from the draft + persisted on both transitions (× / undo) —
  // the crash-recovery net save honors a removed tag (the sibling gap)
  const [tagKept, setTagKept] = useState(initialDraft.tagKept);
  // 8/5 crew banner (her contract DEFAULT ON; private crews = server hard
  // gate regardless): the toggle rides the tag row — untagged runs never
  // see it. Sent explicitly on POST so OFF is honored. 8/7: seeded from
  // the draft and persisted on toggle (the title/memo grammar) so the
  // run-result safety-net save carries the user's choice, not the
  // omission-default; recovery restores it like any typed field.
  const [showCrew, setShowCrew] = useState(initialDraft.showCrew);

  // run.area send-rider (S-batch #3, guide §96): reverse-geocode the run's
  // START point via the existing Apple path — district = subLocality =
  // 동-level (ⓑ verdict, probed 4/4 2026-07-13). Best-effort: failure or
  // trackless run → no area, 지역 라인 stays hidden; never blocks a save.
  const [area, setArea] = useState<string | null>(null);
  useEffect(() => {
    const p = run?.path?.[0];
    if (!p) return;
    let cancelled = false;
    Location.reverseGeocodeAsync({ latitude: p.lat, longitude: p.lng })
      .then(rs => { if (!cancelled && rs[0]?.district) setArea(rs[0].district); })
      .catch(() => { /* offline geocoder — save proceeds without area */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Crash safety: typed fields persist as they change
  useEffect(() => { updatePendingDraft({ title, memo, visibility, photos }); }, [title, memo, visibility, photos]);

  // 사진 추가: PHPicker (no allowsEditing — the 4s legacy-controller lesson),
  // multi-select capped to the remaining slots. Every pick re-encodes
  // immediately — the stored draft URI is already EXIF-free.
  async function addPhotos() {
    if (picking || photos.length >= MAX_RUN_PHOTOS) return;
    setPicking(true);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsMultipleSelection: true,
        selectionLimit: MAX_RUN_PHOTOS - photos.length,
        quality: 1, // full-quality handoff — our re-encode owns compression
      });
      if (res.canceled) return;
      const clean: string[] = [];
      for (const a of res.assets.slice(0, MAX_RUN_PHOTOS - photos.length)) {
        clean.push(await reencodeForUpload(a.uri, a.width, a.height));
      }
      setPhotos(p => [...p, ...clean].slice(0, MAX_RUN_PHOTOS));
    } catch {
      Alert.alert(t('runSave.photoFailTitle'), t('runSave.photoFailBody'));
    } finally {
      setPicking(false);
    }
  }

  // 촬영 (build #9 ③): camera capture beside library pick — the SAME
  // EXIF-stripping re-encode owns the shot (the R2' privacy contract applies
  // to camera photos identically). NSCameraUsageDescription ships with #9;
  // pre-#9 runtimes never see this code (1.0.2 runtime bump).
  async function takePhoto() {
    if (picking || photos.length >= MAX_RUN_PHOTOS) return;
    setPicking(true);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        // the house denied-grammar (handleStart's location alert): honest
        // body + a REAL Settings route, never a dead-end OK
        Alert.alert(
          t('runSave.cameraPermTitle'),
          t('runSave.cameraPermBody'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.openSettings'), onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }
      const res = await ImagePicker.launchCameraAsync({ quality: 1 });
      if (res.canceled || !res.assets[0]) return;
      const a = res.assets[0];
      const clean = await reencodeForUpload(a.uri, a.width, a.height);
      setPhotos(p => [...p, clean].slice(0, MAX_RUN_PHOTOS));
    } catch {
      Alert.alert(t('runSave.shootFailTitle'), t('runSave.shootFailBody'));
    } finally {
      setPicking(false);
    }
  }

  // No pending run (cold navigation) → home
  useEffect(() => { if (!run) router.replace('/(tabs)' as any); }, [run]);

  // Back-button ruling (2026-07-27): this screen is a revisitable CHECKPOINT.
  // 종료 no longer kills the session — it pauses it and pushes here, so ‹
  // returns to the run (paused, resumable); 종료 again refreshes the numbers
  // and keeps the typed draft. The session dies only at 저장/삭제 (we own
  // stop()). Exception: the crash-recovery lane composes with NO live session
  // beneath — there ‹ keeps the old discard-confirm meaning (there is no run
  // to return to).
  const sessionLive = runSession.getRunState() === 'running' || runSession.getRunState() === 'paused';
  const exitingRef = useRef(false);
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: false });
    return navigation.addListener('beforeRemove', e => {
      if (!exitingRef.current) e.preventDefault();
    });
  }, [navigation]);

  if (!run) return null;

  const endedIso = new Date(run.endedAt).toISOString();
  const suggestedTitle = timeTitle(endedIso, lang); // time-of-day placeholder
  const tooShort = run.distanceKm < MIN_SAVE_KM;
  const showMap = run.distanceKm >= MAP_HIDE_BELOW_KM && run.path.length >= 2;

  async function handleSave() {
    if (!run || tooShort || saving || savedOnceRef.current) return;
    setSaving(true);
    try {
      const saved = await saveRun({
        distanceKm: run.distanceKm,
        durationSec: run.elapsedSec,
        avgPaceSecPerKm: run.avgPaceSecPerKm,
        routeId: run.course?.id ?? null,
        // empty title → the suggestion is sent as the real title (the
        // placeholder is a promise, not decoration)
        title: (title.trim() || suggestedTitle).slice(0, 60),
        notes: memo.trim() || null,
        visibility,
        area,
        gpsTrack: run.gpsTrack,
        // L1 정기런 tag — only when kept (× removed → normal run)
        ...(crewSession && tagKept
          ? { crewId: crewSession.crewId, announcementId: crewSession.announcementId, showCrew }
          : {}),
      });
      savedOnceRef.current = true;
      markSaved(saved); // disk copy dropped — server has it now
      runSession.stop(); // the checkpoint's deferred teardown — GPS/LA die HERE (idempotent)
      // ③: mirror the run into Apple 건강 (opt-in gated, fire-and-forget —
      // the server save above is the source of truth; HK never blocks it)
      maybeWriteRunToHealth(run);
      exitingRef.current = true;
      router.replace('/(course)/run-result' as any);
    } catch (e: unknown) {
      // Failure UI with a real retry (debt batch 1): the run is untouched —
      // still in memory AND on disk (pending-run crash copy) — so 다시 시도
      // re-attempts the identical POST with the current typed fields.
      setSaving(false);
      Alert.alert(t('runSave.saveFailTitle'), errorMessage(e), [
        { text: t('common.later'), style: 'cancel' },
        { text: t('common.retry'), onPress: () => handleSave() },
      ]);
    }
  }

  // Canvas: custom centered modal (owner call — replaces the native Alert).
  // Also fired by the app-bar ‹ (confirm-on-back kept: documented deviation,
  // no-silent-loss).
  function handleDelete() {
    setDiscardOpen(true);
  }

  function confirmDiscard() {
    setDiscardOpen(false);
    runSession.stop(); // discard also owns the deferred teardown (idempotent)
    clearPendingRun();
    exitingRef.current = true;
    router.replace('/(tabs)' as any);
  }

  // ‹ = back to the paused run (checkpoint) — or the discard confirm when no
  // session lives beneath (crash-recovery compose).
  function handleBack() {
    if (!sessionLive) { handleDelete(); return; }
    exitingRef.current = true;
    router.back();
  }

  return (
    // +16: appBar's paddingVertical 10 puts content at insets.top+26 —
    // run-result parity; a bare insets.top clipped under notch/Dynamic
    // Island when the modal measured the inset late (field report)
    <KeyboardAvoidingView style={[st.root, { paddingTop: insets.top + 16 }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* App bar: ‹ (→ back to the paused run; recovery lane → discard
          confirm) · title · 저장 pill */}
      <View style={st.appBar}>
        <Pressable onPress={handleBack} hitSlop={12} style={st.backBtn}>
          <Icon name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>{T('runSave.title')}</Text>
        <Pressable
          onPress={handleSave}
          disabled={tooShort || saving}
          style={[st.savePill, tooShort && st.savePillOff]}
        >
          {saving
            ? <ActivityIndicator size="small" color={C.accentText} />
            : <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={[st.savePillTxt, tooShort && { color: C.faint }]}>{T('runSave.save')}</Text>}
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── L1 정기런 tag line — a fact about this run, removable (×), undoable ── */}
        {crewSession && (
          <View style={{ paddingHorizontal: S.gutter, paddingTop: 10 }}>
            {tagKept ? (
              <View style={st.tagRow}>
                <View style={st.tagIcon}><Icon name="people" size={14} color={C.accentGrn} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.tagTxt} numberOfLines={2}>
                    {T('runSave.crewTag.before')}<Text style={st.tagStrong}>{crewSession.crewName}</Text>{T('runSave.crewTag.after')}
                  </Text>
                  {crewSession.announcementTitle ? (
                    <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.tagSub} numberOfLines={1}>{tfIn(lang, 'runSave.crewMeeting', { title: crewSession.announcementTitle })}</Text>
                  ) : null}
                </View>
                <Pressable onPress={() => { setTagKept(false); updatePendingDraft({ tagKept: false }); }} hitSlop={8} style={st.tagRemove}>
                  <Icon name="close" size={15} color={C.faint} />
                </Pressable>
              </View>
            ) : null}
            {tagKept ? (
              <Pressable onPress={() => { const next = !showCrew; setShowCrew(next); updatePendingDraft({ showCrew: next }); }} style={st.showCrewRow} hitSlop={6}>
                <Icon name={showCrew ? 'checkbox' : 'square-outline'} size={17} color={showCrew ? C.accentGrn : C.faint} />
                <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.showCrewTxt}>{T('runSave.showCrew')}</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => { setTagKept(true); updatePendingDraft({ tagKept: true }); }} style={st.tagRemovedRow}>
                <Text style={st.tagRemovedTxt}>{T('runSave.tagRemoved')}</Text>
                <Text style={st.tagUndo}>{T('runSave.undo')}</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* ── Title hero ── */}
        <View style={{ paddingHorizontal: S.gutter, paddingTop: 8 }}>
          <TextInput
            maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE}
            value={title}
            onChangeText={v => setTitle(v.slice(0, 30))} // canvas cap (backend allows 60)
            placeholder={suggestedTitle}
            placeholderTextColor={C.faint}
            style={st.titleInput}
          />
          <Text style={st.caption}>
            {run.course ? run.course.title : T('common.freeRun')} · {T('runSave.gpsCaption')}
          </Text>
        </View>

        {/* ── Stats row (canvas: label above value, green distance, 3 cols) ── */}
        <View style={st.statsRow}>
          {([
            [T('runSave.statDist'), fmtDist(run.distanceKm, units, 2), distUnit(units), true],
            [T('runSave.statTime'), fmtDuration(run.elapsedSec), '', false],
            [T('runSave.statPace'), run.avgPaceSecPerKm != null ? fmtPaceIn(run.avgPaceSecPerKm, units) : '--', paceUnit(units), false],
          ] as [string, string, string, boolean][]).map(([label, val, unit, accent], i) => (
            <View key={i} style={st.statCell}>
              <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.statLbl}>{label}</Text>
              <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={[st.statVal, accent && { color: C.accentGrn }]}>
                {val}{unit ? <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.statUnit}> {unit}</Text> : null}
              </Text>
            </View>
          ))}
        </View>
        <View style={st.hairline} />

        {/* ── Date row ── */}
        <View style={st.row}>
          <Icon name="calendar-outline" size={17} color={C.sub} />
          <Text style={st.rowTxt}>{fmtWhen(endedIso, lang)}</Text>
        </View>
        <View style={st.hairline} />

        {/* ── Map preview (hidden < 0.3km or no route points) ── */}
        {showMap && (
          <View style={st.mapCard}>
            <RealMap height={150} polyline={run.path} cache={false} />
          </View>
        )}

        {/* ── 사진 추가 (canvas run-save.jsx: dashed square, 76px thumbs,
                × badge; add square dims at 3) — photos only, video = v2 ── */}
        <View style={[st.photoRow, { paddingHorizontal: S.gutter, paddingTop: 16 }]}>
          <Pressable
            onPress={addPhotos}
            disabled={picking || photos.length >= MAX_RUN_PHOTOS}
            style={({ pressed }) => [
              st.photoSquare,
              { opacity: photos.length >= MAX_RUN_PHOTOS ? 0.45 : pressed ? 0.7 : 1 },
            ]}
          >
            {picking
              ? <ActivityIndicator size="small" color={C.faint} />
              : <Icon name="add" size={22} color={C.faint} />}
          </Pressable>
          {/* 촬영 (build #9 ③) — same square grammar, camera glyph */}
          <Pressable
            onPress={takePhoto}
            disabled={picking || photos.length >= MAX_RUN_PHOTOS}
            style={({ pressed }) => [
              st.photoSquare,
              { opacity: photos.length >= MAX_RUN_PHOTOS ? 0.45 : pressed ? 0.7 : 1 },
            ]}
          >
            <Icon name="camera-outline" size={20} color={C.faint} />
          </Pressable>
          {photos.length === 0 ? (
            <Text style={st.photoTxt}>{T('runSave.addPhoto')}</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingTop: 6, paddingRight: 6 }}>
              {photos.map(uri => (
                <View key={uri} style={st.thumbWrap}>
                  <Image source={{ uri }} style={st.thumb} />
                  <Pressable
                    onPress={() => setPhotos(p => p.filter(x => x !== uri))}
                    hitSlop={8}
                    style={st.thumbRemove}
                  >
                    <Icon name="close" size={11} color={C.bg} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
        <View style={st.hairline} />

        {/* ── Memo (ghost input → notes) ── */}
        <View style={{ paddingHorizontal: S.gutter }}>
          <TextInput
            value={memo}
            onChangeText={v => setMemo(v.slice(0, 2000))}
            placeholder={T('runSave.memoPlaceholder')}
            placeholderTextColor={C.faint}
            multiline
            style={st.memoInput}
          />
        </View>
        <View style={st.hairline} />

        {/* ── 공개 범위 row → bottom sheet ── */}
        <View style={{ paddingHorizontal: S.gutter }}>
          <Pressable onPress={() => setSheetOpen(true)} style={st.visRow}>
            <Icon name="lock-closed-outline" size={17} color={C.sub} />
            <Text style={st.visLabel}>{T('runSave.visibility')}</Text>
            <Text style={st.visValue}>{visibilityLabel(visibility)}</Text>
            <Icon name="chevron-forward" size={16} color={C.faint} />
          </Pressable>
        </View>

        {/* ── Too-short notice ── */}
        {tooShort && (
          <View style={st.noticeRow}>
            <Icon name="information-circle-outline" size={15} color={C.faint} />
            <Text style={st.noticeTxt}>{T('runSave.tooShort')}</Text>
          </View>
        )}

        {/* ── 러닝 삭제하기 (canvas: plain red centered text) ── */}
        <Pressable onPress={handleDelete} style={({ pressed }) => [st.deleteBtn, { opacity: pressed ? 0.7 : 1 }]}>
          <Text style={st.deleteTxt}>{T('runSave.deleteRun')}</Text>
        </Pressable>
      </ScrollView>

      {/* ── Discard confirm — custom centered modal per canvas ── */}
      <Modal visible={discardOpen} transparent animationType="fade" onRequestClose={() => setDiscardOpen(false)}>
        <Pressable style={st.discardOverlay} onPress={() => setDiscardOpen(false)}>
          <Pressable style={st.discardCard} onPress={() => {}}>
            <Text style={st.discardTitle}>{T('runSave.discardTitle')}</Text>
            <Text style={st.discardSub}>{T('runSave.discardSub')}</Text>
            <Pressable onPress={confirmDiscard} style={({ pressed }) => [st.discardBtn, { opacity: pressed ? 0.85 : 1 }]}>
              <Text style={st.discardBtnTxt}>{T('common.delete')}</Text>
            </Pressable>
            <Pressable onPress={() => setDiscardOpen(false)} style={({ pressed }) => [st.discardCancel, { opacity: pressed ? 0.7 : 1 }]}>
              <Text style={st.discardCancelTxt}>{T('common.cancel')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 공개 범위 bottom sheet ── */}
      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={st.sheetOverlay} onPress={() => setSheetOpen(false)}>
          <Pressable style={[st.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]} onPress={() => {}}>
            <View style={st.sheetHandleRow}><View style={st.sheetHandle} /></View>
            <Text style={st.sheetTitle}>{T('runSave.visibility')}</Text>
            {/* canvas: selected option = accentDim card with ✓, no radios */}
            {visibilityOptions().map(o => {
              const on = visibility === o.value;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => { setVisibility(o.value); setSheetOpen(false); }}
                  style={[st.sheetRow, on && st.sheetRowOn]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.sheetRowLabel}>{o.label}</Text>
                    <Text style={st.sheetRowSub}>{o.sub}</Text>
                  </View>
                  {on && <Icon name="checkmark" size={20} color={C.accentGrn} />}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, paddingVertical: 10, gap: 8 },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  savePill:    { height: 38, paddingHorizontal: 18, borderRadius: R.pill, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  savePillOff: { backgroundColor: C.surfaceAlt },
  savePillTxt: { fontSize: 14.5, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },

  tagRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accent + '33', borderRadius: 14, paddingVertical: 11, paddingHorizontal: 13 },
  tagIcon:      { width: 28, height: 28, borderRadius: 9, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  tagTxt:       { fontSize: 13, color: C.sub, letterSpacing: -0.2, lineHeight: 18 },
  tagStrong:    { fontWeight: '800', color: C.text },
  tagSub:       { fontSize: 11.5, color: C.accentGrn, letterSpacing: -0.2, marginTop: 2, fontWeight: '600' },
  tagRemove:    { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  showCrewRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8, paddingLeft: 2 },
  showCrewTxt: { fontSize: 12.5, fontWeight: '600', color: C.sub, letterSpacing: -0.2 },
  tagRemovedRow:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 4 },
  tagRemovedTxt:{ fontSize: 12.5, color: C.faint, letterSpacing: -0.2 },
  tagUndo:      { fontSize: 12.5, fontWeight: '700', color: C.accentGrn, letterSpacing: -0.2 },

  titleInput: { fontSize: 27, fontWeight: '700', letterSpacing: -0.7, color: C.text, paddingVertical: 6 },
  caption:    { fontSize: 12.5, color: C.faint, letterSpacing: -0.2, marginTop: 2 },

  statsRow: { flexDirection: 'row', gap: 34, paddingHorizontal: S.gutter, paddingTop: 18, paddingBottom: 16 },
  statCell: { gap: 4 },
  statVal:  { fontSize: 19, fontWeight: '700', color: C.text, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  statUnit: { fontSize: 11.5, color: C.faint, fontWeight: '600' },
  statLbl:  { fontSize: 12, color: C.faint, letterSpacing: -0.1 },

  hairline: { height: 1, backgroundColor: C.border, marginHorizontal: S.gutter },

  row:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: S.gutter, paddingVertical: 15 },
  rowTxt: { fontSize: 14, fontWeight: '600', color: C.text, letterSpacing: -0.2 },

  mapCard: { marginHorizontal: S.gutter, marginTop: 14, borderRadius: 18, overflow: 'hidden' },

  photoRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 16 },
  photoSquare: { width: 52, height: 52, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed', backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  photoTxt:    { fontSize: 14, fontWeight: '600', color: C.sub, letterSpacing: -0.2 },
  thumbWrap:   { position: 'relative' },
  thumb:       { width: 76, height: 76, borderRadius: 12, backgroundColor: C.surfaceAlt },
  thumbRemove: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 999, borderWidth: 1.5, borderColor: C.surface, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },

  memoInput: { minHeight: 76, fontSize: 14.5, color: C.text, letterSpacing: -0.2, lineHeight: 21, textAlignVertical: 'top', paddingVertical: 14 },

  visRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
  visLabel: { fontSize: 14.5, fontWeight: '600', color: C.text, letterSpacing: -0.3, flex: 1 },
  visValue: { fontSize: 14, fontWeight: '700', color: C.accentGrn, letterSpacing: -0.2 },

  noticeRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: S.gutter, paddingTop: 14 },
  noticeTxt: { fontSize: 12.5, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },

  deleteBtn: { alignItems: 'center', marginTop: 30, paddingVertical: 12 },
  deleteTxt: { fontSize: 15, fontWeight: '700', color: C.danger, letterSpacing: -0.3 },

  discardOverlay:   { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 28 },
  discardCard:      { width: '100%', backgroundColor: C.surface, borderRadius: 22, paddingTop: 24, paddingBottom: 18, paddingHorizontal: 22, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 30, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  discardTitle:     { fontSize: 19, fontWeight: '700', color: C.text, letterSpacing: -0.5, textAlign: 'center' },
  discardSub:       { fontSize: 13.5, lineHeight: 20, color: C.sub, textAlign: 'center', letterSpacing: -0.3, marginTop: 8, marginHorizontal: 8 },
  discardBtn:       { height: 52, borderRadius: 14, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  discardBtnTxt:    { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: -0.3 },
  discardCancel:    { height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  discardCancelTxt: { fontSize: 15, fontWeight: '700', color: C.sub, letterSpacing: -0.3 },

  sheetOverlay:   { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.42)' },
  sheet:          { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: S.gutter },
  sheetHandleRow: { alignItems: 'center', paddingTop: 10, paddingBottom: 2 },
  sheetHandle:    { width: 38, height: 5, borderRadius: 99, backgroundColor: C.border },
  sheetTitle:     { fontSize: 16, fontWeight: '700', color: C.text, letterSpacing: -0.4, paddingVertical: 12, textAlign: 'center' },
  sheetDivider:   { height: 1, backgroundColor: C.border },
  sheetRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 14, marginBottom: 4 },
  sheetRowOn:     { backgroundColor: C.accentDim },
  sheetRowLabel:  { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  sheetRowSub:    { fontSize: 12.5, color: C.faint, letterSpacing: -0.2, marginTop: 2 },
});
