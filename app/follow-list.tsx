/**
 * 팔로잉/팔로워 list (canvas: FrFollowList). Pushed from 내 프로필's count
 * cells; opens on the tapped tab, switchable in place.
 *
 * Rows are name-only — the canvas's sub line ("주 4회 · 서울 마포구") has no
 * backend source on FollowUserItem (optional bio-on-row ask logged in TODO).
 * Follow button per row: optimistic toggle + rollback (POST/DELETE 204s,
 * idempotent per guide §5).
 */
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { useFollowList, type FollowUser } from '@/hooks/use-follow-list';
import { apiFetch } from '@/lib/api';
import { avatarBg } from '@/lib/fr-hash';
import { openProfile } from '@/lib/profile-nav';
import { colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';
import { useStore } from '@/store/use-store';

type Tab = 'following' | 'followers';

function Avatar({ name, size }: { name: string; size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: avatarBg(name), alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border }}>
      <Text style={{ fontWeight: '700', fontSize: Math.round(size * 0.4), color: '#fff' }}>
        {name.trim()[0]?.toUpperCase() ?? '?'}
      </Text>
    </View>
  );
}

export default function FollowListScreen() {
  const insets = useSafeAreaInsets();
  // uid/name absent → own lists (existing behavior); present → that user's
  const params = useLocalSearchParams<{ tab?: string; uid?: string; name?: string }>();
  const displayName = useStore(s => s.displayName) ?? '내 프로필';
  const title = params.name ?? displayName;
  const { following, followers, loading, error, refetch } = useFollowList(params.uid ?? null);

  const [tab, setTab] = useState<Tab>(params.tab === 'followers' ? 'followers' : 'following');
  // Optimistic follow-state overlay by user_id — applies across both tabs
  const [overlay, setOverlay] = useState<Record<string, boolean>>({});

  const isFollowing = useCallback(
    (u: FollowUser) => overlay[u.user_id] ?? u.is_following,
    [overlay],
  );

  const toggle = useCallback((u: FollowUser) => {
    const cur = overlay[u.user_id] ?? u.is_following;
    setOverlay(p => ({ ...p, [u.user_id]: !cur }));
    (cur
      ? apiFetch<void>(`/api/users/${u.user_id}/follow`, { method: 'DELETE' })
      : apiFetch<void>(`/api/users/${u.user_id}/follow`, { method: 'POST' })
    ).catch((e: unknown) => {
      setOverlay(p => ({ ...p, [u.user_id]: cur })); // rollback
      Alert.alert('실패했어요', e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요');
    });
  }, [overlay]);

  const list = tab === 'following' ? following : followers;

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      {/* App bar — title is the user's name, per canvas */}
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle} numberOfLines={1}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Segmented tabs with counts */}
      <View style={st.tabRow}>
        {([
          ['following', '팔로잉', following.length],
          ['followers', '팔로워', followers.length],
        ] as [Tab, string, number][]).map(([id, label, n]) => {
          const on = tab === id;
          return (
            <Pressable key={id} onPress={() => setTab(id)} style={st.tabBtn}>
              <Text style={[st.tabTxt, { color: on ? C.text : C.faint, fontWeight: on ? '700' : '600' }]}>
                {label} {n}
              </Text>
              {on && <View style={st.tabUnderline} />}
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : error ? (
        <View style={st.centered}>
          <Icon name="warning-outline" size={36} color={C.faint} />
          <Text style={st.stateTxt}>{error}</Text>
          <Pressable onPress={refetch} style={st.retryBtn}><Text style={st.retryTxt}>다시 시도</Text></Pressable>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={u => u.user_id}
          contentContainerStyle={{ paddingHorizontal: S.gutter, paddingTop: 16, paddingBottom: 28, gap: 10 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isF = isFollowing(item);
            return (
              <View style={[st.row, shadows.sm]}>
                {/* Row body navigates (canvas: tappable-name zone); pill stays
                    its own button — no chevron per owner call */}
                <Pressable
                  onPress={() => openProfile(item.user_id, item.nickname)}
                  style={({ pressed }) => [st.rowBody, pressed && { opacity: 0.7 }]}
                >
                  <Avatar name={item.nickname ?? '러너'} size={44} />
                  <Text style={st.rowName} numberOfLines={1}>{item.nickname ?? '러너'}</Text>
                </Pressable>
                <Pressable
                  onPress={() => toggle(item)}
                  style={[st.followBtn, isF ? st.followBtnOn : st.followBtnOff]}
                  hitSlop={6}
                >
                  <Text style={[st.followTxt, { color: isF ? C.sub : C.accentText }]}>
                    {isF ? '팔로잉' : '팔로우'}
                  </Text>
                </Pressable>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={st.centered}>
              <Icon name="people-outline" size={36} color={C.faint} />
              <Text style={st.stateTxt}>{tab === 'following' ? '아직 팔로우한 러너가 없어요' : '아직 팔로워가 없어요'}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, paddingVertical: 10 },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16.5, fontWeight: '700', letterSpacing: -0.4, color: C.text },

  tabRow:       { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface },
  tabBtn:       { flex: 1, alignItems: 'center', paddingTop: 12, paddingBottom: 11, position: 'relative' },
  tabTxt:       { fontSize: 14, letterSpacing: -0.3 },
  tabUnderline: { position: 'absolute', left: '25%', right: '25%', bottom: -1, height: 2.5, borderRadius: 99, backgroundColor: C.accent },

  row:     { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingVertical: 11, paddingHorizontal: 13 },
  rowBody: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowName: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.3 },

  followBtn:    { flexShrink: 0, height: 34, paddingHorizontal: 15, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center' },
  followBtnOn:  { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  followBtnOff: { backgroundColor: C.accent },
  followTxt:    { fontSize: 12.5, fontWeight: '700', letterSpacing: -0.2 },

  centered: { alignItems: 'center', gap: 12, paddingVertical: 60 },
  stateTxt: { fontSize: 14, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: R.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  retryTxt: { fontSize: 14, fontWeight: '700', color: C.text },
});
