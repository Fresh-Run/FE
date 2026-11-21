/**
 * 배틀 상세 — spec §2.6-4 · redesign 8b (2026-11-21): REAL wire-in. Data =
 * GET /battles/{id} (scores + runs) through the battles store; 종료 states
 * redirect to /battle-settle. Header (이모지 + 배틀명 + D-day/기간) · 참가자
 * 2인 점수 바 (총점 비례) · 일별 분해 (attributed_at KST — derived, not a
 * server field) · 러닝별 점수 (counted + breakdown icons; NO km — the server
 * run item carries none, ledgered ask) · 규칙 푸터 · ⋯ 메뉴 = 포기하기 /
 * 상호 취소 (both 2-step confirms). 점수는 "어제까지 스탠딩" (KST 자정 배치).
 */
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/ui';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import {
  battleDaysLeft, dailyBreakdown, fmtKst, isDone, isSettling, opponentIdOf, scoreOf, type Battle, type BattleRunItem,
} from '@/lib/battles-api';
import { errorMessage } from '@/lib/error-copy';
import { t, tfIn, useLang, useT } from '@/lib/i18n';
import { radius as R, spacing as S, shadows, type Tokens } from '@/lib/theme';
import { useBattles } from '@/store/use-battles';
import { useStore } from '@/store/use-store';

/** Everything the sub-views need to name and picture the two sides. */
export type Sides = { me: string | undefined; myName: string; myPhoto: string | null; oppId: string; oppName: string; oppPhoto: string | null };
export function useSides(battle: Battle | null | undefined): Sides {
  const me = useStore(s => s.session?.user.id);
  const myName = useStore(s => s.displayName) ?? t('bat.me');
  const myPhoto = useStore(s => s.photoUrl);
  const profiles = useBattles(s => s.profiles);
  const oppId = battle ? opponentIdOf(battle, me) : '';
  return { me, myName, myPhoto, oppId, oppName: profiles[oppId]?.nickname ?? t('bat.opponent'), oppPhoto: profiles[oppId]?.avatar_url ?? null };
}

