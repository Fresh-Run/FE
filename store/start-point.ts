// Manual start-point override for AI course generation (C1 출발지 변경).
// Written by app/(course)/start-picker.tsx; read by create.tsx, which
// clears it on unmount so a fresh form session starts back on GPS.

import { create } from 'zustand';

export type StartPoint = { lat: number; lng: number; label: string };

type Store = {
  point: StartPoint | null;
  setPoint: (p: StartPoint) => void;
  clear: () => void;
};

export const useStartPoint = create<Store>(set => ({
  point: null,
  setPoint: p => set({ point: p }),
  clear: () => set({ point: null }),
}));
