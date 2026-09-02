/**
 * 배틀 홈 바디 — 슬라이스 1 (spec §2.6-1, v0 LOCKED 8/29) + 9/1 오너
 * 재룰링: 진입점 = 커뮤니티 3번째 톱탭 (크루 · 둘러보기 · 배틀), codeRow
 * 엔트리 폐기. 바디를 공유 컴포넌트로 추출 — 커뮤니티 탭이 embedded로
 * 렌더, /battle-home 라우트는 얇은 래퍼로 존치 (딥링크 표면, 푸시 알림용).
 *
 * mode 차이 (embedded = 커뮤니티 탭 안):
 *  - appBar (back/타이틀) 없음 — 커뮤니티 헤더+톱탭이 위에 있다.
 *    생성(+)은 서브탭 필 행 우측 끝으로 이동 (앱바 부재 시 유일한 생성 진입).
 *  - 상단 인셋 0 (커뮤니티가 이미 패딩) · 하단 = 플로팅 탭바 인셋.
 *
 * MOCK ONLY: 리스트는 useBattleMock (인메모리, 네트워크 0), 카드 탭의
 * 리더보드는 8/21 목 리더보드 셸을 내부 디테일 뷰로 보존 (slice 3의 배틀
 * 상세 조상 — 스코어 엔진 lib/battle-score는 라이브, 입력만 픽스처).
 *
 * 탭: 진행 중 / 대기 / 종료 — 카드에 상대·남은 일수·점수 격차 (spec §2.6-1).
 * 전 탭 엠티 스테이트 (dead space 금지, 목 데이터 누수 금지).
 *
 * TODO(slice2): 리스트/생성/수락 실 엔드포인트 · TODO(slice3): 배틀 상세
 * (점수 바 · 일별 · 포기 오버플로우) + 정산 화면 · 푸시 = 빌드 13.
 */
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { useTabBarInset } from '@/components/fresh-tab-bar';
import { Confetti } from '@/components/pb-celebration';
import { Icon } from '@/components/ui';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { tfIn, useLang, useT } from '@/lib/i18n';
import { aggregateScore, type BattleRun, type BattleScore } from '@/lib/battle-score';
import { useBattleMock, type MockBattle } from '@/store/battle-mock';
import { radius as R, spacing as S, shadows, type Tokens } from '@/lib/theme';

type Tab = 'active' | 'pending' | 'done';
type Mode = 'route' | 'embedded';

