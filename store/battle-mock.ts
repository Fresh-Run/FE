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

/** 9/16 가시성 플래그: 배틀은 목-데이터인데 9/5 프로모션으로 프로덕션에
    노출됐다 — 지연 슬라이스-2 엔드포인트 와이어-인 때 true로 플립.
    false = 커뮤니티 배틀 탭 숨김 + 배틀 라우트 inert-리다이렉트.
    목 스토어/화면 코드는 존치 (슬라이스 2/3가 이 위에 빌드). */
export const BATTLE_ENABLED = false;

export type MockFriend = { id: string; nickname: string };

/** 맞팔 친구 목 (spec Q3: v1 대전 범위 = 맞팔만) — slice 2에서
    실제 mutual-follows 소스로 교체. */
export const MOCK_FRIENDS: MockFriend[] = [
  { id: 'mock-f1', nickname: '달림달림' },
  { id: 'mock-f2', nickname: '청라러너' },
  { id: 'mock-f3', nickname: '한강질주' },
  { id: 'mock-f4', nickname: '새벽공기' },
];

/** 배틀 이모지 — 큐레이션 12종 (9/5 오너 룰링). 자유 키보드 입력 없음 =
    모더레이션-프리 보증 (선택지가 곧 화이트리스트). slice 2에서 이 세트가
    서버 계약의 enum 후보로 넘어간다. */
export const BATTLE_EMOJIS = ['⚡', '🔥', '🏃', '💨', '🏆', '🎯', '👟', '💪', '🚀', '🌅', '⛰️', '🐢'] as const;
export const DEFAULT_BATTLE_EMOJI = '⚡';

export type MockBattleStatus = 'pending' | 'active' | 'settled';

export type MockBattle = {
  id: string;
  opponent: MockFriend;
  title: string | null;
  /** 큐레이션 세트의 하나 (BATTLE_EMOJIS) — 디폴트 ⚡ */
  emoji: string;
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
  createBattle: (opponent: MockFriend, durationDays: number, title: string | null, emoji: string) => void;
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
      emoji: '🔥',
      durationDays: 7,
      direction: 'in',
      status: 'pending',
      daysLeft: 0,
      myScore: 0,
      oppScore: 0,
    },
  ],

  canCreate: () => ({ ok: true }),

  createBattle: (opponent, durationDays, title, emoji) => set(s => ({
    battles: [
      ...s.battles,
      {
        id: `mock-b${seq++}`,
        opponent,
        title: title?.trim() ? title.trim() : null,
        emoji,
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
