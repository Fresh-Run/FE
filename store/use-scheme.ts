// Dark-mode scheme store — Phase 5 (the picker): the epic's END-STATE.
//
// mode = 시스템/라이트/다크 (pre-ruled three-way, default 시스템). DEVICE-LOCAL
// (AsyncStorage): appearance-follow is a per-device preference, like iOS
// itself. Explicit picks additionally PATCH /me/settings {theme} (the server
// enum is Literal["light","dark"] — 'system' would 422; enum extension is a
// ledgered 지연 nicety ask, cross-device sync rides it if ever wanted).
//
// resolved = the single scheme output every consumer derives from
// (useTokens/useStyles, nav chrome, status bar, route stroke). 시스템 mode
// follows the OS live via the Appearance listener. The Phase-0/1 light pin
// and the temporary 5-tap dev override DIED here — resolution is REAL now.
//
// Cold start: first frames resolve as 시스템 until the ~ms AsyncStorage
// hydrate lands (explicit-mode users on an opposite-scheme device may see a
// brief system-scheme flash — standard RN pattern, disclosed).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { create } from 'zustand';

export type Mode = 'system' | 'light' | 'dark';
export type Resolved = 'light' | 'dark';

const KEY = '@fr_theme_mode';

const resolve = (mode: Mode): Resolved =>
  mode === 'system'
    ? (Appearance.getColorScheme() === 'dark' ? 'dark' : 'light')
    : mode;

type SchemeStore = {
  mode: Mode;
  resolved: Resolved;
  /** Apply + persist (device-local). Explicit server sync is the caller's
      job (theme.tsx PATCHes light/dark; 시스템 is local-only). */
  setMode: (m: Mode) => void;
};

export const useScheme = create<SchemeStore>(set => ({
  mode: 'system',
  resolved: resolve('system'),
  setMode: (m: Mode) => {
    set({ mode: m, resolved: resolve(m) });
    AsyncStorage.setItem(KEY, m).catch(() => {});
  },
}));

// Hydrate the persisted mode (no re-persist round-trip).
AsyncStorage.getItem(KEY)
  .then(v => {
    if (v === 'light' || v === 'dark' || v === 'system') {
      useScheme.setState({ mode: v, resolved: resolve(v) });
    }
  })
  .catch(() => {});

// 시스템 mode follows the OS live.
Appearance.addChangeListener(({ colorScheme }) => {
  if (useScheme.getState().mode === 'system') {
    useScheme.setState({ resolved: colorScheme === 'dark' ? 'dark' : 'light' });
  }
});
