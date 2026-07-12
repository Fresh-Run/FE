/**
 * 크루 공지 상세 (M1) — body + 러닝 일정 card (place map when coords exist)
 * + RSVP 3-state poll (server contract: going/not_going/maybe, re-vote
 * overwrites; canvas's 2-option poll adapted per the approved decision) +
 * going_members roster. 수정/삭제 = owner||admin — role computed HERE from
 * the members list (server truth) so the notification deep-link path gets
 * full function without param threading.
 */
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RealMap } from '@/components/real-map';
import { Icon } from '@/components/ui';
import {
  deleteAnnouncement,
  getAnnouncement,
  rsvpAnnouncement,
  type AnnouncementDetail,
  type RsvpStatus,
} from '@/lib/announcements-api';
import { getCrewMembers } from '@/lib/crews-api';
import { avatarBg } from '@/lib/fr-hash';
import { fmtWhen } from '@/lib/run-format';
import { supabase } from '@/lib/supabase';
import { colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';

// avatar wire-up (BE 5009cbe): author photo wins over initials; load
// failure falls back to initials — never a broken image.
function AuthorAvatar({ name, photoUrl, size }: { name: string; photoUrl?: string | null; size: number }) {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  if (photoUrl && photoUrl !== brokenUrl) {
    return <Image source={{ uri: photoUrl }} onError={() => setBrokenUrl(photoUrl)} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: avatarBg(name), alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.5, fontWeight: '700', color: '#fff' }}>{name[0]}</Text>
    </View>
  );
}

const RSVP_OPTS: { value: RsvpStatus; label: string }[] = [
  { value: 'going',     label: '참석' },
  { value: 'maybe',     label: '미정' },
  { value: 'not_going', label: '불참' },
];

