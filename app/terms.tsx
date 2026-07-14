/**
 * 서비스 약관 — canvas FrTerms (settings-screens.jsx), static sections
 * verbatim. Legal copy describes the service including the planned
 * subscription (§4) — forward-looking terms text, not a UI affordance,
 * so it stays as authored (the premium PAGE handles the honest pre-IAP
 * state; the terms describe the contract once it exists).
 */
import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { colors as C, spacing as S } from '@/lib/theme';

const SECTIONS: [string, string][] = [
  ['1. 서비스 이용', 'FreshRun은 AI 기반 러닝 코스 추천과 활동 기록 서비스를 제공합니다. 본 약관에 동의하면 서비스를 이용할 수 있습니다.'],
  ['2. 위치 정보', '코스 생성과 활동 추적을 위해 위치 정보를 수집합니다. 위치 데이터는 서비스 제공 목적으로만 사용되며 동의 없이 제3자에게 제공되지 않습니다.'],
  ['3. 건강 데이터', 'Apple 건강 등과 연동된 데이터는 기기 내에서 처리되며 사용자가 동기화 항목을 직접 제어할 수 있습니다.'],
  ['4. 구독 및 결제', 'Premium 구독은 선택한 주기로 자동 갱신되며 갱신일 24시간 전까지 언제든 해지할 수 있습니다.'],
  ['5. 안전 고지', '러닝 중에는 항상 주변 교통과 환경에 유의하세요. AI 추천 코스는 참고용이며 실제 안전은 사용자 책임입니다.'],
];

export default function TermsScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>서비스 약관</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 30 }}>
        <Text style={st.updated}>최종 업데이트 · 2026년 6월 1일</Text>
        {SECTIONS.map(([t, body]) => (
          <View key={t} style={{ marginBottom: 22 }}>
            <Text style={st.secTitle}>{t}</Text>
            <Text style={st.secBody}>{body}</Text>
          </View>
        ))}
        <Text style={st.footer}>© 2026 FreshRun · Made in Seoul</Text>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, paddingVertical: 10 },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16.5, fontWeight: '700', letterSpacing: -0.4, color: C.text },

  updated:  { fontSize: 12.5, color: C.faint, letterSpacing: -0.2, marginBottom: 18 },
  secTitle: { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.4, marginBottom: 8 },
  secBody:  { fontSize: 13.5, lineHeight: 22, color: C.sub, letterSpacing: -0.2 },
  footer:   { fontSize: 12, color: C.faint, textAlign: 'center', paddingTop: 8 },
});
