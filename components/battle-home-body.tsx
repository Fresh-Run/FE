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
 * MOCK ONLY: 리스트는 useBattleMock (서버-셰이프 행, 인메모리, 네트워크 0).
 * 슬라이스 3 (10/10): 8/21 리더보드-데모 조상 삭제 — 카드 탭은 라우트로:
 * active → /battle-detail · 종료(ended·forfeited·cancelled) → /battle-settle ·
 * 받은 초대 → /battle-invite. 탭: 진행 중 / 대기 / 종료 (spec §2.6-1).
 * 전 탭 엠티 스테이트 (dead space 금지, 목 데이터 누수 금지).
 *
 * TODO(slice2): 리스트/생성/수락/포기 실 엔드포인트 · 푸시 착지.
 */
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { useTabBarInset } from '@/components/fresh-tab-bar';
import { Icon } from '@/components/ui';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { tfIn, useLang, useT } from '@/lib/i18n';
import { radius as R, spacing as S, shadows, type Tokens } from '@/lib/theme';
import {
  daysLeftOf, directionOf, isDone, isSettling, myScore, oppScore, outcomeOf, useBattleMock, type MockBattle,
} from '@/store/battle-mock';

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
  const battles = useBattleMock(s => s.battles);

  const active = battles.filter(b => b.status === 'active');
  const pending = battles.filter(b => b.status === 'pending');
  const done = battles.filter(isDone);
  const rows: MockBattle[] = tab === 'active' ? active : tab === 'pending' ? pending : done;

  function openCreate() {
    // 쿼터 슬롯 (spec Q6) — 베타: 항상 ok; slice 2에서 실 게이트 + 안내 UI
    if (!useBattleMock.getState().canCreate().ok) return;
    router.push('/battle-create' as never);
  }
  function openBattle(b: MockBattle) {
    if (b.status === 'pending') {
      if (directionOf(b) === 'in') router.push({ pathname: '/battle-invite', params: { id: b.id } } as never);
      return; // 보낸 초대: 상대 응답 대기 — 열 화면 없음 (카드 자체가 상태)
    }
    if (isDone(b)) router.push({ pathname: '/battle-settle', params: { id: b.id } } as never);
    else router.push({ pathname: '/battle-detail', params: { id: b.id } } as never);
  }

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
        ) : rows.map(b => {
          const me = myScore(b), opp = oppScore(b);
          const outcome = outcomeOf(b);
          return (
            <Pressable key={b.id} onPress={() => openBattle(b)} style={[st.card, shadows.sm]}>
              <View style={st.cardHead}>
                <Avatar name={b.opponent.nickname} size={38} photoUrl={null} />
                <Text style={st.cardEmoji}>{b.emoji}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.cardName} numberOfLines={1}>
                    {b.title ?? tfIn(lang, 'bat.vsName', { name: b.opponent.nickname })}
                  </Text>
                  {b.title ? <Text style={st.cardSubName} numberOfLines={1}>{tfIn(lang, 'bat.vsName', { name: b.opponent.nickname })}</Text> : null}
                </View>
                {b.status === 'active' && (
                  isSettling(b)
                    ? <Text style={[st.daysLeft, { color: C.sun }]}>{T('bd.settling')}</Text>
                    : <Text style={st.daysLeft}>{tfIn(lang, 'bat.daysLeft', { n: daysLeftOf(b) })}</Text>
                )}
                {outcome && (
                  <View style={[st.resultBadge, { backgroundColor: outcome === 'won' ? C.accentDim : C.surfaceAlt }]}>
                    <Text style={[st.resultTxt, { color: outcome === 'won' ? C.accentGrn : C.sub }]}>
                      {T(b.status === 'forfeited' ? 'bd.forfeitBadge' : outcome === 'won' ? 'bat.won' : outcome === 'lost' ? 'bat.lost' : 'bd.drawTitle')}
                    </Text>
                  </View>
                )}
              </View>
              {b.status === 'active' && (
                <View style={st.cardFoot}>
                  <Text style={st.gapTxt}>
                    {me === opp ? T('bat.tied') : me > opp ? tfIn(lang, 'bat.leading', { n: me - opp }) : tfIn(lang, 'bat.trailing', { n: opp - me })}
                  </Text>
                  <View style={{ flex: 1 }} />
                  {/* 데모 전용 — 목 정산 (라이프사이클 워크용; slice 2에서 죽음) */}
                  <Pressable onPress={() => useBattleMock.getState().demoSettle(b.id)} style={st.demoChip} hitSlop={6}>
                    <Text style={st.demoChipTxt}>{T('bat.demoSettle')}</Text>
                  </Pressable>
                </View>
              )}
              {b.status === 'pending' && (
                <Text style={st.pendingTxt}>{T(directionOf(b) === 'out' ? 'bat.waitingReply' : 'bat.inviteFrom')}</Text>
              )}
              {outcome && (
                <Text style={st.scoreLine}>{`${me} : ${opp}`}</Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
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
  cardEmoji: { fontSize: 20 },
  cardName: { fontSize: 15, fontWeight: '700' as const, color: C.text },
  cardSubName: { fontSize: 12, color: C.sub },
  daysLeft: { fontSize: 12, fontWeight: '700' as const, color: C.accentGrn },
  resultBadge: { borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4 },
  resultTxt: { fontSize: 12, fontWeight: '800' as const },
  cardFoot: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginTop: 10 },
  gapTxt: { fontSize: 13, fontWeight: '700' as const, color: C.sub, fontVariant: ['tabular-nums' as const] },
  pendingTxt: { fontSize: 13, color: C.faint, marginTop: 8 },
  scoreLine: { fontSize: 14, fontWeight: '800' as const, color: C.text, marginTop: 8, fontVariant: ['tabular-nums' as const] },
  mockChip: { alignSelf: 'flex-start' as const, backgroundColor: C.surfaceAlt, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4, marginBottom: S.md },
  mockChipTxt: { fontSize: 11, color: C.faint, fontWeight: '600' as const },
  card: { backgroundColor: C.surface, borderRadius: R.xl, borderWidth: 1, borderColor: C.border, padding: S.md, marginBottom: S.md },
  demoChip: { backgroundColor: C.accentDim, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4 },
  demoChipTxt: { fontSize: 11, fontWeight: '700' as const, color: C.accentGrn },
});
