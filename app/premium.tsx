/**
 * FreshRun Premium — the profile banner's destination (canvas FrPremium,
 * celebrate-screens.jsx; owner-approved honest pre-IAP build 2026-07-14).
 *
 * HONEST-STATE ADAPTATIONS (stated):
 * - The canvas's "7일 무료 체험 시작" purchase CTA would dead-end (IAP is
 *   build-#1 territory) → replaced by a non-interactive "출시 시 구독 가능"
 *   notice. ZERO dead CTAs on this screen.
 * - The plan cards render as INFORMATION (canvas prices ₩9,900/월 ·
 *   ₩79,000/년 + 33% 할인 badge) but are NOT selectable — a selector feeding
 *   no purchase is dead interaction.
 * - The features list is TRUTHFUL to today's server (probed 2026-07-14):
 *   AI 코스 premium = `unlimited: true` (free 3/주) ✓ live · 월간 인사이트
 *   premium-gated ✓ live · 오디오 코치 = 출시 예정 chip (built later; the
 *   canvas's 심박/회복 조언 copy dropped — those fields don't exist).
 * - A premium visitor sees an "이용 중" state instead of the upsell tail.
 */
import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { colors as C, shadows, spacing as S } from '@/lib/theme';
import { useQuota } from '@/store/use-quota';

const FEATURES: { icon: string; title: string; desc: string; soon?: boolean }[] = [
  { icon: 'sparkles-outline', title: 'AI 맞춤 코스 무제한', desc: '거리·경유지에 최적화된 코스 생성 — 횟수 제한 없이' },
  { icon: 'stats-chart-outline', title: 'AI 월간 인사이트', desc: '월간 통계·페이스 추이와 함께 AI 분석 리포트를 받아보세요' },
  { icon: 'volume-high-outline', title: 'AI 오디오 코치', desc: '러닝 중 실시간 음성 페이스 안내', soon: true },
];

export default function PremiumScreen() {
  const insets = useSafeAreaInsets();
  const isPremium = useQuota(s => s.isPremium);

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      {/* transparent bar — × close (canvas FrPremium) */}
      <View style={st.appBar}>
        <View style={{ width: 40 }} />
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.closeBtn}>
          <Icon name="close" size={22} color={C.text} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: Math.max(insets.bottom, 16) + 12 }}>
        {/* crown hero */}
        <View style={{ alignItems: 'center', marginTop: 4 }}>
          <View style={st.crownTile}>
            <Icon name="trophy" size={34} color={C.accent} />
          </View>
        </View>
        <Text style={st.title}>FreshRun Premium</Text>
        <Text style={st.sub}>프로 러너를 위한 AI 코칭과 심층 분석을 잠금 해제하세요.</Text>

        {/* features — truthful to today's server */}
        <View style={{ gap: 12, marginTop: 24 }}>
          {FEATURES.map(f => (
            <View key={f.title} style={st.featRow}>
              <View style={st.featIcon}><Icon name={f.icon} size={20} color={C.accentGrn} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <Text style={st.featTitle}>{f.title}</Text>
                  {f.soon && <View style={st.soonChip}><Text style={st.soonTxt}>출시 예정</Text></View>}
                </View>
                <Text style={st.featDesc}>{f.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {isPremium ? (
          /* already premium — active state, no upsell tail */
          <View style={[st.activeCard, shadows.sm]}>
            <Icon name="checkmark-circle" size={20} color={C.accentGrn} />
            <Text style={st.activeTxt}>Premium 이용 중이에요</Text>
          </View>
        ) : (
          <>
            {/* plan cards — INFORMATION (canvas prices), not selectable */}
            <View style={{ flexDirection: 'row', gap: 11, marginTop: 26 }}>
              {([['월간', '₩9,900', '/월', false], ['연간', '₩79,000', '/년', true]] as [string, string, string, boolean][]).map(([nm, price, per, badge]) => (
                <View key={nm} style={[st.planCard, shadows.sm]}>
                  {badge && <View style={st.planBadge}><Text style={st.planBadgeTxt}>33% 할인</Text></View>}
                  <Text style={st.planName}>{nm}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2, marginTop: 6 }}>
                    <Text style={st.planPrice}>{price}</Text>
                    <Text style={st.planPer}>{per}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* honest pre-IAP state — a notice, NOT a button (zero dead CTAs) */}
            <View style={st.noticeCard}>
              <Icon name="time-outline" size={18} color={C.accentGrn} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.noticeTitle}>출시 시 구독 가능</Text>
                <Text style={st.noticeSub}>정식 출시와 함께 구독이 열려요. 지금은 모든 기본 기능을 무료로 사용할 수 있어요.</Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, paddingVertical: 8 },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  crownTile: { width: 72, height: 72, borderRadius: 22, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },
  title:     { fontSize: 26, fontWeight: '700', color: C.text, letterSpacing: -0.9, textAlign: 'center', marginTop: 18 },
  sub:       { fontSize: 14.5, lineHeight: 21, color: C.sub, letterSpacing: -0.3, textAlign: 'center', marginTop: 8, marginHorizontal: 10 },

  featRow:   { flexDirection: 'row', alignItems: 'center', gap: 13 },
  featIcon:  { width: 40, height: 40, borderRadius: 12, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  featTitle: { fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  featDesc:  { fontSize: 12.5, color: C.faint, letterSpacing: -0.2, marginTop: 2 },
  soonChip:  { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  soonTxt:   { fontSize: 10, fontWeight: '700', color: C.faint, letterSpacing: -0.1 },

  planCard:     { flex: 1, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, borderRadius: 16, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 15, position: 'relative' },
  planBadge:    { position: 'absolute', top: -9, right: 12, backgroundColor: C.accent, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  planBadgeTxt: { fontSize: 9.5, fontWeight: '700', color: C.accentText, letterSpacing: 0.3 },
  planName:     { fontSize: 13, fontWeight: '700', color: C.sub, letterSpacing: -0.2 },
  planPrice:    { fontSize: 21, fontWeight: '700', color: C.text, letterSpacing: -0.6 },
  planPer:      { fontSize: 12, color: C.faint },

  noticeCard:  { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accentGrn + '44', borderRadius: 16, padding: 15, marginTop: 22 },
  noticeTitle: { fontSize: 14.5, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  noticeSub:   { fontSize: 12.5, lineHeight: 18, color: C.sub, letterSpacing: -0.2, marginTop: 3 },

  activeCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16, marginTop: 26 },
  activeTxt:  { fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
});
