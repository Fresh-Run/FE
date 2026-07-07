import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import React, { useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { useProfile, type Profile, type RunStats } from '@/hooks/use-profile';
import { avatarBg } from '@/lib/fr-hash';
import { distUnit, fmtDist, fmtPaceIn, type Units } from '@/lib/run-format';
import type { RunSettings } from '@/lib/settings-api';
import { colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';
import { useSettings } from '@/store/use-settings';
import { useStore } from '@/store/use-store';

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 40, ring = false }: { name: string; size?: number; ring?: boolean }) {
  const initial = name.trim()[0]?.toUpperCase() ?? '?';
  return (
    <View style={[
      { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarBg(name), alignItems: 'center', justifyContent: 'center' },
      ring && { borderWidth: 2.5, borderColor: C.accent },
    ]}>
      <Text style={{ fontWeight: '700', fontSize: Math.round(size * 0.4), color: '#fff', letterSpacing: -0.3 }}>
        {initial}
      </Text>
    </View>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

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

// ─── SettingRow ───────────────────────────────────────────────────────────────

interface SettingRowProps {
  icon: React.ReactNode;
  iconBg?: string;
  label: string;
  value?: string;
  badge?: string;
  danger?: boolean;
  locked?: boolean;
  onPress?: () => void;
}

function SettingRow({ icon, iconBg, label, value, badge, danger, locked, onPress }: SettingRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [st.settingRow, pressed && onPress && { opacity: 0.6 }]}
    >
      <View style={[st.settingIcon, iconBg ? { backgroundColor: iconBg } : undefined]}>
        {icon}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Text style={[st.settingLabel, danger && { color: C.danger }]}>{label}</Text>
          {badge && (
            <View style={st.badgePill}>
              <Text style={st.badgeTxt}>{badge}</Text>
            </View>
          )}
        </View>
        {value ? <Text style={st.settingValue}>{value}</Text> : null}
      </View>
      {locked
        ? <Icon name="lock-closed-outline" size={17} color={C.faint} />
        : (onPress && !danger && <Icon name="chevron-forward" size={17} color={C.faint} />)
      }
    </Pressable>
  );
}

// ─── ToggleRow ────────────────────────────────────────────────────────────────

function ToggleRow({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={st.toggleRow}>
      <Text style={st.settingLabel}>{label}</Text>
      <Toggle on={on} onChange={onChange} />
    </View>
  );
}

// ─── SettingGroup ─────────────────────────────────────────────────────────────

function SettingGroup({ title, children }: { title: string; children: React.ReactNode }) {
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
    </View>
  );
}

// ─── IdentityCard ─────────────────────────────────────────────────────────────

