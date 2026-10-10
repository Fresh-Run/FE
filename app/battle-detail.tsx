/**
 * 배틀 상세 — 슬라이스 3 (2026-10-10; spec §2.6-4). 8/21 리더보드-데모 조상
 * (battle-home-body 내부 뷰)을 대체한다. MOCK ONLY: useBattleMock의 서버-
 * 셰이프 행 (BattleResponse 1:1) — slice 2는 GET /battles/{id}로 데이터만
 * 교체. 진행 중(active)의 홈이며, 종료 상태는 /battle-settle로 보낸다.
 *
 * 구성: 헤더 (이모지 + 배틀명 + D-day/기간) · 참가자 2인 점수 바 (총점,
 * 비례) · 일별 분해 (attributed_at KST 날짜 그룹 — 파생, 서버 필드 아님)
 * · 규칙 푸터 (30분 유예 라인 = spec §Q4 UI 필수) · ⋯ 오버플로우 = 포기하기
 * (확인 → forfeit 미러). 신고/차단은 spec §2.6-6상 실배선 시 필수 — 슬라이스
 * 2에서 메뉴에 합류 (죽은 항목은 노출하지 않는다: 지금은 메뉴에 없음).
 *
 * 점수는 "어제까지 스탠딩" (KST 자정 배치 정산) — 라이브 아님을 명시.
 */
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/ui';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { t, tfIn, useLang, useT } from '@/lib/i18n';
import { radius as R, spacing as S, shadows, type Tokens } from '@/lib/theme';
import {
  BATTLE_ENABLED, MOCK_ME_ID, dailyBreakdown, daysLeftOf, isDone, isSettling, myScore, oppScore,
  useBattleMock, type BattleRunRow, type MockBattle,
} from '@/store/battle-mock';

