/**
 * 단위 — distance unit picker (bundle: FrUnitsScreen).
 * Pushed from the profile tab's 설정 group. Instant apply (no save bar):
 * selection PATCHes /me/settings {units} optimistically with rollback.
 */
import { router } from 'expo-router';
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { t, useT, type StringKey } from '@/lib/i18n';
import type { UserSettings } from '@/lib/settings-api';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useSettings } from '@/store/use-settings';

const OPTIONS: { value: UserSettings['units']; label: StringKey; sub: StringKey }[] = [
  { value: 'km', label: 'units.km', sub: 'units.kmSub' },
  { value: 'mi', label: 'units.mi', sub: 'units.miSub' },
];

export default function UnitsScreen() {
  const T = useT();
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const units = useSettings(s => s.settings.units);
  const setUnits = useSettings(s => s.setUnits);

  async function pick(value: UserSettings['units']) {
    if (value === units) return;
    const ok = await setUnits(value); // optimistic; rolls back on failure
    if (!ok) Alert.alert(t('set.saveFailT'), t('set.saveFailB'));
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>{T('units.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={{ paddingHorizontal: S.gutter }}>
        <Text style={st.groupTitle}>{T('units.group')}</Text>
        <Text style={st.groupHint}>{T('units.hint')}</Text>
        <View style={[st.groupCard, shadows.sm]}>
          {OPTIONS.map((o, i) => (
            <React.Fragment key={o.value}>
              {i > 0 && <View style={st.divider} />}
              <Pressable onPress={() => pick(o.value)} style={st.row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.rowLabel}>{T(o.label)}</Text>
                  <Text style={st.rowSub}>{T(o.sub)}</Text>
                </View>
                <View style={[st.radioOuter, units === o.value && { borderColor: C.accent }]}>
                  {units === o.value && <View style={st.radioInner} />}
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

  groupTitle: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, color: C.faint, textTransform: 'uppercase', paddingTop: S.lg, paddingBottom: 4, paddingHorizontal: 4 },
  groupHint:  { fontSize: 12, color: C.faint, letterSpacing: -0.2, paddingHorizontal: 4, paddingBottom: S.sm },
  groupCard:  { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.xl, paddingHorizontal: S.md },
  divider:    { height: 1, backgroundColor: C.border, marginHorizontal: 4 },

  row:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 4 },
  rowLabel: { fontSize: 15, fontWeight: '600', letterSpacing: -0.3, color: C.text },
  rowSub:   { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },

  radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.accent },
});