function IdentityCard({ profile, stats, units, onEdit }: { profile: Profile; stats: RunStats; units: Units; onEdit: () => void }) {
  const dist     = fmtDist(stats.totalDistKm, units, 1);
  const runs     = String(stats.totalRuns);
  const bestPace = stats.bestPaceSec != null ? fmtPaceIn(stats.bestPaceSec, units) : '--';

  const quickStats: [string, string][] = [
    [`${dist} ${distUnit(units)}`, '누적 거리'],
    [runs,                         '러닝'],
    [bestPace,                     '최고 페이스'],
  ];

  return (
    <View style={[st.identityCard, shadows.sm]}>
      {/* Avatar + name row → 개인 정보 edit screen */}
      <Pressable onPress={onEdit} style={({ pressed }) => [st.identityRow, pressed && { opacity: 0.7 }]}>
        <View style={{ position: 'relative' }}>
          <Avatar name={profile.nickname} size={62} ring />
          <View style={st.editBadge}>
            <Icon name="pencil-outline" size={11} color={C.accentText} />
          </View>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.identityName} numberOfLines={1}>{profile.nickname}</Text>
          <Text style={st.identityHint}>탭하여 개인 정보 편집</Text>
        </View>
        <Icon name="chevron-forward" size={18} color={C.faint} />
      </Pressable>

      {/* Quick stats */}
      <View style={st.quickStats}>
        {quickStats.map(([value, label], i) => (
          <View key={label} style={[st.quickStatCell, i > 0 && st.quickStatBorder]}>
            <Text style={st.quickStatVal}>{value}</Text>
            <Text style={st.quickStatLabel}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── PremiumBanner ────────────────────────────────────────────────────────────

function PremiumBanner() {
  return (
    <Pressable style={st.premiumBanner}>
      <Icon name="trophy-outline" size={22} color={C.accent} />
      <View style={{ flex: 1 }}>
        <Text style={st.premiumTitle}>FreshRun Premium</Text>
        <Text style={st.premiumSub}>AI 코스 · 심층 분석 · 오디오 코치</Text>
      </View>
      <Icon name="chevron-forward" size={18} color={C.faint} />
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

export default function ProfileScreen() {
  const insets  = useSafeAreaInsets();
  const signOut = useStore(s => s.signOut);
  const { profile, stats, loading, error, signedOut, refetch } = useProfile();

  // Settings — bound to /me/settings (server truth, AsyncStorage first frame)
  const runSettings   = useSettings(s => s.settings.run);
  const units         = useSettings(s => s.settings.units);
  const theme         = useSettings(s => s.settings.theme);
  const hydrate       = useSettings(s => s.hydrate);
  const setRunSetting = useSettings(s => s.setRunSetting);
  useEffect(() => { hydrate(); }, [hydrate]);

  async function toggleRun(key: keyof RunSettings, value: boolean) {
    const ok = await setRunSetting(key, value); // optimistic; rolls back on failure
    if (!ok) Alert.alert('저장 실패', '설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  // Refetch on focus so a nickname saved in 개인 정보 shows immediately
  useFocusEffect(useCallback(() => {
    refetch();
  }, [refetch]));

  function handleSignOut() {
    Alert.alert('로그아웃', '정말 로그아웃하시겠어요?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[st.root, { paddingTop: insets.top }]}>
        <View style={st.loadingWrap}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      </View>
    );
  }

  // ── Signed out ───────────────────────────────────────────────────────────
  if (signedOut) {
    return (
      <View style={[st.root, { paddingTop: insets.top }]}>
        <Text style={[st.screenTitle, st.headerPad]}>프로필</Text>
        <View style={st.centeredState}>
          <Icon name="person-outline" size={36} color={C.faint} />
          <Text style={st.stateTxt}>로그인이 필요해요</Text>
        </View>
      </View>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error || !profile) {
    return (
      <View style={[st.root, { paddingTop: insets.top }]}>
        <Text style={[st.screenTitle, st.headerPad]}>프로필</Text>
        <View style={st.centeredState}>
          <Icon name="warning-outline" size={36} color={C.faint} />
          <Text style={st.stateTxt}>{error ?? '프로필을 불러올 수 없어요'}</Text>
          <Pressable onPress={refetch} style={st.retryBtn}>
            <Text style={st.retryTxt}>다시 시도</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Main ─────────────────────────────────────────────────────────────────
  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
      >
        <Text style={[st.screenTitle, st.headerPad]}>프로필</Text>

        {/* Identity card */}
        <View style={{ paddingHorizontal: S.gutter, paddingTop: S.lg }}>
          <IdentityCard
            profile={profile}
            stats={stats}
            units={units}
            onEdit={() => router.push({ pathname: '/personal-info' as any, params: { nickname: profile.nickname } })}
          />
        </View>

        {/* Premium upsell */}
        <View style={{ paddingHorizontal: S.gutter, paddingTop: S.md }}>
          <PremiumBanner />
        </View>

        {/* 러닝 & AI */}
        <SettingGroup title="러닝 & AI">
          <SettingRow
            icon={<Icon name="sparkles-outline" size={19} color="#3D8BFF" />}
            iconBg="#3D8BFF18"
            label="AI 코스 선호도"
            badge="Premium"
            locked
          />
          <SettingRow
            icon={<Icon name="volume-high-outline" size={19} color={C.accentGrn} />}
            iconBg={C.accentDim}
            label="오디오 코치 설정"
            badge="Premium"
            locked
          />
        </SettingGroup>

        {/* 연결 */}
        <SettingGroup title="연결">
          <SettingRow
            icon={<Icon name="heart-outline" size={19} color={C.danger} />}
            iconBg="#EF444418"
            label="Apple 건강"
            value="연결 안 됨"
          />
          <SettingRow
            icon={<Icon name="link-outline" size={19} color={C.sub} />}
            label="소셜 계정"
          />
          <SettingRow
            icon={<Icon name="notifications-outline" size={19} color={C.sub} />}
            label="알림"
            onPress={() => router.push('/notifications' as any)}
          />
        </SettingGroup>

        {/* 러닝 동작 — persisted via PATCH /me/settings.
            Runtime effects: haptics is live (gates hold-stop feedback);
            auto_pause / voice_cue persist-only (features unbuilt);
            keep_screen_on persist-only for now (see TODO(keep-awake) in tracking.tsx). */}
        <SettingGroup title="러닝 동작">
          <ToggleRow label="자동 일시정지"  on={runSettings.auto_pause}     onChange={v => toggleRun('auto_pause',     v)} />
          <ToggleRow label="음성 안내"      on={runSettings.voice_cue}      onChange={v => toggleRun('voice_cue',      v)} />
          <ToggleRow label="햅틱 피드백"    on={runSettings.haptics}        onChange={v => toggleRun('haptics',        v)} />
          <ToggleRow label="화면 항상 켜기" on={runSettings.keep_screen_on} onChange={v => toggleRun('keep_screen_on', v)} />
        </SettingGroup>

        {/* 설정 */}
        <SettingGroup title="설정">
          <SettingRow
            icon={<Icon name="resize-outline" size={19} color={C.sub} />}
            label="단위"
            value={units === 'mi' ? 'mi (마일)' : 'km (킬로미터)'}
            onPress={() => router.push('/units' as any)}
          />
          <SettingRow
            icon={<Icon name="moon-outline" size={19} color={C.sub} />}
            label="다크 모드"
            value={theme === 'dark' ? '켜짐' : '꺼짐'}
            onPress={() => router.push('/theme' as any)}
          />
          <SettingRow icon={<Icon name="globe-outline"         size={19} color={C.sub} />} label="언어"       value="한국어" />
          <SettingRow icon={<Icon name="headset-outline"       size={19} color={C.sub} />} label="도움말 센터" />
          <SettingRow icon={<Icon name="document-text-outline" size={19} color={C.sub} />} label="서비스 약관" />
        </SettingGroup>

        {/* Logout — standalone row outside a group */}
        <View style={{ paddingHorizontal: S.gutter, paddingTop: S.sm }}>
          <SettingRow
            icon={<Icon name="log-out-outline" size={19} color={C.danger} />}
            iconBg="#EF444412"
            label="로그아웃"
            danger
            onPress={handleSignOut}
          />
        </View>

        {/* Version footer */}
        <Text style={st.versionFooter}>FreshRun {APP_VERSION} · Made in Seoul</Text>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerPad:   { paddingTop: S.xl },
  screenTitle: { fontSize: 26, fontWeight: '700', letterSpacing: -0.8, color: C.text, paddingHorizontal: S.gutter },

  // Identity card
  identityCard:   { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.xl, padding: S.lg },
  identityRow:    { flexDirection: 'row', alignItems: 'center', gap: 14 },
  identityName:   { fontSize: 19, fontWeight: '700', letterSpacing: -0.5, color: C.text },
  identityHint:   { fontSize: 12.5, color: C.faint, letterSpacing: -0.2, marginTop: 3 },
  editBadge:      { position: 'absolute', bottom: -2, right: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: C.accent, borderWidth: 2.5, borderColor: C.surface, alignItems: 'center', justifyContent: 'center' },

  // Quick stats
  quickStats:      { flexDirection: 'row', marginTop: S.lg, paddingTop: S.lg, borderTopWidth: 1, borderTopColor: C.border },
  quickStatCell:   { flex: 1, alignItems: 'center' },
  quickStatBorder: { borderLeftWidth: 1, borderLeftColor: C.border },
  quickStatVal:    { fontSize: 18, fontWeight: '700', letterSpacing: -0.5, color: C.text },
  quickStatLabel:  { fontSize: 11, color: C.faint, marginTop: 3 },

  // Premium banner
  premiumBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.text, borderRadius: R.xl, padding: S.lg },
  premiumTitle:  { fontSize: 14.5, fontWeight: '700', color: C.bg, letterSpacing: -0.3 },
  premiumSub:    { fontSize: 12, color: C.faint, marginTop: 2 },

  // Setting group
  groupWrap:    { paddingHorizontal: S.gutter },
  groupTitle:   { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, color: C.faint, textTransform: 'uppercase', paddingVertical: S.md, paddingTop: S.xl, paddingHorizontal: 4 },
  groupCard:    { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.xl, paddingHorizontal: S.md },
  groupDivider: { height: 1, backgroundColor: C.border, marginHorizontal: 4 },

  // Setting row
  settingRow:   { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 12, paddingHorizontal: 4 },
  settingIcon:  { width: 38, height: 38, borderRadius: R.md, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  settingLabel: { fontSize: 15, fontWeight: '600', letterSpacing: -0.3, color: C.text },
  settingValue: { fontSize: 12.5, color: C.faint, letterSpacing: -0.2, marginTop: 2 },
  badgePill:    { backgroundColor: C.accentDim, borderRadius: R.sm, paddingHorizontal: 6, paddingVertical: 2 },
  badgeTxt:     { fontSize: 10, fontWeight: '700', letterSpacing: 0.4, color: C.accentGrn, textTransform: 'uppercase' },

  // Toggle row
  toggleRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 4 },
  toggleTrack:  { width: 46, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  toggleThumb:  { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },

  // States
  centeredState: { paddingTop: 60, alignItems: 'center', gap: 12 },
  stateTxt:      { fontSize: 14, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },
  retryBtn:      { paddingHorizontal: 20, paddingVertical: 10, borderRadius: R.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  retryTxt:      { fontSize: 14, fontWeight: '700', color: C.text },

  // Footer
  versionFooter: { textAlign: 'center', fontSize: 11.5, color: C.faint, paddingHorizontal: S.gutter, paddingTop: S.lg, paddingBottom: S.xl },
});
