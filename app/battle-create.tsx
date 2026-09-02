/**
 * 배틀 생성 플로우 — 슬라이스 1 (spec §2.6-2, v0 LOCKED 8/29). MOCK ONLY:
 * 상대 목록 = 맞팔 목 (spec Q3 — searchUsers 라이브 콜은 8/21 데모의
 * 흔적이었고 이 슬라이스에서 제거, 실 mutual-follows는 slice 2), 제출 =
 * useBattleMock.createBattle (네트워크 0). v0 확정으로 죽은 것: 포맷/지표
 * 선택 (§2.1 — v1은 1v1 점수 배틀 단일 모드).
 *
 * 쿼터 슬롯 (spec Q6): 진입/제출 모두 canCreate() 경유 — 베타 무제한이라
 * 항상 ok지만, 무료 30일-롤링 3회 게이팅이 이 함수 교체만으로 들어온다.
 * 라우트: /battle-create (8/29 클로즈아웃에서 -demo 은퇴).
 */
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { BattleTermsCard } from '@/components/battle-terms';
import { Icon } from '@/components/ui';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { tfIn, useLang, useT } from '@/lib/i18n';
import { MOCK_FRIENDS, useBattleMock, type MockFriend } from '@/store/battle-mock';
import { radius as R, spacing as S, shadows, type Tokens } from '@/lib/theme';

const DURATIONS = [3, 7, 14, 30] as const; // spec §2.2 프리셋 칩 (30d max)
const TITLE_MAX = 30;

