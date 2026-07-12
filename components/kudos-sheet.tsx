/**
 * Likers bottom sheet (canvas: FrMyProfile likers sheet) — extracted from
 * my-profile.tsx at the ledger-scoped graduation moment (own-run social view
 * became the second consumer, 2026-07-12). Rows: initials avatar + name +
 * relative time; row tap → profile. The canvas 나-badge/heart-toggle variants
 * stay future feed-context work (original scoping note).
 */
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Avatar } from '@/components/avatar';
import { getRunKudos, type RunKudoser } from '@/lib/kudos-api';
import { openProfile } from '@/lib/profile-nav';
import { fmtAgo } from '@/lib/run-format';
import { colors as C, shadows } from '@/lib/theme';

export function KudosSheet({ runId, kudosCount, onClose }: {
  runId: string; kudosCount: number; onClose: () => void;
}) {
  const [rows, setRows]       = React.useState<RunKudoser[] | null>(null);
  const [failed, setFailed]   = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setFailed(false);
    getRunKudos(runId)
      .then(list => { if (!cancelled) setRows(list); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [runId, attempt]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={st.sheetRoot}>
        <Pressable style={st.sheetBackdrop} onPress={onClose} />
        <View style={st.sheet}>
          <View style={st.sheetHead}>
            <View style={st.grabBar} />
            <Text style={st.sheetTitle}>좋아요 {kudosCount}개</Text>
          </View>
          {failed ? (
            <View style={st.sheetState}>
              <Text style={st.stateTxt}>목록을 불러올 수 없어요</Text>
              <Pressable onPress={() => { setRows(null); setAttempt(a => a + 1); }} style={st.retryBtn}>
                <Text style={st.retryTxt}>다시 시도</Text>
              </Pressable>
            </View>
          ) : rows === null ? (
            <View style={st.sheetState}><ActivityIndicator color={C.accent} /></View>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={k => k.user_id}
              renderItem={({ item }) => (
                <View style={[st.likerRow, shadows.sm]}>
                  {/* Row body → profile (canvas tappable-name zone; self-case
                      can't occur — self-kudos is a server 400) */}
                  <Pressable
                    onPress={() => openProfile(item.user_id, item.nickname)}
                    style={({ pressed }) => [st.likerBody, pressed && { opacity: 0.7 }]}
                  >
                    <Avatar name={item.nickname} size={44} photoUrl={item.avatar_url} ring={C.border} initialsRatio={0.38} upper />
                    <Text style={st.likerName} numberOfLines={1}>{item.nickname}</Text>
                  </Pressable>
                  <Text style={st.likerWhen}>{fmtAgo(item.created_at)}</Text>
                </View>
              )}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              ListEmptyComponent={<Text style={[st.stateTxt, { textAlign: 'center' }]}>아직 좋아요가 없어요</Text>}
              contentContainerStyle={{ padding: 20, paddingTop: 14, paddingBottom: 28 }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  sheetRoot:     { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:         { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '68%' },
  sheetHead:     { paddingTop: 12, paddingBottom: 12, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: C.border },
  grabBar:       { width: 38, height: 5, borderRadius: 99, backgroundColor: C.border, alignSelf: 'center', marginBottom: 12 },
  sheetTitle:    { fontSize: 16, fontWeight: '700', letterSpacing: -0.4, color: C.text, textAlign: 'center' },
  sheetState:    { alignItems: 'center', gap: 12, paddingVertical: 40 },
  stateTxt:      { fontSize: 14, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },
  retryBtn:      { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  retryTxt:      { fontSize: 14, fontWeight: '700', color: C.text },

  likerRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingVertical: 11, paddingHorizontal: 13 },
  likerBody: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  likerName: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  likerWhen: { fontSize: 11.5, color: C.faint, letterSpacing: -0.2, flexShrink: 0 },
});
