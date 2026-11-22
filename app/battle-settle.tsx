/**
 * 배틀 정산 (종료 상태 뷰) — spec §2.6-5 · redesign 8b (2026-11-21): REAL
 * wire-in. Target = ended · forfeited · cancelled rows (detail via the
 * battles store). 승자 락업 (무승부/포기 분기) · 최종 점수 바 · 페이스 보너스
 * 항목화 (runs[].breakdown.pace) · 일별 리캡 · 다시 도전 (same opponent
 * prefilled → /battle-create). Landing for battle_won notifications.
 */
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Confetti } from '@/components/pb-celebration';
import { Icon } from '@/components/ui';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { fmtKst, isDone, outcomeOf, paceBonusOf, scoreOf } from '@/lib/battles-api';
import { tfIn, useLang, useT } from '@/lib/i18n';
import { radius as R, spacing as S, shadows, type Tokens } from '@/lib/theme';
import { useBattles } from '@/store/use-battles';

import { DailyList, ScoreBars, useSides } from './battle-detail';

export default function BattleSettleScreen() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const T = useT();
  const lang = useLang();
  const { id } = useLocalSearchParams<{ id: string }>();
  const battle = useBattles(s => s.battles.find(b => b.id === id));
  const loaded = useBattles(s => s.loaded);
  const sides = useSides(battle);
  useEffect(() => { void useBattles.getState().loadDetail(id); }, [id]);

  if (battle && !isDone(battle)) return <Redirect href={{ pathname: '/battle-detail', params: { id: battle.id } } as never} />;

  const outcome = battle ? outcomeOf(battle, sides.me) : null;
  const forfeitedByMe = battle?.status === 'forfeited' && outcome === 'lost';
  const forfeitedByOpp = battle?.status === 'forfeited' && outcome === 'won';

  return (
    <View style={st.root}>
      {outcome === 'won' ? <View pointerEvents="none" style={st.confettiWrap}><Confetti /></View> : null}
      <View style={[st.appBar, { marginTop: insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appTitle} numberOfLines={1}>{battle ? `${battle.emoji ?? ''} ${battle.title}`.trim() : T('bd.settleTitle')}</Text>
        <View style={{ width: 20 }} />
      </View>

      {!battle ? (
        <View style={st.goneWrap}>
          {!loaded ? <ActivityIndicator size="large" color={C.accent} /> : <>
            <Icon name="flag-outline" size={36} color={C.faint} />
            <Text style={st.goneTxt}>{T('bd.gone')}</Text>
          </>}
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + 110 }} showsVerticalScrollIndicator={false}>
            <View style={[st.lockup, shadows.sm, outcome === 'won' && { borderColor: C.accent + '88' }]}>
              <Icon name={outcome === 'won' ? 'trophy' : outcome === 'draw' ? 'remove-circle-outline' : 'flag-outline'} size={36} color={outcome === 'won' ? C.crown : C.faint} />
              <Text style={st.lockupTitle}>
                {battle.status === 'cancelled' ? T('bd.cancelled')
                  : forfeitedByMe ? T('bd.forfeitedMe')
                  : forfeitedByOpp ? T('bd.forfeitedOpp')
                  : outcome === 'won' ? T('bd.wonTitle')
                  : outcome === 'lost' ? T('bd.lostTitle')
                  : T('bd.drawTitle')}
              </Text>
              <View style={st.lockupNames}>
                <Avatar name={sides.myName} size={44} photoUrl={sides.myPhoto} ring={outcome === 'won' ? C.accent : undefined} />
                <Text style={st.vs}>{`${Math.round(scoreOf(battle, sides.me))} : ${Math.round(scoreOf(battle, sides.oppId))}`}</Text>
                <Avatar name={sides.oppName} size={44} photoUrl={sides.oppPhoto} ring={outcome === 'lost' ? C.accent : undefined} />
              </View>
              <Text style={st.lockupSub}>
                {battle.started_at ? tfIn(lang, 'bd.period', { from: fmtKst(battle.started_at), to: fmtKst(battle.ends_at), days: battle.duration_days }) : tfIn(lang, 'bat.termDuration', { n: battle.duration_days })}
                {battle.settled_at ? `  ·  ${tfIn(lang, 'bd.settledAt', { d: fmtKst(battle.settled_at) })}` : ''}
              </Text>
            </View>

            <Text style={st.sectionTitle}>{T('bd.finalScores')}</Text>
            <ScoreBars battle={battle} sides={sides} compact />

            <Text style={st.sectionTitle}>{T('bd.paceTitle')}</Text>
            <View style={[st.card, shadows.sm]}>
              {([[sides.myName, paceBonusOf(battle, sides.me)], [sides.oppName, paceBonusOf(battle, sides.oppId)]] as [string, { pts: number; runs: number }][]).map(([name, p], i) => (
                <View key={i} style={st.paceRow}>
                  <Icon name="speedometer-outline" size={15} color={p.pts > 0 ? C.accentGrn : C.faint} />
                  <Text style={st.paceName} numberOfLines={1}>{name}</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={[st.paceVal, p.pts === 0 && { color: C.faint }]}>
                    {p.pts > 0 ? tfIn(lang, 'bd.paceLine', { n: Math.round(p.pts), k: p.runs }) : T('bd.paceNone')}
                  </Text>
                </View>
              ))}
              <Text style={st.paceNote}>{T('bd.paceRule')}</Text>
            </View>

            <Text style={st.sectionTitle}>{T('bd.dailyTitle')}</Text>
            <DailyList battle={battle} sides={sides} />
          </ScrollView>

          <View style={[st.footer, { paddingBottom: insets.bottom + 10 }]}>
            <Pressable onPress={() => router.push({ pathname: '/battle-create', params: { opponent: sides.oppId } } as never)} style={st.cta}>
              <Icon name="refresh" size={18} color={C.accentText} />
              <Text style={st.ctaTxt}>{tfIn(lang, 'bd.rematch', { name: sides.oppName })}</Text>
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
  ctaTxt: { fontSize: 15, fontWeight: '800' as const, color: C.accentText },
  goneWrap: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8 },
  goneTxt: { fontSize: 14, color: C.sub },
});