export default function BattleCreateScreen() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const T = useT();
  const lang = useLang();

  const [step, setStep] = useState(0);
  const [opponent, setOpponent] = useState<MockFriend | null>(null);
  const [days, setDays] = useState<number>(7);
  const [title, setTitle] = useState('');

  const steps = [T('bc.stepOpponent'), T('bc.stepSettings'), T('bc.stepConfirm')];
  const canNext = step === 0 ? opponent != null : true;

  function submit() {
    if (!opponent) return;
    // 쿼터 슬롯 — 베타: 항상 ok (spec Q6); slice 2에서 실 게이트로 교체
    if (!useBattleMock.getState().canCreate().ok) return;
    useBattleMock.getState().createBattle(opponent, days, title);
    router.back(); // 홈 대기 탭에 pending 카드로 나타난다
  }

  return (
    <View style={st.root}>
      <View style={[st.appBar, { marginTop: insets.top }]}>
        <Pressable onPress={() => (step > 0 ? setStep(s => s - 1) : router.back())} hitSlop={12}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appTitle}>{T('bc.title')}</Text>
        <View style={{ width: 20 }} />
      </View>
      {/* step dots */}
      <View style={st.stepRow}>
        {steps.map((label, i) => (
          <View key={label} style={st.stepItem}>
            <View style={[st.stepDot, i <= step && { backgroundColor: C.accent }]} />
            <Text style={[st.stepLbl, i === step && { color: C.text, fontWeight: '700' }]}>{label}</Text>
          </View>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + 90 }} keyboardShouldPersistTaps="handled">
        {step === 0 && (
          <>
            <Text style={st.hint}>{T('bat.friendsHint')}</Text>
            {MOCK_FRIENDS.map(u => (
              <Pressable key={u.id} onPress={() => setOpponent(u)} style={[st.userRow, opponent?.id === u.id && st.userRowSel]}>
                <Avatar name={u.nickname} size={36} photoUrl={null} />
                <Text style={[st.userName, { flex: 1 }]} numberOfLines={1}>{u.nickname}</Text>
                {opponent?.id === u.id && <Icon name="checkmark-circle" size={20} color={C.accent} />}
              </Pressable>
            ))}
          </>
        )}

        {step === 1 && (
          <>
            <Text style={st.secLabel}>{T('bc.duration')}</Text>
            <View style={st.chipRow}>
              {DURATIONS.map(d => (
                <Pressable key={d} onPress={() => setDays(d)} style={[st.chip, days === d && st.chipSel]}>
                  <Text style={[st.chipTxt, days === d && st.chipTxtSel]}>{tfIn(lang, 'bc.days', { n: d })}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={st.secLabel}>{T('bat.optTitle')}</Text>
            <View style={st.titleBox}>
              <TextInput
                style={st.titleInput}
                value={title}
                onChangeText={v => setTitle(v.slice(0, TITLE_MAX))}
                placeholder={T('bat.titlePh')}
                placeholderTextColor={C.faint}
                maxLength={TITLE_MAX}
              />
            </View>
          </>
        )}

        {step === 2 && opponent && (
          <View style={[st.confirmCard, shadows.sm]}>
            <View style={st.vsRow}>
              <View style={st.vsSide}>
                <Avatar name={T('bat.me')} size={48} photoUrl={null} />
                <Text style={st.userName}>{T('bat.me')}</Text>
              </View>
              <Text style={st.vsTxt}>{T('bc.vs')}</Text>
              <View style={st.vsSide}>
                <Avatar name={opponent.nickname} size={48} photoUrl={null} />
                <Text style={st.userName} numberOfLines={1}>{opponent.nickname}</Text>
              </View>
            </View>
            {title.trim().length > 0 && <Text style={st.battleTitle}>{title.trim()}</Text>}
            {/* 룰 명시 (spec Q4 필수 — 30분 정산 마감 포함) */}
            <BattleTermsCard durationDays={days} />
          </View>
        )}
      </ScrollView>

      <View style={[st.footer, { paddingBottom: insets.bottom + 10 }]}>
        {step < 2 ? (
          <Pressable disabled={!canNext} onPress={() => setStep(s => s + 1)} style={[st.cta, !canNext && { opacity: 0.4 }]}>
            <Text style={st.ctaTxt}>{T('bc.next')}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={submit} style={st.cta}>
            <Text style={st.ctaTxt}>{T('bc.start')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const makeSt = (C: Tokens) => ({
  root: { flex: 1, backgroundColor: C.bg },
  appBar: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: S.lg, paddingVertical: 10 },
  appTitle: { fontSize: 17, fontWeight: '800' as const, color: C.text },
  stepRow: { flexDirection: 'row' as const, justifyContent: 'center' as const, gap: 18, paddingVertical: 8 },
  stepItem: { alignItems: 'center' as const, gap: 4 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border },
  stepLbl: { fontSize: 11, color: C.faint },
  hint: { fontSize: 13, color: C.faint, marginBottom: S.md },
  userRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: 10, marginBottom: 8 },
  userRowSel: { borderColor: C.accent },
  userName: { fontSize: 14, fontWeight: '700' as const, color: C.text },
  secLabel: { fontSize: 13, fontWeight: '700' as const, color: C.sub, marginTop: S.md, marginBottom: 8 },
  chipRow: { flexDirection: 'row' as const, gap: 8, flexWrap: 'wrap' as const },
  chip: { backgroundColor: C.surface, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 8 },
  chipSel: { backgroundColor: C.accent, borderColor: C.accent },
  chipTxt: { fontSize: 13, fontWeight: '600' as const, color: C.text },
  chipTxtSel: { color: '#0D1A06', fontWeight: '800' as const },
  titleBox: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12 },
  titleInput: { paddingVertical: 11, fontSize: 15, color: C.text },
  confirmCard: { backgroundColor: C.surface, borderRadius: R.xl, borderWidth: 1, borderColor: C.border, padding: S.lg, alignItems: 'center' as const, gap: 12 },
  vsRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 16 },
  vsSide: { alignItems: 'center' as const, gap: 6, minWidth: 80 },
  vsTxt: { fontSize: 18, fontWeight: '800' as const, color: C.accentGrn },
  battleTitle: { fontSize: 15, fontWeight: '800' as const, color: C.text },
  footer: { position: 'absolute' as const, left: 0, right: 0, bottom: 0, paddingHorizontal: S.lg, paddingTop: 10, backgroundColor: C.bg },
  cta: { backgroundColor: C.accent, borderRadius: R.pill, alignItems: 'center' as const, paddingVertical: 14 },
  ctaTxt: { fontSize: 15, fontWeight: '800' as const, color: '#0D1A06' },
});
