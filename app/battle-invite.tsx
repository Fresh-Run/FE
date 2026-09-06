/**
 * 배틀 초대 화면 — 슬라이스 1 (spec §2.6-3, v0 LOCKED 8/29). MOCK ONLY:
 * 대상 = useBattleMock의 direction:'in' pending 행 (?id=). 수락 → active
 * (홈 진행 중 탭), 거절 → 행 제거 (리스트에서 사라짐 — spec 2.2). 푸시
 * 도착 경로는 빌드 13 (de1a5f9 프리-와이어 dormant 유지); slice 2가 실
 * invite 엔드포인트로 교체한다.
 */
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { BattleTermsCard } from '@/components/battle-terms';
import { Icon } from '@/components/ui';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { tfIn, useLang, useT } from '@/lib/i18n';
import { useBattleMock } from '@/store/battle-mock';
import { radius as R, spacing as S, shadows, type Tokens } from '@/lib/theme';

export default function BattleInviteScreen() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const T = useT();
  const lang = useLang();
  const { id } = useLocalSearchParams<{ id: string }>();

  const battle = useBattleMock(s => s.battles.find(b => b.id === id && b.direction === 'in' && b.status === 'pending'));

  function accept() {
    if (!battle) return;
    useBattleMock.getState().acceptInvite(battle.id);
    router.back();
  }
  function decline() {
    if (!battle) return;
    useBattleMock.getState().declineInvite(battle.id);
    router.back();
  }

  return (
    <View style={st.root}>
      <View style={[st.appBar, { marginTop: insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appTitle}>{T('bat.inviteTitle')}</Text>
        <View style={{ width: 20 }} />
      </View>

      {battle ? (
        <>
          <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + 120 }}>
            <View style={[st.card, shadows.sm]}>
              <Text style={st.inviteEmoji}>{battle.emoji}</Text>
              <Avatar name={battle.opponent.nickname} size={64} photoUrl={null} />
              <Text style={st.inviteSub}>{tfIn(lang, 'bat.inviteSub', { name: battle.opponent.nickname })}</Text>
              {battle.title ? <Text style={st.battleTitle}>{battle.title}</Text> : null}
              {/* 룰 명시 (spec Q4 필수 — 30분 정산 마감 포함) */}
              <BattleTermsCard durationDays={battle.durationDays} />
            </View>
          </ScrollView>
          <View style={[st.footer, { paddingBottom: insets.bottom + 10 }]}>
            <Pressable onPress={decline} style={[st.btn, st.btnDecline]}>
              <Text style={st.btnDeclineTxt}>{T('bat.declineBtn')}</Text>
            </Pressable>
            <Pressable onPress={accept} style={[st.btn, st.btnAccept]}>
              <Text style={st.btnAcceptTxt}>{T('bat.acceptBtn')}</Text>
            </Pressable>
          </View>
        </>
      ) : (
        // 이미 처리됐거나 만료된 초대 — 정직한 부재 상태 (dead space 금지)
        <View style={st.goneWrap}>
          <Icon name="mail-open-outline" size={36} color={C.faint} />
          <Text style={st.goneTxt}>{T('bat.inviteGone')}</Text>
        </View>
      )}
    </View>
  );
}

const makeSt = (C: Tokens) => ({
  root: { flex: 1, backgroundColor: C.bg },
  appBar: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: S.lg, paddingVertical: 10 },
  appTitle: { fontSize: 17, fontWeight: '800' as const, color: C.text },
  card: { backgroundColor: C.surface, borderRadius: R.xl, borderWidth: 1, borderColor: C.border, padding: S.lg, alignItems: 'center' as const, gap: 12 },
  inviteEmoji: { fontSize: 34 },
  inviteSub: { fontSize: 15, fontWeight: '700' as const, color: C.text, textAlign: 'center' as const },
  battleTitle: { fontSize: 14, fontWeight: '800' as const, color: C.accentGrn },
  footer: { position: 'absolute' as const, left: 0, right: 0, bottom: 0, flexDirection: 'row' as const, gap: 10, paddingHorizontal: S.lg, paddingTop: 10, backgroundColor: C.bg },
  btn: { flex: 1, borderRadius: R.pill, alignItems: 'center' as const, paddingVertical: 14 },
  btnDecline: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  btnDeclineTxt: { fontSize: 15, fontWeight: '700' as const, color: C.sub },
  btnAccept: { backgroundColor: C.accent },
  btnAcceptTxt: { fontSize: 15, fontWeight: '800' as const, color: '#0D1A06' },
  goneWrap: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 10 },
  goneTxt: { fontSize: 14, color: C.faint },
});
