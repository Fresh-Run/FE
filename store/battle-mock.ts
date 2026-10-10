/**
 * 배틀 목 스토어 — SLICE-1 STAND-IN → SLICE-3 (2026-10-10): SERVER-SHAPED.
 * MOCK ONLY: in-memory zustand, no persistence, no storage, ZERO network —
 * slice 2 replaces every action with real POST/GET calls and the row type
 * below is `BattleResponse` (docs/API_GUIDE.md §배틀 · schemas.py:2080)
 * field-for-field, so the wire-in is a DATA SWAP, not a reshape:
 *
 *   server BattleResponse            →  MockBattle
 *   id · created_by · opponent(id)   →  id · created_by · opponent.id (+ nickname = client profile join)
 *   title · emoji · format · metric  →  same
 *   duration_days · status           →  same — status = SERVER enum
 *                                       pending|active|ended|cancelled|forfeited
 *   started_at · ends_at · settled_at · winner · created_at → same (ISO)
 *   invite_expires_at (pending)      →  same
 *   scores[] BattleParticipantScore  →  same {user_id, score, streak_multiplier, breakdown}
 *   runs[]   BattleRunItem           →  same {run_id, user_id, counted, run_score,
 *                                            breakdown{base,completion,pace,early_bird,milestone},
 *                                            attributed_at}
 *
 * NOT on the server (derived client-side, never sent): `direction`
 * (created_by === ME), daysLeft (ends_at − now), the DAILY breakdown (group
 * runs by attributed_at's KST date — the server has no daily field; the
 * design doc's Q4 makes attributed_at = ran_at the one time source), and
 * the UI-only "정산 중" (active + ends_at passed + settled_at null — the
 * design doc says settling is a TIMESTAMP, not a status).
 *
 * "SETTLED" in app wording = server `ended` (+ settled_at). Lifecycle:
 * pending → active → ended · cancelled (decline/expire/mutual) · forfeited.
 */
import { create } from 'zustand';

/** 9/16 가시성 플래그: 배틀은 목-데이터인데 9/5 프로모션으로 프로덕션에
    노출됐다 — 지연 슬라이스-2 엔드포인트 와이어-인 때 true로 플립.
    false = 커뮤니티 배틀 탭 숨김 + 배틀 라우트 inert-리다이렉트.
    목 스토어/화면 코드는 존치 (슬라이스 2/3가 이 위에 빌드). */
export const BATTLE_ENABLED = false;

export type MockFriend = { id: string; nickname: string };

/** 나 — 서버에선 세션 user_id. 목에선 고정 id (created_by/winner/scores/
    runs의 user_id 비교 기준). 닉네임은 T('bat.me')로 렌더. */
export const MOCK_ME_ID = 'me';

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

/** = server status enum (API_GUIDE §배틀). */
export type BattleStatus = 'pending' | 'active' | 'ended' | 'cancelled' | 'forfeited';

/** = BattleRunItem.breakdown (schemas.py: dict — keys per API_GUIDE 점수식). */
export type BattleRunBreakdown = {
  base: number;
  completion: number;
  pace: number;
  early_bird: number;
  milestone: number;
};

/** = BattleRunItem. Client-only extras for rendering: distance_km (the
    detail row shows km; slice 2 joins it from the run or asks 지연 to add
    it to BattleRunItem — flagged in the mapping table). */
export type BattleRunRow = {
  run_id: string;
  user_id: string;
  counted: boolean;
  run_score: number;
  breakdown: BattleRunBreakdown | null;
  attributed_at: string; // ISO (= runs.ran_at, Q4=①)
  distance_km: number;   // CLIENT-ONLY (not in BattleRunItem)
};

/** = BattleParticipantScore. */
export type BattleParticipantScore = {
  user_id: string;
  score: number;
  streak_multiplier: number;
  breakdown: Record<string, number> | null;
};

export type MockBattle = {
  id: string;
  created_by: string;
  /** server: opponent user_id — client joins the nickname (profile) */
  opponent: MockFriend;
  title: string | null;
  emoji: string;
  format: 'points' | 'pure';
  metric: 'distance_km';
  duration_days: number;
  status: BattleStatus;
  started_at: string | null;
  ends_at: string | null;
  settled_at: string | null;
  winner: string | null;
  created_at: string;
  invite_expires_at: string | null;
  scores: BattleParticipantScore[];
  runs: BattleRunRow[];
};

// ── derived views (client-side, never sent) ─────────────────────────────────
/** out = 내가 보낸 초대 · in = 받은 초대 */
export const directionOf = (b: MockBattle): 'out' | 'in' => (b.created_by === MOCK_ME_ID ? 'out' : 'in');
export const scoreOf = (b: MockBattle, userId: string): number =>
  b.scores.find(s => s.user_id === userId)?.score ?? 0;
