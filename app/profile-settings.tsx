/**
 * 프로필 설정 — the 내 프로필 gear's destination (canvas: my-profile.jsx
 * FrProfileSettings), design-wave C + ⑨ wire-up.
 *
 * 공개 범위 (비공개 프로필 v1, BE acc1ad1): 3-way wired to PATCH /me/profile
 * {nickname, visibility} — nickname must ride every PATCH (422 without,
 * probed). WRITE path live-probed; the read-side lock GATE is staging-dark
 * as of 2026-07-26 (지연-reported: locked never true, runs not 404'd) —
 * the setting stores server-side now, enforcement engages with her deploy.
 *
 * 팔로우 승인제 (v2, BE 610c7f3 — probed live): PATCH {nickname,
 * follow_approval}; ON → new follows become 202-pending requests.
 * SERVER GAPS (her roadmap): 좋아요/댓글 허용 = v1.5 · 차단 관리 = v3 —
 * still render NOT AT ALL (the line-132 rule); parity notes in TODO.md.
 *
 * Also ships: 피드 설정 (v1.5, settings.feed server-backed — 자동 게시 /
 * 좋아요·댓글 허용), 프로필 편집 / 앱 설정 doors, 회원 탈퇴 (the 8bc494e
 * flow — canvas draws a simple modal; ours keeps the server-mandated
 * crew-owner 409 path). 앱 설정 row = the preserved door for the settings
 * hub, whose ONLY previous entry was the gear this screen now owns.
 */
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { Toggle } from '@/components/toggle';
import { getMyProfile, listFollowRequests, updateProfile, type ProfileVisibility } from '@/lib/profile-api';
import { shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useSettings } from '@/store/use-settings';

const VISIBILITY_OPTS: { value: ProfileVisibility; label: string; sub: string }[] = [
  { value: 'public',    label: '전체 공개', sub: '누구나 내 프로필과 게시한 러닝을 볼 수 있어요' },
  { value: 'followers', label: '팔로워만',  sub: '팔로워에게만 게시한 러닝이 보여요' },
  { value: 'private',   label: '비공개',    sub: '아무에게도 보이지 않아요' },
];

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const st = useStyles(makeSt);
  const items = React.Children.toArray(children);
  return (
    <View style={{ paddingHorizontal: S.gutter, paddingTop: 22 }}>
      <Text style={st.groupTitle}>{title}</Text>
      <View style={[st.groupCard, shadows.sm]}>
        {items.map((ch, i) => (
          <React.Fragment key={i}>
            {ch}
            {i < items.length - 1 && <View style={st.divider} />}
          </React.Fragment>
        ))}
      </View>
      {hint ? <Text style={st.groupHint}>{hint}</Text> : null}
    </View>
  );
}

function NavRow({ icon, label, value, onPress }: {
  icon: string; label: string; value?: string; onPress: () => void;
}) {
  const C = useTokens();
  const st = useStyles(makeSt);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.row, pressed && { opacity: 0.7 }]}>
      <View style={st.rowIcon}><Icon name={icon} size={18} color={C.sub} /></View>
      <Text style={st.rowLabel}>{label}</Text>
      {value ? <Text style={st.rowValue}>{value}</Text> : null}
      <Icon name="chevron-forward" size={16} color={C.faint} />
    </Pressable>
  );
}

const VIS_TIMEOUT_MS = 10_000; // optimistic-write clock (timeout rider)

