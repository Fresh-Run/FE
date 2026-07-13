/**
 * Bottom-sheet wheel picker family — design-wave B (canvas crew-create.jsx
 * FrWheelSheet/FrWheelRow/FrTimeWheelRow). ONE shared implementation: the
 * sheet housing is ours (the run-save/kudos sheet language — dim overlay,
 * handle, title, 확인); the wheel itself is @react-native-picker/picker
 * (Expo Go-bundled): real UIPickerView physics on iOS beats a hand-rolled
 * snap ScrollView. The 07-12 veto was an inline centered popup — this is
 * the sheet-housed redesign the docket waited for.
 *
 * Adaptations vs canvas (stated): the native wheel draws its own selection
 * band (no accentDim bar); Android renders Picker as a dropdown-in-sheet,
 * not a drum — iOS is the design target.
 */
import { Picker } from '@react-native-picker/picker';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { colors as C, spacing as S } from '@/lib/theme';

// ─── Sheet housing ────────────────────────────────────────────────────────────

function WheelSheet({ visible, title, onClose, onDone, children }: {
  visible: boolean; title: string;
  onClose: () => void; onDone: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.overlay} onPress={onClose}>
        <Pressable style={[st.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]} onPress={() => {}}>
          <View style={st.handleRow}><View style={st.handle} /></View>
          <Text style={st.title}>{title}</Text>
          <View style={st.wheelRow}>{children}</View>
          <Pressable onPress={onDone} style={({ pressed }) => [st.doneBtn, pressed && { opacity: 0.85 }]}>
            <Text style={st.doneTxt}>확인</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Trigger row — label · green value · chevron (canvas FrWheelRow) ─────────

function TriggerRow({ label, display, onPress }: { label: string; display: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.trigRow, pressed && { opacity: 0.7 }]}>
      <Text style={st.trigLabel}>{label}</Text>
      <Text style={st.trigValue}>{display}</Text>
      <Icon name="chevron-down" size={15} color={C.faint} />
    </Pressable>
  );
}

// ─── Single-column number wheel ───────────────────────────────────────────────

