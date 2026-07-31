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
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/ui';
import { listFollowRequests, respondFollowRequest, type FollowRequestItem } from '@/lib/profile-api';
import { openProfile } from '@/lib/profile-nav';
import { fmtWhen } from '@/lib/run-format';
import { radius as R, shadows, spacing as S, type Tokens, DENSE_MAX_FONT_SCALE} from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { t, tf, useLang, useT } from '@/lib/i18n';

export default function FollowRequestsScreen() {
  const T = useT(); // reactive anchor — stack-mounted beneath 설정, repaints on lang flip
  const lang = useLang(); // compiler-visible locale for the date/title formatters (2026-08-03 formatter-cache fix)
  const C = useTokens();
  const st = useStyles(makeSt);
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
      Alert.alert(approve ? t('fq.approveFail') : t('fq.rejectFail'),
        e instanceof Error ? e.message : t('auth.tryLater'));
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
        <Text style={st.appBarTitle}>{T('fq.title')}</Text>
        <Text style={st.appBarCount}>{rows ? tf('fq.nCount', { n: rows.length }) : ''}</Text>
      </View>

      {rows === null ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : rows.length === 0 ? (
        <View style={st.centered}>
          <Icon name="person-add-outline" size={36} color={C.faint} />
          <Text style={st.emptyTxt}>{T('fq.empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={r => r.user_id}
          renderItem={({ item }) => {
            const name = item.nickname ?? T('home.runner');
            const busy = busyId === item.user_id;
            return (
              <View style={[st.row, shadows.sm]}>
                <Pressable
                  onPress={() => openProfile(item.user_id, name)}
                  style={({ pressed }) => [st.rowBody, pressed && { opacity: 0.7 }]}
                >
                  <Avatar name={name} size={42} photoUrl={item.avatar_url} initialsRatio={0.38} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.name} numberOfLines={1}>{name}</Text>
                    <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.sub} numberOfLines={1}>
                      {fmtWhen(item.followed_at, lang)}{item.is_following ? T('fq.mutual') : ''}
                    </Text>
                  </View>
                </Pressable>
                {busy ? (
                  <ActivityIndicator size="small" color={C.faint} />
                ) : (
                  <View style={st.actions}>
                    <Pressable onPress={() => respond(item, true)} hitSlop={6} style={({ pressed }) => [st.acceptBtn, pressed && { opacity: 0.85 }]}>
                      <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.acceptTxt}>{T('fq.accept')}</Text>
                    </Pressable>
                    <Pressable onPress={() => respond(item, false)} hitSlop={6} style={({ pressed }) => [st.rejectBtn, pressed && { opacity: 0.7 }]}>
                      <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.rejectTxt}>{T('fq.reject')}</Text>
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

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.gutter, paddingVertical: 10 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },
  appBarCount: { width: 36, textAlign: 'right', fontSize: 12.5, fontWeight: '700', color: C.faint },

  centered: { paddingTop: 80, alignItems: 'center', gap: 10 },
  emptyTxt: { fontSize: 14, color: C.faint, fontWeight: '600', letterSpacing: -0.2 },

  row:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.xl, paddingVertical: 11, paddingHorizontal: 13 },
  rowBody: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  sub:  { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },

  actions:   { flexDirection: 'row', gap: 6 },
  acceptBtn: { height: 34, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  acceptTxt: { fontSize: 12.5, fontWeight: '700', color: C.accentText, letterSpacing: -0.2 },
  rejectBtn: { height: 34, paddingHorizontal: 14, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  rejectTxt: { fontSize: 12.5, fontWeight: '700', color: C.sub, letterSpacing: -0.2 },
});
