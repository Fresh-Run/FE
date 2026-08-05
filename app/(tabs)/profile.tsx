import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { router, useNavigation } from 'expo-router';
import React, { useCallback, useEffect, useRef } from 'react';
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

import { Avatar } from '@/components/avatar';
import { useTabBarInset } from '@/components/fresh-tab-bar';
import { t, useT } from '@/lib/i18n';
import { Icon } from '@/components/ui';
import { Toggle } from '@/components/toggle';
import { useProfile, type Profile, type RunStats } from '@/hooks/use-profile';
import { healthAvailable, requestHealthAuthorization } from '@/lib/health';
import { distUnit, fmtDist, fmtPaceIn, type Units } from '@/lib/run-format';
import type { RunSettings } from '@/lib/settings-api';
import { radius as R, shadows, spacing as S, type Tokens, DENSE_MAX_FONT_SCALE} from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useHealth } from '@/store/use-health';
import { useQuota } from '@/store/use-quota';
import { useScheme } from '@/store/use-scheme';
import { useSettings } from '@/store/use-settings';
import { useStore } from '@/store/use-store';

// ─── Toggle ───────────────────────────────────────────────────────────────────

// Toggle — now the shared house component (components/toggle.tsx, extraction
// 2026-07-23): gated buzz-when-ON rides there; the local copy is retired.

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
  const C = useTokens();
  const st = useStyles(makeSt);
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
          <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={[st.settingLabel, danger && { color: C.danger }]}>{label}</Text>
          {badge && (
            <View style={st.badgePill}>
              <Text style={st.badgeTxt}>{badge}</Text>
            </View>
          )}
        </View>
        {value ? <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.settingValue}>{value}</Text> : null}
      </View>
      {locked
        ? <Icon name="lock-closed-outline" size={17} color={C.faint} />
        : (onPress && !danger && <Icon name="chevron-forward" size={17} color={C.faint} />)
      }
    </Pressable>
  );
}

// ─── ToggleRow ────────────────────────────────────────────────────────────────

function ToggleRow({ label, caption, on, onChange }: { label: string; caption?: string; on: boolean; onChange: (v: boolean) => void }) {
  const st = useStyles(makeSt);
  return (
    <View style={st.toggleRow}>
      <View style={{ flex: 1, minWidth: 0, gap: 2, paddingRight: 10 }}>
        <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.settingLabel}>{label}</Text>
        {/* invisible-conditions cure class: armed states announce their real
            requirements (haptics recon 2026-07-23: system-haptic state is
            UNDETECTABLE from JS — expo-haptics has no query API and iOS
            exposes none — so the caption is static, not state-reactive) */}
        {caption != null && <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.toggleCaption}>{caption}</Text>}
      </View>
      <Toggle on={on} onChange={onChange} />
    </View>
  );
}

// ─── SettingGroup ─────────────────────────────────────────────────────────────

function SettingGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const st = useStyles(makeSt);
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

