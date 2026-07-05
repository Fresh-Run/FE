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
import type { UserSettings } from '@/lib/settings-api';
import { colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';
import { useSettings } from '@/store/use-settings';

const OPTIONS: { value: UserSettings['units']; label: string; sub: string }[] = [
  { value: 'km', label: '킬로미터 (km)', sub: '페이스 분/킬로미터' },
  { value: 'mi', label: '마일 (mi)',     sub: '페이스 분/마일' },
];

export default function UnitsScreen() {
  const insets = useSafeAreaInsets();
  const units = useSettings(s => s.settings.units);
  const setUnits = useSettings(s => s.setUnits);

  async function pick(value: UserSettings['units']) {
    if (value === units) return;
    const ok = await setUnits(value); // optimistic; rolls back on failure
    if (!ok) Alert.alert('저장 실패', '설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>단위</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={{ paddingHorizontal: S.gutter }}>
        <Text style={st.groupTitle}>거리 단위</Text>
        <Text style={st.groupHint}>앱 전체의 거리·페이스 표기에 적용돼요.</Text>
        <View style={[st.groupCard, shadows.sm]}>
          {OPTIONS.map((o, i) => (
            <React.Fragment key={o.value}>
              {i > 0 && <View style={st.divider} />}
              <Pressable onPress={() => pick(o.value)} style={st.row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.rowLabel}>{o.label}</Text>
                  <Text style={st.rowSub}>{o.sub}</Text>
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

const st = StyleSheet.create({
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
