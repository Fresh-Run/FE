/**
 * 테마 — theme picker (bundle: FrThemeScreen). Pushed from the profile tab.
 * Phase 5 (dark-mode epic end-state, 2026-07-21): LIVE three-way
 * 시스템/라이트/다크 (default 시스템 — pre-ruled). mode is DEVICE-LOCAL
 * (store/use-scheme); explicit picks additionally PATCH /me/settings {theme}
 * (server enum is light|dark — 'system' is local-only; enum extension is a
 * ledgered 지연 nicety). The old persist-only 준비-중 notice died here.
 */
import { router } from 'expo-router';
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { t, useT, type StringKey } from '@/lib/i18n';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useScheme, type Mode } from '@/store/use-scheme';
import { useSettings } from '@/store/use-settings';

// labels/subs hold KEYS (slice-6; the notifications.tsx TABS convention)
const OPTIONS: { value: Mode; label: StringKey; sub: StringKey }[] = [
  { value: 'system', label: 'thm.system', sub: 'thm.systemSub' },
  { value: 'light',  label: 'thm.light',  sub: 'thm.lightSub' },
  { value: 'dark',   label: 'thm.dark',   sub: 'thm.darkSub' },
];

export default function ThemeScreen() {
  const T = useT(); // reactive — the picker itself re-renders on lang flip
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const mode = useScheme(s => s.mode);
  const setMode = useScheme(s => s.setMode);
  const setTheme = useSettings(s => s.setTheme);

  async function pick(value: Mode) {
    if (value === mode) return;
    setMode(value); // applies + persists locally, instantly
    if (value !== 'system') {
      // keep the server contract in sync for explicit picks (light|dark enum)
      const ok = await setTheme(value);
      if (!ok) Alert.alert(t('set.saveFailT'), t('thm.syncFailB'));
    }
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>{T('thm.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={{ paddingHorizontal: S.gutter }}>
        <Text style={st.groupTitle}>{T('thm.group')}</Text>
        <View style={[st.groupCard, shadows.sm]}>
          {OPTIONS.map((o, i) => (
            <React.Fragment key={o.value}>
              {i > 0 && <View style={st.divider} />}
              <Pressable onPress={() => pick(o.value)} style={st.row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.rowLabel}>{T(o.label)}</Text>
                  <Text style={st.rowSub}>{T(o.sub)}</Text>
                </View>
                <View style={[st.radioOuter, mode === o.value && { borderColor: C.accent }]}>
                  {mode === o.value && <View style={st.radioInner} />}
                </View>
              </Pressable>
            </React.Fragment>
          ))}
        </View>


      </View>
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.gutter, paddingVertical: 12 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },

  groupTitle: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, color: C.faint, textTransform: 'uppercase', paddingTop: S.lg, paddingBottom: S.sm, paddingHorizontal: 4 },
  groupCard:  { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.xl, paddingHorizontal: S.md },
  divider:    { height: 1, backgroundColor: C.border, marginHorizontal: 4 },

  row:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 4 },
  rowLabel: { fontSize: 15, fontWeight: '600', letterSpacing: -0.3, color: C.text },
  rowSub:   { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },

  radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.accent },

  noticeCard: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: S.md, backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accent + '44', borderRadius: R.md, padding: 12 },
  noticeTxt:  { flex: 1, fontSize: 12.5, color: C.accentGrn, letterSpacing: -0.2 },
});