export default function BattleDetailScreen() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const T = useT();
  const lang = useLang();
  const { id } = useLocalSearchParams<{ id: string }>();
  const battle = useBattleMock(s => s.battles.find(b => b.id === id));

  // 9/16 플래그 (훅 뒤 — rules-of-hooks): 슬라이스 2까지 inert-리다이렉트
  if (!BATTLE_ENABLED) return <Redirect href="/(tabs)/community" />;
  if (battle && isDone(battle)) return <Redirect href={{ pathname: '/battle-settle', params: { id: battle.id } } as never} />;

  function openMenu(b: MockBattle) {
    // 포기하기 = 2단계 확인 (즉시 패배·상대 점수 유지 — API_GUIDE forfeit 계약).
    // TODO(slice 2): 신고 · 차단 항목 합류 (spec §2.6-6 — 실배선 시 필수).
    Alert.alert(b.title ?? tfIn(lang, 'bat.vsName', { name: b.opponent.nickname }), undefined, [
      { text: t('bd.forfeit'), style: 'destructive', onPress: () => confirmForfeit(b) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }
  function confirmForfeit(b: MockBattle) {
    Alert.alert(t('bd.forfeitConfirmT'), t('bd.forfeitConfirmB'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('bd.forfeit'), style: 'destructive',
        onPress: () => {
          useBattleMock.getState().forfeit(b.id);
          router.replace({ pathname: '/battle-settle', params: { id: b.id } } as never);
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
        <Text style={st.appTitle} numberOfLines={1}>
          {battle ? `${battle.emoji} ${battle.title ?? tfIn(lang, 'bat.vsName', { name: battle.opponent.nickname })}` : T('bd.title')}
        </Text>
        {battle && battle.status === 'active' ? (
          <Pressable onPress={() => openMenu(battle)} hitSlop={12} accessibilityLabel={T('bd.menu')}>
            <Icon name="ellipsis-horizontal" size={22} color={C.text} />
          </Pressable>
        ) : <View style={{ width: 22 }} />}
      </View>

      {!battle ? (
        <View style={st.goneWrap}>
          <Icon name="flag-outline" size={36} color={C.faint} />
          <Text style={st.goneTxt}>{T('bd.gone')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
          <View style={st.mockChip}><Text style={st.mockChipTxt}>{T('bt.mockNotice')}</Text></View>

          {/* 헤더 — D-day / 기간 / 정산 중 */}
          <View style={st.periodRow}>
            {battle.status === 'pending' ? (
              <Text style={st.periodMain}>{T('bat.waitingReply')}</Text>
            ) : isSettling(battle) ? (
              <Text style={[st.periodMain, { color: C.sun }]}>{T('bd.settling')}</Text>
            ) : (
              <Text style={st.periodMain}>{tfIn(lang, 'bd.dDay', { n: daysLeftOf(battle) })}</Text>
            )}
            <Text style={st.periodSub}>
              {battle.started_at
                ? tfIn(lang, 'bd.period', { from: fmtKst(battle.started_at), to: fmtKst(battle.ends_at), days: battle.duration_days })
                : tfIn(lang, 'bat.termDuration', { n: battle.duration_days })}
            </Text>
          </View>

          {/* 참가자 2인 — 점수 바 (총점 비례) */}
          <ScoreBars battle={battle} />
          <Text style={st.standingNote}>{T('bd.standingNote')}</Text>

          {/* 일별 분해 */}
          <Text style={st.sectionTitle}>{T('bd.dailyTitle')}</Text>
          <DailyList battle={battle} />

          {/* 런 상세 (counted 분기 — 미집계 = 1.5km 미만/플래그) */}
          <Text style={st.sectionTitle}>{T('bd.runsTitle')}</Text>
          <RunRows battle={battle} />

          {/* 규칙 푸터 — 30분 유예 (spec §Q4 UI 필수) */}
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
export function ScoreBars({ battle, compact = false }: { battle: MockBattle; compact?: boolean }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  const lang = useLang();
  const me = myScore(battle), opp = oppScore(battle);
  const max = Math.max(me, opp, 1);
  const rows: [string, number, boolean][] = [
    [T('bat.me'), me, true],
    [battle.opponent.nickname, opp, false],
  ];
  const meMult = battle.scores.find(s => s.user_id === MOCK_ME_ID)?.streak_multiplier ?? 1;
  const oppMult = battle.scores.find(s => s.user_id === battle.opponent.id)?.streak_multiplier ?? 1;
  return (
    <View style={[st.card, shadows.sm, compact && { padding: S.md }]}>
      {rows.map(([name, score, isMe]) => {
        const lead = score >= Math.max(me, opp) && me !== opp;
        const mult = isMe ? meMult : oppMult;
        return (
          <View key={name} style={st.barRow}>
            <Avatar name={name} size={compact ? 28 : 34} photoUrl={null} />
            <View style={{ flex: 1, gap: 6 }}>
              <View style={st.barHead}>
                <Text style={[st.barName, lead && { color: C.accentGrn }]} numberOfLines={1}>{name}</Text>
                {mult > 1 ? <Text style={st.multTxt}>{tfIn(lang, 'bd.streak', { m: mult.toFixed(2) })}</Text> : null}
                <View style={{ flex: 1 }} />
                <Text style={[st.barScore, lead && { color: C.accentGrn }]}>{tfIn(lang, 'bt.totalPts', { n: score })}</Text>
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
export function DailyList({ battle }: { battle: MockBattle }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  const lang = useLang();
  const days = dailyBreakdown(battle);
  if (days.length === 0) return <Text style={st.emptyDaily}>{T('bd.dailyEmpty')}</Text>;
  return (
    <View style={[st.card, shadows.sm, { paddingVertical: 4 }]}>
      <View style={st.dailyHead}>
        <Text style={[st.dailyCell, st.dailyDayCol, { color: C.faint }]}>{T('bd.colDay')}</Text>
        <Text style={[st.dailyCell, { color: C.faint }]}>{T('bat.me')}</Text>
        <Text style={[st.dailyCell, { color: C.faint }]} numberOfLines={1}>{battle.opponent.nickname}</Text>
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
      <Text style={[st.dailyPts, lead && { color: C.accentGrn }]}>{pts > 0 ? tfIn(lang, 'bt.runPts', { n: pts }) : T('bd.noRun')}</Text>
      {runs > 0 ? <Text style={st.dailyRuns}>{tfIn(lang, 'bd.runsN', { n: runs })}</Text> : null}
    </View>
  );
}

/** 런 행 — counted 분기 + breakdown 아이콘 (early_bird · milestone · pace) */
function RunRows({ battle }: { battle: MockBattle }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  const lang = useLang();
  const runs = [...battle.runs].sort((a, b) => b.attributed_at.localeCompare(a.attributed_at));
  if (runs.length === 0) return <Text style={st.emptyDaily}>{T('bd.runsEmpty')}</Text>;
  return (
    <View style={[st.card, shadows.sm, { paddingVertical: 2 }]}>
      {runs.map((r: BattleRunRow) => {
        const mine = r.user_id === MOCK_ME_ID;
        const bd = r.breakdown;
        return (
          <View key={r.run_id} style={st.runRow}>
            <Icon name={r.counted ? 'checkmark-circle' : 'remove-circle-outline'} size={15} color={r.counted ? C.accent : C.faint} />
            <Text style={st.runWho} numberOfLines={1}>{mine ? T('bat.me') : battle.opponent.nickname}</Text>
            <Text style={st.runDist}>{`${r.distance_km.toFixed(1)}km`}</Text>
            {bd && bd.early_bird > 0 ? <Icon name="sunny-outline" size={13} color={C.sun} /> : null}
            {bd && bd.milestone > 0 ? <Icon name="trophy-outline" size={13} color={C.crown} /> : null}
            {bd && bd.pace > 0 ? <Icon name="speedometer-outline" size={13} color={C.accentGrn} /> : null}
            <View style={{ flex: 1 }} />
            <Text style={[st.runPts, !r.counted && { color: C.faint }]}>
              {r.counted ? tfIn(lang, 'bt.runPts', { n: r.run_score }) : T('bt.notQualified')}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** KST 날짜 M/D */
export function fmtKst(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + 9 * 3_600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

const makeSt = (C: Tokens) => ({
  root: { flex: 1, backgroundColor: C.bg },
  appBar: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: S.lg, paddingVertical: 10, gap: 12 },
  backBtn: { padding: 2 },
  appTitle: { flex: 1, fontSize: 17, fontWeight: '800' as const, color: C.text, textAlign: 'center' as const },
  mockChip: { alignSelf: 'flex-start' as const, backgroundColor: C.surfaceAlt, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4, marginBottom: S.md },
  mockChipTxt: { fontSize: 11, color: C.faint, fontWeight: '600' as const },
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
