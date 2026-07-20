// Dark-mode epic scheme INPUT (Phase 1, Option A — owner-approved).
//
// USER-FACING RESOLUTION IS PINNED LIGHT until phases 3–4 are whole:
// converted screens must not dark-follow while unconverted files are still
// static-light — that would re-create the half-dark state Phase 0 killed.
//
// ⚠ TEMPORARY FIXTURE — the hidden dev override (설정's version row, 5 taps)
// is the ONLY dark path and DIES WITH PHASE 5's real picker (시스템/라이트/
// 다크 three-way, default 시스템 — pre-ruled). Phase 5 replaces `devOverride`
// with `mode` + an Appearance change listener feeding `resolved`; nothing
// else should ever read the OS scheme directly (real-map's routeStroke is
// the one grandfathered exception until its batch converts).
import { create } from 'zustand';

export type Resolved = 'light' | 'dark';

type SchemeStore = {
  /** Hidden internal override — null = the pinned default (light). */
  devOverride: Resolved | null;
  /** The single scheme output every token consumer derives from. */
  resolved: Resolved;
  /** 5-tap cycle: off(light) → dark preview → light preview → off. */
  cycleDevOverride: () => void;
};

export const useScheme = create<SchemeStore>((set, get) => ({
  devOverride: null,
  resolved: 'light',
  cycleDevOverride: () => {
    const cur = get().devOverride;
    const next: Resolved | null = cur === null ? 'dark' : cur === 'dark' ? 'light' : null;
    set({ devOverride: next, resolved: next ?? 'light' });
  },
}));
