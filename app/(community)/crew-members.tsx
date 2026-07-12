/**
 * 크루원 관리 (M3) — FrCrewManage's buildable subset on admin v1
 * (BE f68a48f). Owner: 운영진 지정/해제 (PATCH role, 멱등; owner target is
 * a server 422 — no affordance rendered) + 강퇴. Admin: 강퇴 on members
 * only — admin/owner targets render DISABLED affordances (the 403
 * semantics made visible, not error surprises). Self never shows actions.
 *
 * FrCrewPerms per-admin permission toggles are OUT — 지연's admin v2
 * boundary; this screen stops at the single admin role.
 */
import { router, useLocalSearchParams } from 'expo-router';
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
import { getCrewMembers, kickMember, setMemberRole, transferCrew, type CrewMember } from '@/lib/crews-api';
import { avatarBg } from '@/lib/fr-hash';
import { openProfile } from '@/lib/profile-nav';
import { supabase } from '@/lib/supabase';
import { colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';

// avatar wire-up (BE 5009cbe): photo wins over initials; load failure
// falls back to initials — never a broken image.
function MemberAvatar({ name, photoUrl, style, txtStyle }: {
  name: string | null; photoUrl?: string | null;
  style: object; txtStyle: object;
}) {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  if (photoUrl && photoUrl !== brokenUrl) {
    return <Image source={{ uri: photoUrl }} onError={() => setBrokenUrl(photoUrl)} style={style} />;
  }
  const n = name || '러너';
  return (
    <View style={[style, { backgroundColor: avatarBg(n), alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={txtStyle}>{n[0]}</Text>
    </View>
  );
}

const ROLE_BADGE: Record<CrewMember['role'], { label: string; bg: string; fg: string }> = {
  owner:  { label: '크루장', bg: '#E8B53D', fg: '#0D1A06' },
  admin:  { label: '운영진', bg: '#3D8BFF22', fg: '#3D8BFF' },
  member: { label: '멤버',   bg: 'transparent', fg: 'transparent' }, // no badge
};

export default function CrewMembersScreen() {
  const insets = useSafeAreaInsets();
  const { crewId } = useLocalSearchParams<{ crewId: string }>();

  const [members, setMembers] = useState<CrewMember[] | null>(null);
  const [myUid, setMyUid]     = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!crewId) return;
    getCrewMembers(crewId).then(setMembers).catch(() => setMembers([]));
  }, [crewId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setMyUid(user?.id ?? null));
  }, []);

  const myRole = members?.find(m => m.user_id === myUid)?.role;
  const iAmOwner = myRole === 'owner';
  const iAmAdmin = myRole === 'admin';

  async function changeRole(m: CrewMember, role: 'admin' | 'member') {
    setBusyUid(m.user_id);
    try {
      await setMemberRole(crewId!, m.user_id, role);
      load();
    } catch (e: unknown) {
      Alert.alert('변경 실패', e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요.');
    } finally {
      setBusyUid(null);
    }
  }

  function confirmRole(m: CrewMember) {
    const promoting = m.role === 'member';
    Alert.alert(
      promoting ? '운영진으로 지정할까요?' : '운영진을 해제할까요?',
      promoting
        ? `${m.nickname}님이 공지 작성·수정·삭제, 챌린지 생성, 멤버 강퇴를 할 수 있게 돼요.`
        : `${m.nickname}님의 운영진 권한을 해제해요.`,
      [
        { text: '취소', style: 'cancel' },
        { text: promoting ? '지정' : '해제', onPress: () => changeRole(m, promoting ? 'admin' : 'member') },
      ],
    );
  }

  // 크루 양도 (S-batch #4): owner-only, destructive-confirm — you stop
  // being owner (leave_after=false: you stay as a regular member).
  function confirmTransfer(m: CrewMember) {
    Alert.alert(
      '크루장을 양도할까요?',
      `${m.nickname}님이 새 크루장이 되고, 나는 일반 멤버가 돼요. 되돌리려면 새 크루장이 다시 양도해야 해요.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '양도', style: 'destructive',
          onPress: async () => {
            setBusyUid(m.user_id);
            try {
              await transferCrew(crewId!, m.user_id);
              load(); // roles re-render from server truth; my actions vanish
            } catch (e: unknown) {
              Alert.alert('양도 실패', e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요.');
            } finally {
              setBusyUid(null);
            }
          },
        },
      ],
    );
  }

  function confirmKick(m: CrewMember) {
    Alert.alert('크루에서 내보낼까요?', `${m.nickname}님을 크루에서 내보내요. 다시 가입할 수는 있어요.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '내보내기', style: 'destructive',
        onPress: async () => {
          setBusyUid(m.user_id);
          try {
            await kickMember(crewId!, m.user_id);
            load();
          } catch (e: unknown) {
            Alert.alert('내보내기 실패', e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요.');
          } finally {
            setBusyUid(null);
          }
        },
      },
    ]);
  }

  /** Authorization matrix → affordances. Disabled = visible but inert
      (the server's 403 semantics, surfaced honestly). */
  function actionsFor(m: CrewMember): { role?: boolean; kick?: 'enabled' | 'disabled'; transfer?: boolean } {
    if (m.user_id === myUid) return {};              // self — never
    if (iAmOwner) {
      if (m.role === 'owner') return {};             // cannot occur (self is owner)
      return { role: true, kick: 'enabled', transfer: true };
    }
    if (iAmAdmin) {
      if (m.role === 'member') return { kick: 'enabled' };
      return { kick: 'disabled' };                   // admin/owner target → 403
    }
    return {};                                       // plain member — read-only
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>크루원 관리</Text>
        <View style={{ width: 36 }} />
      </View>

      {members === null ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={m => m.user_id}
          renderItem={({ item: m }) => {
            const acts = actionsFor(m);
            const badge = ROLE_BADGE[m.role];
            const busy = busyUid === m.user_id;
            return (
              <View style={[st.row, shadows.sm]}>
                <Pressable
                  onPress={() => openProfile(m.user_id, m.nickname)}
                  style={({ pressed }) => [st.rowBody, pressed && { opacity: 0.7 }]}
                >
                  <MemberAvatar name={m.nickname} photoUrl={m.avatar_url} style={st.avatar} txtStyle={st.avatarTxt} />
                  <Text style={st.name} numberOfLines={1}>{m.nickname}</Text>
                  {m.role !== 'member' && (
                    <View style={[st.badge, { backgroundColor: badge.bg }]}>
                      <Text style={[st.badgeTxt, { color: badge.fg }]}>{badge.label}</Text>
                    </View>
                  )}
                </Pressable>

                {busy ? (
                  <ActivityIndicator size="small" color={C.faint} />
                ) : (
                  <View style={st.actions}>
                    {acts.role && (
                      <Pressable onPress={() => confirmRole(m)} hitSlop={6} style={({ pressed }) => [st.actBtn, pressed && { opacity: 0.7 }]}>
                        <Text style={st.actTxt}>{m.role === 'admin' ? '운영진 해제' : '운영진 지정'}</Text>
                      </Pressable>
                    )}
                    {acts.transfer && (
                      <Pressable onPress={() => confirmTransfer(m)} hitSlop={6} style={({ pressed }) => [st.actBtn, pressed && { opacity: 0.7 }]}>
                        <Text style={st.actTxt}>양도</Text>
                      </Pressable>
                    )}
                    {acts.kick && (
                      <Pressable
                        onPress={acts.kick === 'enabled' ? () => confirmKick(m) : undefined}
                        disabled={acts.kick === 'disabled'}
                        hitSlop={6}
                        style={({ pressed }) => [
                          st.actBtn, st.actBtnDanger,
                          acts.kick === 'disabled' && { opacity: 0.35 },
                          pressed && acts.kick === 'enabled' && { opacity: 0.7 },
                        ]}
                      >
                        <Text style={[st.actTxt, { color: C.danger }]}>내보내기</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          contentContainerStyle={{ padding: S.gutter, paddingBottom: 40 }}
          ListFooterComponent={
            iAmAdmin ? (
              <Text style={st.footNote}>운영진은 멤버만 내보낼 수 있어요 · 운영진 지정은 크루장만</Text>
            ) : null
          }
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

  centered: { paddingTop: 70, alignItems: 'center' },

  row:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.xl, paddingVertical: 11, paddingHorizontal: 13 },
  rowBody: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar:    { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },
  name:      { flexShrink: 1, fontSize: 14.5, fontWeight: '600', color: C.text, letterSpacing: -0.3 },
  badge:     { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeTxt:  { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },

  actions:      { flexDirection: 'row', gap: 6 },
  actBtn:       { borderWidth: 1, borderColor: C.border, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: C.surfaceAlt },
  actBtnDanger: { borderColor: '#EF444440' },
  actTxt:       { fontSize: 11.5, fontWeight: '700', color: C.sub, letterSpacing: -0.2 },

  footNote: { textAlign: 'center', fontSize: 11.5, color: C.faint, letterSpacing: -0.2, paddingTop: 14 },
});
