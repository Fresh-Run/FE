/**
 * 배틀 정산 (종료 상태 뷰) — 슬라이스 3 (2026-10-10; spec §2.6-5). MOCK ONLY.
 * 대상 = ended · forfeited · cancelled (isDone). 구성: 승자 락업 (또는
 * 무승부/포기) · 최종 점수 바 · 일별 리캡 · 페이스 보너스 항목화 (베이스라인-
 * 상대 — 락된 스펙: round(km×5) iff pace < 참가자 베이스라인 @수락 스냅샷;
 * 합계 = runs[].breakdown.pace) · 다시 도전 CTA (같은 상대 프리필 → create).
 * slice 2: 데이터 = GET /battles/{id} (status로 분기), 다시 도전 = POST /battles.
 */
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Confetti } from '@/components/pb-celebration';
import { Icon } from '@/components/ui';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { tfIn, useLang, useT } from '@/lib/i18n';
import { radius as R, spacing as S, shadows, type Tokens } from '@/lib/theme';
import {
  BATTLE_ENABLED, MOCK_ME_ID, isDone, myScore, oppScore, outcomeOf, paceBonusOf, useBattleMock,
} from '@/store/battle-mock';

import { DailyList, ScoreBars, fmtKst } from './battle-detail';

export default function BattleSettleScreen() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const T = useT();
  const lang = useLang();
  const { id } = useLocalSearchParams<{ id: string }>();
  const battle = useBattleMock(s => s.battles.find(b => b.id === id));

  if (!BATTLE_ENABLED) return <Redirect href="/(tabs)/community" />;
  if (battle && !isDone(battle)) return <Redirect href={{ pathname: '/battle-detail', params: { id: battle.id } } as never} />;

  const outcome = battle ? outcomeOf(battle) : null;
  const forfeitedByMe = battle?.status === 'forfeited' && battle.winner === battle.opponent.id;
  const forfeitedByOpp = battle?.status === 'forfeited' && battle.winner === MOCK_ME_ID;

  return (
    <View style={st.root}>
      {outcome === 'won' ? <View pointerEvents="none" style={st.confettiWrap}><Confetti /></View> : null}
      <View style={[st.appBar, { marginTop: insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appTitle} numberOfLines={1}>
          {battle ? `${battle.emoji} ${battle.title ?? tfIn(lang, 'bat.vsName', { name: battle.opponent.nickname })}` : T('bd.settleTitle')}
        </Text>
        <View style={{ width: 20 }} />
      </View>

      {!battle ? (
        <View style={st.goneWrap}>
          <Icon name="flag-outline" size={36} color={C.faint} />
          <Text style={st.goneTxt}>{T('bd.gone')}</Text>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + 110 }} showsVerticalScrollIndicator={false}>
            <View style={st.mockChip}><Text style={st.mockChipTxt}>{T('bt.mockNotice')}</Text></View>

            {/* 승자 락업 */}
            <View style={[st.lockup, shadows.sm, outcome === 'won' && { borderColor: C.accent + '88' }]}>
              <Icon
                name={outcome === 'won' ? 'trophy' : outcome === 'draw' ? 'remove-circle-outline' : 'flag-outline'}
                size={36}
                color={outcome === 'won' ? C.crown : C.faint}
              />
              <Text style={st.lockupTitle}>
                {battle.status === 'cancelled' ? T('bd.cancelled')
                  : forfeitedByMe ? T('bd.forfeitedMe')
                  : forfeitedByOpp ? T('bd.forfeitedOpp')
                  : outcome === 'won' ? T('bd.wonTitle')
                  : outcome === 'lost' ? T('bd.lostTitle')
                  : T('bd.drawTitle')}
              </Text>
              <View style={st.lockupNames}>
                <Avatar name={T('bat.me')} size={44} photoUrl={null} ring={outcome === 'won' ? C.accent : undefined} />
                <Text style={st.vs}>{`${myScore(battle)} : ${oppScore(battle)}`}</Text>
                <Avatar name={battle.opponent.nickname} size={44} photoUrl={null} ring={outcome === 'lost' ? C.accent : undefined} />
              </View>
              <Text style={st.lockupSub}>
                {tfIn(lang, 'bd.period', { from: fmtKst(battle.started_at), to: fmtKst(battle.ends_at), days: battle.duration_days })}
                {battle.settled_at ? `  ·  ${tfIn(lang, 'bd.settledAt', { d: fmtKst(battle.settled_at) })}` : ''}
              </Text>
            </View>

            {/* 최종 점수 */}
            <Text style={st.sectionTitle}>{T('bd.finalScores')}</Text>
            <ScoreBars battle={battle} compact />

            {/* 페이스 보너스 항목화 (베이스라인-상대) */}
            <Text style={st.sectionTitle}>{T('bd.paceTitle')}</Text>
            <View style={[st.card, shadows.sm]}>
              {[[T('bat.me'), paceBonusOf(battle, MOCK_ME_ID)], [battle.opponent.nickname, paceBonusOf(battle, battle.opponent.id)]].map(([name, pb]) => {
                const p = pb as { pts: number; runs: number };
                return (
                  <View key={String(name)} style={st.paceRow}>
                    <Icon name="speedometer-outline" size={15} color={p.pts > 0 ? C.accentGrn : C.faint} />
                    <Text style={st.paceName} numberOfLines={1}>{String(name)}</Text>
                    <View style={{ flex: 1 }} />
                    <Text style={[st.paceVal, p.pts === 0 && { color: C.faint }]}>
                      {p.pts > 0 ? tfIn(lang, 'bd.paceLine', { n: p.pts, k: p.runs }) : T('bd.paceNone')}
                    </Text>
                  </View>
                );
              })}
              <Text style={st.paceNote}>{T('bd.paceRule')}</Text>
            </View>

            {/* 일별 리캡 */}
            <Text style={st.sectionTitle}>{T('bd.dailyTitle')}</Text>
            <DailyList battle={battle} />
          </ScrollView>

          {/* 다시 도전 — 같은 상대 프리필 */}
          <View style={[st.footer, { paddingBottom: insets.bottom + 10 }]}>
            <Pressable
              onPress={() => router.push({ pathname: '/battle-create', params: { opponent: battle.opponent.id } } as never)}
              style={st.cta}
            >
              <Icon name="refresh" size={18} color="#0D1A06" />
              <Text style={st.ctaTxt}>{tfIn(lang, 'bd.rematch', { name: battle.opponent.nickname })}</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const makeSt = (C: Tokens) => ({
  root: { flex: 1, backgroundColor: C.bg },
  confettiWrap: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 },
  appBar: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: S.lg, paddingVertical: 10, gap: 12 },
  backBtn: { padding: 2 },
  appTitle: { flex: 1, fontSize: 17, fontWeight: '800' as const, color: C.text, textAlign: 'center' as const },
  mockChip: { alignSelf: 'flex-start' as const, backgroundColor: C.surfaceAlt, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4, marginBottom: S.md },
  mockChipTxt: { fontSize: 11, color: C.faint, fontWeight: '600' as const },
  lockup: { backgroundColor: C.surface, borderRadius: R.xl, borderWidth: 1, borderColor: C.border, padding: S.xl, alignItems: 'center' as const, gap: 10, marginBottom: S.lg },
  lockupTitle: { fontSize: 22, fontWeight: '800' as const, color: C.text },
  lockupNames: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 16, marginTop: 4 },
  vs: { fontSize: 24, fontWeight: '800' as const, color: C.text, fontVariant: ['tabular-nums' as const] },
  lockupSub: { fontSize: 12, color: C.sub, textAlign: 'center' as const },
  sectionTitle: { fontSize: 13, fontWeight: '800' as const, color: C.sub, marginBottom: 8, marginTop: 4 },
  card: { backgroundColor: C.surface, borderRadius: R.xl, borderWidth: 1, borderColor: C.border, padding: S.lg, marginBottom: S.sm, gap: 10 },
  paceRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  paceName: { fontSize: 14, fontWeight: '700' as const, color: C.text, maxWidth: '50%' as const },
  paceVal: { fontSize: 13, fontWeight: '800' as const, color: C.accentGrn, fontVariant: ['tabular-nums' as const] },
  paceNote: { fontSize: 11, color: C.faint, lineHeight: 16, marginTop: 2 },
  footer: { position: 'absolute' as const, left: 0, right: 0, bottom: 0, paddingHorizontal: S.lg, paddingTop: 10, backgroundColor: C.bg },
  cta: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, backgroundColor: C.accent, borderRadius: R.pill, paddingVertical: 16 },
  ctaTxt: { fontSize: 15, fontWeight: '800' as const, color: '#0D1A06' },
  goneWrap: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8 },
  goneTxt: { fontSize: 14, color: C.sub },
});
