/**
 * 프로필 설정 — the 내 프로필 gear's destination (canvas: my-profile.jsx
 * FrProfileSettings), design-wave C honest subset.
 *
 * SERVER GAPS (probed 2026-07-26, staging + BE 5827c94 — the ask batch's
 * privacy pack has NOT landed): 프로필 공개 범위, 좋아요/댓글 허용, 팔로우
 * 승인제, 차단 관리 have no backing fields/resources and render NOT AT ALL
 * (the line-132 rule — no disabled teasers). They join this screen the day
 * her fields land; canvas parity notes in TODO.md.
 *
 * What ships: 러닝 자동 게시 (device-local default save-visibility —
 * store/feed-prefs), 프로필 편집 / 앱 설정 doors, 회원 탈퇴 (the 8bc494e
 * flow — canvas draws a simple modal; ours keeps the server-mandated
 * crew-owner 409 path). 앱 설정 row = the preserved door for the settings
 * hub, whose ONLY previous entry was the gear this screen now owns
 * (deviation from canvas, stated in the checkpoint).
 */
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { colors as C, shadows, spacing as S } from '@/lib/theme';
import { useFeedPrefs } from '@/store/feed-prefs';

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
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
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.row, pressed && { opacity: 0.7 }]}>
      <View style={st.rowIcon}><Icon name={icon} size={18} color={C.sub} /></View>
      <Text style={st.rowLabel}>{label}</Text>
      {value ? <Text style={st.rowValue}>{value}</Text> : null}
      <Icon name="chevron-forward" size={16} color={C.faint} />
    </Pressable>
  );
}

export default function ProfileSettingsScreen() {
  const insets = useSafeAreaInsets();
  const autoPost = useFeedPrefs(s => s.autoPost);
  const setAutoPost = useFeedPrefs(s => s.setAutoPost);
  useEffect(() => { useFeedPrefs.getState().hydrate(); }, []);

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
        <Group
          title="피드"
          hint="끄면 새 러닝의 공개 범위가 비공개로 시작해요. 저장 화면에서 러닝마다 바꿀 수 있어요."
        >
          <View style={st.row}>
            <View style={st.rowIcon}><Icon name="megaphone-outline" size={18} color={C.sub} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.rowLabel}>러닝 자동 게시</Text>
              <Text style={st.rowSub}>러닝 저장 시 프로필 피드에 자동 공개</Text>
            </View>
            <Switch
              value={autoPost}
              onValueChange={setAutoPost}
              trackColor={{ true: C.accent, false: C.border }}
              thumbColor="#fff"
            />
          </View>
        </Group>

        <Group title="관리">
          <NavRow icon="person-outline" label="프로필 편집" value="이름 · 소개 · 신체 정보" onPress={() => router.push('/personal-info' as any)} />
          <NavRow icon="options-outline" label="앱 설정" value="단위 · 테마 · 러닝 동작" onPress={() => router.push('/settings' as any)} />
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

const st = StyleSheet.create({
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

  deleteBtn: { height: 50, borderRadius: 14, borderWidth: 1, borderColor: C.danger + '44', alignItems: 'center', justifyContent: 'center' },
  deleteTxt: { fontSize: 14.5, fontWeight: '700', color: C.danger, letterSpacing: -0.3 },
});