function IdentityCard({ profile, stats, units, premium, onEdit }: { profile: Profile; stats: RunStats; units: Units; premium: boolean; onEdit: () => void }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const dist     = fmtDist(stats.totalDistKm, units, 1);
  const runs     = String(stats.totalRuns);
  const bestPace = stats.bestPaceSec != null ? fmtPaceIn(stats.bestPaceSec, units) : '--';

  const T = useT();
  const quickStats: [string, string][] = [
    [`${dist} ${distUnit(units)}`, T('prof.statDist')],
    [runs,                         T('prof.statRuns')],
    [bestPace,                     T('prof.statBestPace')],
  ];

  return (
    <View style={[st.identityCard, shadows.sm]}>
      {/* Avatar + name row → 개인 정보 edit screen */}
      <Pressable onPress={onEdit} style={({ pressed }) => [st.identityRow, pressed && { opacity: 0.7 }]}>
        <View style={{ position: 'relative' }}>
          <Avatar name={profile.nickname} size={62} ring={C.accent} ringWidth={2.5} photoUrl={profile.avatar_url} initialsRatio={0.4} letterSpacing={-0.3} upper />
          <View style={st.editBadge}>
            <Icon name="pencil-outline" size={11} color={C.accentText} />
          </View>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Text style={st.identityName} numberOfLines={1}>{profile.nickname}</Text>
            {/* Canvas: crown badge on the premium variant */}
            {premium && (
              <View style={st.crownBadge}>
                <Icon name="flash" size={10} color="#fff" />
                <Text style={st.crownBadgeTxt}>PREMIUM</Text>
              </View>
            )}
          </View>
          <Text style={st.identityHint}>{T('prof.editHint')}</Text>
        </View>
        <Icon name="chevron-forward" size={18} color={C.faint} />
      </Pressable>

      {/* Quick stats */}
      <View style={st.quickStats}>
        {quickStats.map(([value, label], i) => (
          <View key={label} style={[st.quickStatCell, i > 0 && st.quickStatBorder]}>
            <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.quickStatVal}>{value}</Text>
            <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.quickStatLabel}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── PremiumBanner ────────────────────────────────────────────────────────────

// Lite-only upsell (canvas: hidden on the premium variant). Destination:
// the honest pre-IAP FrPremium page (B1, 2026-07-14) — the 준비 중 dead-end
// closed; purchase itself lights at build #1 (IAP).
function PremiumBanner() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  return (
    <Pressable
      onPress={() => router.push('/premium' as never)}
      style={({ pressed }) => [st.premiumBanner, pressed && { opacity: 0.85 }]}
    >
      <Icon name="trophy-outline" size={22} color={C.accent} />
      <View style={{ flex: 1 }}>
        <Text style={st.premiumTitle}>FreshRun Premium</Text>
        <Text style={st.premiumSub}>{T('prof.premiumSub')}</Text>
      </View>
      <Icon name="chevron-forward" size={18} color={C.faint} />
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
// ── Bundle identity (8/5 owner ruling — the structural fix): "which bytes am
// I on" must be a GLANCE, not forensics. The night's three phantoms (wrong-
// lane retest, unsubmitted binary, 32-cap ghost) all traced to a phone that
// couldn't say what it was running. Sources, all runtime-true:
//  · buildNumber  = Constants.nativeBuildVersion (the BINARY: 11 staging /
//    12 production — the channel is baked per-binary, so this digit IS the
//    lane discriminator)
//  · channel + runtimeVersion = expo-updates (empty channel = dev client)
//  · bundle = the running update's GROUP short-id (manifest.metadata
//    .updateGroup — verified served 2026-08-05; the ledger's own key, so
//    glance → ledger → commit) or 임베디드 when running the built-in bundle
//    (isEmbeddedLaunch — exactly the 32-cap ghost's signature).
// Commit short-hash was ruled in but the update manifest does not carry the
// commit (verified: metadata = {updateGroup, branchName} only) — the group
// id is the ledger-tied substitute; deviation stated at checkpoint.
// ko hardcoded — the footer's existing convention (slice-6 census).
function bundleIdentity(): string {
  const build = Constants.nativeBuildVersion ?? '?';
  const rt = (typeof Updates.runtimeVersion === 'string' && Updates.runtimeVersion) || APP_VERSION;
  const ch = Updates.channel || '(개발)';
  const group = Updates.isEmbeddedLaunch
    ? '임베디드'
    : ((Updates.manifest as { metadata?: { updateGroup?: string } })?.metadata?.updateGroup?.slice(0, 8)
        ?? Updates.updateId?.slice(0, 8)
        ?? '?');
  return `#${build} · ${ch} · rt ${rt} · 번들 ${group}`;
}


export default function ProfileScreen() {
  const T = useT(); // reactive — long-lived tab mount (the community bare-t lesson)
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets  = useSafeAreaInsets();
  // 재탭 = 맨 위로 (owner-ruled 8/5, 홈 패턴 버바팀 — index.tsx의
  // conviction 코멘트 참조): 자기 탭 tabPress만 수신, emit-타임 isFocused()
  // 분기 (true = 재탭 → 스크롤 / false = 타-탭발 도착 → 무동작 = 위치 보존).
  // SCROLL ONLY — 리페치 무동승 (refresh는 pull-to-refresh 소관).
  const scrollRef = useRef<ScrollView>(null);
  const navigation = useNavigation();
  useEffect(() => {
    return navigation.addListener('tabPress' as never, () => {
      if (navigation.isFocused()) {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }
    });
  }, [navigation]);
  const tabBarInset = useTabBarInset();
  const signOut = useStore(s => s.signOut);
  const { profile, stats, loading, error, signedOut, refetch } = useProfile();

  // Settings — bound to /me/settings (server truth, AsyncStorage first frame)
  const runSettings   = useSettings(s => s.settings.run);
  const units         = useSettings(s => s.settings.units);
  const themeMode     = useScheme(s => s.mode); // Phase 5 — the 테마 row value
  const lang          = useSettings(s => s.settings.lang);

  // Apple 건강 opt-in (③ Slice C — device-local; enable = the HK sheet once).
  // iOS hides write-denial by design: `enabled` records the opt-in, and the
  // post-enable alert names 건강 앱 > 공유 as the re-grant home.
  const healthOn = useHealth(s => s.enabled);
  const setHealthOn = useHealth(s => s.setEnabled);
  useEffect(() => { useHealth.getState().hydrate(); }, []);
  // The 연결 row's tap: 연결 안 됨 → the HK sheet (once) → 연결됨.
  // 연결됨 → an honest disconnect dialog (stops OUR writes; the iOS
  // permission itself lives in 건강 앱 > 공유 — stated in the copy).
  async function handleHealthRow() {
    if (healthOn) {
      Alert.alert(t('prof.hkTitle'), t('prof.hkOnBody'), [
        { text: t('prof.close'), style: 'cancel' },
        {
          text: t('prof.hkDisconnect'),
          style: 'destructive',
          onPress: () => setHealthOn(false),
        },
      ]);
      return;
    }
    if (!healthAvailable()) {
      Alert.alert(t('prof.hkUnavailT'), t('prof.hkUnavailB'));
      return;
    }
    const ok = await requestHealthAuthorization();
    if (!ok) { Alert.alert(t('prof.hkConnFailT'), t('auth.tryLater')); return; }
    setHealthOn(true);
    Alert.alert(t('prof.hkConnOkT'), t('prof.hkConnOkB'));
  }
  const hydrate       = useSettings(s => s.hydrate);
  const setRunSetting = useSettings(s => s.setRunSetting);
  useEffect(() => { hydrate(); }, [hydrate]);

  // Tier — Lite/Premium visual variants (canvas FrProfile); quota store is
  // the flag source (per-user cached, last-known-tier retention)
  const isPremium = useQuota(s => s.isPremium);
  useEffect(() => { useQuota.getState().hydrate(); }, []);

  async function toggleRun(key: keyof RunSettings, value: boolean) {
    const ok = await setRunSetting(key, value); // optimistic; rolls back on failure
    if (!ok) Alert.alert(t('set.saveFailT'), t('set.saveFailB'));
  }

  // Refetch on focus so a nickname saved in 개인 정보 shows immediately
  useFocusEffect(useCallback(() => {
    refetch();
  }, [refetch]));

  function handleSignOut() {
    Alert.alert(t('prof.signOut'), t('prof.signOutAsk'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('prof.signOut'), style: 'destructive', onPress: () => signOut() },
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
        <Text style={[st.screenTitle, st.headerPad]}>{T('prof.title')}</Text>
        <View style={st.centeredState}>
          <Icon name="person-outline" size={36} color={C.faint} />
          <Text style={st.stateTxt}>{T('prof.needLogin')}</Text>
        </View>
      </View>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error || !profile) {
    return (
      <View style={[st.root, { paddingTop: insets.top }]}>
        <Text style={[st.screenTitle, st.headerPad]}>{T('prof.title')}</Text>
        <View style={st.centeredState}>
          <Icon name="warning-outline" size={36} color={C.faint} />
          <Text style={st.stateTxt}>{error ?? T('prof.loadFail')}</Text>
          <Pressable onPress={refetch} style={st.retryBtn}>
            <Text style={st.retryTxt}>{T('common.retry')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Main ─────────────────────────────────────────────────────────────────
  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarInset }}
      >
        <Text style={[st.screenTitle, st.headerPad]}>{T('prof.title')}</Text>

        {/* Identity card */}
        <View style={{ paddingHorizontal: S.gutter, paddingTop: S.lg }}>
          <IdentityCard
            profile={profile}
            stats={stats}
            units={units}
            premium={isPremium}
            onEdit={() => router.push({ pathname: '/personal-info' as any, params: { nickname: profile.nickname } })}
          />
        </View>

        {/* Premium upsell — lite only (canvas premium variant hides it) */}
        {!isPremium && (
          <View style={{ paddingHorizontal: S.gutter, paddingTop: S.md }}>
            <PremiumBanner />
          </View>
        )}

        {/* 러닝 & AI — AI 코스 선호도 is 전 티어 (지연 결정 ⓐ, BE ab2841f /
            guide line 270: settings UI open to all, 차등은 쿼터로); 오디오
            코치 stays premium (coach-script 403 premium_required, guide line
            65) and design-ahead (FrAudioCoach has no code screen yet) */}
        <SettingGroup title={T('prof.gRunAi')}>
          <SettingRow
            icon={<Icon name="sparkles-outline" size={19} color={C.blue} />}
            iconBg={C.blue + '18'}
            label={T('acp.title')}
            onPress={() => router.push('/ai-course-prefs' as any)}
          />
          {/* 오디오 코치 v1 (2026-07-14): premium → settings screen; free →
              the honest /premium page (the lock now has a real destination) */}
          <SettingRow
            icon={<Icon name="volume-high-outline" size={19} color={C.accentGrn} />}
            iconBg={C.accentDim}
            label={T('prof.rowAudioCoach')}
            badge="Premium"
            locked={!isPremium}
            onPress={() => router.push((isPremium ? '/audio-coach' : '/premium') as never)}
          />
        </SettingGroup>

        {/* 연결 — RESTORED (owner ruling 2026-07-16; A2's own return
            condition met: HealthKit shipped at build #4). Original row
            grammar from git (9fb4462~1): heart icon #EF444418, state
            subtitle. The original rows were INERT — no tap behavior existed
            to restore — so taps get the real feature: Apple 건강 drives the
            opt-in/disconnect flow (the 설정-group toggle's third and FINAL
            home; one truth). 소셜 계정 = OWNER OVERRIDE of A2: visible +
            tappable 준비-중 alert NOW, wired when 지연's social-links
            backend lands (the return condition, ledgered). 알림 stays in
            설정 (ruling ②). */}
        <SettingGroup title={T('prof.gConn')}>
          <SettingRow
            icon={<Icon name="heart-outline" size={19} color={C.danger} />}
            iconBg={C.danger + '18'}
            label={T('prof.hkTitle')}
            value={healthOn ? T('prof.hkOn') : T('prof.hkOff')}
            onPress={handleHealthRow}
          />
          <SettingRow
            icon={<Icon name="link-outline" size={19} color={C.sub} />}
            label={T('prof.rowSocial')}
            onPress={() => Alert.alert(t('prof.soonT'), t('prof.soonB'))}
          />
        </SettingGroup>

        {/* 러닝 동작 — persisted via PATCH /me/settings.
            Runtime effects: haptics gates ALL app-origin haptics (toggle-
            scope ruling 2026-07-23: tab bars + countdown-go + split buzz +
            hold-stop — OFF = zero buzzes from this app; it's a GATE, not a
            generator: it can never force haptics past system-OFF);
            voice_cue is LIVE (오디오 코치 v1 master, 2026-07-14);
            keep_screen_on is LIVE (useKeepAwake in tracking.tsx, verified 2026-07-23).
            자동 일시정지 row REMOVED (owner ruling 2026-07-23: a dead
            ON-default switch sells a feature that doesn't exist — zero
            mid-run readers). The setting persists server-side untouched;
            the row returns WITH the real feature (post-gate item, must
            route through togglePause). */}
        <SettingGroup title={T('prof.gRunBehavior')}>
          {/* RESTORED 8/2 with the real feature (the 7/23 dead-switch removal
              ruling's own return condition — routes through togglePause).
              Ships ON: the server default (true) stands, owner-ruled; this
              toggle is the opt-out. */}
          <ToggleRow label={T('prof.autoPause')} on={runSettings.auto_pause} onChange={v => toggleRun('auto_pause', v)} caption={T('prof.autoPauseCap')} />
          <ToggleRow label={T('prof.voiceCue')} on={runSettings.voice_cue} onChange={v => toggleRun('voice_cue', v)} />
          <ToggleRow label={T('prof.haptics')} on={runSettings.haptics} onChange={v => toggleRun('haptics', v)} caption={T('prof.hapticsCap')} />
          <ToggleRow label={T('prof.keepScreen')} on={runSettings.keep_screen_on} onChange={v => toggleRun('keep_screen_on', v)} />
        </SettingGroup>

        {/* 설정 */}
        <SettingGroup title={T('prof.gSettings')}>
          {/* Push-notification SETTINGS (canvas: value "푸시 알림 설정") —
              NOT the inbox; the inbox lives behind the home bell. */}
          <SettingRow
            icon={<Icon name="notifications-outline" size={19} color={C.sub} />}
            label={T('prof.rowNotif')}
            value={T('prof.valPush')}
            onPress={() => router.push('/notification-settings' as any)}
          />
          <SettingRow
            icon={<Icon name="resize-outline" size={19} color={C.sub} />}
            label={T('units.title')}
            value={units === 'mi' ? T('units.mi') : T('units.km')}
            onPress={() => router.push('/units' as any)}
          />
          {/* 테마 row RESTORED (Phase 5, 2026-07-21) — the epic's end-state:
              live 시스템/라이트/다크 picker (default 시스템), device-local
              mode + server sync on explicit picks.
              Persist plumbing (useSettings.theme, /theme screen, server
              field) intact by design. */}
          <SettingRow icon={<Icon name="moon-outline"          size={19} color={C.sub} />} label={T('thm.title')} value={themeMode === 'system' ? T('thm.system') : themeMode === 'dark' ? T('thm.dark') : T('thm.light')} onPress={() => router.push('/theme' as any)} />
          <SettingRow icon={<Icon name="globe-outline"         size={19} color={C.sub} />} label={T('lang.title')} value={lang === 'en' ? 'English' : '한국어'} onPress={() => router.push('/lang' as any)} />
          {/* 도움말/약관 — LIVE screens (help-center.tsx / terms.tsx); the old
              "don't exist yet" note outlived their shipping (comment fixed
              2026-07-20, Phase-0 ride-along). */}
          <SettingRow icon={<Icon name="headset-outline"       size={19} color={C.sub} />} label={T('prof.rowHelp')} onPress={() => router.push('/help-center' as any)} />
          <SettingRow icon={<Icon name="document-text-outline" size={19} color={C.sub} />} label={T('prof.rowTerms')} onPress={() => router.push('/terms' as any)} />
        </SettingGroup>

        {/* Logout — standalone row outside a group */}
        <View style={{ paddingHorizontal: S.gutter, paddingTop: S.sm }}>
          <SettingRow
            icon={<Icon name="log-out-outline" size={19} color={C.danger} />}
            iconBg={C.danger + '12'}
            label={T('prof.signOut')}
            danger
            onPress={handleSignOut}
          />
        </View>

        {/* Version footer — plain again: the temporary dev override DIED with
            Phase 5's real picker (테마 row above). */}
        <Text style={st.versionFooter}>{`FreshRun ${APP_VERSION} · Made in Seoul`}</Text>
        {/* the identity line — see bundleIdentity's conviction comment */}
        <Text style={st.bundleIdent}>{bundleIdentity()}</Text>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeSt = (C: Tokens) => StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerPad:   { paddingTop: S.xl },
  screenTitle: { fontSize: 26, fontWeight: '700', letterSpacing: -0.8, color: C.text, paddingHorizontal: S.gutter },

  // Identity card
  identityCard:   { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.xl, padding: S.lg },
  identityRow:    { flexDirection: 'row', alignItems: 'center', gap: 14 },
  identityName:   { fontSize: 19, fontWeight: '700', letterSpacing: -0.5, color: C.text, flexShrink: 1 },
  crownBadge:     { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.accentGrn, borderRadius: R.pill, paddingLeft: 6, paddingRight: 8, paddingVertical: 3, flexShrink: 0 },
  crownBadgeTxt:  { fontSize: 9, fontWeight: '800', letterSpacing: 0.5, color: '#fff' },
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
  toggleCaption: { fontSize: 11.5, color: C.faint, letterSpacing: -0.2 },
  settingValue: { fontSize: 12.5, color: C.faint, letterSpacing: -0.2, marginTop: 2 },
  badgePill:    { backgroundColor: C.accentDim, borderRadius: R.sm, paddingHorizontal: 6, paddingVertical: 2 },
  badgeTxt:     { fontSize: 10, fontWeight: '700', letterSpacing: 0.4, color: C.accentGrn, textTransform: 'uppercase' },

  // Toggle row
  toggleRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 4 },

  // States
  centeredState: { paddingTop: 60, alignItems: 'center', gap: 12 },
  stateTxt:      { fontSize: 14, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },
  retryBtn:      { paddingHorizontal: 20, paddingVertical: 10, borderRadius: R.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  retryTxt:      { fontSize: 14, fontWeight: '700', color: C.text },

  // Footer
  versionFooter: { textAlign: 'center', fontSize: 11.5, color: C.faint, paddingHorizontal: S.gutter, paddingTop: S.lg },
  bundleIdent:   { textAlign: 'center', fontSize: 10.5, color: C.faint, opacity: 0.75, fontVariant: ['tabular-nums'], paddingHorizontal: S.gutter, paddingTop: 4, paddingBottom: S.xl },
});
