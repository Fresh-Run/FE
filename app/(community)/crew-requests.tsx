/**
 * 가입 요청 — owner-side 신청 관리 (canvas FrCrewRequests, community-screen.jsx;
 * M-tier from the consumption audit — the requester flow shipped in M3, this
 * is the approver side).
 *
 * Contract (guide §200-201, probed live 2026-07-15): list = PENDING only,
 * newest first, owner-only (403); approve → 204 + join_approved fan-out +
 * member add (409 = 정원 초과, request stays pending); reject → 204, SILENT
 * to the requester by design. Canvas parity notes: the canvas row's sub line
 * (r.sub) has no payload source → omitted; payload carries no avatar_url
 * (지연-observation, ledgered) → initials avatar; canvas has NO confirms —
 * 수락 follows canvas (recoverable via kick), 거절 gets a light confirm
 * (owner-directive "appropriate confirms": a mis-tap silently rejects).
 */
import { useFocusEffect } from '@react-navigation/native';
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
import { ApiError } from '@/lib/api';
import {
  approveJoinRequest,
  listJoinRequests,
  rejectJoinRequest,
  type CrewJoinRequest,
} from '@/lib/crews-api';
import { avatarBg } from '@/lib/fr-hash';
import { openProfile } from '@/lib/profile-nav';
import { fmtAgo } from '@/lib/run-format';
import { colors as C, shadows, spacing as S } from '@/lib/theme';

export default function CrewRequestsScreen() {
  const insets = useSafeAreaInsets();
  const { crewId } = useLocalSearchParams<{ crewId: string }>();

  const [rows, setRows] = useState<CrewJoinRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!crewId) return;
    listJoinRequests(crewId)
      .then(list => { setRows(list); setError(null); })
      .catch(e => setError(e instanceof Error ? e.message : '요청을 불러올 수 없어요'));
  }, [crewId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function approve(r: CrewJoinRequest) {
    setBusyId(r.id);
    try {
      await approveJoinRequest(crewId!, r.id);
      setRows(prev => (prev ?? []).filter(x => x.id !== r.id));
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 409) {
        // 정원 초과 — the request stays pending server-side (contract)
        Alert.alert('정원 초과', '크루 정원이 가득 차 승인할 수 없어요. 요청은 대기 상태로 유지돼요.');
      } else if (e instanceof ApiError && e.status === 404) {
        load(); // already decided elsewhere — stale row, refresh
      } else {
        Alert.alert('승인 실패', e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요');
      }
    } finally {
      setBusyId(null);
    }
  }

  function confirmReject(r: CrewJoinRequest) {
    const name = r.nickname ?? '러너';
    Alert.alert('가입 요청을 거절할까요?', `${name}님에게 알림은 가지 않고, 다시 신청할 수 있어요.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '거절', style: 'destructive',
        onPress: async () => {
          setBusyId(r.id);
          try {
            await rejectJoinRequest(crewId!, r.id);
            setRows(prev => (prev ?? []).filter(x => x.id !== r.id));
          } catch (e: unknown) {
            if (e instanceof ApiError && e.status === 404) load();
            else Alert.alert('거절 실패', e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  }

  const count = rows?.length ?? 0;

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      {/* App bar — count pill on the right (canvas) */}
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>가입 요청</Text>
        <View style={st.backBtn}>
          {count > 0 && (
            <View style={st.countPill}><Text style={st.countTxt}>{count}</Text></View>
          )}
        </View>
      </View>

      {error ? (
        <View style={st.centered}>
          <Icon name="warning-outline" size={34} color={C.faint} />
          <Text style={st.stateTxt}>{error}</Text>
          <Pressable onPress={load} style={st.retryBtn}><Text style={st.retryTxt}>다시 시도</Text></Pressable>
        </View>
      ) : rows === null ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={r => r.id}
          contentContainerStyle={{ padding: S.gutter, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={st.centered}>
              <View style={st.emptyIcon}><Icon name="checkmark" size={26} color={C.faint} /></View>
              <Text style={st.stateTxt}>대기 중인 가입 요청이 없어요.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const name = item.nickname ?? '러너';
            const busy = busyId === item.id;
            return (
              <View style={[st.card, shadows.sm]}>
                <Pressable
                  onPress={() => openProfile(item.user_id, item.nickname)}
                  style={({ pressed }) => [st.cardHead, pressed && { opacity: 0.7 }]}
                >
                  {/* Initials only — payload carries no avatar_url (ledgered) */}
                  <View style={[st.avatar, { backgroundColor: avatarBg(name) }]}>
                    <Text style={st.avatarTxt}>{name.trim()[0]?.toUpperCase() ?? '?'}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <Text style={st.name} numberOfLines={1}>{name}</Text>
                    <Text style={st.when}>{fmtAgo(item.created_at)}</Text>
                  </View>
                </Pressable>
                {busy ? (
                  <ActivityIndicator size="small" color={C.faint} style={{ marginTop: 13, height: 42 }} />
                ) : (
                  <View style={st.btnRow}>
                    <Pressable onPress={() => approve(item)} style={({ pressed }) => [st.acceptBtn, pressed && { opacity: 0.85 }]}>
                      <Icon name="checkmark" size={15} color={C.accentText} />
                      <Text style={st.acceptTxt}>수락</Text>
                    </Pressable>
                    <Pressable onPress={() => confirmReject(item)} style={({ pressed }) => [st.rejectBtn, pressed && { opacity: 0.7 }]}>
                      <Text style={st.rejectTxt}>거절</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          }}
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
  countPill:   { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  countTxt:    { fontSize: 12, fontWeight: '800', color: '#fff' },

  centered: { paddingTop: 60, alignItems: 'center', gap: 13, paddingHorizontal: 24 },
  emptyIcon: { width: 54, height: 54, borderRadius: 16, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  stateTxt: { fontSize: 14, color: C.sub, letterSpacing: -0.2, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  retryTxt: { fontSize: 14, fontWeight: '700', color: C.text },

  card:     { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 15 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar:    { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 17, fontWeight: '700', color: '#fff' },
  name: { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.3, flexShrink: 1 },
  when: { fontSize: 11.5, color: C.faint, flexShrink: 0 },

  btnRow:    { flexDirection: 'row', gap: 9, marginTop: 13 },
  acceptBtn: { flex: 1, height: 42, borderRadius: 12, backgroundColor: C.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  acceptTxt: { fontSize: 14, fontWeight: '700', color: C.accentText, letterSpacing: -0.2 },
  rejectBtn: { flex: 1, height: 42, borderRadius: 12, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  rejectTxt: { fontSize: 14, fontWeight: '700', color: C.sub, letterSpacing: -0.2 },
});
