// Manual END-point for one-way AI course generation (일방통행 도착지 —
// v2.3 unlock, 2026-07-20). Written by start-picker in target=end mode;
// read by create.tsx, which clears it on unmount alongside the start point
// so a fresh form session starts back on loop mode with no stale 도착지.
import { create } from 'zustand';

import type { StartPoint } from '@/store/start-point';

type Store = {
  point: StartPoint | null;
  setPoint: (p: StartPoint) => void;
  clear: () => void;
};

export const useEndPoint = create<Store>(set => ({
  point: null,
  setPoint: p => set({ point: p }),
  clear: () => set({ point: null }),
}));
