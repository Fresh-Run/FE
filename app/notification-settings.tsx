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
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { useT, type StringKey } from '@/lib/i18n';
import { Toggle } from '@/components/toggle';
import type { NotifSettings } from '@/lib/settings-api';
import { shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useSettings } from '@/store/use-settings';

const GROUPS: { title: StringKey; hint?: StringKey; rows: { key: keyof NotifSettings; label: StringKey; sub: StringKey }[] }[] = [
  {
    title: 'nset.gCrew',
    rows: [
      { key: 'crewChallenge', label: 'nset.challenge', sub: 'nset.challengeSub' },
      { key: 'crewNotice',    label: 'nset.notice',    sub: 'nset.noticeSub' },
      { key: 'crewChat',      label: 'nset.chat',      sub: 'nset.chatSub' },
      { key: 'crewJoin',      label: 'nset.join',      sub: 'nset.joinSub' },
    ],
  },
  {
    title: 'nset.gSocial',
    rows: [
      { key: 'likes',     label: 'nset.likes',     sub: 'nset.likesSub' },
      { key: 'comments',  label: 'nset.comments',  sub: 'nset.commentsSub' },
      { key: 'followers', label: 'nset.followers', sub: 'nset.followersSub' },
    ],
  },
  {
    title: 'nset.gRun',
    hint: 'nset.gRunHint',
    rows: [
      { key: 'runReminder', label: 'nset.reminder', sub: 'nset.reminderSub' },
      { key: 'weekly',      label: 'nset.weekly',   sub: 'nset.weeklySub' },
      { key: 'pb',          label: 'nset.pb',       sub: 'nset.pbSub' },
    ],
  },
  {
    title: 'nset.gEtc',
    hint: 'nset.gEtcHint',
    rows: [
      { key: 'marketing', label: 'nset.marketing', sub: 'nset.marketingSub' },
    ],
  },
];

export default function NotificationSettingsScreen() {
  const T = useT();
  const C = useTokens();
  const st = useStyles(makeSt);
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
        <Text style={st.appBarTitle}>{T('nset.title')}</Text>
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
              <Text style={st.masterTitle}>{T('nset.master')}</Text>
              <Text style={st.masterSub}>{T('nset.masterSub')}</Text>
            </View>
            <Toggle on={notif.master} onChange={v => { setNotifSetting('master', v); }} />
          </View>
          {/* the delivery truth — store-now, push-later, in-app unaffected */}
          <Text style={st.deliveryNote}>{T('nset.deliveryNote')}</Text>
        </View>

        {/* ── Category groups — dim + inert under master OFF (canvas) ── */}
        <View
          style={{ opacity: notif.master ? 1 : 0.4 }}
          pointerEvents={notif.master ? 'auto' : 'none'}
        >
          {GROUPS.map(g => (
            <View key={g.title} style={{ paddingHorizontal: S.gutter, paddingTop: 22 }}>
              <Text style={st.groupTitle}>{T(g.title)}</Text>
              <View style={[st.groupCard, shadows.sm]}>
                {g.rows.map((r, i) => (
                  <React.Fragment key={r.key}>
                    {i > 0 && <View style={st.divider} />}
                    <View style={st.row}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={st.rowLabel}>{T(r.label)}</Text>
                        <Text style={st.rowSub}>{T(r.sub)}</Text>
                      </View>
                      <Toggle on={notif[r.key]} onChange={v => { setNotifSetting(r.key, v); }} />
                    </View>
                  </React.Fragment>
                ))}
              </View>
              {g.hint ? <Text style={st.groupHint}>{T(g.hint)}</Text> : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
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
