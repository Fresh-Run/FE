/**
 * 크루 초대 — the crew_invited deep-link destination (guide §245: "크루 초대
 * 확인 모달 preview→join"). Reached from the 알림 센터 crew_invited row with
 * the invite code in params; also the home for the freshrun://crew-invite?code=
 * external link (Linking handler routes here — wiring is a follow-up).
 *
 * Contract (probed 2026-07-13): the invite is a NOTIFICATION + the crew's
 * shared invite_code — there is NO server-side invite record. So:
 *   accept  = POST /crews/preview-by-code (confirm) → POST /crews/join-by-code
 *             (즉시 가입, 비공개·승인제 무관 — 초대 = 사전 승인).
 *   decline = purely client-side dismiss (back out). The inviter is NOT
 *             notified (no decline verb exists — /invitations is POST-only),
 *             and the code stays valid (they can accept later from the row).
 * Expired/regenerated code → preview 404 → "만료된 초대예요". Already a
 * member → join 409 → straight into the crew.
 */
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { t, tf } from '@/lib/i18n';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SafeImage } from '@/components/safe-image';
import { Icon } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { joinCrewByCode, previewCrewByCode } from '@/lib/crews-api';
import { accentShadow, radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';

type Preview = { id: string; name: string; description: string | null; area: string | null; member_count: number; max_members: number | null; icon_url: string | null; color: string | null; owner_nickname: string | null };

export default function CrewInviteScreen() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const { code, crewName } = useLocalSearchParams<{ code: string; crewName?: string }>();

  const [preview, setPreview] = useState<Preview | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'expired' | 'error'>('loading');
  const [joining, setJoining] = useState(false);

  const load = useCallback(() => {
    if (!code) { setState('error'); return; }
    setState('loading');
    previewCrewByCode(code)
      .then(row => { setPreview(row as unknown as Preview); setState('ready'); })
      .catch((e: unknown) => {
        // 404 = 잘못된/만료된 코드 (재생성으로 죽은 링크 포함)
        setState(e instanceof ApiError && e.status === 404 ? 'expired' : 'error');
      });
  }, [code]);
  useEffect(() => { load(); }, [load]);

  async function accept() {
    if (!code || joining) return;
    setJoining(true);
    try {
      const joined = await joinCrewByCode(code);
      // replace so back doesn't return to the (consumed) invite screen
      router.replace({ pathname: '/(community)/crew-detail' as never, params: { crewId: joined.id } });
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 409 && preview) {
        // already a member (joined elsewhere) — just go to the crew
        router.replace({ pathname: '/(community)/crew-detail' as never, params: { crewId: preview.id } });
        return;
      }
      setState('error');
      setJoining(false);
    }
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="close" size={22} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>{t('crw.invTitle')}</Text>
        <View style={{ width: 36 }} />
      </View>

      {state === 'loading' ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : state === 'expired' || state === 'error' ? (
        <View style={st.centered}>
          <View style={st.emptyIcon}><Icon name={state === 'expired' ? 'time-outline' : 'warning-outline'} size={28} color={C.faint} /></View>
          <Text style={st.emptyTxt}>{state === 'expired' ? t('crw.invExpired') : t('crw.invLoadFail')}</Text>
          <Text style={st.emptySub}>
            {state === 'expired' ? t('crw.invExpiredSub') : t('auth.tryLater')}
          </Text>
          {state === 'error' && (
            <Pressable onPress={load} style={st.retryBtn}><Text style={st.retryTxt}>{t('common.retry')}</Text></Pressable>
          )}
        </View>
      ) : preview ? (
        <View style={st.body}>
          <View style={[st.card, shadows.sm]}>
            <SafeImage uri={preview.icon_url} style={st.crewIcon} fallback={
              <View style={[st.crewIcon, { backgroundColor: preview.color ?? C.accent, alignItems: 'center', justifyContent: 'center' }]}>
                <Icon name="people" size={34} color={C.accentText} />
              </View>
            } />
            <Text style={st.crewName} numberOfLines={2}>{preview.name || crewName || t('crw.crewFallback')}</Text>
            <View style={st.metaRow}>
              <Icon name="people-outline" size={13} color={C.faint} />
              <Text style={st.metaTxt}>
                {tf('crw.nMembers', { n: preview.member_count })}{preview.max_members != null ? tf('crw.maxN', { n: preview.max_members }) : ''}
              </Text>
              {preview.area ? (
                <>
                  <View style={st.dot} />
                  <Text style={st.metaTxt} numberOfLines={1}>{preview.area}</Text>
                </>
              ) : null}
            </View>
            {preview.owner_nickname ? <Text style={st.ownerTxt}>{tf('crw.ownerIs', { name: preview.owner_nickname })}</Text> : null}
            {preview.description ? <Text style={st.descTxt} numberOfLines={3}>{preview.description}</Text> : null}
          </View>
          <Text style={st.hint}>{t('crw.invHint')}</Text>
        </View>
      ) : null}

      {state === 'ready' && (
        <View style={[st.footer, { paddingBottom: Math.max(insets.bottom, 12) + 10 }]}>
          <Pressable onPress={accept} disabled={joining} style={[st.acceptBtn, accentShadow(C.accent), joining && { opacity: 0.6 }]}>
            {joining ? <ActivityIndicator size="small" color={C.accentText} /> : <Text style={st.acceptTxt}>{t('crw.invAccept')}</Text>}
          </Pressable>
          <Pressable onPress={() => router.back()} disabled={joining} hitSlop={8} style={st.laterBtn}>
            <Text style={st.laterTxt}>{t('common.later')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.gutter, paddingVertical: 10 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },

  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 40 },
  emptyIcon: { width: 60, height: 60, borderRadius: 18, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTxt:  { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  emptySub:  { fontSize: 12.5, color: C.faint, letterSpacing: -0.2, textAlign: 'center', lineHeight: 18 },
  retryBtn:  { marginTop: 8, paddingHorizontal: 18, height: 40, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  retryTxt:  { fontSize: 13.5, fontWeight: '700', color: C.text },

  body: { flex: 1, paddingHorizontal: S.gutter, paddingTop: 20 },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 22, padding: 22, alignItems: 'center' },
  crewIcon: { width: 72, height: 72, borderRadius: 20, marginBottom: 14 },
  crewName: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.5, textAlign: 'center' },
  metaRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  metaTxt:  { fontSize: 13, color: C.faint, letterSpacing: -0.2, flexShrink: 1 },
  dot:      { width: 3, height: 3, borderRadius: 2, backgroundColor: C.border },
  ownerTxt: { fontSize: 12.5, color: C.sub, letterSpacing: -0.2, marginTop: 8 },
  descTxt:  { fontSize: 13, color: C.sub, letterSpacing: -0.2, lineHeight: 19, textAlign: 'center', marginTop: 14 },
  hint:     { fontSize: 12.5, color: C.faint, letterSpacing: -0.2, textAlign: 'center', marginTop: 16 },

  footer:    { paddingHorizontal: S.gutter, paddingTop: 12, gap: 4 },
  acceptBtn: { height: 54, borderRadius: 16, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  acceptTxt: { fontSize: 16, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },
  laterBtn:  { height: 46, alignItems: 'center', justifyContent: 'center' },
  laterTxt:  { fontSize: 14.5, fontWeight: '600', color: C.sub, letterSpacing: -0.3 },
});
