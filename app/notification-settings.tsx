/**
 * 알림 설정 — canvas FrNotifSettings field-for-field (settings.notif,
 * BE ff58041): master card + 4 category groups, categories dim + inert
 * when master is OFF (canvas: opacity 0.4 / pointerEvents none).
 *
 * HONESTY (probed + guide §286/299): these toggles gate REMOTE PUSH ONLY —
 * in-app 알림 센터 rows are always generated regardless (probe-verified);
 * push delivery itself starts with the native build (push tokens), and
 * runReminder/weekly/pb/marketing have no sender yet even then. Both truths
 * are user-visible captions below — store-now, deliver-later, said plainly.
 *
 * Entry doors (canvas silent — no FrNotifSettings door in any pulled file;
 * judgment call, stated in checkpoint): gear on 알림 센터's app bar + the
 * 알림 설정 row in the 설정 hub's 알림 & 데이터 group.
 */
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import type { NotifSettings } from '@/lib/settings-api';
import { colors as C, shadows, spacing as S } from '@/lib/theme';
import { useSettings } from '@/store/use-settings';

const GROUPS: { title: string; hint?: string; rows: { key: keyof NotifSettings; label: string; sub: string }[] }[] = [
  {
    title: '크루 · 커뮤니티',
    rows: [
      { key: 'crewChallenge', label: '새 챌린지',     sub: '내 크루에 새 챌린지가 시작되면' },
      { key: 'crewNotice',    label: '크루 공지',     sub: '크루장·운영진이 공지를 올리면' },
      { key: 'crewChat',      label: '크루 채팅',     sub: '새 채팅 메시지가 오면' },
      { key: 'crewJoin',      label: '가입 요청·승인', sub: '가입 요청이 오거나 승인되면' },
    ],
  },
  {
    title: '소셜',
    rows: [
      { key: 'likes',     label: '좋아요',    sub: '내 러닝에 좋아요가 달리면' },
      { key: 'comments',  label: '댓글',      sub: '내 러닝에 댓글이 달리면' },
      { key: 'followers', label: '새 팔로워', sub: '누군가 나를 팔로우하면' },
    ],
  },
  {
    title: '러닝',
    hint: '리마인더·주간 리포트·기록 축하 발송은 준비 중이에요 — 설정은 지금 저장돼요.',
    rows: [
      { key: 'runReminder', label: '러닝 리마인더',  sub: '정기 러닝 시간 전에 미리 알림' },
      { key: 'weekly',      label: '주간 리포트',    sub: '매주 월요일 지난주 러닝 요약' },
      { key: 'pb',          label: '개인 기록 달성', sub: '새 개인 기록(PB)을 세우면' },
    ],
  },
  {
    title: '기타',
    hint: '이벤트·프로모션 소식은 언제든 다시 끌 수 있어요.',
    rows: [
      { key: 'marketing', label: '이벤트·프로모션', sub: '챌린지 이벤트, 프리미엄 혜택 소식' },
    ],
  },
];

export default function NotificationSettingsScreen() {
  const insets = useSafeAreaInsets();
  const notif = useSettings(st_ => st_.settings.notif);
  const setNotifSetting = useSettings(st_ => st_.setNotifSetting);
  useEffect(() => { useSettings.getState().hydrate(); }, []);

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>알림 설정</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* ── Master card (canvas) ── */}
        <View style={{ paddingHorizontal: S.gutter, paddingTop: 16 }}>
          <View style={[st.masterCard, shadows.sm]}>
            <View style={st.masterIcon}>
              <Icon name="notifications-outline" size={20} color={C.accentGrn} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.masterTitle}>푸시 알림</Text>
              <Text style={st.masterSub}>끄면 모든 알림이 오지 않아요</Text>
            </View>
            <Switch
              value={notif.master}
              onValueChange={v => { setNotifSetting('master', v); }}
              trackColor={{ true: C.accent, false: C.border }}
              thumbColor="#fff"
            />
          </View>
          {/* the delivery truth — store-now, push-later, in-app unaffected */}
          <Text style={st.deliveryNote}>
            푸시 알림은 정식 앱 버전부터 발송돼요 — 설정은 지금 저장되고 그때 그대로 적용돼요.
            앱 안의 알림 목록은 이 설정과 무관하게 계속 쌓여요.
          </Text>
        </View>

        {/* ── Category groups — dim + inert under master OFF (canvas) ── */}
        <View
          style={{ opacity: notif.master ? 1 : 0.4 }}
          pointerEvents={notif.master ? 'auto' : 'none'}
        >
          {GROUPS.map(g => (
            <View key={g.title} style={{ paddingHorizontal: S.gutter, paddingTop: 22 }}>
              <Text style={st.groupTitle}>{g.title}</Text>
              <View style={[st.groupCard, shadows.sm]}>
                {g.rows.map((r, i) => (
                  <React.Fragment key={r.key}>
                    {i > 0 && <View style={st.divider} />}
                    <View style={st.row}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={st.rowLabel}>{r.label}</Text>
                        <Text style={st.rowSub}>{r.sub}</Text>
                      </View>
                      <Switch
                        value={notif[r.key]}
                        onValueChange={v => { setNotifSetting(r.key, v); }}
                        trackColor={{ true: C.accent, false: C.border }}
                        thumbColor="#fff"
                      />
                    </View>
                  </React.Fragment>
                ))}
              </View>
              {g.hint ? <Text style={st.groupHint}>{g.hint}</Text> : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.gutter, paddingVertical: 10 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },

  masterCard:  { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 16 },
  masterIcon:  { width: 40, height: 40, borderRadius: 12, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  masterTitle: { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  masterSub:   { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },

  deliveryNote: { fontSize: 12, color: C.faint, letterSpacing: -0.2, lineHeight: 17, paddingTop: 9, paddingHorizontal: 6 },

  groupTitle: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, color: C.faint, textTransform: 'uppercase', paddingHorizontal: 4, paddingBottom: 8 },
  groupCard:  { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, paddingHorizontal: 16 },
  groupHint:  { fontSize: 12, color: C.faint, letterSpacing: -0.2, lineHeight: 17, paddingTop: 9, paddingHorizontal: 6 },
  divider:    { height: 1, backgroundColor: C.border, marginHorizontal: -16 },

  row:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rowLabel: { fontSize: 14.5, fontWeight: '600', color: C.text, letterSpacing: -0.3 },
  rowSub:   { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 3 },
});
