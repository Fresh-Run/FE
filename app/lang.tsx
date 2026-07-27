/**
 * 언어 — language picker (canvas: FrLangScreen). LIVE since the i18n
 * core-loop cut (2026-07-27): the selection PATCHes /me/settings {lang}
 * (optimistic, rollback) and the core loop re-renders in the picked
 * language; the notice below states the partial-support boundary honestly.
 *
 * DARK-MODE PILOT (epic Phase 1, 2026-07-20): first screen on the
 * useTokens/useStyles pattern — the reference conversion for every phase-3
 * batch. Recipe: static `colors as C` import dropped; `const C = useTokens()`
 * for inline uses; module-scope styles became the `makeSt(C)` factory
 * resolved via `useStyles`. Dark is reachable only through the hidden dev
 * override (설정 버전 row ×5) until phases 3–4 are whole.
 */
import { router } from 'expo-router';
import React from 'react';
import { useT } from '@/lib/i18n';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import type { UserSettings } from '@/lib/settings-api';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useSettings } from '@/store/use-settings';

const OPTIONS: { value: UserSettings['lang']; label: string; sub: string }[] = [
  { value: 'ko', label: '한국어',  sub: 'Korean' },
  { value: 'en', label: 'English', sub: '영어' },
];

export default function LangScreen() {
  const T = useT();
  const insets = useSafeAreaInsets();
  const lang = useSettings(s => s.settings.lang);
  const setLang = useSettings(s => s.setLang);
  const C = useTokens();
  const st = useStyles(makeSt);

  async function pick(value: UserSettings['lang']) {
    if (value === lang) return;
    const ok = await setLang(value); // optimistic; rolls back on failure
    if (!ok) Alert.alert('저장 실패', '설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>언어</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={{ paddingHorizontal: S.gutter }}>
        <Text style={st.groupTitle}>앱 언어</Text>
        <View style={[st.groupCard, shadows.sm]}>
          {OPTIONS.map((o, i) => (
            <React.Fragment key={o.value}>
              {i > 0 && <View style={st.divider} />}
              <Pressable onPress={() => pick(o.value)} style={st.row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.rowLabel}>{o.label}</Text>
                  <Text style={st.rowSub}>{o.sub}</Text>
                </View>
                <View style={[st.radioOuter, lang === o.value && { borderColor: C.accent }]}>
                  {lang === o.value && <View style={st.radioInner} />}
                </View>
              </Pressable>
            </React.Fragment>
          ))}
        </View>

        {/* Honest partial-support caption — core loop first, rest post-gate */}
        <View style={st.noticeCard}>
          <Icon name="information-circle-outline" size={15} color={C.accentGrn} />
          <Text style={st.noticeTxt}>{T('lang.partialNote')}</Text>
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