function fmtRunAt(iso: string): string {
  const d = new Date(iso);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]}) ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function AnnouncementDetailScreen() {
  const insets = useSafeAreaInsets();
  const { crewId, announcementId } = useLocalSearchParams<{ crewId: string; announcementId: string }>();

  const [ann, setAnn]         = useState<AnnouncementDetail | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [voting, setVoting]   = useState(false);

  const load = useCallback(() => {
    if (!crewId || !announcementId) return;
    getAnnouncement(crewId, announcementId)
      .then(setAnn)
      .catch(() => setError('공지를 불러올 수 없어요'));
  }, [crewId, announcementId]);
  useEffect(() => { load(); }, [load]);

  // Role from server truth — enables 수정/삭제 on the deep-link path too.
  // Focus-retry (debt batch 1): a transient failure here silently stripped
  // the owner's 수정/삭제 for the visit — refocus now re-derives the role.
  useFocusEffect(useCallback(() => {
    if (!crewId) return;
    let cancelled = false;
    (async () => {
      const [{ data: { user } }, members] = await Promise.all([
        supabase.auth.getUser(),
        getCrewMembers(crewId),
      ]);
      if (cancelled) return;
      const role = members.find(m => m.user_id === user?.id)?.role;
      setCanManage(role === 'owner' || role === 'admin');
    })().catch(() => { /* refocus retries; buttons appear then */ });
    return () => { cancelled = true; };
  }, [crewId]));

  async function vote(status: RsvpStatus) {
    if (!ann || voting || !ann.rsvp_open) return;
    setVoting(true);
    try {
      await rsvpAnnouncement(crewId!, ann.id, status);
      load(); // counts + roster need server truth after an overwrite vote
    } catch {
      Alert.alert('투표 실패', '참석 투표를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setVoting(false);
    }
  }

  function confirmDelete() {
    Alert.alert('공지를 삭제할까요?', '삭제한 공지는 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive',
        onPress: () => deleteAnnouncement(crewId!, announcementId!)
          .then(() => router.back())
          .catch(() => Alert.alert('삭제 실패', '잠시 후 다시 시도해 주세요.')),
      },
    ]);
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.iconBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>공지</Text>
        {canManage && ann ? (
          <View style={{ flexDirection: 'row' }}>
            <Pressable
              onPress={() => router.push({
                pathname: '/(community)/announcement-compose' as never,
                params: { crewId: crewId!, announcementId: ann.id },
              })}
              hitSlop={6}
              style={st.iconBtn}
            >
              <Icon name="create-outline" size={19} color={C.text} />
            </Pressable>
            <Pressable onPress={confirmDelete} hitSlop={6} style={st.iconBtn}>
              <Icon name="trash-outline" size={18} color={C.danger} />
            </Pressable>
          </View>
        ) : <View style={{ width: 36 }} />}
      </View>

      {error ? (
        <Text style={st.stateTxt}>{error}</Text>
      ) : !ann ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: S.gutter, paddingBottom: 40 }}>
          <Text style={st.title}>{ann.title}</Text>
          <View style={st.metaRow}>
            <AuthorAvatar name={ann.author_nickname ?? '크루장'} photoUrl={ann.author_avatar_url} size={20} />
            <Text style={st.meta}>{ann.author_nickname ?? '크루장'} · {fmtWhen(ann.created_at)}</Text>
          </View>
          <Text style={st.body}>{ann.body}</Text>

          {/* 러닝 일정 — only when scheduled */}
          {ann.run_at ? (
            <View style={[st.scheduleCard, shadows.sm]}>
              <View style={st.scheduleRow}>
                <Icon name="calendar-outline" size={15} color={C.accentGrn} />
                <Text style={st.scheduleTxt}>{fmtRunAt(ann.run_at)}</Text>
              </View>
              {ann.place_name ? (
                <View style={st.scheduleRow}>
                  <Icon name="location-outline" size={15} color={C.accentGrn} />
                  <Text style={st.scheduleTxt}>{ann.place_name}</Text>
                </View>
              ) : null}
              {ann.place_lat != null && ann.place_lng != null ? (
                <View style={st.mapWrap}>
                  <RealMap height={120} center={{ lat: ann.place_lat, lng: ann.place_lng }} borderRadius={12} />
                </View>
              ) : null}

              {/* RSVP — 3-state, re-vote overwrites */}
              <View style={st.rsvpRow}>
                {RSVP_OPTS.map(o => {
                  const mine = ann.my_rsvp === o.value;
                  const count = ann.rsvp[o.value];
                  return (
                    <Pressable
                      key={o.value}
                      onPress={() => vote(o.value)}
                      disabled={voting || !ann.rsvp_open}
                      style={({ pressed }) => [
                        st.rsvpBtn,
                        mine && st.rsvpBtnMine,
                        !ann.rsvp_open && { opacity: 0.55 },
                        pressed && { opacity: 0.75 },
                      ]}
                    >
                      <Text style={[st.rsvpLabel, mine && { color: C.accentGrn }]}>{o.label}</Text>
                      <Text style={[st.rsvpCount, mine && { color: C.accentGrn }]}>{count}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {!ann.rsvp_open && <Text style={st.closedTxt}>참석 투표가 마감됐어요</Text>}

              {/* 참석 roster */}
              {ann.going_members.length > 0 && (
                <View style={st.rosterWrap}>
                  <Text style={st.rosterHead}>참석 {ann.going_members.length}명</Text>
                  <View style={st.rosterRow}>
                    {ann.going_members.map(m => {
                      const name = m.nickname ?? '러너';
                      return (
                        <View key={m.user_id} style={st.rosterChip}>
                          <View style={[st.rosterAvatar, { backgroundColor: avatarBg(name) }]}>
                            <Text style={st.rosterAvatarTxt}>{name[0]}</Text>
                          </View>
                          <Text style={st.rosterName} numberOfLines={1}>{name}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.gutter, paddingVertical: 10 },
  iconBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },

  centered: { paddingTop: 70, alignItems: 'center' },
  stateTxt: { textAlign: 'center', paddingTop: 60, fontSize: 14, color: C.faint },

  title: { fontSize: 20, fontWeight: '700', color: C.text, letterSpacing: -0.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  meta:  { fontSize: 12, color: C.faint, letterSpacing: -0.2 },
  body:  { fontSize: 14.5, color: C.sub, letterSpacing: -0.2, lineHeight: 22, marginTop: 14 },

  scheduleCard: { marginTop: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.xl, padding: 14, gap: 10 },
  scheduleRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scheduleTxt:  { fontSize: 14, fontWeight: '600', color: C.text, letterSpacing: -0.3 },
  mapWrap:      { borderRadius: 12, overflow: 'hidden' },

  rsvpRow:     { flexDirection: 'row', gap: 8, marginTop: 4 },
  rsvpBtn:     { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: R.md, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surfaceAlt },
  rsvpBtnMine: { borderColor: C.accent, backgroundColor: C.accentDim },
  rsvpLabel:   { fontSize: 13.5, fontWeight: '700', color: C.sub, letterSpacing: -0.2 },
  rsvpCount:   { fontSize: 12, fontWeight: '600', color: C.faint, marginTop: 2 },
  closedTxt:   { fontSize: 11.5, color: C.faint, letterSpacing: -0.2, textAlign: 'center' },

  rosterWrap: { marginTop: 4 },
  rosterHead: { fontSize: 12.5, fontWeight: '700', color: C.text, letterSpacing: -0.2, marginBottom: 8 },
  rosterRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rosterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surfaceAlt, borderRadius: R.pill, paddingVertical: 4, paddingLeft: 4, paddingRight: 10, maxWidth: 140 },
  rosterAvatar:    { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rosterAvatarTxt: { fontSize: 10, fontWeight: '700', color: '#fff' },
  rosterName:      { fontSize: 12, fontWeight: '600', color: C.sub, letterSpacing: -0.2, flexShrink: 1 },
});