export const myScore = (b: MockBattle) => scoreOf(b, MOCK_ME_ID);
export const oppScore = (b: MockBattle) => scoreOf(b, b.opponent.id);
/** 남은 일수 (ceil) — active 전용; 종료 시 0 */
export function daysLeftOf(b: MockBattle, now = Date.now()): number {
  if (!b.ends_at) return 0;
  return Math.max(0, Math.ceil((new Date(b.ends_at).getTime() - now) / 86_400_000));
}
/** UI-only 정산 중: active인데 ends_at 지남 + settled_at 없음 (설계 §정산). */
export const isSettling = (b: MockBattle, now = Date.now()) =>
  b.status === 'active' && !!b.ends_at && new Date(b.ends_at).getTime() <= now && !b.settled_at;
/** 종료 탭 소속 (ended·forfeited·cancelled) */
export const isDone = (b: MockBattle) => b.status === 'ended' || b.status === 'forfeited' || b.status === 'cancelled';
/** 내 결과: won / lost / draw / null(미종료) */
export function outcomeOf(b: MockBattle): 'won' | 'lost' | 'draw' | null {
  if (!isDone(b)) return null;
  if (b.winner === MOCK_ME_ID) return 'won';
  if (b.winner === b.opponent.id) return 'lost';
  return 'draw';
}

/** KST 날짜 키 (YYYY-MM-DD) — 일별 그룹핑의 유일 시간원 (Q4=① ran_at). */
export function kstDateKey(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3_600_000);
  return d.toISOString().slice(0, 10);
}
export type DailyRow = {
  dateKey: string;
  dayIndex: number; // 1-based from started_at (KST)
  me: { runs: number; pts: number };
  opp: { runs: number; pts: number };
};
/** 일별 분해 — runs를 attributed_at KST 날짜로 그룹 (서버 필드 아님, 파생). */
export function dailyBreakdown(b: MockBattle): DailyRow[] {
  if (!b.started_at) return [];
  const startKey = kstDateKey(b.started_at);
  const startMs = Date.parse(startKey + 'T00:00:00+09:00');
  const map = new Map<string, DailyRow>();
  for (const r of b.runs) {
    const key = kstDateKey(r.attributed_at);
    const dayMs = Date.parse(key + 'T00:00:00+09:00');
    const dayIndex = Math.floor((dayMs - startMs) / 86_400_000) + 1;
    if (dayIndex < 1 || dayIndex > b.duration_days) continue; // 창 밖 (서버는 귀속 안 함)
    const row = map.get(key) ?? { dateKey: key, dayIndex, me: { runs: 0, pts: 0 }, opp: { runs: 0, pts: 0 } };
    const side = r.user_id === MOCK_ME_ID ? row.me : row.opp;
    if (r.counted) { side.runs += 1; side.pts += r.run_score; }
    map.set(key, row);
  }
  return [...map.values()].sort((a, b2) => a.dayIndex - b2.dayIndex);
}
/** 페이스 보너스 합 + 수혜 런 수 (정산 화면 항목화). */
export function paceBonusOf(b: MockBattle, userId: string): { pts: number; runs: number } {
  let pts = 0, runs = 0;
  for (const r of b.runs) {
    if (r.user_id !== userId || !r.counted) continue;
    const p = r.breakdown?.pace ?? 0;
    if (p > 0) { pts += p; runs += 1; }
  }
  return { pts, runs };
}

type BattleMockStore = {
  battles: MockBattle[];
  /** 베타 = 전원 무제한 (spec Q6 확정). SLOT: 무료 30일-롤링 3회 체크가
      여기 들어온다 (지연 쿼터 필드, slice 2) — 시그니처는 그대로, 구현만
      교체되도록 create 진입이 이 함수를 이미 경유한다. */
  canCreate: () => { ok: boolean };
  createBattle: (opponent: MockFriend, durationDays: number, title: string | null, emoji: string) => void;
  acceptInvite: (id: string) => void;
  declineInvite: (id: string) => void;
  /** POST /battles/{id}/forfeit 미러 — 즉시 패배: status=forfeited · winner=상대 · 점수 유지 */
  forfeit: (id: string) => void;
  /** 데모 전용 — 진행 중 배틀을 즉시 정산 (ended + settled_at + winner by score). slice 2에서 죽는다. */
  demoSettle: (id: string) => void;
};

let seq = 1;

// ── seed helpers ──────────────────────────────────────────────────────────────
const DAY = 86_400_000;
const kstMidnight = (daysFromToday: number) => {
  const nowKst = new Date(Date.now() + 9 * 3_600_000);
  const key = nowKst.toISOString().slice(0, 10);
  return new Date(Date.parse(key + 'T00:00:00+09:00') + daysFromToday * DAY).toISOString();
};
const at = (dayIso: string, hourKst: number, min = 0) =>
  new Date(Date.parse(dayIso) + hourKst * 3_600_000 + min * 60_000).toISOString();
