/**
 * 배틀 목 스토어 — SLICE-1 STAND-IN, 지연 엔드포인트 부재 (spec §4-2).
 * MOCK ONLY: in-memory zustand, no persistence, no storage, ZERO network —
 * the slice-2 wiring replaces every action here with real POST/GET calls
 * (schema-gap rule: no battle endpoint exists to call yet).
 *
 * Lifecycle modeled (spec §2.2): pending (invite out/in) → active (accept;
 * clock = accept + next-KST-midnight alignment — mocked as whole daysLeft)
 * → settled. Decline/expire = row removed (list-wise "gone"; the server
 * keeps history, the FE list does not show declined invites — spec 2.2).
 */
import { create } from 'zustand';

export type MockFriend = { id: string; nickname: string };

/** 맞팔 친구 목 (spec Q3: v1 대전 범위 = 맞팔만) — slice 2에서
    실제 mutual-follows 소스로 교체. */
export const MOCK_FRIENDS: MockFriend[] = [
  { id: 'mock-f1', nickname: '달림달림' },
  { id: 'mock-f2', nickname: '청라러너' },
  { id: 'mock-f3', nickname: '한강질주' },
  { id: 'mock-f4', nickname: '새벽공기' },
];

export type MockBattleStatus = 'pending' | 'active' | 'settled';

export type MockBattle = {
  id: string;
  opponent: MockFriend;
  title: string | null;
  durationDays: number;
  /** out = 내가 보낸 초대 · in = 받은 초대 (수락/거절 대상) */
  direction: 'out' | 'in';
  status: MockBattleStatus;
  /** active만 의미 — 목 값 (실제는 서버 ends_at, KST) */
  daysLeft: number;
  myScore: number;
  oppScore: number;
  /** settled만 */
  won?: boolean;
};

type BattleMockStore = {
  battles: MockBattle[];
  /** 베타 = 전원 무제한 (spec Q6 확정). SLOT: 무료 30일-롤링 3회 체크가
      여기 들어온다 (지연 쿼터 필드, slice 2) — 시그니처는 그대로, 구현만
      교체되도록 create 진입이 이 함수를 이미 경유한다. */
  canCreate: () => { ok: boolean };
  createBattle: (opponent: MockFriend, durationDays: number, title: string | null) => void;
  acceptInvite: (id: string) => void;
  declineInvite: (id: string) => void;
  /** 데모 전용 — 진행 중 배틀을 즉시 정산 (목 최종 점수). slice 2에서 죽는다. */
  demoSettle: (id: string) => void;
};

let seq = 1;

export const useBattleMock = create<BattleMockStore>((set) => ({
  // Seed: ONE received invite — the invite screen's demo subject. 진행/종료
  // start EMPTY so every tab's empty state is real (no fake data leaking).
  battles: [
    {
      id: 'mock-b0',
      opponent: MOCK_FRIENDS[1],
      title: '청라 대전',
      durationDays: 7,
      direction: 'in',
      status: 'pending',
      daysLeft: 0,
      myScore: 0,
      oppScore: 0,
    },
  ],

  canCreate: () => ({ ok: true }),

  createBattle: (opponent, durationDays, title) => set(s => ({
    battles: [
      ...s.battles,
      {
        id: `mock-b${seq++}`,
        opponent,
        title: title?.trim() ? title.trim() : null,
        durationDays,
        direction: 'out' as const,
        status: 'pending' as const,
        daysLeft: 0,
        myScore: 0,
        oppScore: 0,
      },
    ],
  })),

  acceptInvite: (id) => set(s => ({
    battles: s.battles.map(b =>
      b.id === id ? { ...b, status: 'active' as const, daysLeft: b.durationDays, myScore: 0, oppScore: 0 } : b),
  })),

  declineInvite: (id) => set(s => ({
    battles: s.battles.filter(b => b.id !== id),
  })),

  demoSettle: (id) => set(s => ({
    battles: s.battles.map(b =>
      b.id === id
        ? { ...b, status: 'settled' as const, daysLeft: 0, myScore: 340, oppScore: 285, won: true }
        : b),
  })),
}));
