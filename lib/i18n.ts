/**
 * i18n core (slice 1, ruling (b) 2026-07-27) — ZERO-DEP typed dictionary.
 *
 * Library decision (checkpoint-stated): neither i18n-js nor react-i18next.
 *  - react-i18next: context/suspense/namespace machinery built for web-scale
 *    lazy loading — two deps for a 2-locale, ~400-string core loop.
 *  - i18n-js (+ expo-localization): the Expo-docs pairing, but expo-localization
 *    is a NATIVE module — adding it mid-gate means a binary + runtime split;
 *    and i18n-js's missing-key story is a runtime fallback, not a compile error.
 *  - This module: typed records (en completeness = tsc-enforced), the house
 *    zero-dep convention (wheel-sheet/month-picker class), and the locale
 *    already lives in a store we own. If ICU-grade plurals are ever needed,
 *    i18n-js can slot in UNDER this same t() surface.
 *
 * Locale source of truth = settings.lang (SERVER-persisted — the 언어 row's
 * writer since its build; her generation templates follow the same field).
 * Reactivity: useT() subscribes to the settings store — converted screens
 * re-render on a language flip; bare t() serves imperative code (alerts,
 * formatters) reading the store synchronously.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback } from 'react';
import { NativeModules, Platform } from 'react-native';

import { en } from '@/lib/strings/en';
import { ko } from '@/lib/strings/ko';
import { useSettings } from '@/store/use-settings';

export type StringKey = keyof typeof ko;
const DICTS: Record<'ko' | 'en', Record<StringKey, string>> = { ko, en };

export function getLang(): 'ko' | 'en' {
  return useSettings.getState().settings.lang === 'en' ? 'en' : 'ko';
}

/** Imperative lookup (alerts, formatters, module-level composition). */
export function t(key: StringKey): string {
  return DICTS[getLang()][key] ?? ko[key];
}

/** Reactive lookup — subscribes to the language; flips re-render the screen. */
export function useT(): (key: StringKey) => string {
  const lang = useSettings(s => s.settings.lang) === 'en' ? 'en' : 'ko';
  return useCallback((key: StringKey) => DICTS[lang][key] ?? ko[key], [lang]);
}

/** Reactive language VALUE — pass it into locale-branching formatters called
    in render bodies. The React Compiler memoizes each expression on its
    VISIBLE arguments only: a formatter that reads the store internally gets
    its result cached across language flips even though the component
    re-rendered (run-card timestamp bug, 2026-08-03). A lang argument makes
    the locale a tracked dependency. */
export function useLang(): 'ko' | 'en' {
  return useSettings(s => s.settings.lang) === 'en' ? 'en' : 'ko';
}

/** Lang-explicit lookups for formatter internals (same tables as t/tf). */
export function tIn(lang: 'ko' | 'en', key: StringKey): string {
  return DICTS[lang][key] ?? ko[key];
}
export function tfIn(lang: 'ko' | 'en', key: StringKey, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
    tIn(lang, key),
  );
}

/** Interpolation: fills {name} slots. */
export function tf(key: StringKey, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
    t(key),
  );
}

/** ko 와/과 josa (8/5 banner amend): final-consonant (받침) check on the
    last Hangul syllable — 받침 있음 → 과, 없음 → 와. Non-Hangul finals
    (latin/digits) default to 와 (the common editorial convention). */
export function josaWaGwa(word: string): '와' | '과' {
  const ch = word.charCodeAt(word.length - 1);
  if (ch >= 0xac00 && ch <= 0xd7a3) return (ch - 0xac00) % 28 === 0 ? '와' : '과';
  return '와';
}

/** en plural helper (ko never inflects): plural(2, 'photo', 'photos'). */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

const SEED_KEY = '@fr_lang_seeded';

/** One-shot device-locale default (first launch only): an English-device
    first run starts in en WITHOUT waiting for the 언어 row. Reads the OS
    language from RN's built-ins (zero native deps — expo-localization
    declined above); the marker guards re-runs, and any explicit 언어-row
    choice afterwards wins by construction (this never fires again). */
export function maybeSeedDeviceLang(): void {
  AsyncStorage.getItem(SEED_KEY).then(done => {
    if (done) return;
    AsyncStorage.setItem(SEED_KEY, '1').catch(() => {});
    const osLang: string =
      Platform.OS === 'ios'
        ? (NativeModules.SettingsManager?.settings?.AppleLanguages?.[0] ?? '')
        : (NativeModules.I18nManager?.localeIdentifier ?? '');
    if (osLang.toLowerCase().startsWith('en') && getLang() !== 'en') {
      useSettings.getState().setLang('en').catch(() => {});
    }
  }).catch(() => {});
}
