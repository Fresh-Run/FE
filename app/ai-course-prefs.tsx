/**
 * AI 코스 선호도 — generation preference defaults (bundle: FrAICoursePrefs).
 * Pushed from the profile tab's 러닝 & AI group. Instant apply per canvas
 * (no save bar): every control PATCHes /me/settings {ai_course} optimistically
 * with rollback. The server consults these only when POST /routes/generate
 * omits a field (guide priority: body > 내 설정 > 서버 기본값); the create
 * form seeds its distance slider from default_distance_km for the same reason.
 *
 * Deviation (owner-approved 2026-07-09): stepper capped at 32 km, not the
 * canvas 42 — backend bound is default_distance_km le=32.2 (422 above it).
 */
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import type { AiCourseSettings } from '@/lib/settings-api';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useSettings } from '@/store/use-settings';

const TERRAINS: { value: AiCourseSettings['terrain']; label: string; sub: string }[] = [
  { value: 'flat',  label: '평지 우선', sub: '한강·공원 등 평탄한 길' },
  { value: 'mixed', label: '균형',      sub: '평지와 언덕을 적절히' },
  { value: 'hill',  label: '언덕 훈련', sub: '오르막 위주의 강한 코스' },
];

const SURFACES: { value: AiCourseSettings['surface']; label: string }[] = [
  { value: 'any',   label: '상관 없음' },
  { value: 'paved', label: '포장도로' },
  { value: 'trail', label: '트레일·흙길' },
];

// Backend bound: default_distance_km 1.0–32.2 → integer stepper 1–32
const DIST_MIN = 1;
const DIST_MAX = 32;

// ─── Row primitives (bundle: FrSelectRow / FrToggleRow / FrStepperRow) ────────

