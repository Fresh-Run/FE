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
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { timeTitle } from '@/lib/run-format';
import { updateRun, type RunVisibility } from '@/lib/runs-api';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useRunDetail } from '@/hooks/use-runs';
import { VISIBILITY_OPTIONS } from '@/app/(course)/run-save';

export default function EditRunScreen() {
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

  // Seed once from server truth (useRunDetail refetches don't clobber edits)
  useEffect(() => {
    if (!run || seeded) return;
    setTitle(run.title ?? '');
    setNotes(run.notes ?? '');
    setVisibility((run.visibility as RunVisibility) ?? 'public');
    setSeeded(true);
  }, [run, seeded]);

  const suggestedTitle = run ? timeTitle(run.ran_at) : '';

  async function save() {
    if (!runId || saving) return;
    setSaving(true);
    try {
      await updateRun(runId, {
        // Same promise as run-save: empty title → the suggestion IS the title
        title: (title.trim() || suggestedTitle).slice(0, 60),
        visibility,
        notes: notes.trim() || null,
      });
      router.back(); // 활동 상세 + 기록 focus-refetch pick it up
    } catch (e: unknown) {
      Alert.alert('저장 실패', e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={[st.root, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="close" size={22} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>러닝 편집</Text>
        <Pressable onPress={save} disabled={saving || !run} style={st.savePill}>
          {saving
            ? <ActivityIndicator size="small" color={C.accentText} />
            : <Text style={st.savePillTxt}>저장</Text>}
        </Pressable>
      </View>

      {loading && !run ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : error || !run ? (
        <View style={st.centered}>
          <Icon name="warning-outline" size={34} color={C.faint} />
          <Text style={st.stateTxt}>{error ?? '기록을 찾을 수 없어요'}</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          {/* Title — run-save field semantics (placeholder is a promise) */}
          <View style={{ paddingHorizontal: S.gutter, paddingTop: 8 }}>
            <Text style={st.fieldLabel}>제목</Text>
            <TextInput
              value={title}
              onChangeText={v => setTitle(v.slice(0, 60))}
              placeholder={suggestedTitle}
              placeholderTextColor={C.faint}
              style={st.titleInput}
            />
          </View>

          {/* 공개 범위 — the run-save 3-way picker, inline */}
          <View style={{ paddingHorizontal: S.gutter, paddingTop: 22 }}>
            <Text style={st.fieldLabel}>공개 범위</Text>
            <View style={[st.visCard, shadows.sm]}>
              {VISIBILITY_OPTIONS.map((o, i) => (
                <React.Fragment key={o.value}>
                  {i > 0 && <View style={st.divider} />}
                  <Pressable onPress={() => setVisibility(o.value)} style={st.visRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={st.visLabel}>{o.label}</Text>
                      <Text style={st.visSub}>
                        {o.value === 'private'
                          ? '나만 볼 수 있어요 · 피드와 프로필에서 사라져요'
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
            <Text style={st.fieldLabel}>메모</Text>
            <TextInput
              value={notes}
              onChangeText={v => setNotes(v.slice(0, 2000))}
              placeholder="이 러닝에 대한 메모 (나만 볼 수 있어요)"
              placeholderTextColor={C.faint}
              multiline
              style={[st.notesInput, shadows.sm]}
            />
          </View>

          <Text style={st.footNote}>거리·시간·경로는 기록 그대로 유지돼요.</Text>
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

  footNote: { fontSize: 12, color: C.faint, letterSpacing: -0.2, textAlign: 'center', paddingTop: 24 },
});