export default function ProfileSettingsScreen() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  // v1.5: feed prefs are SERVER settings now (settings.feed — the device-
  // local feed-prefs store died with the migration; hydrate runs it once)
  const feed = useSettings(st_ => st_.settings.feed);
  const setFeedSetting = useSettings(st_ => st_.setFeedSetting);
  useEffect(() => { useSettings.getState().hydrate(); }, []);

  async function toggleFeed(key: 'auto_publish' | 'allow_likes' | 'allow_comments', v: boolean) {
    const ok = await setFeedSetting(key, v);
    if (!ok) Alert.alert('변경 실패', '설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  // ── 공개 범위 — server truth on mount; default-select public on a failed
  // read (all accounts are backfilled public; NEVER hide the section on a
  // read miss). Single-field PATCHes since BE 8483115 (⑥ cleanup).
  const [visibility, setVisibility] = useState<ProfileVisibility>('public');
  const [approval, setApproval] = useState(false);
  const [reqCount, setReqCount] = useState(0);
  useEffect(() => {
    listFollowRequests().then(rows => setReqCount(rows.length)).catch(() => {});
  }, []);
  const [visBusy, setVisBusy] = useState(false);
  useEffect(() => {
    getMyProfile()
      .then(p => {
        setVisibility(p.visibility ?? 'public');
        setApproval(p.follow_approval ?? false);
      })
      .catch(() => { /* profile-less/offline — defaults stand, change surfaces the error */ });
  }, []);

  // same fast-fail + reconcile discipline as visibility (the timeout rider);
  // single-field PATCH per BE 8483115 (partial semantics — ⑥ cleanup)
  async function toggleApproval(v: boolean) {
    const prev = approval;
    setApproval(v);
    try {
      await updateProfile({ follow_approval: v }, VIS_TIMEOUT_MS);
    } catch (e: unknown) {
      setApproval(prev);
      getMyProfile(VIS_TIMEOUT_MS)
        .then(p => setApproval(p.follow_approval ?? false))
        .catch(() => {});
      Alert.alert('변경 실패', e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요.');
    }
  }

  // Optimistic write with a FAST failure (10s deadline — offline must revert
  // + alert while the user is still on the screen, not after reconnect).
  // On failure, one reconcile GET re-reads server truth: a PATCH the OS
  // queue landed anyway wins over the revert instead of diverging. A PATCH
  // that lands after even that closes on the next screen open (mount read).
  async function pickVisibility(v: ProfileVisibility) {
    if (visBusy || v === visibility) return;
    const prev = visibility;
    setVisibility(v);
    setVisBusy(true);
    try {
      await updateProfile({ visibility: v }, VIS_TIMEOUT_MS);
    } catch (e: unknown) {
      setVisibility(prev); // last known server truth, until the reconcile says otherwise
      getMyProfile(VIS_TIMEOUT_MS)
        .then(p => setVisibility(p.visibility ?? 'public'))
        .catch(() => { /* still offline — prev stands; next mount re-reads */ });
      Alert.alert('변경 실패', e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요.');
    } finally {
      setVisBusy(false);
    }
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>프로필 설정</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* ── 공개 범위 — canvas top section (⑨ wire-up) ── */}
        <Group
          title="프로필 공개 범위"
          hint="비공개로 하면 팔로워가 아닌 사람에게는 게시한 러닝이 보이지 않아요."
        >
          {VISIBILITY_OPTS.map(o => {
            const on = visibility === o.value;
            return (
              <Pressable
                key={o.value}
                onPress={() => pickVisibility(o.value)}
                disabled={visBusy}
                style={({ pressed }) => [st.row, pressed && { opacity: 0.7 }]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.rowLabel}>{o.label}</Text>
                  <Text style={st.rowSub}>{o.sub}</Text>
                </View>
                <View style={[st.radioOuter, on && { borderColor: C.accent, backgroundColor: C.accent }]}>
                  {on && <Icon name="checkmark" size={13} color={C.accentText} />}
                </View>
              </Pressable>
            );
          })}
        </Group>
        <Group
          title="피드"
          hint="자동 게시를 끄면 새 러닝의 공개 범위가 비공개로 시작해요. 좋아요·댓글을 끄면 다른 러너의 시도가 거절돼요."
        >
          <View style={st.row}>
            <View style={st.rowIcon}><Icon name="megaphone-outline" size={18} color={C.sub} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.rowLabel}>러닝 자동 게시</Text>
              <Text style={st.rowSub}>러닝 저장 시 프로필 피드에 자동 공개</Text>
            </View>
            <Toggle on={feed.auto_publish} onChange={v => toggleFeed('auto_publish', v)} />
          </View>
          <View style={st.row}>
            <View style={st.rowIcon}><Icon name="heart-outline" size={18} color={C.sub} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.rowLabel}>좋아요 허용</Text>
              <Text style={st.rowSub}>다른 러너가 내 러닝에 좋아요를 남길 수 있어요</Text>
            </View>
            <Toggle on={feed.allow_likes} onChange={v => toggleFeed('allow_likes', v)} />
          </View>
          <View style={st.row}>
            <View style={st.rowIcon}><Icon name="chatbubble-outline" size={18} color={C.sub} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.rowLabel}>댓글 허용</Text>
              <Text style={st.rowSub}>내 러닝에 댓글을 남길 수 있어요</Text>
            </View>
            <Toggle on={feed.allow_comments} onChange={v => toggleFeed('allow_comments', v)} />
          </View>
        </Group>

        <Group title="팔로우">
          <View style={st.row}>
            <View style={st.rowIcon}><Icon name="person-add-outline" size={18} color={C.sub} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.rowLabel}>팔로우 승인제</Text>
              <Text style={st.rowSub}>새 팔로워를 직접 승인해요</Text>
            </View>
            <Toggle on={approval} onChange={toggleApproval} />
          </View>
          <NavRow
            icon="mail-unread-outline"
            label="팔로우 요청"
            value={reqCount > 0 ? `${reqCount}건 대기` : undefined}
            onPress={() => router.push('/follow-requests' as any)}
          />
        </Group>

        <Group title="관리">
          <NavRow icon="person-outline" label="프로필 편집" value="이름 · 소개 · 신체 정보" onPress={() => router.push('/personal-info' as any)} />
          {/* 앱 설정 row DELETED (owner ruling 7/31): its href pointed at
              app/settings.tsx, deleted in 5237b7d as an "orphan" WITH this
              live consumer — the unmatched→코스설정 trap. Contents live in
              the profile tab; slice 6 reintroduces a real hub deliberately
              if wanted. Lesson: route deletions grep ROUTE-STRINGS
              ('/settings'), not filenames. */}
          {/* 차단 관리 — goes live with 지연's block stack (was a server gap) */}
          <NavRow icon="ban-outline" label="차단 관리" value="차단한 사용자" onPress={() => router.push('/block-list' as any)} />
        </Group>

        {/* 회원 탈퇴 — canvas bottom danger button; destination is the shipped
            flow (crew-owner 409 path), not the canvas's bare modal */}
        <View style={{ paddingHorizontal: S.gutter, paddingTop: 26 }}>
          <Pressable
            onPress={() => router.push('/delete-account' as any)}
            style={({ pressed }) => [st.deleteBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={st.deleteTxt}>회원탈퇴</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.gutter, paddingVertical: 10 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },

  groupTitle: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, color: C.faint, textTransform: 'uppercase', paddingHorizontal: 4, paddingBottom: 8 },
  groupCard:  { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, paddingHorizontal: 16 },
  groupHint:  { fontSize: 12, color: C.faint, letterSpacing: -0.2, lineHeight: 17, paddingTop: 9, paddingHorizontal: 6 },
  divider:    { height: 1, backgroundColor: C.border, marginHorizontal: -16 },

  row:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rowIcon:  { width: 32, height: 32, borderRadius: 10, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 14.5, fontWeight: '600', color: C.text, letterSpacing: -0.3 },
  rowSub:   { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },
  rowValue: { fontSize: 12.5, fontWeight: '600', color: C.faint, letterSpacing: -0.2, marginLeft: 'auto' },

  radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },

  deleteBtn: { height: 50, borderRadius: 14, borderWidth: 1, borderColor: C.danger + '44', alignItems: 'center', justifyContent: 'center' },
  deleteTxt: { fontSize: 14.5, fontWeight: '700', color: C.danger, letterSpacing: -0.3 },
});
