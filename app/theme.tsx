/**
 * 테마 — theme picker (bundle: FrThemeScreen). Pushed from the profile tab.
 * T1: persist-only — the selection PATCHes /me/settings {theme} (optimistic,
 * rollback) but nothing repaints yet; dark RENDERING is the 다크 렌더링 sweep
 * (TODO.md T2). The notice below states this honestly.
 */
import { router } from 'expo-router';
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import type { UserSettings } from '@/lib/settings-api';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useSettings } from '@/store/use-settings';

const OPTIONS: { value: UserSettings['theme']; label: string; sub: string }[] = [
  { value: 'light', label: '라이트', sub: '밝은 배경' },
  { value: 'dark',  label: '다크',   sub: '어두운 배경' },
];

export default function ThemeScreen() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const theme = useSettings(s => s.settings.theme);
  const setTheme = useSettings(s => s.setTheme);

  async function pick(value: UserSettings['theme']) {
    if (value === theme) return;
    const ok = await setTheme(value); // optimistic; rolls back on failure
    if (!ok) Alert.alert('저장 실패', '설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>테마</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={{ paddingHorizontal: S.gutter }}>
        <Text style={st.groupTitle}>화면 테마</Text>
        <View style={[st.groupCard, shadows.sm]}>
          {OPTIONS.map((o, i) => (
            <React.Fragment key={o.value}>
              {i > 0 && <View style={st.divider} />}
              <Pressable onPress={() => pick(o.value)} style={st.row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.rowLabel}>{o.label}</Text>
                  <Text style={st.rowSub}>{o.sub}</Text>
                </View>
                <View style={[st.radioOuter, theme === o.value && { borderColor: C.accent }]}>
                  {theme === o.value && <View style={st.radioInner} />}
                </View>
              </Pressable>
            </React.Fragment>
          ))}
        </View>

        {/* Honest T1 notice — rendering lands with the 다크 렌더링 sweep */}
        <View style={st.noticeCard}>
          <Icon name="information-circle-outline" size={15} color={C.accentGrn} />
          <Text style={st.noticeTxt}>다크 화면은 준비 중이에요 — 설정은 저장돼요</Text>
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
