/**
 * 회원 탈퇴 — DELETE /me (App-Store-mandatory; guide §241 front rules are
 * the spec — OWNER-SPEC layout, no canvas design; design-session flag).
 *
 * Probed 2026-07-15 (throwaway series): 204 = auth.users delete commits →
 * FK cascade kills ALL public data atomically; old token → 401 immediately;
 * solo owned crews auto-delete; owns-crew-WITH-members → 409
 * {error: crew_owner, crew_ids}; demo fixtures → 403 demo_account;
 * re-signup same email = fresh empty account. Backups purge ≤90d.
 *
 * The crew_owner block renders as a PATH (guide rule ②): the blocking
 * crews are listed with links into crew-detail (양도/삭제 live there),
 * never a bare error. Guide rule ① = 2-step confirm (the logout Alert
 * pattern is step 2, this screen is step 1).
 */
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { listMyCrews, mapCrew, type Crew } from '@/lib/crews-api';
import { errorMessage } from '@/lib/error-copy';
import { t, useT, type StringKey } from '@/lib/i18n';
import { deleteAccount } from '@/lib/profile-api';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useStore } from '@/store/use-store';

const CONSEQUENCES: [string, StringKey][] = [
  ['footsteps-outline', 'da.c1'],
  ['chatbubble-outline', 'da.c2'],
  ['people-outline', 'da.c3'],
  ['time-outline', 'da.c4'],
  ['mail-outline', 'da.c5'],
];

export default function DeleteAccountScreen() {
  const T = useT();
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const signOut = useStore(s => s.signOut);

  const [busy, setBusy] = useState(false);
  // crew_owner 409 → the blocking crews, rendered as a path
  const [blockingIds, setBlockingIds] = useState<string[] | null>(null);
  const [myCrews, setMyCrews] = useState<Crew[]>([]);
  useEffect(() => {
    if (!blockingIds) return;
    listMyCrews().then(rows => setMyCrews(rows.map(r => mapCrew(r, 'owner')))).catch(() => {});
  }, [blockingIds]);

  async function runDelete() {
    setBusy(true);
    try {
      await deleteAccount();
      // 204 — the server already invalidated the token (probed: old token →
      // 401). signOut clears the local session; AuthGuard lands on welcome.
      await signOut();
    } catch (e: unknown) {
      setBusy(false);
      if (e instanceof ApiError && e.code === 'crew_owner') {
        const ids = Array.isArray(e.detail?.crew_ids) ? (e.detail.crew_ids as string[]) : [];
        setBlockingIds(ids); // the path panel takes over
      } else if (e instanceof ApiError && e.code === 'demo_account') {
        Alert.alert(t('da.demoT'), t('da.demoB'));
      } else {
        Alert.alert(t('da.failT'), errorMessage(e));
      }
    }
  }

  // Guide rule ①: 2-step confirm — this screen is step 1, the Alert is step 2
  function confirmDelete() {
    Alert.alert(t('da.confirmT'), t('da.confirmB'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('da.cta'), style: 'destructive', onPress: runDelete },
    ]);
  }

  const blockingCrews = blockingIds
    ? myCrews.filter(c => blockingIds.includes(c.id))
    : [];

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>{T('da.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: S.gutter, paddingBottom: 40 }}>
        <View style={st.heroIcon}>
          <Icon name="person-remove-outline" size={30} color={C.danger} />
        </View>
        <Text style={st.title}>{T('da.heroTitle')}</Text>

        <View style={[st.card, shadows.sm]}>
          {CONSEQUENCES.map(([icon, txt], i) => (
            <React.Fragment key={txt}>
              {i > 0 && <View style={st.divider} />}
              <View style={st.row}>
                <Icon name={icon} size={17} color={C.sub} />
                <Text style={st.rowTxt}>{T(txt)}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* crew_owner block — a PATH, not an error (guide rule ②) */}
        {blockingIds && (
          <View style={[st.blockCard, shadows.sm]}>
            <View style={st.blockHead}>
              <Icon name="alert-circle-outline" size={17} color={C.sun} />
              <Text style={st.blockTitle}>{T('da.blockT')}</Text>
            </View>
            <Text style={st.blockBody}>{T('da.blockB')}</Text>
            {(blockingCrews.length > 0 ? blockingCrews : blockingIds.map(id => ({ id, name: T('da.myCrewFallback') } as Crew))).map(c => (
              <Pressable
                key={c.id}
                onPress={() => router.push({ pathname: '/(community)/crew-detail' as never, params: { crewId: c.id } })}
                style={({ pressed }) => [st.blockCrewRow, pressed && { opacity: 0.7 }]}
              >
                <Icon name="people-outline" size={15} color={C.accentGrn} />
                <Text style={st.blockCrewName} numberOfLines={1}>{c.name}</Text>
                <Text style={st.blockCrewGo}>{T('da.blockGo')}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <Pressable onPress={confirmDelete} disabled={busy} style={[st.deleteBtn, busy && { opacity: 0.6 }]}>
          {busy
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={st.deleteTxt}>{T('da.cta')}</Text>}
        </Pressable>
        <Pressable onPress={() => router.back()} style={st.keepBtn}>
          <Text style={st.keepTxt}>{T('da.keep')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.gutter, paddingVertical: 10 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },

  heroIcon: { alignSelf: 'center', width: 64, height: 64, borderRadius: 20, backgroundColor: C.danger + '1A', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  title:    { fontSize: 20, fontWeight: '700', color: C.text, letterSpacing: -0.5, textAlign: 'center', marginTop: 14, marginBottom: 18 },

  card:    { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, paddingHorizontal: 14 },
  divider: { height: 1, backgroundColor: C.border },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 13 },
  rowTxt:  { flex: 1, fontSize: 13.5, color: C.text, letterSpacing: -0.3, lineHeight: 19 },

  blockCard:    { backgroundColor: C.surface, borderWidth: 1, borderColor: C.sun + '66', borderRadius: 18, padding: 14, marginTop: 14 },
  blockHead:    { flexDirection: 'row', alignItems: 'center', gap: 7 },
  blockTitle:   { fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  blockBody:    { fontSize: 12.5, color: C.sub, letterSpacing: -0.2, lineHeight: 18, marginTop: 6 },
  blockCrewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, marginTop: 9 },
  blockCrewName:{ flex: 1, fontSize: 13.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  blockCrewGo:  { fontSize: 12.5, fontWeight: '700', color: C.accentGrn, letterSpacing: -0.2 },

  deleteBtn: { height: 54, borderRadius: R.lg, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  deleteTxt: { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: -0.3 },
  keepBtn:   { height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  keepTxt:   { fontSize: 15, fontWeight: '700', color: C.sub, letterSpacing: -0.3 },
});