export default function BattleDetailScreen() {
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

  if (battle && isDone(battle)) return <Redirect href={{ pathname: '/battle-settle', params: { id: battle.id } } as never} />;

  function openMenu(b: Battle) {
    // 포기하기 / 상호 취소 — both 2-step confirms (API_GUIDE forfeit/cancel contracts).
    // 신고·차단 join this menu when their battle-scoped contract lands (never a dead item).
    Alert.alert(b.title, undefined, [
      { text: t('bd.forfeit'), style: 'destructive', onPress: () => confirm('forfeit', b) },
      { text: t('bd.cancelMutual'), onPress: () => confirm('cancel', b) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }
  function confirm(kind: 'forfeit' | 'cancel', b: Battle) {
    Alert.alert(kind === 'forfeit' ? t('bd.forfeitConfirmT') : t('bd.cancelConfirmT'), kind === 'forfeit' ? t('bd.forfeitConfirmB') : t('bd.cancelConfirmB'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: kind === 'forfeit' ? t('bd.forfeit') : t('bd.cancelMutual'), style: 'destructive',
        onPress: async () => {
          try {
            await (kind === 'forfeit' ? useBattles.getState().forfeit(b.id) : useBattles.getState().cancel(b.id));
            router.replace({ pathname: '/battle-settle', params: { id: b.id } } as never);
          } catch (e: unknown) {
            Alert.alert(t('bd.title'), errorMessage(e));
          }
        },
      },
    ]);
  }

  return (
    <View style={st.root}>
      <View style={[st.appBar, { marginTop: insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appTitle} numberOfLines={1}>{battle ? `${battle.emoji ?? ''} ${battle.title}`.trim() : T('bd.title')}</Text>
        {battle && battle.status === 'active' ? (
          <Pressable onPress={() => openMenu(battle)} hitSlop={12} accessibilityLabel={T('bd.menu')}>
            <Icon name="ellipsis-horizontal" size={22} color={C.text} />
          </Pressable>
        ) : <View style={{ width: 22 }} />}
      </View>

      {!battle ? (
        <View style={st.goneWrap}>
          {!loaded ? <ActivityIndicator size="large" color={C.accent} /> : <>
            <Icon name="flag-outline" size={36} color={C.faint} />
            <Text style={st.goneTxt}>{T('bd.gone')}</Text>
          </>}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
          <View style={st.periodRow}>
            {battle.status === 'pending' ? (
              <Text style={st.periodMain}>{T('bat.waitingReply')}</Text>
            ) : isSettling(battle) ? (
              <Text style={[st.periodMain, { color: C.sun }]}>{T('bd.settling')}</Text>
            ) : (
              <Text style={st.periodMain}>{tfIn(lang, 'bd.dDay', { n: battleDaysLeft(battle) })}</Text>
            )}
            <Text style={st.periodSub}>
              {battle.started_at
                ? tfIn(lang, 'bd.period', { from: fmtKst(battle.started_at), to: fmtKst(battle.ends_at), days: battle.duration_days })
                : tfIn(lang, 'bat.termDuration', { n: battle.duration_days })}
            </Text>
          </View>

          <ScoreBars battle={battle} sides={sides} />
          <Text style={st.standingNote}>{T('bd.standingNote')}</Text>

          <Text style={st.sectionTitle}>{T('bd.dailyTitle')}</Text>
          <DailyList battle={battle} sides={sides} />

          <Text style={st.sectionTitle}>{T('bd.runsTitle')}</Text>
          <RunRows battle={battle} sides={sides} />

          <View style={st.rulesCard}>
            <Icon name="information-circle-outline" size={16} color={C.sub} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={st.ruleTxt}>{T('bat.termSettle')}</Text>
              <Text style={st.ruleTxt}>{T('bat.termAuto')}</Text>
              <Text style={st.ruleTxt}>{T('bd.ruleBatch')}</Text>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

/** 참가자 점수 바 — 총점 비례 (둘 다 0이면 반반 회색) */
export function ScoreBars({ battle, sides, compact = false }: { battle: Battle; sides: Sides; compact?: boolean }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const lang = useLang();
  const me = scoreOf(battle, sides.me), opp = scoreOf(battle, sides.oppId);
  const max = Math.max(me, opp, 1);
  const multOf = (uid: string | undefined) => battle.scores?.find(s => s.user_id === uid)?.streak_multiplier ?? 1;
  const rows: [string, string | null, number, number][] = [
    [sides.myName, sides.myPhoto, me, multOf(sides.me)],
    [sides.oppName, sides.oppPhoto, opp, multOf(sides.oppId)],
  ];
  return (
    <View style={[st.card, shadows.sm, compact && { padding: S.md }]}>
      {rows.map(([name, photo, score, mult], i) => {
        const lead = score >= Math.max(me, opp) && me !== opp;
        return (
          <View key={i} style={st.barRow}>
            <Avatar name={name} size={compact ? 28 : 34} photoUrl={photo} />
            <View style={{ flex: 1, gap: 6 }}>
              <View style={st.barHead}>
                <Text style={[st.barName, lead && { color: C.accentGrn }]} numberOfLines={1}>{name}</Text>
                {mult > 1 ? <Text style={st.multTxt}>{tfIn(lang, 'bd.streak', { m: mult.toFixed(2) })}</Text> : null}
                <View style={{ flex: 1 }} />
                <Text style={[st.barScore, lead && { color: C.accentGrn }]}>{tfIn(lang, 'bt.totalPts', { n: Math.round(score) })}</Text>
              </View>
              <View style={st.barTrack}>
                <View style={[st.barFill, { width: `${Math.max(2, Math.round((score / max) * 100))}%` as const, backgroundColor: lead ? C.accent : C.border }]} />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** 일별 분해 — 양측 런 수/점수 */
export function DailyList({ battle, sides }: { battle: Battle; sides: Sides }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  const lang = useLang();
  const days = dailyBreakdown(battle, sides.me);
  if (days.length === 0) return <Text style={st.emptyDaily}>{T('bd.dailyEmpty')}</Text>;
  return (
    <View style={[st.card, shadows.sm, { paddingVertical: 4 }]}>
      <View style={st.dailyHead}>
        <Text style={[st.dailyCell, st.dailyDayCol, { color: C.faint }]}>{T('bd.colDay')}</Text>
        <Text style={[st.dailyCell, { color: C.faint }]}>{T('bat.me')}</Text>
        <Text style={[st.dailyCell, { color: C.faint }]} numberOfLines={1}>{sides.oppName}</Text>
      </View>
      {days.map(d => (
        <View key={d.dateKey} style={st.dailyRow}>
          <View style={st.dailyDayCol}>
            <Text style={st.dailyDay}>{tfIn(lang, 'bd.dayN', { n: d.dayIndex })}</Text>
            <Text style={st.dailyDate}>{d.dateKey.slice(5).replace('-', '/')}</Text>
          </View>
          <DailyCell runs={d.me.runs} pts={d.me.pts} lead={d.me.pts > d.opp.pts} />
          <DailyCell runs={d.opp.runs} pts={d.opp.pts} lead={d.opp.pts > d.me.pts} />
        </View>
      ))}
    </View>
  );
}
function DailyCell({ runs, pts, lead }: { runs: number; pts: number; lead: boolean }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const lang = useLang();
  const T = useT();
  return (
    <View style={st.dailyCell}>
      <Text style={[st.dailyPts, lead && { color: C.accentGrn }]}>{pts > 0 ? tfIn(lang, 'bt.runPts', { n: Math.round(pts) }) : T('bd.noRun')}</Text>
      {runs > 0 ? <Text style={st.dailyRuns}>{tfIn(lang, 'bd.runsN', { n: runs })}</Text> : null}
    </View>
  );
}

/** 런 행 — counted 분기 + breakdown 아이콘 (early_bird · milestone · pace); date instead of km (none served) */
function RunRows({ battle, sides }: { battle: Battle; sides: Sides }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  const lang = useLang();
  const runs = [...(battle.runs ?? [])].sort((a, b) => (b.attributed_at ?? '').localeCompare(a.attributed_at ?? ''));
  if (runs.length === 0) return <Text style={st.emptyDaily}>{T('bd.runsEmpty')}</Text>;
  return (
    <View style={[st.card, shadows.sm, { paddingVertical: 2 }]}>
      {runs.map((r: BattleRunItem) => {
        const bd = r.breakdown;
        return (
          <View key={r.run_id} style={st.runRow}>
            <Icon name={r.counted ? 'checkmark-circle' : 'remove-circle-outline'} size={15} color={r.counted ? C.accent : C.faint} />
            <Text style={st.runWho} numberOfLines={1}>{r.user_id === sides.me ? T('bat.me') : sides.oppName}</Text>
            <Text style={st.runDist}>{fmtKst(r.attributed_at)}</Text>
            {bd && (bd.early_bird ?? 0) > 0 ? <Icon name="sunny-outline" size={13} color={C.sun} /> : null}
            {bd && (bd.milestone ?? 0) > 0 ? <Icon name="trophy-outline" size={13} color={C.crown} /> : null}
            {bd && (bd.pace ?? 0) > 0 ? <Icon name="speedometer-outline" size={13} color={C.accentGrn} /> : null}
            <View style={{ flex: 1 }} />
            <Text style={[st.runPts, !r.counted && { color: C.faint }]}>
              {r.counted ? tfIn(lang, 'bt.runPts', { n: Math.round(r.run_score) }) : T('bt.notQualified')}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const makeSt = (C: Tokens) => ({
  root: { flex: 1, backgroundColor: C.bg },
  appBar: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: S.lg, paddingVertical: 10, gap: 12 },
  backBtn: { padding: 2 },
  appTitle: { flex: 1, fontSize: 17, fontWeight: '800' as const, color: C.text, textAlign: 'center' as const },
  periodRow: { marginBottom: S.md, gap: 2 },
  periodMain: { fontSize: 22, fontWeight: '800' as const, color: C.text, fontVariant: ['tabular-nums' as const] },
  periodSub: { fontSize: 13, color: C.sub },
  card: { backgroundColor: C.surface, borderRadius: R.xl, borderWidth: 1, borderColor: C.border, padding: S.lg, marginBottom: S.sm, gap: 12 },
  barRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  barHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  barName: { fontSize: 14, fontWeight: '700' as const, color: C.text, maxWidth: '55%' as const },
  multTxt: { fontSize: 11, fontWeight: '700' as const, color: C.accentGrn, backgroundColor: C.accentDim, borderRadius: R.pill, paddingHorizontal: 7, paddingVertical: 2 },
  barScore: { fontSize: 16, fontWeight: '800' as const, color: C.text, fontVariant: ['tabular-nums' as const] },
  barTrack: { height: 10, borderRadius: 5, backgroundColor: C.surfaceAlt, overflow: 'hidden' as const },
  barFill: { height: 10, borderRadius: 5 },
  standingNote: { fontSize: 11, color: C.faint, marginBottom: S.lg, marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '800' as const, color: C.sub, marginBottom: 8, marginTop: 4 },
  dailyHead: { flexDirection: 'row' as const, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  dailyRow: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  dailyDayCol: { width: 64 },
  dailyDay: { fontSize: 13, fontWeight: '800' as const, color: C.text },
  dailyDate: { fontSize: 11, color: C.faint },
  dailyCell: { flex: 1, fontSize: 12, fontWeight: '700' as const, gap: 2 },
  dailyPts: { fontSize: 14, fontWeight: '800' as const, color: C.text, fontVariant: ['tabular-nums' as const] },
  dailyRuns: { fontSize: 11, color: C.sub },
  emptyDaily: { fontSize: 13, color: C.faint, paddingVertical: 10, marginBottom: S.sm },
  runRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 7, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.border },
  runWho: { fontSize: 12, color: C.sub, maxWidth: 72 },
  runDist: { fontSize: 13, fontWeight: '700' as const, color: C.text, fontVariant: ['tabular-nums' as const] },
  runPts: { fontSize: 12, fontWeight: '700' as const, color: C.sub },
  rulesCard: { flexDirection: 'row' as const, gap: 8, backgroundColor: C.surfaceAlt, borderRadius: R.lg, padding: S.md, marginTop: S.md },
  ruleTxt: { fontSize: 12, color: C.sub, lineHeight: 17 },
  goneWrap: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8 },
  goneTxt: { fontSize: 14, color: C.sub },
});
