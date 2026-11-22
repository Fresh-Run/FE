/**
 * 배틀 초대 화면 — spec §2.6-3 (v0 LOCKED 8/29) · redesign 8b (2026-11-21):
 * REAL wire-in. Target = a pending battle where I am the opponent (?id=).
 * 수락 → POST /battles/{id}/accept (410 battle_invite_expired = honest
 * "만료" state) · 거절 → POST /battles/{id}/decline (server: cancelled —
 * gone from the list). Landing for the battle_invited notification.
 */
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { BattleTermsCard } from '@/components/battle-terms';
import { Icon } from '@/components/ui';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { track } from '@/lib/analytics';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/error-copy';
import { t, tfIn, useLang, useT } from '@/lib/i18n';
import { radius as R, spacing as S, shadows, type Tokens } from '@/lib/theme';
import { useBattles } from '@/store/use-battles';
import { useStore } from '@/store/use-store';

export default function BattleInviteScreen() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const T = useT();
  const lang = useLang();
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useStore(s => s.session?.user.id);
  const loaded = useBattles(s => s.loaded);
  const profiles = useBattles(s => s.profiles);
  const row = useBattles(s => s.battles.find(b => b.id === id));
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!loaded || !row) void useBattles.getState().loadDetail(id); }, [id, loaded, row]);

  const battle = row && row.status === 'pending' && row.opponent === me ? row : null;
  const fromName = battle ? profiles[battle.created_by]?.nickname ?? T('bat.opponent') : '';

  async function act(kind: 'accept' | 'decline') {
    if (!battle || busy) return;
    setBusy(true);
    try {
      if (kind === 'accept') { await useBattles.getState().accept(battle.id); track('battle_accept'); }
      else await useBattles.getState().decline(battle.id);
      router.back();
    } catch (e: unknown) {
      const code = e instanceof ApiError ? e.code : null;
      Alert.alert(t('bat.inviteTitle'), code === 'battle_invite_expired' ? t('bat.inviteExpired') : errorMessage(e));
      void useBattles.getState().refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={st.root}>
      <View style={[st.appBar, { marginTop: insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appTitle}>{T('bat.inviteTitle')}</Text>
        <View style={{ width: 20 }} />
      </View>

      {battle ? (
        <>
          <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + 120 }}>
            <View style={[st.card, shadows.sm]}>
              <Text style={st.inviteEmoji}>{battle.emoji ?? '⚡'}</Text>
              <Avatar name={fromName} size={64} photoUrl={profiles[battle.created_by]?.avatar_url ?? null} />
              <Text style={st.inviteSub}>{tfIn(lang, 'bat.inviteSub', { name: fromName })}</Text>
              {battle.title ? <Text style={st.battleTitle}>{battle.title}</Text> : null}
              <BattleTermsCard durationDays={battle.duration_days} />
            </View>
          </ScrollView>
          <View style={[st.footer, { paddingBottom: insets.bottom + 10 }]}>
            <Pressable onPress={() => act('decline')} disabled={busy} style={[st.btn, st.btnDecline]}>
              <Text style={st.btnDeclineTxt}>{T('bat.declineBtn')}</Text>
            </Pressable>
            <Pressable onPress={() => act('accept')} disabled={busy} style={[st.btn, st.btnAccept, busy && { opacity: 0.6 }]}>
              {busy ? <ActivityIndicator size="small" color={C.accentText} /> : <Text style={st.btnAcceptTxt}>{T('bat.acceptBtn')}</Text>}
            </Pressable>
          </View>
        </>
      ) : !loaded && !row ? (
        <View style={st.goneWrap}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : (
        <View style={st.goneWrap}>
          <Icon name="mail-open-outline" size={36} color={C.faint} />
          <Text style={st.goneTxt}>{T('bat.inviteGone')}</Text>
        </View>
      )}
    </View>
  );
}

const makeSt = (C: Tokens) => ({
  root: { flex: 1, backgroundColor: C.bg },
  appBar: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: S.lg, paddingVertical: 10 },
  appTitle: { fontSize: 17, fontWeight: '800' as const, color: C.text },
  card: { backgroundColor: C.surface, borderRadius: R.xl, borderWidth: 1, borderColor: C.border, padding: S.lg, alignItems: 'center' as const, gap: 12 },
  inviteEmoji: { fontSize: 34 },
  inviteSub: { fontSize: 15, fontWeight: '700' as const, color: C.text, textAlign: 'center' as const },
  battleTitle: { fontSize: 14, fontWeight: '800' as const, color: C.accentGrn },
  footer: { position: 'absolute' as const, left: 0, right: 0, bottom: 0, flexDirection: 'row' as const, gap: 10, paddingHorizontal: S.lg, paddingTop: 10, backgroundColor: C.bg },
  btn: { flex: 1, borderRadius: R.pill, alignItems: 'center' as const, paddingVertical: 14 },
  btnDecline: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  btnDeclineTxt: { fontSize: 15, fontWeight: '700' as const, color: C.sub },
  btnAccept: { backgroundColor: C.accent },
  btnAcceptTxt: { fontSize: 15, fontWeight: '800' as const, color: C.accentText },
  goneWrap: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 10 },
  goneTxt: { fontSize: 14, color: C.faint },
});
