/**
 * 기간 선택 — shared month/year picker bottom sheet (canvas FrMonthPicker,
 * records-screen.jsx: grab bar + 기간 선택 title + year stepper + 4-col month
 * grid + "이 해에는 기록이 없어요" empty-year note). Consumers: 기록 tab
 * month label + 월간 리포트 month label. NOT a wheel — that design family
 * was discarded (owner, 2026-07-13); this is the app's sheet language.
 */
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { type Tokens, DENSE_MAX_FONT_SCALE} from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { tf, useT, type StringKey } from '@/lib/i18n';

export function MonthPicker({ visible, year, month, isEnabled, onSelect, onClose }: {
  visible: boolean;
  /** Currently-selected year/month — highlighted in the grid. */
  year: number;
  month: number;
  /** Which months are selectable (records: months with runs; report: not-future). */
  isEnabled: (year: number, month: number) => boolean;
  onSelect: (year: number, month: number) => void;
  onClose: () => void;
}) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT(); // junction — monthly-insight + records both render this sheet
  const insets = useSafeAreaInsets();
  const [yr, setYr] = useState(year);
  // Re-open always starts at the selected year, not where the user last browsed
  useEffect(() => { if (visible) setYr(year); }, [visible, year]);

  const yearHasData = Array.from({ length: 12 }, (_, i) => i + 1).some(m => isEnabled(yr, m));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={st.root}>
        <Pressable style={st.backdrop} onPress={onClose} />
        <View style={[st.sheet, { paddingBottom: Math.max(insets.bottom, 14) + 12 }]}>
          <View style={st.grabBar} />
          <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.title}>{T('mpk.title')}</Text>

          {/* Year stepper */}
          <View style={st.yearRow}>
            <Pressable onPress={() => setYr(y => y - 1)} hitSlop={6} style={st.yearBtn}>
              <Icon name="chevron-back" size={18} color={C.text} />
            </Pressable>
            <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.yearTxt}>{tf('date.yearN', { n: yr })}</Text>
            <Pressable onPress={() => setYr(y => y + 1)} hitSlop={6} style={st.yearBtn}>
              <Icon name="chevron-forward" size={18} color={C.text} />
            </Pressable>
          </View>

          {/* 4-column month grid (canvas: repeat(4,1fr)) */}
          <View style={st.grid}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(mn => {
              const ok = isEnabled(yr, mn);
              const on = yr === year && mn === month;
              return (
                <Pressable
                  key={mn}
                  disabled={!ok}
                  onPress={() => { onSelect(yr, mn); onClose(); }}
                  style={[
                    st.cell,
                    on ? st.cellOn : ok ? st.cellOk : st.cellOff,
                  ]}
                >
                  <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={[st.cellTxt, { color: on ? C.accentText : ok ? C.text : C.faint }]}>
                    {T(('date.m' + mn) as StringKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {!yearHasData && <Text style={st.emptyTxt}>{T('mpk.empty')}</Text>}
        </View>
      </View>
    </Modal>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root:     { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,12,8,0.34)' },
  sheet:    { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 10 },
  grabBar:  { width: 40, height: 5, borderRadius: 99, backgroundColor: C.border, alignSelf: 'center', marginBottom: 14 },
  title:    { fontSize: 16, fontWeight: '800', color: C.text, letterSpacing: -0.4, textAlign: 'center', marginBottom: 16 },

  yearRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, marginBottom: 18 },
  yearBtn:  { width: 34, height: 34, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  yearTxt:  { fontSize: 17, fontWeight: '800', color: C.text, letterSpacing: -0.4, minWidth: 78, textAlign: 'center' },

  grid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  cell:     { width: '23%', flexGrow: 1, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  cellOn:   { backgroundColor: C.accent, borderColor: C.accent },
  cellOk:   { backgroundColor: C.surface, borderColor: C.border },
  cellOff:  { backgroundColor: C.surfaceAlt, borderColor: 'transparent' },
  cellTxt:  { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },

  emptyTxt: { fontSize: 12, color: C.faint, textAlign: 'center', marginTop: 14 },
});
