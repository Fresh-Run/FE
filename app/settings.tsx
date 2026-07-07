/**
 * 설정 — settings hub (canvas: FrSettingsHub). The gear on 내 프로필 lands
 * here. Rows duplicate the 프로필 tab's on purpose (canvas keeps both
 * surfaces) — both bind the same useSettings store, so they never diverge.
 *
 * Owner deviation from canvas: 햅틱 피드백 sub-label is "버튼 조작 시 진동"
 * (canvas "목표 달성 시 진동" mis-describes live behavior — haptics fire on
 * hold-stop). Canvas-side correction logged on the parity list (TODO.md).
 */
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import type { RunSettings } from '@/lib/settings-api';
import { colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';
import { useSettings } from '@/store/use-settings';

// ─── Primitives (profile-tab clones + canvas-hub additions) ──────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
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

function ToggleRow({ label, sub, on, onChange }: { label: string; sub: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={st.toggleRow}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={st.rowLabel}>{label}</Text>
        <Text style={st.rowSub}>{sub}</Text>
      </View>
      <Toggle on={on} onChange={onChange} />
    </View>
  );
}

function SettingRow({ icon, iconBg, label, value, onPress }: {
  icon: React.ReactNode; iconBg?: string; label: string; value?: string; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.settingRow, pressed && { opacity: 0.6 }]}>
      <View style={[st.settingIcon, iconBg ? { backgroundColor: iconBg } : undefined]}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={st.rowLabel}>{label}</Text>
        {value ? <Text style={st.rowSub}>{value}</Text> : null}
      </View>
      <Icon name="chevron-forward" size={17} color={C.faint} />
    </Pressable>
  );
}

function SettingGroup({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  return (
    <View style={st.groupWrap}>
      <Text style={st.groupTitle}>{title}</Text>
      <View style={[st.groupCard, shadows.sm]}>
        {items.map((child, i) => (
          <React.Fragment key={i}>
            {child}
            {i < items.length - 1 && <View style={st.groupDivider} />}
          </React.Fragment>
        ))}
      </View>
      {hint ? <Text style={st.groupHint}>{hint}</Text> : null}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const settings      = useSettings(s => s.settings);
  const hydrate       = useSettings(s => s.hydrate);
  const setRunSetting = useSettings(s => s.setRunSetting);
  useEffect(() => { hydrate(); }, [hydrate]);

  async function toggleRun(key: keyof RunSettings, value: boolean) {
    const ok = await setRunSetting(key, value); // optimistic; rolls back on failure
    if (!ok) Alert.alert('저장 실패', '설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  const notReady = (feature: string) =>
    Alert.alert('준비 중', `${feature}은 다음 업데이트에서 지원돼요.`);

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.appBarBtn}>
          <Icon name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>설정</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 36 }}>
        {/* 앱 환경 — hub value formats per canvas (단위 uses "km · 킬로미터",
            unlike the 프로필 tab's "km (킬로미터)") */}
        <SettingGroup title="앱 환경">
          <SettingRow
            icon={<Icon name="resize-outline" size={19} color={C.sub} />}
            label="단위"
            value={settings.units === 'mi' ? 'mi · 마일' : 'km · 킬로미터'}
            onPress={() => router.push('/units' as any)}
          />
          <SettingRow
            icon={<Icon name="moon-outline" size={19} color={C.sub} />}
            label="테마"
            value={settings.theme === 'dark' ? '다크' : '라이트'}
            onPress={() => router.push('/theme' as any)}
          />
          <SettingRow
            icon={<Icon name="globe-outline" size={19} color={C.sub} />}
            label="언어"
            value={settings.lang === 'en' ? 'English' : '한국어'}
            onPress={() => router.push('/lang' as any)}
          />
        </SettingGroup>

        {/* 러닝 동작 — persisted via PATCH /me/settings; runtime effects as on
            the 프로필 tab (haptics live, others persist-only for now) */}
        <SettingGroup
          title="러닝 동작"
          hint="자동 일시정지는 GPS 속도가 멈추면 러닝을 자동으로 멈춰요"
        >
          <ToggleRow label="자동 일시정지"  sub="멈추면 자동으로 기록 정지" on={settings.run.auto_pause}     onChange={v => toggleRun('auto_pause',     v)} />
          <ToggleRow label="음성 안내"      sub="구간마다 음성 피드백"      on={settings.run.voice_cue}      onChange={v => toggleRun('voice_cue',      v)} />
          <ToggleRow label="햅틱 피드백"    sub="버튼 조작 시 진동"         on={settings.run.haptics}        onChange={v => toggleRun('haptics',        v)} />
          <ToggleRow label="화면 항상 켜기" sub="러닝 중 화면 유지"         on={settings.run.keep_screen_on} onChange={v => toggleRun('keep_screen_on', v)} />
        </SettingGroup>

        {/* 알림 & 데이터 — 건강 데이터 stays 준비 중 (HealthKit is
            Expo-Go-blocked) */}
        <SettingGroup title="알림 & 데이터">
          <SettingRow
            icon={<Icon name="notifications-outline" size={19} color={C.sub} />}
            label="알림 센터"
            onPress={() => router.push('/notifications' as any)}
          />
          <SettingRow
            icon={<Icon name="heart-outline" size={19} color={C.danger} />}
            iconBg="#EF444418"
            label="건강 데이터"
            onPress={() => notReady('건강 데이터 연동')}
          />
        </SettingGroup>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, paddingVertical: 10 },
  appBarBtn:   { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },

  groupWrap:    { paddingHorizontal: S.gutter },
  groupTitle:   { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, color: C.faint, textTransform: 'uppercase', paddingVertical: S.md, paddingTop: S.lg, paddingHorizontal: 4 },
  groupCard:    { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.xl, paddingHorizontal: S.md },
  groupDivider: { height: 1, backgroundColor: C.border, marginHorizontal: 4 },
  groupHint:    { fontSize: 12, color: C.faint, letterSpacing: -0.2, lineHeight: 17, paddingTop: S.sm, paddingHorizontal: 4 },

  settingRow:  { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 12, paddingHorizontal: 4 },
  settingIcon: { width: 38, height: 38, borderRadius: R.md, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  rowLabel: { fontSize: 14.5, fontWeight: '600', letterSpacing: -0.3, color: C.text },
  rowSub:   { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 3 },

  toggleRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 4 },
  toggleTrack: { width: 46, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
});