export function BattleHomeBody({ mode, scrollRef }: {
  mode: Mode;
  scrollRef?: React.RefObject<ScrollView | null>;
}) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset();
  const T = useT();
  const lang = useLang();

  const [tab, setTab] = useState<Tab>('active');
  const [detailOpen, setDetailOpen] = useState(false);
  const battles = useBattleMock(s => s.battles);

  const active = battles.filter(b => b.status === 'active');
  const pending = battles.filter(b => b.status === 'pending');
  const done = battles.filter(b => b.status === 'settled');
  const rows: MockBattle[] = tab === 'active' ? active : tab === 'pending' ? pending : done;

  function openCreate() {
    // 쿼터 슬롯 (spec Q6) — 베타: 항상 ok; slice 2에서 실 게이트 + 안내 UI
    if (!useBattleMock.getState().canCreate().ok) return;
    router.push('/battle-create' as never);
  }

  if (detailOpen) return <LeaderboardDemo mode={mode} onBack={() => setDetailOpen(false)} />;

  const TABS: [Tab, string][] = [
    ['active', T('bat.tabActive')],
    ['pending', T('bat.tabPending')],
    ['done', T('bat.tabDone')],
  ];

  return (
    <View style={st.root}>
      {mode === 'route' && (
        <View style={[st.appBar, { marginTop: insets.top }]}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
            <Icon name="arrow-back" size={20} color={C.text} />
          </Pressable>
          <Text style={st.appTitle}>{T('bat.homeTitle')}</Text>
          <Pressable onPress={openCreate} hitSlop={10} accessibilityLabel={T('bat.create')}>
            <Icon name="add" size={24} color={C.accentGrn} />
          </Pressable>
        </View>
      )}

      <View style={[st.mockChipWrap, mode === 'embedded' && { paddingTop: 10 }]}>
        <View style={st.mockChip}><Text style={st.mockChipTxt}>{T('bt.mockNotice')}</Text></View>
      </View>

      {/* tabs — embedded carries the create (+) at the row's end (no appBar) */}
      <View style={st.tabRow}>
        {TABS.map(([key, label]) => (
          <Pressable key={key} onPress={() => setTab(key)} style={[st.tabBtn, tab === key && st.tabBtnSel]}>
            <Text style={[st.tabTxt, tab === key && st.tabTxtSel]}>{label}</Text>
          </Pressable>
        ))}
        {mode === 'embedded' && (
          <>
            <View style={{ flex: 1 }} />
            <Pressable onPress={openCreate} hitSlop={10} accessibilityLabel={T('bat.create')} style={st.tabAddBtn}>
              <Icon name="add" size={22} color={C.accentGrn} />
            </Pressable>
          </>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: S.lg, paddingBottom: mode === 'route' ? insets.bottom + 24 : tabBarInset }}
        showsVerticalScrollIndicator={false}
      >
        {rows.length === 0 ? (
          <View style={st.emptyWrap}>
            <Icon
              name={tab === 'active' ? 'flash-outline' : tab === 'pending' ? 'mail-outline' : 'flag-outline'}
              size={36}
              color={C.faint}
            />
            <Text style={st.emptyTitle}>
              {T(tab === 'active' ? 'bat.emptyActive' : tab === 'pending' ? 'bat.emptyPending' : 'bat.emptyDone')}
            </Text>
            {tab === 'active' && <Text style={st.emptySub}>{T('bat.emptyActiveSub')}</Text>}
          </View>
        ) : rows.map(b => (
          <Pressable
            key={b.id}
            onPress={() => {
              if (b.status === 'pending' && b.direction === 'in') router.push({ pathname: '/battle-invite', params: { id: b.id } } as never);
              else if (b.status === 'active') setDetailOpen(true); // 목 리더보드 (slice-3 상세의 조상)
            }}
            style={[st.card, shadows.sm]}
          >
            <View style={st.cardHead}>
              <Avatar name={b.opponent.nickname} size={38} photoUrl={null} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.cardName} numberOfLines={1}>
                  {b.title ?? tfIn(lang, 'bat.vsName', { name: b.opponent.nickname })}
                </Text>
                {b.title ? <Text style={st.cardSubName} numberOfLines={1}>{tfIn(lang, 'bat.vsName', { name: b.opponent.nickname })}</Text> : null}
              </View>
              {b.status === 'active' && <Text style={st.daysLeft}>{tfIn(lang, 'bat.daysLeft', { n: b.daysLeft })}</Text>}
              {b.status === 'settled' && (
                <View style={[st.resultBadge, { backgroundColor: b.won ? C.accentDim : C.surfaceAlt }]}>
                  <Text style={[st.resultTxt, { color: b.won ? C.accentGrn : C.sub }]}>{T(b.won ? 'bat.won' : 'bat.lost')}</Text>
                </View>
              )}
            </View>
            {b.status === 'active' && (
              <View style={st.cardFoot}>
                <Text style={st.gapTxt}>
                  {b.myScore === b.oppScore
                    ? T('bat.tied')
                    : b.myScore > b.oppScore
                      ? tfIn(lang, 'bat.leading', { n: b.myScore - b.oppScore })
                      : tfIn(lang, 'bat.trailing', { n: b.oppScore - b.myScore })}
                </Text>
                <View style={{ flex: 1 }} />
                {/* 데모 전용 — 목 정산 (라이프사이클 워크용; slice 2에서 죽음) */}
                <Pressable onPress={() => useBattleMock.getState().demoSettle(b.id)} style={st.demoChip} hitSlop={6}>
                  <Text style={st.demoChipTxt}>{T('bat.demoSettle')}</Text>
                </Pressable>
              </View>
            )}
            {b.status === 'pending' && (
              <Text style={st.pendingTxt}>{T(b.direction === 'out' ? 'bat.waitingReply' : 'bat.inviteFrom')}</Text>
            )}
            {b.status === 'settled' && (
              <Text style={st.scoreLine}>{`${b.myScore} : ${b.oppScore}`}</Text>
            )}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 목 리더보드 (8/21 셸 보존) — 진행 중 카드 탭의 데모 디테일. slice 3의 배틀
// 상세가 이걸 대체/흡수한다. 스코어 엔진은 라이브, 입력은 픽스처.
// ═════════════════════════════════════════════════════════════════════════════

const ME_RUNS: BattleRun[] = [
  { id: 'm1', ran_at: '2026-08-18T19:10:00+09:00', distance_km: 3.2, duration_sec: 1020, avg_pace_sec_per_km: 319 },
  { id: 'm2', ran_at: '2026-08-20T06:30:00+09:00', distance_km: 2.0, duration_sec: 780, avg_pace_sec_per_km: 390 },
  { id: 'm3', ran_at: '2026-08-21T08:00:00+09:00', distance_km: 12.0, duration_sec: 4200, avg_pace_sec_per_km: 350 },
];
const RIVAL_RUNS: BattleRun[] = [
  { id: 'r1', ran_at: '2026-08-19T06:20:00+09:00', distance_km: 5.4, duration_sec: 1980, avg_pace_sec_per_km: 366 },
  { id: 'r2', ran_at: '2026-08-20T21:00:00+09:00', distance_km: 1.2, duration_sec: 600, avg_pace_sec_per_km: 500 },
  { id: 'r3', ran_at: '2026-08-21T20:10:00+09:00', distance_km: 4.1, duration_sec: 1450, avg_pace_sec_per_km: 353 },
];
const MOCK = [
  { nickname: '이준', avatarUrl: null, me: true, streakDays: 4, baseline: 360, runs: ME_RUNS },
  { nickname: '테스트2', avatarUrl: null, me: false, streakDays: 2, baseline: 380, runs: RIVAL_RUNS },
];
const MOCK_ENDS_AT = '2026-08-24T21:00:00+09:00'; // TODO(slice3): 실 ends_at
const DEMO_RUNS: BattleRun[] = [
  { id: 'd1', ran_at: '2026-08-22T06:40:00+09:00', distance_km: 4.0, duration_sec: 1400, avg_pace_sec_per_km: 350 },
  { id: 'd2', ran_at: '2026-08-22T19:00:00+09:00', distance_km: 2.5, duration_sec: 900, avg_pace_sec_per_km: 360 },
  { id: 'd3', ran_at: '2026-08-23T07:30:00+09:00', distance_km: 6.5, duration_sec: 2400, avg_pace_sec_per_km: 369 },
];

function Countdown({ endAt }: { endAt: string }) {
  const st = useStyles(makeSt);
  const lang = useLang();
  const T = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const leftMs = new Date(endAt).getTime() - now;
  if (leftMs <= 0) return <Text style={st.daysTxt}>{T('bt.ended')}</Text>;
  const d = Math.floor(leftMs / 86_400_000);
  const h = Math.floor((leftMs % 86_400_000) / 3_600_000);
  return <Text style={st.daysTxt}>{d > 0 ? tfIn(lang, 'bt.countdown', { d, h }) : tfIn(lang, 'bt.countdownH', { h })}</Text>;
}

function ScoreFlip({ text, style }: { text: string; style: object }) {
  const roll = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(text);
  const prevRef = useRef(text);
  useEffect(() => {
    if (text === prevRef.current) return;
    prevRef.current = text;
    roll.setValue(0);
    Animated.timing(roll, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const half = setTimeout(() => setShown(text), 130); // swap under the roll
    return () => clearTimeout(half);
  }, [text, roll]);
  const translateY = roll.interpolate({ inputRange: [0, 0.34, 0.35, 1], outputRange: [0, 14, -14, 0] });
  const opacity = roll.interpolate({ inputRange: [0, 0.3, 0.4, 1], outputRange: [1, 0, 0, 1] });
  return <Animated.Text style={[style, { transform: [{ translateY }], opacity }]}>{shown}</Animated.Text>;
}

function LeaderboardDemo({ mode, onBack }: { mode: Mode; onBack: () => void }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset();
  const T = useT();
  const lang = useLang();

  const [demoIdx, setDemoIdx] = useState(0);
  const [reveal, setReveal] = useState(false);
  const scored = MOCK.map((p, pi) => ({
    ...p,
    score: aggregateScore(
      pi === 0 ? [...p.runs, ...DEMO_RUNS.slice(0, demoIdx)] : p.runs,
      { baselinePaceSecPerKm: p.baseline, streakDays: p.streakDays },
    ),
  })).sort((a, b) => b.score.totalPts - a.score.totalPts);

  return (
    <View style={st.root}>
      <View style={[st.appBar, { marginTop: mode === 'route' ? insets.top : 0 }]}>
        <Pressable onPress={onBack} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appTitle}>{T('bt.title')}</Text>
        <View style={{ width: 20 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: mode === 'route' ? insets.bottom + 24 : tabBarInset }} showsVerticalScrollIndicator={false}>
        <View style={st.liveBanner}>
          <View style={st.liveDot} />
          <Text style={st.liveTxt}>{T('bt.live')}</Text>
          <Countdown endAt={MOCK_ENDS_AT} />
        </View>
        <View style={st.demoRow}>
          <View style={st.mockChip}><Text style={st.mockChipTxt}>{T('bt.mockNotice')}</Text></View>
          <Pressable onPress={() => setDemoIdx(i => Math.min(i + 1, DEMO_RUNS.length))} style={st.demoChip}>
            <Text style={st.demoChipTxt}>{T('bt.demoAddRun')}</Text>
          </Pressable>
          <Pressable onPress={() => setReveal(true)} style={st.demoChip}>
            <Text style={st.demoChipTxt}>{T('bt.demoReveal')}</Text>
          </Pressable>
        </View>

        {scored.map((p, i) => (
          <View key={p.nickname} style={[st.card, shadows.sm, i === 0 && st.cardLead]}>
            <View style={st.head}>
              <View style={[st.rankMedal, { backgroundColor: i === 0 ? C.crown : C.faint }]}>
                <Text style={st.rankMedalTxt}>{i + 1}</Text>
              </View>
              <Avatar name={p.nickname} size={34} photoUrl={p.avatarUrl} />
              <Text style={st.name} numberOfLines={1}>{p.nickname}</Text>
              <ScoreFlip text={tfIn(lang, 'bt.totalPts', { n: p.score.totalPts })} style={st.total} />
            </View>
            <Breakdown score={p.score} streakDays={p.streakDays} />
            {p.score.runs.map(r => {
              const run = p.runs.find(x => x.id === r.runId)!;
              return (
                <View key={r.runId} style={st.runRow}>
                  <Icon name={r.qualified ? 'checkmark-circle' : 'remove-circle-outline'} size={15} color={r.qualified ? C.accent : C.faint} />
                  <Text style={st.runDist}>{run.distance_km.toFixed(1)}km</Text>
                  {r.earlyBird > 0 && <Icon name="sunny-outline" size={13} color={C.sun} />}
                  {r.milestone > 0 && <Icon name="trophy-outline" size={13} color={C.crown} />}
                  <View style={{ flex: 1 }} />
                  <Text style={[st.runPts, !r.qualified && { color: C.faint }]}>
                    {r.qualified ? tfIn(lang, 'bt.runPts', { n: r.pts }) : T('bt.notQualified')}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
      {reveal ? (
        <View style={st.revealWrap}>
          <Confetti />
          <View style={st.revealCard}>
            <Icon name="trophy" size={40} color={C.crown} />
            <Text style={st.revealTitle}>{T('bt.wonTitle')}</Text>
            <Text style={st.revealSub}>{tfIn(lang, 'bt.wonSub', { name: scored[0].nickname })}</Text>
            <Pressable onPress={() => setReveal(false)} style={st.revealBtn}>
              <Text style={st.revealBtnTxt}>{T('bt.revealClose')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Breakdown({ score, streakDays }: { score: BattleScore; streakDays: number }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  const lang = useLang();
  const base = score.runs.reduce((a, r) => a + r.base, 0);
  const bonus = score.rawPts - base;
  return (
    <View style={st.breakRow}>
      <View style={st.breakPill}>
        <Text style={st.breakLabel}>{T('bt.ptsBase')}</Text>
        <Text style={st.breakVal}>{base}</Text>
      </View>
      <View style={st.breakPill}>
        <Text style={st.breakLabel}>{T('bt.ptsBonus')}</Text>
        <Text style={st.breakVal}>{bonus}</Text>
      </View>
      {score.streakMultiplier > 1 && (
        <View style={[st.breakPill, { backgroundColor: C.accentDim }]}>
          <Icon name="flame" size={12} color={C.accentGrn} />
          <Text style={[st.breakVal, { color: C.accentGrn }]}>
            {tfIn(lang, 'bt.streakBadge', { n: streakDays, m: score.streakMultiplier.toFixed(2) })}
          </Text>
        </View>
      )}
    </View>
  );
}

const makeSt = (C: Tokens) => ({
  root: { flex: 1, backgroundColor: C.bg },
  appBar: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: S.lg, paddingVertical: 10 },
  backBtn: { padding: 2 },
  appTitle: { fontSize: 17, fontWeight: '800' as const, color: C.text },
  mockChipWrap: { paddingHorizontal: S.lg },
  tabRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingHorizontal: S.lg, paddingVertical: 10 },
  tabBtn: { borderRadius: R.pill, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, paddingHorizontal: 14, paddingVertical: 7 },
  tabBtnSel: { backgroundColor: C.accent, borderColor: C.accent },
  tabTxt: { fontSize: 13, fontWeight: '600' as const, color: C.text },
  tabTxtSel: { color: '#0D1A06', fontWeight: '800' as const },
  tabAddBtn: { padding: 2 },
  emptyWrap: { alignItems: 'center' as const, gap: 8, paddingVertical: 56 },
  emptyTitle: { fontSize: 15, fontWeight: '700' as const, color: C.sub },
  emptySub: { fontSize: 13, color: C.faint },
  cardHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  cardName: { fontSize: 15, fontWeight: '700' as const, color: C.text },
  cardSubName: { fontSize: 12, color: C.sub },
  daysLeft: { fontSize: 12, fontWeight: '700' as const, color: C.accentGrn },
  resultBadge: { borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4 },
  resultTxt: { fontSize: 12, fontWeight: '800' as const },
  cardFoot: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginTop: 10 },
  gapTxt: { fontSize: 13, fontWeight: '700' as const, color: C.sub, fontVariant: ['tabular-nums' as const] },
  pendingTxt: { fontSize: 13, color: C.faint, marginTop: 8 },
  scoreLine: { fontSize: 14, fontWeight: '800' as const, color: C.text, marginTop: 8, fontVariant: ['tabular-nums' as const] },
  liveBanner: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 10 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  liveTxt: { fontSize: 13, fontWeight: '800' as const, color: C.accentGrn },
  daysTxt: { fontSize: 13, color: C.sub },
  mockChip: { alignSelf: 'flex-start' as const, backgroundColor: C.surfaceAlt, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4, marginBottom: S.md },
  mockChipTxt: { fontSize: 11, color: C.faint, fontWeight: '600' as const },
  card: { backgroundColor: C.surface, borderRadius: R.xl, borderWidth: 1, borderColor: C.border, padding: S.md, marginBottom: S.md },
  cardLead: { borderColor: C.accent + '66' },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginBottom: 10 },
  rankMedal: { width: 22, height: 22, borderRadius: 11, alignItems: 'center' as const, justifyContent: 'center' as const },
  rankMedalTxt: { fontSize: 12, fontWeight: '800' as const, color: '#0D1A06' },
  name: { flex: 1, fontSize: 15, fontWeight: '700' as const, color: C.text },
  total: { fontSize: 18, fontWeight: '800' as const, color: C.accentGrn, fontVariant: ['tabular-nums' as const] },
  breakRow: { flexDirection: 'row' as const, gap: 6, marginBottom: 10, flexWrap: 'wrap' as const },
  breakPill: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, backgroundColor: C.surfaceAlt, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4 },
  breakLabel: { fontSize: 11, color: C.sub },
  breakVal: { fontSize: 12, fontWeight: '800' as const, color: C.text, fontVariant: ['tabular-nums' as const] },
  runRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 7, paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.border },
  runDist: { fontSize: 13, fontWeight: '700' as const, color: C.text, fontVariant: ['tabular-nums' as const] },
  runPts: { fontSize: 12, fontWeight: '700' as const, color: C.sub },
  demoRow: { flexDirection: 'row' as const, gap: 6, marginBottom: S.md, flexWrap: 'wrap' as const },
  demoChip: { backgroundColor: C.accentDim, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4 },
  demoChipTxt: { fontSize: 11, fontWeight: '700' as const, color: C.accentGrn },
  revealWrap: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center' as const, justifyContent: 'center' as const },
  revealCard: { backgroundColor: C.surface, borderRadius: R.xl, padding: S.xl, alignItems: 'center' as const, gap: 8, width: '78%' as const },
  revealTitle: { fontSize: 22, fontWeight: '800' as const, color: C.text },
  revealSub: { fontSize: 14, color: C.sub, textAlign: 'center' as const },
  revealBtn: { marginTop: 8, backgroundColor: C.accent, borderRadius: R.pill, paddingHorizontal: 22, paddingVertical: 10 },
  revealBtnTxt: { fontSize: 14, fontWeight: '800' as const, color: '#0D1A06' },
});