function SelectRow({ label, sub, selected, onSelect }: {
  label: string; sub?: string; selected: boolean; onSelect: () => void;
}) {
  const C = useTokens();
  const st = useStyles(makeSt);
  return (
    <Pressable onPress={onSelect} style={({ pressed }) => [st.row, pressed && { opacity: 0.6 }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={st.rowLabel}>{label}</Text>
        {sub ? <Text style={st.rowSub}>{sub}</Text> : null}
      </View>
      <View style={[st.radioOuter, selected && { borderColor: C.accent }]}>
        {selected && <View style={st.radioInner} />}
      </View>
    </Pressable>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  return (
    <Pressable
      onPress={() => onChange(!on)}
      style={[st.toggleTrack, { backgroundColor: on ? C.accent : C.border }]}
      hitSlop={6}
    >
      <View style={[st.toggleThumb, { transform: [{ translateX: on ? 18 : 0 }] }]} />
    </Pressable>
  );
}

function ToggleRow({ label, sub, on, onChange }: {
  label: string; sub: string; on: boolean; onChange: (v: boolean) => void;
}) {
  const st = useStyles(makeSt);
  return (
    <View style={st.row}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={st.rowLabel}>{label}</Text>
        <Text style={st.rowSub}>{sub}</Text>
      </View>
      <Toggle on={on} onChange={onChange} />
    </View>
  );
}

function StepperRow({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void;
}) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const bump = (dir: 1 | -1) => {
    // Integer steps; a stored fractional value (e.g. 5.5) rounds toward the grid
    const next = Math.min(DIST_MAX, Math.max(DIST_MIN, Math.round(value + dir)));
    if (next !== value) onChange(next);
  };
  return (
    <View style={st.row}>
      <Text style={[st.rowLabel, { flex: 1 }]}>{label}</Text>
      <View style={st.stepperCtrls}>
        <Pressable onPress={() => bump(-1)} hitSlop={6} style={[st.stepBtn, value <= DIST_MIN && { opacity: 0.4 }]}>
          <Icon name="remove" size={16} color={C.text} />
        </Pressable>
        <Text style={st.stepValue}>{Number.isInteger(value) ? value : value.toFixed(1)} km</Text>
        <Pressable onPress={() => bump(1)} hitSlop={6} style={[st.stepBtn, value >= DIST_MAX && { opacity: 0.4 }]}>
          <Icon name="add" size={16} color={C.text} />
        </Pressable>
      </View>
    </View>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const st = useStyles(makeSt);
  const items = React.Children.toArray(children);
  return (
    <View style={{ paddingHorizontal: S.gutter }}>
      <Text style={st.groupTitle}>{title}</Text>
      <View style={[st.groupCard, shadows.sm]}>
        {items.map((child, i) => (
          <React.Fragment key={i}>
            {child}
            {i < items.length - 1 && <View style={st.divider} />}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AiCoursePrefsScreen() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const ai = useSettings(s => s.settings.ai_course);
  const setAiCourse = useSettings(s => s.setAiCourse);
  const hydrate = useSettings(s => s.hydrate);

  useEffect(() => { hydrate(); }, [hydrate]);

  async function save(patch: Partial<AiCourseSettings>) {
    const ok = await setAiCourse(patch); // optimistic; rolls back on failure
    if (!ok) Alert.alert('저장 실패', '설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>AI 코스 선호도</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28 }}>
        {/* Info banner */}
        <View style={{ paddingHorizontal: S.gutter, paddingTop: S.sm }}>
          <View style={st.infoBanner}>
            <Icon name="sparkles-outline" size={18} color={C.accentGrn} />
            <Text style={st.infoTxt}>AI가 새 코스를 추천할 때 이 설정을 기본값으로 사용해요.</Text>
          </View>
        </View>

        <Group title="지형">
          {TERRAINS.map(t => (
            <SelectRow
              key={t.value}
              label={t.label}
              sub={t.sub}
              selected={ai.terrain === t.value}
              onSelect={() => { if (ai.terrain !== t.value) save({ terrain: t.value }); }}
            />
          ))}
        </Group>

        <Group title="기본 거리">
          <StepperRow
            label="추천 거리"
            value={ai.default_distance_km}
            onChange={v => save({ default_distance_km: v })}
          />
        </Group>

        <Group title="노면">
          {SURFACES.map(o => (
            <SelectRow
              key={o.value}
              label={o.label}
              selected={ai.surface === o.value}
              onSelect={() => { if (ai.surface !== o.value) save({ surface: o.value }); }}
            />
          ))}
        </Group>

        <Group title="선호">
          <ToggleRow
            label="경치 좋은 길 우선"
            sub="강변·공원·녹지를 우선 경유"
            on={ai.scenic}
            onChange={v => save({ scenic: v })}
          />
          <ToggleRow
            label="순환 코스 선호"
            sub="출발지로 돌아오는 루프"
            on={ai.prefer_loop}
            onChange={v => save({ prefer_loop: v })}
          />
          <ToggleRow
            label="급경사 회피"
            sub="가파른 오르막 제외"
            on={ai.avoid_hills}
            onChange={v => save({ avoid_hills: v })}
          />
        </Group>
      </ScrollView>
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.gutter, paddingVertical: 12 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },

  infoBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, backgroundColor: C.accentDim, borderWidth: 1, borderColor: `${C.accent}33`, borderRadius: R.lg, padding: 14 },
  infoTxt:    { flex: 1, fontSize: 13, lineHeight: 20, color: C.text, letterSpacing: -0.2 },

  groupTitle: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, color: C.faint, textTransform: 'uppercase', paddingTop: S.lg, paddingBottom: 8, paddingHorizontal: 4 },
  groupCard:  { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.xl, paddingHorizontal: S.md },
  divider:    { height: 1, backgroundColor: C.border, marginHorizontal: 4 },

  row:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 4 },
  rowLabel: { fontSize: 14.5, fontWeight: '600', letterSpacing: -0.3, color: C.text },
  rowSub:   { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 3 },

  radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.accent },

  toggleTrack: { width: 46, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },

  stepperCtrls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn:      { width: 34, height: 34, borderRadius: R.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  stepValue:    { fontSize: 15.5, fontWeight: '700', color: C.text, minWidth: 56, textAlign: 'center', letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
});
