/**
 * 크루 공지 목록 (M1) — full announcement list for a crew.
 * Members-only server-side (403 outside — the entry only renders for
 * members). 작성 = owner||admin (BE f68a48f permissions). List paginates
 * limit/offset; the 6-cap/auto-expire canvas rule is NOT enforced —
 * client displays what the server returns (pending 지연's ② answer).
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/ui';
import { listAnnouncements, type Announcement } from '@/lib/announcements-api';
import { fmtWhen } from '@/lib/run-format';
import { colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';

function fmtRunAt(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function AnnouncementsScreen() {
  const insets = useSafeAreaInsets();
  const { crewId, canManage } = useLocalSearchParams<{ crewId: string; canManage?: string }>();
  const manager = canManage === '1';

  const [rows, setRows]       = useState<Announcement[] | null>(null);
  const [error, setError]     = useState(false);

  const load = useCallback(() => {
    if (!crewId) return;
    setError(false);
    listAnnouncements(crewId, 50)
      .then(setRows)
      .catch(() => { setRows([]); setError(true); });
  }, [crewId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>크루 공지</Text>
        {manager ? (
          <Pressable
            onPress={() => router.push({ pathname: '/(community)/announcement-compose' as never, params: { crewId: crewId! } })}
            hitSlop={8}
            style={st.composeBtn}
          >
            <Icon name="create-outline" size={20} color={C.accentGrn} />
          </Pressable>
        ) : <View style={{ width: 36 }} />}
      </View>

      {rows === null ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={a => a.id}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({
                pathname: '/(community)/announcement-detail' as never,
                params: { crewId: crewId!, announcementId: item.id },
              })}
              style={({ pressed }) => [st.row, shadows.sm, pressed && { opacity: 0.8 }]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.rowTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={st.rowBody} numberOfLines={2}>{item.body}</Text>
                <View style={st.rowMeta}>
                  {item.run_at ? (
                    <View style={st.runAtChip}>
                      <Icon name="calendar-outline" size={11} color={C.accentGrn} />
                      <Text style={st.runAtTxt}>{fmtRunAt(item.run_at)}</Text>
                    </View>
                  ) : null}
                  <Avatar name={item.author_nickname ?? '크루장'} photoUrl={item.author_avatar_url} size={16} initialsRatio={0.5} />
                  <Text style={st.metaTxt}>
                    {item.author_nickname ?? '크루장'} · {fmtWhen(item.created_at)}
                    {item.run_at ? ` · 참석 ${item.rsvp.going}` : ''}
                  </Text>
                </View>
              </View>
              <Icon name="chevron-forward" size={16} color={C.faint} />
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          contentContainerStyle={{ padding: S.gutter, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={st.centered}>
              <Icon name="megaphone-outline" size={34} color={C.faint} />
              <Text style={st.emptyTxt}>
                {error ? '공지를 불러올 수 없어요' : manager ? '공지를 올려 크루원에게 소식을 전해보세요' : '아직 공지가 없어요'}
              </Text>
            </View>
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
  composeBtn:  { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  centered: { paddingTop: 70, alignItems: 'center', gap: 12 },
  emptyTxt: { fontSize: 13.5, color: C.faint, letterSpacing: -0.2, textAlign: 'center', paddingHorizontal: 30, lineHeight: 20 },

  row:      { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.xl, padding: 14 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  rowBody:  { fontSize: 13, color: C.sub, letterSpacing: -0.2, lineHeight: 18, marginTop: 4 },
  rowMeta:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  runAtChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.accentDim, borderRadius: R.pill, paddingHorizontal: 8, paddingVertical: 3 },
  runAtTxt:  { fontSize: 11.5, fontWeight: '700', color: C.accentGrn, letterSpacing: -0.2 },
  metaTxt:   { fontSize: 11.5, color: C.faint, letterSpacing: -0.2 },
});
