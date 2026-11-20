// MY tab (redesign item 2, owner-ruled 2026-11-19) — canvas "MY 통계/기록/게시물
// — Figma 원본" boards. Header (avatar · nickname · 프로필 보기 · gear → 설정)
// + segmented 통계 / 기록 / 게시물. 2a shipped the shell + 통계; 2b the 기록 and
// 게시물 tabs (the old (tabs)/records screen is retired — post-save redirects
// land here with ?tab=records). The pre-redesign 프로필 tab lives at
// app/settings.tsx.
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { useTabBarInset } from '@/components/fresh-tab-bar';
import { MyPostsTab } from '@/components/my-posts-tab';
import { MyRecordsTab } from '@/components/my-records-tab';
import { MyStatsTab } from '@/components/my-stats-tab';
import { Icon } from '@/components/ui';
import { useProfile } from '@/hooks/use-profile';
import { useRuns } from '@/hooks/use-runs';
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
  // Deep links / post-save redirects select a tab via ?tab=records
  useEffect(() => { if (isMyTab(tabParam)) setTab(tabParam); }, [tabParam]);

  // 재탭 = 맨 위로 (owner-ruled 8/5 pattern, carried from the old 프로필 tab)
  const scrollRef = useRef<ScrollView>(null);
  const navigation = useNavigation();
  useEffect(() => navigation.addListener('tabPress' as never, () => {
    if (navigation.isFocused()) scrollRef.current?.scrollTo({ y: 0, animated: true });
  }), [navigation]);

  const { profile, refetch } = useProfile();
  // One run list shared by 기록 and 게시물 (cursor-paginated, newest first)
  const runList = useRuns();
  const refetchRuns = runList.refetch;
  useFocusEffect(useCallback(() => { refetch(); refetchRuns(); }, [refetch, refetchRuns]));

  const listTab = tab === 'records' || tab === 'posts';

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarInset }}
        onScroll={({ nativeEvent: e }) => {
          if (listTab && runList.hasMore && !runList.loadingMore
              && e.contentOffset.y + e.layoutMeasurement.height > e.contentSize.height - 600) {
            runList.loadMore();
          }
        }}
        scrollEventThrottle={120}
      >
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
          runList.error
            ? <ErrorState message={runList.error} onRetry={runList.refetch} />
            : <MyRecordsTab runs={runList.runs} loading={runList.loading} loadingMore={runList.loadingMore} hasMore={runList.hasMore} loadMore={runList.loadMore} />
        )}
        {tab === 'posts' && (
          runList.error
            ? <ErrorState message={runList.error} onRetry={runList.refetch} />
            : <MyPostsTab runs={runList.runs} loading={runList.loading} loadingMore={runList.loadingMore} />
        )}
      </ScrollView>
    </View>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  return (
    <View style={st.errorWrap}>
      <Icon name="warning-outline" size={30} color={C.faint} />
      <Text style={st.errorTxt}>{message}</Text>
      <Pressable onPress={onRetry} style={st.retryBtn} accessibilityRole="button">
        <Text style={st.retryTxt}>{T('common.retry')}</Text>
      </Pressable>
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
  errorWrap:   { alignItems: 'center', gap: 10, paddingVertical: 36, paddingHorizontal: S.gutter },
  errorTxt:    { fontSize: 13, color: C.sub, textAlign: 'center' },
  retryBtn:    { paddingHorizontal: 16, paddingVertical: 9, borderRadius: R.md, backgroundColor: C.surface },
  retryTxt:    { fontSize: 13, fontWeight: '700', color: C.text },
});