export function NumberWheelRow({ label, value, min, max, step, suffix, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  suffix: string; onChange: (v: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const options: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) options.push(+v.toFixed(1));
  // out-of-range current value (e.g. a pre-cap crew at 200명) stays representable
  if (!options.includes(value)) {
    options.push(value);
    options.sort((a, b) => a - b);
  }
  const [sel, setSel] = useState(value);

  return (
    <>
      <TriggerRow label={label} display={`${value}${suffix}`} onPress={() => { setSel(value); setOpen(true); }} />
      <WheelSheet
        visible={open} title={label}
        onClose={() => setOpen(false)}
        onDone={() => { onChange(sel); setOpen(false); }}
      >
        <Picker selectedValue={sel} onValueChange={setSel} style={st.col} itemStyle={st.item}>
          {options.map(v => <Picker.Item key={v} label={`${v}${suffix}`} value={v} />)}
        </Picker>
      </WheelSheet>
    </>
  );
}

// ─── 3-column time wheel — 오전/오후 · 시 · 분(10분) (canvas FrTimeWheelRow) ──
// value is the serializer's 24h "HH:mm" (or '' = unset); display is Korean.

const HOURS12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINS = [0, 10, 20, 30, 40, 50];

function parse24(v: string): { pm: boolean; h12: number; min: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return { pm: false, h12: 6, min: 30 }; // canvas default 오전 6:30
  const h = Math.min(23, +m[1]);
  const nearest = MINS.reduce((a, b) => Math.abs(b - +m[2]) < Math.abs(a - +m[2]) ? b : a);
  return { pm: h >= 12, h12: h % 12 === 0 ? 12 : h % 12, min: nearest };
}

function to24({ pm, h12, min }: { pm: boolean; h12: number; min: number }): string {
  const h = pm ? (h12 === 12 ? 12 : h12 + 12) : (h12 === 12 ? 0 : h12);
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function fmtTimeKo(v: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return '';
  const { pm, h12, min } = parse24(v);
  return `${pm ? '오후' : '오전'} ${h12}:${String(min).padStart(2, '0')}`;
}

export function TimeWheelRow({ label = '시간', value, onChange }: {
  label?: string; value: string; onChange: (v24: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(() => parse24(value));

  return (
    <>
      <TriggerRow
        label={label}
        display={value.trim() ? fmtTimeKo(value) : '선택'}
        onPress={() => { setSel(parse24(value)); setOpen(true); }}
      />
      <WheelSheet
        visible={open} title="모임 시간"
        onClose={() => setOpen(false)}
        onDone={() => { onChange(to24(sel)); setOpen(false); }}
      >
        <Picker
          selectedValue={sel.pm ? 1 : 0}
          onValueChange={(v: number) => setSel(s => ({ ...s, pm: v === 1 }))}
          style={[st.col, { flex: 0.9 }]} itemStyle={st.item}
        >
          <Picker.Item label="오전" value={0} />
          <Picker.Item label="오후" value={1} />
        </Picker>
        <Picker
          selectedValue={sel.h12}
          onValueChange={(v: number) => setSel(s => ({ ...s, h12: v }))}
          style={st.col} itemStyle={st.item}
        >
          {HOURS12.map(h => <Picker.Item key={h} label={`${h}시`} value={h} />)}
        </Picker>
        <Picker
          selectedValue={sel.min}
          onValueChange={(v: number) => setSel(s => ({ ...s, min: v }))}
          style={st.col} itemStyle={st.item}
        >
          {MINS.map(m => <Picker.Item key={m} label={`${String(m).padStart(2, '0')}분`} value={m} />)}
        </Picker>
      </WheelSheet>
    </>
  );
}

// ─── Date CALENDAR grid — 월 그리드 (owner ruling 2026-07-13: date-only →
// calendar; wheels stay for magnitudes/time). The WheelSheet housing is
// unchanged — only the contents swapped from the 년·월·일 drum to a month
// grid. min = today CLIENT policy (past days disabled by construction);
// range = this month → +12 months. The trigger row + serialized YYYY-MM-DD
// contract are identical, so announcement-compose needs no change.

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function fmtYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

export function DateWheelRow({ label, value, onChange }: {
  label: string;
  /** 'YYYY-MM-DD' (always valid by construction once touched) */
  value: string;
  onChange: (ymd: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const now = new Date();
  const tY = now.getFullYear(), tM = now.getMonth() + 1, tD = now.getDate();

  const parse = (v: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
    if (!m) return { y: tY, m: tM, d: tD };
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  };
  const [sel, setSel]   = useState(() => parse(value));   // selected day
  const [view, setView] = useState(() => { const p = parse(value); return { y: p.y, m: p.m }; }); // shown month

  // Month range as absolute month indices: [this month, +12 months]
  const minIdx  = tY * 12 + (tM - 1);
  const maxIdx  = minIdx + 12;
  const viewIdx = view.y * 12 + (view.m - 1);
  const step = (delta: number) => {
    const ni = viewIdx + delta;
    if (ni < minIdx || ni > maxIdx) return;
    setView({ y: Math.floor(ni / 12), m: (ni % 12) + 1 });
  };

  const firstDow = new Date(view.y, view.m - 1, 1).getDay(); // 0 = Sun (header is Sun-first → matches)
  const dim = daysInMonth(view.y, view.m);
  const inCurMonth = view.y === tY && view.m === tM;
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);       // leading blanks push day 1 under its weekday
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);            // trailing blanks fill the last row to 7
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7)); // exact rows of 7

  return (
    <>
      <TriggerRow
        label={label}
        display={value.trim() ? value : '선택'}
        onPress={() => { const p = parse(value); setSel(p); setView({ y: p.y, m: p.m }); setOpen(true); }}
      />
      <WheelSheet
        visible={open} title={label}
        onClose={() => setOpen(false)}
        onDone={() => { onChange(fmtYmd(sel.y, sel.m, sel.d)); setOpen(false); }}
      >
        <View style={st.cal}>
          <View style={st.calHead}>
            <Pressable onPress={() => step(-1)} disabled={viewIdx <= minIdx} hitSlop={10} style={[st.calArrow, viewIdx <= minIdx && { opacity: 0.25 }]}>
              <Icon name="chevron-back" size={17} color={C.text} />
            </Pressable>
            <Text style={st.calMonth}>{view.y}년 {view.m}월</Text>
            <Pressable onPress={() => step(1)} disabled={viewIdx >= maxIdx} hitSlop={10} style={[st.calArrow, viewIdx >= maxIdx && { opacity: 0.25 }]}>
              <Icon name="chevron-forward" size={17} color={C.text} />
            </Pressable>
          </View>
          <View style={st.calWeekRow}>
            {WEEKDAYS_KO.map((w, i) => (
              <Text key={w} style={[st.calWeekTxt, i === 0 && { color: C.danger }]}>{w}</Text>
            ))}
          </View>
          <View style={st.calGrid}>
            {weeks.map((week, wi) => (
              <View key={wi} style={st.calWeekLine}>
                {week.map((d, di) => {
                  if (d === null) return <View key={`b${wi}-${di}`} style={st.calCell} />;
                  const past = inCurMonth && d < tD;
                  const selected = sel.y === view.y && sel.m === view.m && sel.d === d;
                  const today = inCurMonth && d === tD;
                  return (
                    <Pressable key={d} disabled={past} onPress={() => setSel({ y: view.y, m: view.m, d })} style={st.calCell}>
                      <View style={[st.calDay, selected && st.calDaySel]}>
                        <Text style={[
                          st.calDayTxt,
                          past && st.calDayPast,
                          today && !selected && st.calDayToday,
                          selected && st.calDaySelTxt,
                        ]}>{d}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </WheelSheet>
    </>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:   { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: S.gutter },

  handleRow: { alignItems: 'center', paddingTop: 10, paddingBottom: 2 },
  handle:    { width: 38, height: 5, borderRadius: 99, backgroundColor: C.border },
  title:     { fontSize: 16, fontWeight: '700', color: C.text, letterSpacing: -0.4, paddingVertical: 10, textAlign: 'center' },

  wheelRow: { flexDirection: 'row', justifyContent: 'center' },
  col:      { flex: 1 },
  item:     { fontSize: 19, fontWeight: '600', color: C.text },

  // Calendar grid (date picker)
  cal:        { width: '100%', paddingTop: 2, paddingBottom: 6 },
  calHead:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, paddingBottom: 10 },
  calArrow:   { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceAlt },
  calMonth:   { fontSize: 16, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  calWeekRow:  { flexDirection: 'row', paddingBottom: 4 },
  calWeekTxt:  { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: C.faint, letterSpacing: -0.2 },
  calGrid:     {},
  calWeekLine: { flexDirection: 'row' },
  calCell:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 3 },
  calDay:     { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  calDaySel:  { backgroundColor: C.accent },
  calDayTxt:  { fontSize: 15, fontWeight: '600', color: C.text, letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  calDayPast: { color: C.faint, opacity: 0.4 },
  calDayToday:{ color: C.accentGrn, fontWeight: '800' },
  calDaySelTxt:{ color: C.accentText, fontWeight: '800' },

  doneBtn: { height: 52, borderRadius: 15, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  doneTxt: { fontSize: 15.5, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },

  trigRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  trigLabel: { flex: 1, fontSize: 14.5, fontWeight: '600', color: C.text, letterSpacing: -0.3 },
  trigValue: { fontSize: 15.5, fontWeight: '700', color: C.accentGrn, letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
});