/** API_GUIDE 점수식 미러 — 목 행의 breakdown은 lib/battle-score와 같은 상수. */
function runRow(id: string, user: string, dayIso: string, hourKst: number, km: number, opts: { pace?: boolean; milestone?: number } = {}): BattleRunRow {
  const counted = km >= 1.5;
  const base = counted ? Math.round(km * 10) : 0;
  const completion = counted ? 20 : 0;
  const pace = counted && opts.pace ? Math.round(km * 5) : 0;
  const early_bird = counted && hourKst < 7 ? 10 : 0;
  const milestone = counted ? (opts.milestone ?? 0) : 0;
  return {
    run_id: id, user_id: user, counted,
    run_score: base + completion + pace + early_bird + milestone,
    breakdown: { base, completion, pace, early_bird, milestone },
    attributed_at: at(dayIso, hourKst), distance_km: km,
  };
}
function scoresFor(runs: BattleRunRow[], me: number, opp: string, oppMult: number, meMult: number): BattleParticipantScore[] {
  const sum = (u: string) => runs.filter(r => r.user_id === u && r.counted).reduce((a, r) => a + r.run_score, 0);
  return [
    { user_id: MOCK_ME_ID, score: Math.round(sum(MOCK_ME_ID) * meMult) + me, streak_multiplier: meMult, breakdown: null },
    { user_id: opp, score: Math.round(sum(opp) * oppMult), streak_multiplier: oppMult, breakdown: null },
  ];
}

// Seeds — every demo-walkable state: 받은 초대 · 진행 중 · 종료-승 · 종료-패 · 포기.
const S_ACTIVE_START = kstMidnight(-3); // D1 = 3 days ago → mid-battle
const activeRuns: BattleRunRow[] = [
  runRow('a-m1', MOCK_ME_ID, kstMidnight(-3), 6, 3.2, { pace: true }),
  runRow('a-o1', 'mock-f1', kstMidnight(-3), 19, 5.4, { milestone: 30 }),
  runRow('a-m2', MOCK_ME_ID, kstMidnight(-2), 20, 1.2),                  // <1.5km — 미집계
  runRow('a-o2', 'mock-f1', kstMidnight(-2), 7, 2.0),
  runRow('a-m3', MOCK_ME_ID, kstMidnight(-1), 8, 10.4, { pace: true, milestone: 80 }),
];
const S_WON_START = kstMidnight(-10);
const wonRuns: BattleRunRow[] = [
  runRow('w-m1', MOCK_ME_ID, kstMidnight(-10), 6, 5.0, { pace: true, milestone: 30 }),
  runRow('w-o1', 'mock-f3', kstMidnight(-10), 18, 3.0),
  runRow('w-m2', MOCK_ME_ID, kstMidnight(-9), 6, 4.2, { pace: true }),
  runRow('w-o2', 'mock-f3', kstMidnight(-8), 21, 6.1, { milestone: 30 }),
  runRow('w-m3', MOCK_ME_ID, kstMidnight(-8), 7, 3.8),
];
const S_LOST_START = kstMidnight(-20);
const lostRuns: BattleRunRow[] = [
  runRow('l-o1', 'mock-f4', kstMidnight(-20), 5, 6.0, { pace: true, milestone: 30 }),
  runRow('l-m1', MOCK_ME_ID, kstMidnight(-19), 19, 2.5),
  runRow('l-o2', 'mock-f4', kstMidnight(-18), 6, 10.2, { pace: true, milestone: 50 }),
  runRow('l-o3', 'mock-f4', kstMidnight(-17), 6, 4.0, { pace: true }),
];
const S_FORFEIT_START = kstMidnight(-6);
const forfeitRuns: BattleRunRow[] = [
  runRow('f-o1', 'mock-f2', kstMidnight(-6), 20, 4.4),
  runRow('f-m1', MOCK_ME_ID, kstMidnight(-5), 8, 2.1),
];

