// 배틀 스토어 — redesign item 8b (2026-11-21): the SERVER-backed replacement
// for the 2026-08/09 mock store (deleted). Rows are BattleResponse verbatim;
// opponent nickname/avatar are joined from GET /users/{id}/profile and cached
// here. Every mutation calls the endpoint, then refreshes the list (server
// truth, no optimistic shape-guessing).
import { create } from 'zustand';

import { apiFetch } from '@/lib/api';
import {
  acceptBattle, cancelBattle, createBattle, declineBattle, forfeitBattle, getBattle, listBattles, type Battle,
} from '@/lib/battles-api';
import { errorMessage } from '@/lib/error-copy';

export type BattleProfile = { user_id: string; nickname: string; avatar_url: string | null };

type BattlesStore = {
  battles: Battle[];
  profiles: Record<string, BattleProfile>;
  loaded: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** GET /battles/{id} → merges scores/runs into the row (and adds it if unseen). */
  loadDetail: (id: string) => Promise<Battle | null>;
  ensureProfiles: (uids: string[]) => Promise<void>;
  create: (opponentId: string, durationDays: number, title: string, emoji: string) => Promise<Battle>;
  accept: (id: string) => Promise<void>;
  decline: (id: string) => Promise<void>;
  forfeit: (id: string) => Promise<void>;
  cancel: (id: string) => Promise<void>;
};

export const useBattles = create<BattlesStore>((set, get) => ({
  battles: [],
  profiles: {},
  loaded: false,
  error: null,

  refresh: async () => {
    try {
      const rows = await listBattles();
      // keep already-loaded detail (scores/runs) on rows the list re-serves thin
      const prev = new Map(get().battles.map(b => [b.id, b]));
      const merged = rows.map(r => ({ ...prev.get(r.id), ...r, scores: r.scores ?? prev.get(r.id)?.scores, runs: r.runs ?? prev.get(r.id)?.runs }));
      set({ battles: merged, loaded: true, error: null });
      void get().ensureProfiles(rows.flatMap(b => [b.created_by, b.opponent]));
    } catch (e: unknown) {
      set(s => ({ error: errorMessage(e), loaded: s.loaded }));
    }
  },

  loadDetail: async (id) => {
    try {
      const d = await getBattle(id);
      set(s => ({ battles: s.battles.some(b => b.id === id) ? s.battles.map(b => (b.id === id ? { ...b, ...d } : b)) : [d, ...s.battles] }));
      void get().ensureProfiles([d.created_by, d.opponent]);
      return d;
    } catch {
      return null;
    }
  },

  ensureProfiles: async (uids) => {
    const missing = [...new Set(uids)].filter(u => u && !get().profiles[u]);
    if (missing.length === 0) return;
    const got = await Promise.all(missing.map(uid =>
      apiFetch<BattleProfile>(`/api/users/${uid}/profile`)
        .then(p => ({ user_id: uid, nickname: p.nickname, avatar_url: p.avatar_url }))
        .catch(() => null)));
    const add: Record<string, BattleProfile> = {};
    for (const p of got) if (p) add[p.user_id] = p;
    if (Object.keys(add).length) set(s => ({ profiles: { ...s.profiles, ...add } }));
  },

  create: async (opponentId, durationDays, title, emoji) => {
    const b = await createBattle({ opponent_id: opponentId, title, emoji, duration_days: durationDays });
    await get().refresh();
    return b;
  },
  accept: async (id) => { await acceptBattle(id); await get().refresh(); },
  decline: async (id) => { await declineBattle(id); await get().refresh(); },
  forfeit: async (id) => { await forfeitBattle(id); await get().refresh(); await get().loadDetail(id); },
  cancel: async (id) => { await cancelBattle(id); await get().refresh(); await get().loadDetail(id); },
}));
