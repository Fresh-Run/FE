/**
 * 크루 챌린지 생성 (M2, design-wave B wheels) — title + 목표/기간 wheel
 * sheets per canvas FrChallengeCreate (goal 5–100km ×1, 기간 3–90일 ×1 —
 * probed inside server caps; goal_km=1 → 200, 0 → 422). The canvas is a
 * DURATION model: the challenge starts today — starts_at = today 00:00 KST,
 * ends_at = today+(기간−1) 23:59:59 KST (inclusive N days; naive datetimes
 * are a server 422). The typed date-range inputs died with the redesign.
 * owner||admin (BE f68a48f). 409 (non-ended challenge exists) renders as a
 * FRIENDLY state — the entry CTA is hidden when a challenge is live, so this
 * path only fires on races.
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
import { NumberWheelRow } from '@/components/wheel-sheet';
import { ApiError } from '@/lib/api';
import { createChallenge, dateToKstIsoDay, kstDateStr } from '@/lib/challenges-api';
import { colors as C, radius as R, spacing as S } from '@/lib/theme';

export default function ChallengeCreateScreen() {
  const insets = useSafeAreaInsets();
  const { crewId } = useLocalSearchParams<{ crewId: string }>();

  const [title, setTitle]     = useState('');
  const [goalKm, setGoalKm]   = useState(50); // canvas defaults: 50km · 7일
  const [periodDays, setPeriodDays] = useState(7);
  const [submitting, setSubmitting] = useState(false);

  // duration model: 오늘 시작, 기간 inclusive → today+(N−1) is the last day
  const startIso = dateToKstIsoDay(kstDateStr(0), 'start');
  const endIso   = dateToKstIsoDay(kstDateStr(periodDays - 1), 'end');
  const canSubmit = title.trim().length > 0 && !submitting;

  async function submit() {
    if (!canSubmit || !crewId) return;
    setSubmitting(true);
    try {
      await createChallenge(crewId, {
        title: title.trim(),
        goal_km: goalKm,
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

        <View style={st.wheelCard}>
          <NumberWheelRow label="목표 거리" value={goalKm} min={5} max={100} step={1} suffix="km" onChange={setGoalKm} />
          <View style={st.divider} />
          <NumberWheelRow label="기간" value={periodDays} min={3} max={90} step={1} suffix="일" onChange={setPeriodDays} />
        </View>
        <Text style={st.periodPreview}>오늘부터 {periodDays}일 · {kstDateStr(periodDays - 1)} 종료</Text>

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

  wheelCard:     { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, paddingHorizontal: 16 },
  divider:       { height: 1, backgroundColor: C.border },
  periodPreview: { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 8, paddingLeft: 4 },

  noteCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accent + '44', borderRadius: R.md, padding: 12, marginTop: 10 },
  noteTxt:  { flex: 1, fontSize: 12.5, color: C.accentGrn, letterSpacing: -0.2, lineHeight: 18 },
});
