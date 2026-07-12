/**
 * 팔로우 요청 — the 승인제 inbox (v2, BE 610c7f3). No canvas drawing exists
 * for this screen (v2 postdates the wave) — built in the crew-requests
 * screen's visual language, the app's request-inbox precedent.
 *
 * Doors: 알림 센터's follow_requested rows deep-link here (payload is null
 * by contract — the LIST is the target), and 프로필 설정's 팔로우 그룹 row.
 * 수락 = PATCH {approve:true} (follows 생성 + 알림) · 거절 = {approve:false}
 * (무알림). 없음/이미 처리 = 404 → the row just leaves (refetch), honest.
 */
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { avatarBg } from '@/lib/fr-hash';
import { listFollowRequests, respondFollowRequest, type FollowRequestItem } from '@/lib/profile-api';
import { openProfile } from '@/lib/profile-nav';
import { fmtWhen } from '@/lib/run-format';
import { colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';

function RequesterAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const [broken, setBroken] = useState(false);
  if (photoUrl && !broken) {
    return <Image source={{ uri: photoUrl }} onError={() => setBroken(true)} style={st.avatar} />;
  }
  return (
    <View style={[st.avatar, { backgroundColor: avatarBg(name), alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={st.avatarTxt}>{name[0]}</Text>
    </View>
  );
}

export default function FollowRequestsScreen() {
  const insets = useSafeAreaInsets();
  const [rows, setRows]   = useState<FollowRequestItem[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    listFollowRequests().then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function respond(item: FollowRequestItem, approve: boolean) {
    setBusyId(item.user_id);
    try {
      await respondFollowRequest(item.user_id, approve);
      setRows(prev => prev?.filter(r => r.user_id !== item.user_id) ?? null);
    } catch (e: unknown) {
      // 404 = already handled elsewhere — refetch shows the truth
      load();
      Alert.alert(approve ? '수락 실패' : '거절 실패',
        e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>팔로우 요청</Text>
        <Text style={st.appBarCount}>{rows ? `${rows.length}건` : ''}</Text>
      </View>

      {rows === null ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : rows.length === 0 ? (
        <View style={st.centered}>
          <Icon name="person-add-outline" size={36} color={C.faint} />
          <Text style={st.emptyTxt}>대기 중인 팔로우 요청이 없어요</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={r => r.user_id}
          renderItem={({ item }) => {
            const name = item.nickname ?? '러너';
            const busy = busyId === item.user_id;
            return (
              <View style={[st.row, shadows.sm]}>
                <Pressable
                  onPress={() => openProfile(item.user_id, name)}
                  style={({ pressed }) => [st.rowBody, pressed && { opacity: 0.7 }]}
                >
                  <RequesterAvatar name={name} photoUrl={item.avatar_url} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.name} numberOfLines={1}>{name}</Text>
                    <Text style={st.sub} numberOfLines={1}>
                      {fmtWhen(item.followed_at)}{item.is_following ? ' · 내가 팔로우하는 러너' : ''}
                    </Text>
                  </View>
                </Pressable>
                {busy ? (
                  <ActivityIndicator size="small" color={C.faint} />
                ) : (
                  <View style={st.actions}>
                    <Pressable onPress={() => respond(item, true)} hitSlop={6} style={({ pressed }) => [st.acceptBtn, pressed && { opacity: 0.85 }]}>
                      <Text style={st.acceptTxt}>수락</Text>
                    </Pressable>
                    <Pressable onPress={() => respond(item, false)} hitSlop={6} style={({ pressed }) => [st.rejectBtn, pressed && { opacity: 0.7 }]}>
                      <Text style={st.rejectTxt}>거절</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          contentContainerStyle={{ padding: S.gutter, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.gutter, paddingVertical: 10 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },
  appBarCount: { width: 36, textAlign: 'right', fontSize: 12.5, fontWeight: '700', color: C.faint },

  centered: { paddingTop: 80, alignItems: 'center', gap: 10 },
  emptyTxt: { fontSize: 14, color: C.faint, fontWeight: '600', letterSpacing: -0.2 },

  row:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.xl, paddingVertical: 11, paddingHorizontal: 13 },
  rowBody: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar:    { width: 42, height: 42, borderRadius: 21 },
  avatarTxt: { fontSize: 16, fontWeight: '700', color: '#fff' },
  name: { fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  sub:  { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },

  actions:   { flexDirection: 'row', gap: 6 },
  acceptBtn: { height: 34, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  acceptTxt: { fontSize: 12.5, fontWeight: '700', color: C.accentText, letterSpacing: -0.2 },
  rejectBtn: { height: 34, paddingHorizontal: 14, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  rejectTxt: { fontSize: 12.5, fontWeight: '700', color: C.sub, letterSpacing: -0.2 },
});