export const useBattleMock = create<BattleMockStore>((set) => ({
  battles: [
    // 받은 초대 — 초대 화면의 데모 대상 (슬라이스 1 시드 유지)
    {
      id: 'mock-b0', created_by: 'mock-f2', opponent: MOCK_FRIENDS[1], title: '청라 대전', emoji: '🔥',
      format: 'points', metric: 'distance_km', duration_days: 7, status: 'pending',
      started_at: null, ends_at: null, settled_at: null, winner: null,
      created_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
      invite_expires_at: new Date(Date.now() + 45 * 3_600_000).toISOString(),
      scores: [], runs: [],
    },
    // 진행 중 (D4/7) — 내가 앞서는 중
    {
      id: 'mock-b1', created_by: MOCK_ME_ID, opponent: MOCK_FRIENDS[0], title: '한강 7일 챌린지', emoji: '⚡',
      format: 'points', metric: 'distance_km', duration_days: 7, status: 'active',
      started_at: S_ACTIVE_START, ends_at: kstMidnight(4), settled_at: null, winner: null,
      created_at: kstMidnight(-4), invite_expires_at: null,
      scores: scoresFor(activeRuns, 0, 'mock-f1', 1.05, 1.1), runs: activeRuns,
    },
    // 종료 — 승
    {
      id: 'mock-b2', created_by: 'mock-f3', opponent: MOCK_FRIENDS[2], title: null, emoji: '🏆',
      format: 'points', metric: 'distance_km', duration_days: 3, status: 'ended',
      started_at: S_WON_START, ends_at: kstMidnight(-7), settled_at: at(kstMidnight(-7), 0, 30), winner: MOCK_ME_ID,
      created_at: kstMidnight(-11), invite_expires_at: null,
      scores: scoresFor(wonRuns, 0, 'mock-f3', 1.0, 1.15), runs: wonRuns,
    },
    // 종료 — 패
    {
      id: 'mock-b3', created_by: MOCK_ME_ID, opponent: MOCK_FRIENDS[3], title: '새벽 러닝 대결', emoji: '🌅',
      format: 'points', metric: 'distance_km', duration_days: 5, status: 'ended',
      started_at: S_LOST_START, ends_at: kstMidnight(-15), settled_at: at(kstMidnight(-15), 0, 30), winner: 'mock-f4',
      created_at: kstMidnight(-21), invite_expires_at: null,
      scores: scoresFor(lostRuns, 0, 'mock-f4', 1.15, 1.0), runs: lostRuns,
    },
    // 포기 — 내가 포기 (즉시 패배, 상대 점수 유지)
    {
      id: 'mock-b4', created_by: MOCK_ME_ID, opponent: MOCK_FRIENDS[1], title: null, emoji: '🐢',
      format: 'points', metric: 'distance_km', duration_days: 7, status: 'forfeited',
      started_at: S_FORFEIT_START, ends_at: kstMidnight(1), settled_at: at(kstMidnight(-4), 14, 12), winner: 'mock-f2',
      created_at: kstMidnight(-7), invite_expires_at: null,
      scores: scoresFor(forfeitRuns, 0, 'mock-f2', 1.0, 1.0), runs: forfeitRuns,
    },
  ],

  canCreate: () => ({ ok: true }),

  createBattle: (opponent, durationDays, title, emoji) => set(s => ({
    battles: [
      ...s.battles,
      {
        id: `mock-b${100 + seq++}`, created_by: MOCK_ME_ID, opponent,
        title: title?.trim() ? title.trim() : null, emoji,
        format: 'points' as const, metric: 'distance_km' as const, duration_days: durationDays,
        status: 'pending' as const, started_at: null, ends_at: null, settled_at: null, winner: null,
        created_at: new Date().toISOString(),
        invite_expires_at: new Date(Date.now() + 48 * 3_600_000).toISOString(),
        scores: [], runs: [],
      },
    ],
  })),

  // accept 미러: started_at=now · ends_at = KST 자정 + duration (설계 §기간)
  acceptInvite: (id) => set(s => ({
    battles: s.battles.map(b =>
      b.id === id
        ? { ...b, status: 'active' as const, started_at: new Date().toISOString(), ends_at: kstMidnight(1 + b.duration_days - 1), invite_expires_at: null,
            scores: [{ user_id: MOCK_ME_ID, score: 0, streak_multiplier: 1, breakdown: null }, { user_id: b.opponent.id, score: 0, streak_multiplier: 1, breakdown: null }] }
        : b),
  })),

  // decline 미러: 서버 cancelled — FE 리스트는 거절 초대를 보이지 않는다 (spec 2.2)
  declineInvite: (id) => set(s => ({
    battles: s.battles.filter(b => b.id !== id),
  })),

  forfeit: (id) => set(s => ({
    battles: s.battles.map(b =>
      b.id === id && b.status === 'active'
        ? { ...b, status: 'forfeited' as const, winner: b.opponent.id, settled_at: new Date().toISOString() }
        : b),
  })),

  demoSettle: (id) => set(s => ({
    battles: s.battles.map(b => {
      if (b.id !== id || b.status !== 'active') return b;
      const me = myScore(b), opp = oppScore(b);
      return { ...b, status: 'ended' as const, settled_at: new Date().toISOString(), winner: me === opp ? null : me > opp ? MOCK_ME_ID : b.opponent.id };
    }),
  })),
}));
