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
import { distUnit, fmtDist, fmtDuration, fmtPaceIn, fmtWhen, paceUnit, timeTitle } from '@/lib/run-format';
import { MAX_RUN_PHOTOS, reencodeForUpload } from '@/lib/run-photos';
import { maybeWriteRunToHealth } from '@/lib/health';
import { saveRun, type RunVisibility } from '@/lib/runs-api';
import { colors as C, radius as R, spacing as S } from '@/lib/theme';
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

export const VISIBILITY_OPTIONS: { value: RunVisibility; label: string; sub: string }[] = [
  { value: 'public',    label: '전체 공개', sub: '피드와 프로필에 공개' },
  { value: 'followers', label: '팔로워만',  sub: '팔로워에게만 보여요' },
  { value: 'private',   label: '비공개',    sub: '나만 볼 수 있어요' },
];

const visibilityLabel = (v: RunVisibility) =>
  VISIBILITY_OPTIONS.find(o => o.value === v)?.label ?? '전체 공개';

export default function RunSaveScreen() {
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
  const [tagKept, setTagKept] = useState(true);

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
      Alert.alert('사진 추가 실패', '사진을 불러오지 못했어요. 다시 시도해 주세요.');
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
          '카메라 권한이 필요해요',
          '러닝 사진을 찍으려면 카메라 접근을 허용해 주세요.',
          [
            { text: '취소', style: 'cancel' },
            { text: '설정 열기', onPress: () => Linking.openSettings() },
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
      Alert.alert('촬영 실패', '사진을 찍지 못했어요. 다시 시도해 주세요.');
    } finally {
      setPicking(false);
    }
  }

  // No pending run (cold navigation) → home
  useEffect(() => { if (!run) router.replace('/(tabs)' as any); }, [run]);

  // Back means nothing here — 저장 or 삭제하기 are the exits
  const exitingRef = useRef(false);
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: false });
    return navigation.addListener('beforeRemove', e => {
      if (!exitingRef.current) e.preventDefault();
    });
  }, [navigation]);

  if (!run) return null;

  const endedIso = new Date(run.endedAt).toISOString();
  const suggestedTitle = timeTitle(endedIso); // time-of-day placeholder
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
          ? { crewId: crewSession.crewId, announcementId: crewSession.announcementId }
          : {}),
      });
      savedOnceRef.current = true;
      markSaved(saved); // disk copy dropped — server has it now
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
      Alert.alert('저장 실패', e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요', [
        { text: '나중에', style: 'cancel' },
        { text: '다시 시도', onPress: () => handleSave() },
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
    clearPendingRun();
    exitingRef.current = true;
    router.replace('/(tabs)' as any);
  }

  return (
    <KeyboardAvoidingView style={[st.root, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* App bar: ‹ (→ discard confirm — no silent loss) · title · 저장 pill */}
      <View style={st.appBar}>
        <Pressable onPress={handleDelete} hitSlop={12} style={st.backBtn}>
          <Icon name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>러닝 저장</Text>
        <Pressable
          onPress={handleSave}
          disabled={tooShort || saving}
          style={[st.savePill, tooShort && st.savePillOff]}
        >
          {saving
            ? <ActivityIndicator size="small" color={C.accentText} />
            : <Text style={[st.savePillTxt, tooShort && { color: C.faint }]}>저장</Text>}
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
                  <Text style={st.tagTxt} numberOfLines={2}>
                    이 러닝은 <Text style={st.tagStrong}>{crewSession.crewName}</Text> 정기런으로 기록돼요
                  </Text>
                  {crewSession.announcementTitle ? (
                    <Text style={st.tagSub} numberOfLines={1}>{`'${crewSession.announcementTitle}' 모임`}</Text>
                  ) : null}
                </View>
                <Pressable onPress={() => setTagKept(false)} hitSlop={8} style={st.tagRemove}>
                  <Icon name="close" size={15} color={C.faint} />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setTagKept(true)} style={st.tagRemovedRow}>
                <Text style={st.tagRemovedTxt}>정기런으로 기록하지 않아요</Text>
                <Text style={st.tagUndo}>되돌리기</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* ── Title hero ── */}
        <View style={{ paddingHorizontal: S.gutter, paddingTop: 8 }}>
          <TextInput
            value={title}
            onChangeText={v => setTitle(v.slice(0, 30))} // canvas cap (backend allows 60)
            placeholder={suggestedTitle}
            placeholderTextColor={C.faint}
            style={st.titleInput}
          />
          <Text style={st.caption}>
            {run.course ? run.course.title : '자유 러닝'} · GPS 기록
          </Text>
        </View>

        {/* ── Stats row (canvas: label above value, green distance, 3 cols) ── */}
        <View style={st.statsRow}>
          {([
            ['거리',   fmtDist(run.distanceKm, units, 2), distUnit(units), true],
            ['시간',   fmtDuration(run.elapsedSec), '', false],
            ['페이스', run.avgPaceSecPerKm != null ? fmtPaceIn(run.avgPaceSecPerKm, units) : '--', paceUnit(units), false],
          ] as [string, string, string, boolean][]).map(([label, val, unit, accent], i) => (
            <View key={i} style={st.statCell}>
              <Text style={st.statLbl}>{label}</Text>
              <Text style={[st.statVal, accent && { color: C.accentGrn }]}>
                {val}{unit ? <Text style={st.statUnit}> {unit}</Text> : null}
              </Text>
            </View>
          ))}
        </View>
        <View style={st.hairline} />

        {/* ── Date row ── */}
        <View style={st.row}>
          <Icon name="calendar-outline" size={17} color={C.sub} />
          <Text style={st.rowTxt}>{fmtWhen(endedIso)}</Text>
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
            <Text style={st.photoTxt}>사진 추가</Text>
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
            placeholder="오늘 러닝은 어땠나요? 메모를 남겨보세요..."
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
            <Text style={st.visLabel}>공개 범위</Text>
            <Text style={st.visValue}>{visibilityLabel(visibility)}</Text>
            <Icon name="chevron-forward" size={16} color={C.faint} />
          </Pressable>
        </View>

        {/* ── Too-short notice ── */}
        {tooShort && (
          <View style={st.noticeRow}>
            <Icon name="information-circle-outline" size={15} color={C.faint} />
            <Text style={st.noticeTxt}>너무 짧은 러닝은 저장되지 않아요</Text>
          </View>
        )}

        {/* ── 러닝 삭제하기 (canvas: plain red centered text) ── */}
        <Pressable onPress={handleDelete} style={({ pressed }) => [st.deleteBtn, { opacity: pressed ? 0.7 : 1 }]}>
          <Text style={st.deleteTxt}>러닝 삭제하기</Text>
        </Pressable>
      </ScrollView>

      {/* ── Discard confirm — custom centered modal per canvas ── */}
      <Modal visible={discardOpen} transparent animationType="fade" onRequestClose={() => setDiscardOpen(false)}>
        <Pressable style={st.discardOverlay} onPress={() => setDiscardOpen(false)}>
          <Pressable style={st.discardCard} onPress={() => {}}>
            <Text style={st.discardTitle}>러닝을 삭제할까요?</Text>
            <Text style={st.discardSub}>이 러닝 기록은 저장되지 않고 사라져요.</Text>
            <Pressable onPress={confirmDiscard} style={({ pressed }) => [st.discardBtn, { opacity: pressed ? 0.85 : 1 }]}>
              <Text style={st.discardBtnTxt}>삭제</Text>
            </Pressable>
            <Pressable onPress={() => setDiscardOpen(false)} style={({ pressed }) => [st.discardCancel, { opacity: pressed ? 0.7 : 1 }]}>
              <Text style={st.discardCancelTxt}>취소</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 공개 범위 bottom sheet ── */}
      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={st.sheetOverlay} onPress={() => setSheetOpen(false)}>
          <Pressable style={[st.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]} onPress={() => {}}>
            <View style={st.sheetHandleRow}><View style={st.sheetHandle} /></View>
            <Text style={st.sheetTitle}>공개 범위</Text>
            {/* canvas: selected option = accentDim card with ✓, no radios */}
            {VISIBILITY_OPTIONS.map(o => {
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

const st = StyleSheet.create({
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
