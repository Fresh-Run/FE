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
import React, { useCallback, useEffect, useState } from 'react';
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

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/ui';
import { useFollowList, type FollowUser } from '@/hooks/use-follow-list';
import { ApiError, apiFetch, apiRequest } from '@/lib/api';
import { openProfile } from '@/lib/profile-nav';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { usePendingFollows } from '@/store/pending-follows';
import { useStore } from '@/store/use-store';
import { t, tf, useT } from '@/lib/i18n';

type Tab = 'following' | 'followers';

export default function FollowListScreen() {
  const T = useT(); // reactive anchor — stack-mounted beneath 설정, repaints on lang flip
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  // uid/name absent → own lists (existing behavior); present → that user's
  const params = useLocalSearchParams<{ tab?: string; uid?: string; name?: string }>();
  const displayName = useStore(s => s.displayName) ?? T('fl.myProfile');
  const title = params.name ?? displayName;
  const { following, followers, loading, error, refetch } = useFollowList(params.uid ?? null);

  const [tab, setTab] = useState<Tab>(params.tab === 'followers' ? 'followers' : 'following');
  // Optimistic follow-state overlay by user_id — applies across both tabs.
  // 3-state (⑥ fix, 2026-07-14 — the rows had cloned the pre-승인제 2-state
  // toggle): 202 → 요청됨, 409 follow_request_pending → adopt, matching
  // user-profile; 요청됨 persists via the pending-follows cache.
  type FollowBtnState = 'following' | 'requested' | 'none';
  const [overlay, setOverlay] = useState<Record<string, FollowBtnState>>({});
  const pendingIds = usePendingFollows(st_ => st_.ids);
  useEffect(() => { usePendingFollows.getState().hydrate(); }, []);
  // 팔로워 삭제 (DELETE /me/followers/{id}) — MY 팔로워 tab ONLY. Optimistic
  // removal by user_id with rollback; others' lists never expose it.
  const isOwnList = !params.uid;
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const stateFor = useCallback(
    (u: FollowUser): FollowBtnState =>
      overlay[u.user_id]
      ?? (u.is_following ? 'following' : pendingIds[u.user_id] ? 'requested' : 'none'),
    [overlay, pendingIds],
  );

  const toggle = useCallback((u: FollowUser) => {
    const cur = stateFor(u);
    if (cur === 'requested') {
      // 요청됨 → 취소 (DELETE /follow-request, idempotent-204)
      setOverlay(p => ({ ...p, [u.user_id]: 'none' }));
      usePendingFollows.getState().remove(u.user_id);
      apiFetch<void>(`/api/users/${u.user_id}/follow-request`, { method: 'DELETE' })
        .catch((e: unknown) => {
          setOverlay(p => ({ ...p, [u.user_id]: cur })); // rollback
          usePendingFollows.getState().add(u.user_id);
          Alert.alert(t('fr.failTitle'), e instanceof Error ? e.message : t('runSave.saveFailBody'));
        });
      return;
    }
    if (cur === 'following') {
      setOverlay(p => ({ ...p, [u.user_id]: 'none' }));
      apiFetch<void>(`/api/users/${u.user_id}/follow`, { method: 'DELETE' })
        .catch((e: unknown) => {
          setOverlay(p => ({ ...p, [u.user_id]: cur })); // rollback
          Alert.alert(t('fr.failTitle'), e instanceof Error ? e.message : t('runSave.saveFailBody'));
        });
      return;
    }
    // 팔로우: 200/204 = followed (open account) · 202 = 승인 대기 →
    // 요청됨 · 409 follow_request_pending = already pending → adopt
    setOverlay(p => ({ ...p, [u.user_id]: 'following' }));
    apiRequest<void>(`/api/users/${u.user_id}/follow`, { method: 'POST' })
      .then(({ status }) => {
        if (status === 202) {
          setOverlay(p => ({ ...p, [u.user_id]: 'requested' }));
          usePendingFollows.getState().add(u.user_id); // survives re-entry
          return;
        }
        usePendingFollows.getState().remove(u.user_id); // stale pending cleared
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.code === 'follow_request_pending') {
          setOverlay(p => ({ ...p, [u.user_id]: 'requested' })); // server knew better
          usePendingFollows.getState().add(u.user_id);
          return;
        }
        setOverlay(p => ({ ...p, [u.user_id]: cur })); // rollback
        Alert.alert(t('fr.failTitle'), e instanceof Error ? e.message : t('runSave.saveFailBody'));
      });
  }, [stateFor]);

  // 삭제 ≠ 차단: removal just drops them; they can re-follow freely — and if my
  // account is private now, that re-follow lands as a REQUEST (approval-unified).
  const confirmRemove = useCallback((u: FollowUser) => {
    Alert.alert(
      t('fl.removeAsk'),
      tf('fl.removeSub', { name: u.nickname ?? t('fl.thisRunner') }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'), style: 'destructive',
          onPress: () => {
            setRemoved(p => new Set(p).add(u.user_id)); // optimistic
            apiFetch<void>(`/api/me/followers/${u.user_id}`, { method: 'DELETE' })
              .catch((e: unknown) => {
                setRemoved(p => { const n = new Set(p); n.delete(u.user_id); return n; }); // rollback
                Alert.alert(t('fl.removeFail'), e instanceof Error ? e.message : t('runSave.saveFailBody'));
              });
          },
        },
      ],
    );
  }, []);

  // MY 팔로워 tab shows the 삭제 affordance; the count follows the optimistic list.
  const visibleFollowers = followers.filter(u => !removed.has(u.user_id));
  const showRemove = isOwnList && tab === 'followers';
  const list = tab === 'following' ? following : visibleFollowers;

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
          ['following', T('fl.tabFollowing'), following.length],
          ['followers', T('fl.tabFollowers'), visibleFollowers.length],
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
          <Pressable onPress={refetch} style={st.retryBtn}><Text style={st.retryTxt}>{T('common.retry')}</Text></Pressable>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={u => u.user_id}
          contentContainerStyle={{ paddingHorizontal: S.gutter, paddingTop: 16, paddingBottom: 28, gap: 10 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const fs = stateFor(item);
            return (
              <View style={[st.row, shadows.sm]}>
                {/* Row body navigates (canvas: tappable-name zone); pill stays
                    its own button — no chevron per owner call */}
                <Pressable
                  onPress={() => openProfile(item.user_id, item.nickname)}
                  style={({ pressed }) => [st.rowBody, pressed && { opacity: 0.7 }]}
                >
                  <Avatar name={item.nickname} size={44} photoUrl={item.avatar_url} ring={C.border} ringWidth={1} initialsRatio={0.4} upper />
                  <Text style={st.rowName} numberOfLines={1}>{item.nickname ?? T('home.runner')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => toggle(item)}
                  style={[st.followBtn, fs !== 'none' ? st.followBtnOn : st.followBtnOff]}
                  hitSlop={6}
                >
                  <Text style={[st.followTxt, { color: fs !== 'none' ? C.sub : C.accentText }]}>
                    {fs === 'following' ? T('fr.following') : fs === 'requested' ? T('fl.requestedCancel') : T('fr.follow')}
                  </Text>
                </Pressable>
                {showRemove && (
                  <Pressable onPress={() => confirmRemove(item)} style={st.removeBtn} hitSlop={6}>
                    <Text style={st.removeTxt}>{T('fl.remove')}</Text>
                  </Pressable>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={st.centered}>
              <Icon name="people-outline" size={36} color={C.faint} />
              <Text style={st.stateTxt}>{tab === 'following' ? T('fl.emptyFollowing') : T('fl.emptyFollowers')}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
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
  removeBtn:    { flexShrink: 0, height: 34, paddingHorizontal: 13, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.danger },
  removeTxt:    { fontSize: 12.5, fontWeight: '700', color: C.danger, letterSpacing: -0.2 },

  centered: { alignItems: 'center', gap: 12, paddingVertical: 60 },
  stateTxt: { fontSize: 14, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: R.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  retryTxt: { fontSize: 14, fontWeight: '700', color: C.text },
});
