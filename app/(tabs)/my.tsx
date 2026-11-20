// MY tab (redesign item 2, owner-ruled 2026-11-19) — canvas "MY 통계/기록/게시물
// — Figma 원본" boards. Header (avatar · nickname · 프로필 보기 · gear → 설정)
// + segmented 통계 / 기록 / 게시물. 2a ships the shell + 통계; 기록 and 게시물
// land in 2b (interim panes below — TODO(redesign/v1 2b): replace).
// The pre-redesign 프로필 tab content now lives at app/settings.tsx.
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { useTabBarInset } from '@/components/fresh-tab-bar';
import { MyStatsTab } from '@/components/my-stats-tab';
import { Icon } from '@/components/ui';
import { useProfile } from '@/hooks/use-profile';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useT, type StringKey } from '@/lib/i18n';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';

export type MyTab = 'stats' | 'records' | 'posts';
const TABS: { key: MyTab; label: StringKey }[] = [
  { key: 'stats',   label: 'my.tabStats' },
  { key: 'records', label: 'my.tabRecords' },
  { key: 'posts',   label: 'my.tabPosts' },
];
const isMyTab = (v: unknown): v is MyTab => v === 'stats' || v === 'records' || v === 'posts';

export default function MyScreen() {
  const T = useT();
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<MyTab>(isMyTab(tabParam) ? tabParam : 'stats');
  // Deep links / post-save redirects select a tab via ?tab= (2b wires records)
  useEffect(() => { if (isMyTab(tabParam)) setTab(tabParam); }, [tabParam]);

  // 재탭 = 맨 위로 (owner-ruled 8/5 pattern, carried from the old 프로필 tab)
  const scrollRef = useRef<ScrollView>(null);
  const navigation = useNavigation();
  useEffect(() => navigation.addListener('tabPress' as never, () => {
    if (navigation.isFocused()) scrollRef.current?.scrollTo({ y: 0, animated: true });
  }), [navigation]);

  const { profile, refetch } = useProfile();
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: tabBarInset }}>
        {/* Header */}
        <View style={st.header}>
          <Pressable
            onPress={() => router.push('/my-profile' as never)}
            style={({ pressed }) => [st.identity, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={T('my.viewProfile')}
          >
            <Avatar name={profile?.nickname} size={40} photoUrl={profile?.avatar_url} ring={C.border} />
            <View style={{ minWidth: 0 }}>
              <Text style={st.name} numberOfLines={1}>{profile?.nickname ?? ' '}</Text>
              <Text style={st.viewProfile}>{T('my.viewProfile')}</Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => router.push('/settings' as never)}
            hitSlop={8}
            style={({ pressed }) => [st.gear, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={T('set.screenTitle')}
          >
            <Icon name="settings-outline" size={20} color={C.text} />
          </Pressable>
        </View>

        {/* Segmented control */}
        <View style={st.segWrap}>
          {TABS.map(t => {
            const on = t.key === tab;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={[st.seg, on && st.segOn, on && shadows.sm]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={T(t.label)}
              >
                <Text style={[st.segTxt, on && st.segTxtOn]}>{T(t.label)}</Text>
              </Pressable>
            );
          })}
        </View>

        {tab === 'stats' && <MyStatsTab />}
        {tab === 'records' && (
          <View style={st.interim}>
            <Text style={st.interimTxt}>{T('my.interimRecords')}</Text>
            <Pressable onPress={() => router.navigate('/(tabs)/records' as never)} style={st.interimBtn} accessibilityRole="button">
              <Text style={st.interimBtnTxt}>{T('my.openOldRecords')}</Text>
            </Pressable>
          </View>
        )}
        {tab === 'posts' && (
          <View style={st.interim}>
            <Text style={st.interimTxt}>{T('my.interimPosts')}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S.gutter, paddingTop: S.lg, paddingBottom: S.md },
  identity:    { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  name:        { fontSize: 17, fontWeight: '800', letterSpacing: -0.3, color: C.text },
  viewProfile: { fontSize: 11, color: C.sub, marginTop: 2 },
  gear:        { width: 38, height: 38, borderRadius: 19, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  segWrap:     { flexDirection: 'row', marginHorizontal: S.gutter, padding: 4, borderRadius: R.lg, backgroundColor: C.surfaceAlt },
  seg:         { flex: 1, height: 40, borderRadius: R.md, alignItems: 'center', justifyContent: 'center' },
  segOn:       { backgroundColor: C.surface },
  segTxt:      { fontSize: 13, fontWeight: '600', color: C.sub },
  segTxtOn:    { color: C.text, fontWeight: '700' },
  interim:     { margin: S.gutter, padding: 18, borderRadius: R.xl, backgroundColor: C.surface, gap: 12 },
  interimTxt:  { fontSize: 13, color: C.sub },
  interimBtn:  { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 9, borderRadius: R.md, backgroundColor: C.surfaceAlt },
  interimBtnTxt:{ fontSize: 13, fontWeight: '700', color: C.text },
});
