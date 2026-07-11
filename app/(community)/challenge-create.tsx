/**
 * 크루 챌린지 생성 (M2) — title + goal_km + 기간 (date-only typed inputs per
 * the M1 composer pattern; the datetime redesign is docketed separately).
 * owner||admin (BE f68a48f). 409 (non-ended challenge exists) renders as a
 * FRIENDLY state — the entry CTA is hidden when a challenge is live, so this
 * path only fires on races. Dates serialize KST whole-day boundaries
 * (00:00 / 23:59:59 +09:00 — naive datetimes are a server 422).
 */
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
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
import { ApiError } from '@/lib/api';
import { createChallenge, dateToKstIsoDay } from '@/lib/challenges-api';
import { colors as C, radius as R, spacing as S } from '@/lib/theme';

export default function ChallengeCreateScreen() {
  const insets = useSafeAreaInsets();
  const { crewId } = useLocalSearchParams<{ crewId: string }>();

  const [title, setTitle]   = useState('');
  const [goalKm, setGoalKm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]     = useState('');
  const [submitting, setSubmitting] = useState(false);

  const goal = Number(goalKm);
  const startIso = dateToKstIsoDay(startDate, 'start');
  const endIso   = dateToKstIsoDay(endDate, 'end');
  const dateEntered = startDate.trim() !== '' || endDate.trim() !== '';
  const datesInvalid = dateEntered && (startIso === null || endIso === null);
  const canSubmit = title.trim().length > 0
    && Number.isFinite(goal) && goal > 0
    && startIso !== null && endIso !== null
    && !submitting;

  async function submit() {
    if (!canSubmit || !crewId) return;
    setSubmitting(true);
    try {
      await createChallenge(crewId, {
        title: title.trim(),
        goal_km: goal,
        starts_at: startIso!,
        ends_at: endIso!,
      });
      router.back();
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 409) {
        // Friendly state, not an error — one challenge at a time by contract
        Alert.alert('이미 진행 중인 챌린지가 있어요', '지금 챌린지가 끝나면 새 챌린지를 만들 수 있어요.', [
          { text: '확인', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('생성 실패', e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={st.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[st.appBar, { marginTop: insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="close" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>챌린지 만들기</Text>
        <Pressable onPress={submit} disabled={!canSubmit} style={[st.submitBtn, !canSubmit && st.submitBtnDisabled]}>
          {submitting
            ? <ActivityIndicator size="small" color={C.accentText} />
            : <Text style={[st.submitTxt, !canSubmit && { color: C.faint }]}>만들기</Text>}
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: S.gutter, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <TextInput
          value={title}
          onChangeText={t => setTitle(t.slice(0, 50))}
          placeholder="챌린지 이름 (예: 주간 50K 릴레이)"
          placeholderTextColor={C.faint}
          style={st.titleInput}
        />

        <View style={st.fieldRow}>
          <Text style={st.fieldLabel}>목표</Text>
          <TextInput
            value={goalKm}
            onChangeText={t => setGoalKm(t.replace(/[^0-9.]/g, ''))}
            placeholder="50"
            placeholderTextColor={C.faint}
            style={st.fieldInput}
            keyboardType="decimal-pad"
          />
          <Text style={st.fieldUnit}>km</Text>
        </View>
        <View style={st.fieldRow}>
          <Text style={st.fieldLabel}>시작일</Text>
          <TextInput
            value={startDate}
            onChangeText={setStartDate}
            placeholder="2026-07-14"
            placeholderTextColor={C.faint}
            style={st.fieldInput}
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
          />
        </View>
        <View style={st.fieldRow}>
          <Text style={st.fieldLabel}>종료일</Text>
          <TextInput
            value={endDate}
            onChangeText={setEndDate}
            placeholder="2026-07-20"
            placeholderTextColor={C.faint}
            style={st.fieldInput}
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
          />
        </View>
        {datesInvalid && <Text style={st.fieldError}>날짜는 2026-07-14 형식으로 입력해 주세요</Text>}

        <View style={st.noteCard}>
          <Icon name="information-circle-outline" size={14} color={C.accentGrn} />
          <Text style={st.noteTxt}>
            크루원 모두의 GPS 기록만 자동으로 집계돼요. 챌린지는 한 번에 하나만 진행할 수 있어요.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.gutter, paddingVertical: 10, gap: 8 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },
  submitBtn:         { height: 34, paddingHorizontal: 16, borderRadius: R.pill, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  submitBtnDisabled: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  submitTxt:         { fontSize: 13.5, fontWeight: '700', color: C.accentText, letterSpacing: -0.2 },

  titleInput: { fontSize: 19, fontWeight: '700', color: C.text, letterSpacing: -0.5, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 16 },

  fieldRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  fieldLabel: { width: 48, fontSize: 13, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },
  fieldInput: { flex: 1, height: 44, borderRadius: R.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceAlt, paddingHorizontal: 12, fontSize: 14.5, color: C.text },
  fieldUnit:  { fontSize: 13.5, fontWeight: '600', color: C.faint },
  fieldError: { fontSize: 12, color: C.danger, letterSpacing: -0.2, paddingLeft: 60, marginBottom: 6 },

  noteCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accent + '44', borderRadius: R.md, padding: 12, marginTop: 10 },
  noteTxt:  { flex: 1, fontSize: 12.5, color: C.accentGrn, letterSpacing: -0.2, lineHeight: 18 },
});
