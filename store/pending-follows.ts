// Pending follow-request cache (owner ruling 2026-07-13) — DEVICE-LOCAL,
// keyed by the signed-in account so test/dual accounts on one device don't
// bleed state. The server's requester-side profile GET carries no pending
// marker (지연 ask: is_requested) — this cache makes 요청됨 survive
// re-entry until her field OBSOLETES the whole store.
//
// Invalidation contract (each proven against the probed server behavior):
//  · 202 on follow POST        → add    (request created)
//  · 409 follow_request_pending → add   (server says pending — adopt)
//  · cancel DELETE             → remove
//  · profile GET is_following  → remove (approve happened elsewhere)
//  · follow POST 200/204       → remove (no pending existed — stale entry)
// Known hole, stated: a REJECT leaves the cache saying 요청됨 (no server
// signal distinguishes rejected from pending) — tapping cancels (idempotent
// 204) and resets to 팔로우; is_requested closes this properly.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { supabase } from '@/lib/supabase';

const keyFor = (uid: string) => `@fr_pending_follows_${uid}`;

type PendingFollowsStore = {
  /** requested-account ids for the CURRENT signed-in user */
  ids: Record<string, true>;
  ownerUid: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  add: (targetId: string) => void;
  remove: (targetId: string) => void;
};

function persist(ownerUid: string | null, ids: Record<string, true>) {
  if (!ownerUid) return;
  AsyncStorage.setItem(keyFor(ownerUid), JSON.stringify(Object.keys(ids))).catch(() => {});
}

export const usePendingFollows = create<PendingFollowsStore>((set, get) => ({
  ids: {},
  ownerUid: null,
  hydrated: false,
  hydrate: async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { set({ hydrated: true }); return; }
      if (get().ownerUid === user.id && get().hydrated) return;
      const raw = await AsyncStorage.getItem(keyFor(user.id));
      const list: string[] = raw ? JSON.parse(raw) : [];
      set({ ownerUid: user.id, ids: Object.fromEntries(list.map(id => [id, true])), hydrated: true });
    } catch {
      set({ hydrated: true }); // cache is garnish — the 409 fallback still corrects
    }
  },
  add: (targetId: string) => {
    const { ids, ownerUid } = get();
    if (ids[targetId]) return;
    const next = { ...ids, [targetId]: true as const };
    set({ ids: next });
    persist(ownerUid, next);
  },
  remove: (targetId: string) => {
    const { ids, ownerUid } = get();
    if (!ids[targetId]) return;
    const next = { ...ids };
    delete next[targetId];
    set({ ids: next });
    persist(ownerUid, next);
  },
}));
