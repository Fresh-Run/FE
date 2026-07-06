// Shared join-request state for approval crews — the single source the browse
// badges read, written by every screen that learns something authoritative:
//   - browse join → 202 / 409-already_requested → pending: true (optimistic)
//   - crew-detail's join-requests/me fetch → true/false (authoritative;
//     opening a detail screen corrects a stale browse badge)
//   - cancel / approval / membership → false (via the detail refetch)
//
// Stage B (blocked on backend `GET /me/join-requests`): hydrate() once per
// browse load so badges are truthful across sessions, not only after a
// detail-screen visit.

import { create } from 'zustand';

type JoinRequestState = {
  pendingByCrewId: Record<string, boolean>;
  setPending: (crewId: string, pending: boolean) => void;
  hydrate: (pendingCrewIds: string[]) => void;
};

export const useJoinRequests = create<JoinRequestState>(set => ({
  pendingByCrewId: {},
  setPending: (crewId, pending) =>
    set(s => ({ pendingByCrewId: { ...s.pendingByCrewId, [crewId]: pending } })),
  hydrate: (pendingCrewIds) =>
    set({ pendingByCrewId: Object.fromEntries(pendingCrewIds.map(id => [id, true])) }),
}));
