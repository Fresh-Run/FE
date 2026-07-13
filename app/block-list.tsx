/**
 * 차단 관리 — the blocked-users list (⑨'s last parity row). Reached from
 * 프로필 설정 → 차단 관리. GET /me/blocks (newest first); per-row 차단 해제
 * (DELETE /users/{id}/block, idempotent). Unblock does NOT restore any prior
 * follow (policy) — so no follow affordance here, just removal from the list.
 * Optimistic removal by user_id with rollback; honest empty state.
 */
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
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

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/ui';
import { listBlocks, unblockUser, type BlockedUser } from '@/lib/blocks-api';
import { colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';

export default function BlockListScreen() {
  const insets = useSafeAreaInsets();
  const [rows, setRows]   = useState<BlockedUser[] | null>(null);
  const [error, setError] = useState(false);
  // Optimistic unblock overlay by user_id (row drops immediately, rolls back on fail)
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setError(false);
    listBlocks()
      .then(setRows)
      .catch(() => { setRows([]); setError(true); });
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const confirmUnblock = useCallback((u: BlockedUser) => {
    Alert.alert(
      `${u.nickname ?? '이 러너'}님 차단을 해제할까요?`,
      '다시 서로의 프로필과 러닝을 볼 수 있어요. 예전 팔로우 관계는 자동으로 복구되지 않아요 — 필요하면 다시 팔로우해 주세요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '차단 해제',
          onPress: () => {
            setRemoved(p => new Set(p).add(u.user_id)); // optimistic
            unblockUser(u.user_id).catch((e: unknown) => {
              setRemoved(p => { const n = new Set(p); n.delete(u.user_id); return n; }); // rollback
              Alert.alert('차단 해제 실패', e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요.');
            });
          },
        },
      ],
    );
  }, []);

  const visible = (rows ?? []).filter(u => !removed.has(u.user_id));

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>차단 관리</Text>
        <View style={{ width: 40 }} />
      </View>

      {rows === null ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : visible.length === 0 ? (
        <View style={st.centered}>
          <Icon name={error ? 'warning-outline' : 'shield-checkmark-outline'} size={36} color={C.faint} />
          <Text style={st.stateTxt}>{error ? '목록을 불러오지 못했어요' : '차단한 사용자가 없어요'}</Text>
          {error && <Pressable onPress={load} style={st.retryBtn}><Text style={st.retryTxt}>다시 시도</Text></Pressable>}
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={u => u.user_id}
          contentContainerStyle={{ paddingHorizontal: S.gutter, paddingTop: 16, paddingBottom: 28, gap: 10 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={[st.row, shadows.sm]}>
              <Avatar name={item.nickname} size={44} photoUrl={item.avatar_url} ring={C.border} ringWidth={1} initialsRatio={0.4} upper />
              <Text style={st.rowName} numberOfLines={1}>{item.nickname ?? '러너'}</Text>
              <Pressable onPress={() => confirmUnblock(item)} style={st.unblockBtn} hitSlop={6}>
                <Text style={st.unblockTxt}>차단 해제</Text>
              </Pressable>
            </View>
          )}
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

  row:     { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingVertical: 11, paddingHorizontal: 13 },
  rowName: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.3 },

  unblockBtn: { flexShrink: 0, height: 34, paddingHorizontal: 14, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  unblockTxt: { fontSize: 12.5, fontWeight: '700', color: C.text, letterSpacing: -0.2 },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 40 },
  stateTxt: { fontSize: 14, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: R.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  retryTxt: { fontSize: 14, fontWeight: '700', color: C.text },
});
