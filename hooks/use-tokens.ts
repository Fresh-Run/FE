// Dark-mode epic delivery mechanism (Phase 1, Option A — owner-approved):
// hook + style-factory.
//
// Conversion recipe (one file = one unit of phase-3 batch work):
//   1. drop `colors as C` from the '@/lib/theme' import
//   2. `const C = useTokens();` in every component that uses C inline
//   3. module-scope `const st = StyleSheet.create({…})` becomes
//      `const makeSt = (C: Tokens) => StyleSheet.create({…})` and components
//      call `const st = useStyles(makeSt);`
// A converted file must take EVERY color through these — a leftover static
// import renders stale-light inside a dark screen.
import { StyleSheet } from 'react-native';

import { colors, darkColors, type Tokens } from '@/lib/theme';
import { useScheme, type Resolved } from '@/store/use-scheme';

export function useTokens(): Tokens {
  const resolved = useScheme(s => s.resolved);
  return resolved === 'dark' ? darkColors : colors;
}

// Per-factory 2-slot cache: StyleSheet.create runs at most twice per factory
// per session (light/dark). The write-once idempotent fill during render is
// deliberate lazy-init (same value for the same inputs — Compiler-safe).
type Factory = (C: Tokens) => ReturnType<typeof StyleSheet.create>;
const styleCache = new WeakMap<Factory, Partial<Record<Resolved, unknown>>>();

export function useStyles<T>(factory: (C: Tokens) => T): T {
  const resolved = useScheme(s => s.resolved);
  let slots = styleCache.get(factory as unknown as Factory);
  if (!slots) {
    slots = {};
    styleCache.set(factory as unknown as Factory, slots);
  }
  if (slots[resolved] === undefined) {
    slots[resolved] = factory(resolved === 'dark' ? darkColors : colors);
  }
  return slots[resolved] as T;
}
