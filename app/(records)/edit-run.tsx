/**
 * 러닝 편집 — post-save edit surface (M-tier audit gap: RunUpdate served,
 * no UI). OWNER-SPEC: no canvas design exists (flagged for the design
 * session); field semantics mirror run-save's compose screen.
 *
 * Contract (BE RunUpdate, probed 2026-07-15): PATCH /runs/{id} partial —
 * title(≤60)/visibility/notes(≤2000); 거리·시간 불변; non-owner → 404.
 * Visibility flips have social reach (비공개 pulls the run from others'
 * feeds/profiles server-side) — the 비공개 sub copy says so plainly.
 * DELETE /runs does NOT exist (probed absent) — no 위험 구역 here;
 * 지연-observation ledgered.
 */
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { t, useLang, useT } from '@/lib/i18n';
import { timeTitle } from '@/lib/run-format';
import { MAX_RUN_PHOTOS, reencodeForUpload, uploadRunPhotoToSlot } from '@/lib/run-photos';
import { updateRun, type RunVisibility } from '@/lib/runs-api';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useRunDetail } from '@/hooks/use-runs';
import { visibilityOptions } from '@/app/(course)/run-save';

export default function EditRunScreen() {
  const T = useT();
  const lang = useLang(); // compiler-visible locale for the date/title formatters (2026-08-03 formatter-cache fix)
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const { runId } = useLocalSearchParams<{ runId: string }>();
  const { run, loading, error } = useRunDetail(runId ?? null);

  const [title, setTitle]           = useState('');
  const [notes, setNotes]           = useState('');
  const [visibility, setVisibility] = useState<RunVisibility>('public');
  const [seeded, setSeeded]         = useState(false);
  const [saving, setSaving]         = useState(false);

  // ── 사진 편집 (photo build, 2026-07-22) — unified display-ordered list:
  // existing = {path (v77), signedUrl}; new = {localUri, EXIF-stripped at
  // pick}. Save assembles [kept paths + new-upload paths] and PATCHes once
  // (replace-array; dropped paths die server-side, guide §112).
  type EditPhoto = { key: string; path?: string; signedUrl?: string; localUri?: string };
  const [photos, setPhotos]   = useState<EditPhoto[]>([]);
  const [picking, setPicking] = useState(false);
  const origPathsRef = useRef<string[]>([]);

  // Seed once from server truth (useRunDetail refetches don't clobber edits)
  useEffect(() => {
    if (!run || seeded) return;
    setTitle(run.title ?? '');
    setNotes(run.notes ?? '');
    setVisibility((run.visibility as RunVisibility) ?? 'public');
    const urls = run.photos ?? [];
    const paths = run.photo_paths ?? [];
    const n = Math.min(urls.length, paths.length); // parallel by contract
    origPathsRef.current = paths.slice(0, n);
    setPhotos(paths.slice(0, n).map((p, i) => ({ key: p, path: p, signedUrl: urls[i] })));
    setSeeded(true);
  }, [run, seeded]);

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
      const clean: EditPhoto[] = [];
      for (const a of res.assets.slice(0, MAX_RUN_PHOTOS - photos.length)) {
        const uri = await reencodeForUpload(a.uri, a.width, a.height);
        clean.push({ key: uri, localUri: uri });
      }
      setPhotos(p => [...p, ...clean].slice(0, MAX_RUN_PHOTOS));
    } catch {
      Alert.alert(t('runSave.photoFailTitle'), t('runSave.photoFailBody'));
    } finally {
      setPicking(false);
    }
  }

  async function takePhoto() {
    if (picking || photos.length >= MAX_RUN_PHOTOS) return;
    setPicking(true);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
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
      const uri = await reencodeForUpload(a.uri, a.width, a.height);
      setPhotos(p => [...p, { key: uri, localUri: uri }].slice(0, MAX_RUN_PHOTOS));
    } catch {
      Alert.alert(t('runSave.photoFailTitle'), t('runSave.photoFailBody'));
    } finally {
      setPicking(false);
    }
  }

  const suggestedTitle = run ? timeTitle(run.ran_at, lang) : '';

  async function save() {
    if (!runId || saving) return;
    setSaving(true);
    try {
      // 사진 변경분: new photos upload to FREE slots (parsed from kept
      // paths "{run_id}/{n}.{ext}") BEFORE the single PATCH — a failed
      // upload aborts the whole save honestly (nothing half-applied).
      let finalPaths: string[] | undefined;
      const kept = photos.filter(p => p.path).map(p => p.path!);
      const news = photos.filter(p => p.localUri);
      const changed = news.length > 0 || kept.length !== origPathsRef.current.length
        || kept.some((p, i) => p !== origPathsRef.current[i]);
      if (changed) {
        const usedSlots = new Set(kept.map(p => {
          const m = p.match(/\/(\d+)\.\w+$/);
          if (!m) throw new Error(t('er.photoPathErr'));
          return Number(m[1]);
        }));
        const free = [1, 2, 3].filter(s => !usedSlots.has(s));
        const uploaded: string[] = [];
        for (const p of news) uploaded.push(await uploadRunPhotoToSlot(runId, p.localUri!, free.shift()!));
        let ui = 0;
        finalPaths = photos.map(p => p.path ?? uploaded[ui++]); // display order
      }
      await updateRun(runId, {
        // Same promise as run-save: empty title → the suggestion IS the title
        title: (title.trim() || suggestedTitle).slice(0, 60),
        visibility,
        notes: notes.trim() || null,
        ...(finalPaths ? { photos: finalPaths } : {}),
      });
      router.back(); // 활동 상세 + 기록 focus-refetch pick it up
    } catch (e: unknown) {
      Alert.alert(t('runSave.saveFailTitle'), e instanceof Error ? e.message : t('runSave.saveFailBody'));
    } finally {
      setSaving(false);
    }
  }

  return (
    // +16: appBar's paddingVertical 10 puts content at insets.top+26 —
    // run-result parity (same top-cutoff class as run-save)
    <KeyboardAvoidingView style={[st.root, { paddingTop: insets.top + 16 }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="close" size={22} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>{T('er.title')}</Text>
        <Pressable onPress={save} disabled={saving || !run} style={st.savePill}>
          {saving
            ? <ActivityIndicator size="small" color={C.accentText} />
            : <Text style={st.savePillTxt}>{T('runSave.save')}</Text>}
        </Pressable>
      </View>

      {loading && !run ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : error || !run ? (
        <View style={st.centered}>
          <Icon name="warning-outline" size={34} color={C.faint} />
          <Text style={st.stateTxt}>{error ?? T('rp.notFound')}</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          {/* Title — run-save field semantics (placeholder is a promise) */}
          <View style={{ paddingHorizontal: S.gutter, paddingTop: 8 }}>
            <Text style={st.fieldLabel}>{T('er.fieldTitle')}</Text>
            <TextInput
              value={title}
              onChangeText={v => setTitle(v.slice(0, 60))}
              placeholder={suggestedTitle}
              placeholderTextColor={C.faint}
              style={st.titleInput}
            />
          </View>

          {/* ── 사진 (photo build 2026-07-22) — run-save's picker grammar
                 verbatim: dashed add square + camera square + 76px thumbs
                 with × badges; existing photos render from signed URLs ── */}
          <View style={{ paddingHorizontal: S.gutter, paddingTop: 18 }}>
            <Text style={st.fieldLabel}>{T('er.fieldPhoto')}</Text>
            <View style={st.photoRow}>
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
                <ScrollView horizontal showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingTop: 6, paddingRight: 6 }}>
                  {photos.map(p => (
                    <View key={p.key} style={st.thumbWrap}>
                      <Image source={{ uri: p.localUri ?? p.signedUrl }} style={st.thumb} />
                      <Pressable
                        onPress={() => setPhotos(prev => prev.filter(x => x.key !== p.key))}
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
          </View>

          {/* 공개 범위 — the run-save 3-way picker, inline */}
          <View style={{ paddingHorizontal: S.gutter, paddingTop: 22 }}>
            <Text style={st.fieldLabel}>{T('runSave.visibility')}</Text>
            <View style={[st.visCard, shadows.sm]}>
              {visibilityOptions().map((o, i) => (
                <React.Fragment key={o.value}>
                  {i > 0 && <View style={st.divider} />}
                  <Pressable onPress={() => setVisibility(o.value)} style={st.visRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={st.visLabel}>{o.label}</Text>
                      <Text style={st.visSub}>
                        {o.value === 'private'
                          ? T('er.privSub')
                          : o.sub}
                      </Text>
                    </View>
                    <View style={[st.radioOuter, visibility === o.value && { borderColor: C.accent }]}>
                      {visibility === o.value && <View style={st.radioInner} />}
                    </View>
                  </Pressable>
                </React.Fragment>
              ))}
            </View>
          </View>

          {/* 메모 */}
          <View style={{ paddingHorizontal: S.gutter, paddingTop: 22 }}>
            <Text style={st.fieldLabel}>{T('act.memo')}</Text>
            <TextInput
              value={notes}
              onChangeText={v => setNotes(v.slice(0, 2000))}
              placeholder={T('er.memoPh')}
              placeholderTextColor={C.faint}
              multiline
              style={[st.notesInput, shadows.sm]}
            />
          </View>

          <Text style={st.footNote}>{T('er.footNote')}</Text>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.gutter, paddingVertical: 10 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },
  savePill:    { height: 34, paddingHorizontal: 16, borderRadius: R.pill, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  savePillTxt: { fontSize: 13.5, fontWeight: '800', color: C.accentText, letterSpacing: -0.2 },

  centered: { paddingTop: 80, alignItems: 'center', gap: 12 },
  stateTxt: { fontSize: 14, color: C.sub, letterSpacing: -0.2 },

  fieldLabel: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, color: C.faint, textTransform: 'uppercase', paddingBottom: 8, paddingHorizontal: 2 },
  titleInput: { fontSize: 20, fontWeight: '700', color: C.text, letterSpacing: -0.5, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },

  visCard:  { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 14 },
  divider:  { height: 1, backgroundColor: C.border, marginHorizontal: -14 },
  visRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
  visLabel: { fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  visSub:   { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },
  radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.accent },

  notesInput: { minHeight: 120, textAlignVertical: 'top', fontSize: 14.5, color: C.text, letterSpacing: -0.3, lineHeight: 21, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },

  // 사진 — run-save's photo-strip styles verbatim (photo build 2026-07-22)
  photoRow:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  photoSquare: { width: 52, height: 52, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed', backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  photoTxt:    { fontSize: 14, fontWeight: '600', color: C.sub, letterSpacing: -0.2 },
  thumbWrap:   { position: 'relative' },
  thumb:       { width: 76, height: 76, borderRadius: 12, backgroundColor: C.surfaceAlt },
  thumbRemove: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 999, borderWidth: 1.5, borderColor: C.surface, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },

  footNote: { fontSize: 12, color: C.faint, letterSpacing: -0.2, textAlign: 'center', paddingTop: 24 },
});
