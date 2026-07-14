/**
 * 오디오 코치 설정 — canvas FrAudioCoach (profile-screen.jsx), v1 subset.
 * Master = the server-persisted settings.run.voice_cue (the 음성 안내 toggle
 * both 러닝 동작 surfaces already bind — one source, finally live). Detail
 * settings (안내 간격 · 말하기 속도 · 항목) are device-local (use-audio-coach;
 * her settings schema has no audio_coach group — 지연 ask ledgered).
 *
 * STATED DIVERGENCES from canvas: 코치 음성 조이/데이빗 personas OMITTED
 * (expo-speech offers system voices, not personas); the 칼로리 항목 is IN
 * (owner correction — estimateKcal is live) with the honest-estimate hint.
 * Entry is premium-gated on the profile tab; the screen itself renders for
 * anyone who lands here (the gate is the affordance, cues gate at runtime).
 */
import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';
import { useAudioCoach } from '@/store/use-audio-coach';
import { useSettings } from '@/store/use-settings';

function SliderRow({ label, value, min, max, step, fmt, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  fmt: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <View style={st.sliderRow}>
      <View style={st.sliderHead}>
        <Text style={st.rowLabel}>{label}</Text>
        <Text style={st.sliderVal}>{fmt(value)}</Text>
      </View>
      <Slider
        minimumValue={min} maximumValue={max} step={step} value={value}
        onSlidingComplete={onChange}
        minimumTrackTintColor={C.accent} maximumTrackTintColor={C.border} thumbTintColor="#fff"
      />
    </View>
  );
}

export default function AudioCoachScreen() {
  const insets = useSafeAreaInsets();
  const voiceCue = useSettings(s => s.settings.run.voice_cue);
  const setRunSetting = useSettings(s => s.setRunSetting);
  const coach = useAudioCoach();
  useEffect(() => { useAudioCoach.getState().hydrate(); }, []);

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>오디오 코치</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: S.gutter, paddingBottom: 28 }}>
        {/* master — the canvas hero card; bound to settings.run.voice_cue */}
        <View style={[st.masterCard, shadows.sm]}>
          <View style={st.masterIcon}><Icon name="volume-high-outline" size={20} color={C.accentGrn} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.masterTitle}>실시간 음성 코칭</Text>
            <Text style={st.masterSub}>러닝 중 구간마다 음성으로 안내해요</Text>
          </View>
          <Switch
            value={voiceCue}
            onValueChange={v => { void setRunSetting('voice_cue', v); }}
            trackColor={{ true: C.accent, false: C.border }}
            thumbColor="#fff"
          />
        </View>

        <View style={{ opacity: voiceCue ? 1 : 0.4 }} pointerEvents={voiceCue ? 'auto' : 'none'}>
          <View style={[st.card, shadows.sm, { marginTop: 18 }]}>
            <SliderRow
              label="말하기 속도" value={coach.rate} min={0.6} max={1.6} step={0.1}
              fmt={v => `${v.toFixed(1)}x`} onChange={v => coach.set({ rate: Math.round(v * 10) / 10 })}
            />
            <View style={st.divider} />
            <SliderRow
              label="안내 간격" value={coach.intervalKm} min={0.5} max={3} step={0.5}
              fmt={v => `${v} km`} onChange={v => coach.set({ intervalKm: v })}
            />
          </View>

          <Text style={st.groupTitle}>안내 항목</Text>
          <View style={[st.card, shadows.sm]}>
            {([
              ['dist', '거리 안내', '구간 지점과 경과 시간'],
              ['pace', '페이스 안내', '현재 킬로미터당 페이스'],
              ['kcal', '칼로리 안내', '체중 정보가 있을 때만 안내돼요'],
            ] as [keyof typeof coach.items, string, string][]).map(([k, label, sub], i) => (
              <React.Fragment key={k}>
                {i > 0 && <View style={st.divider} />}
                <View style={st.toggleRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.rowLabel}>{label}</Text>
                    <Text style={st.rowSub}>{sub}</Text>
                  </View>
                  <Switch
                    value={coach.items[k]}
                    onValueChange={v => coach.setItem(k, v)}
                    trackColor={{ true: C.accent, false: C.border }}
                    thumbColor="#fff"
                  />
                </View>
              </React.Fragment>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, paddingVertical: 10 },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16.5, fontWeight: '700', letterSpacing: -0.4, color: C.text },

  masterCard: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 16, marginTop: 8 },
  masterIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  masterTitle:{ fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  masterSub:  { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },

  card:    { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, paddingHorizontal: 16, paddingVertical: 4 },
  divider: { height: 1, backgroundColor: C.border },

  groupTitle: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, color: C.faint, textTransform: 'uppercase', paddingTop: 22, paddingBottom: 8, paddingLeft: 4 },

  sliderRow:  { paddingVertical: 12 },
  sliderHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 },
  sliderVal:  { fontSize: 14, fontWeight: '700', color: C.accentGrn, letterSpacing: -0.2, fontVariant: ['tabular-nums'] },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  rowLabel:  { fontSize: 14.5, fontWeight: '600', color: C.text, letterSpacing: -0.3 },
  rowSub:    { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },
});
