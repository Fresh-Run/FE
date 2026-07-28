/**
 * 추천 러너 — friends discovery v1.1 (relocation ruling 2026-07-28).
 * DELIBERATELY DISPOSABLE surface behind the stable /users/suggested
 * contract (EVOLUTION-EXPECTED — no dismiss, no explainers, no algorithm
 * affordances; those belong to the real feature later).
 *
 * v1.1 architecture: ONE useSuggestedRunners() hook per screen (single
 * fetch; follow-state shared) + a memoized presentational row rendered at
 * every placement — repeated instances show the SAME faces and the SAME
 * pill states (per-position slices would spend a 14-user list in two slots;
 * variety belongs to the real ranking later).
 *
 * Card v1.1: avatar 52 + nickname + 3-state pill beneath — no sub-line
 * (104px wide, more faces per viewport). Grammar: the follow-list row's
 * 3-state pill VERBATIM (202→요청됨 + pending cache · 409 adopt ·
 * optimistic rollback). Card body → user-profile. Row hides entirely on
 * empty/all-followed/error (no empty theater); skeletons while loading.
 */
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { t, useT } from '@/lib/i18n';
import { ApiError, apiFetch, apiRequest } from '@/lib/api';
import { getSuggestedUsers, type SuggestedUser } from '@/lib/profile-api';
import { openProfile } from '@/lib/profile-nav';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { usePendingFollows } from '@/store/pending-follows';

type BtnState = 'following' | 'requested' | 'none';

export type SuggestedRunnersState = {
  rows: SuggestedUser[] | null; // null = loading
  /** false = the row renders NOTHING anywhere (failed or resolved-empty) */
  available: boolean;
  stateFor: (u: SuggestedUser) => BtnState;
  toggle: (u: SuggestedUser) => void;
};

export function useSuggestedRunners(): SuggestedRunnersState {
  const [rows, setRows] = useState<SuggestedUser[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [overlay, setOverlay] = useState<Record<string, BtnState>>({});
  const pendingIds = usePendingFollows(s => s.ids);

  useEffect(() => {
    let cancelled = false;
    getSuggestedUsers()
      .then(r => { if (!cancelled) setRows(r); })
      .catch(() => { if (!cancelled) setFailed(true); }); // silent hide — auxiliary
    return () => { cancelled = true; };
  }, []);

  const stateFor = (u: SuggestedUser): BtnState =>
    overlay[u.user_id] ?? (u.is_following ? 'following' : pendingIds[u.user_id] ? 'requested' : 'none');

  // the follow-list toggle, verbatim grammar
  function toggle(u: SuggestedUser) {
    const cur = stateFor(u);
    if (cur === 'requested') {
      setOverlay(p => ({ ...p, [u.user_id]: 'none' }));
      usePendingFollows.getState().remove(u.user_id);
      apiFetch<void>(`/api/users/${u.user_id}/follow-request`, { method: 'DELETE' })
        .catch((e: unknown) => {
          setOverlay(p => ({ ...p, [u.user_id]: cur }));
          usePendingFollows.getState().add(u.user_id);
          Alert.alert(t('fr.failTitle'), e instanceof Error ? e.message : t('runSave.saveFailBody'));
        });
      return;
    }
    if (cur === 'following') {
      setOverlay(p => ({ ...p, [u.user_id]: 'none' }));
      apiFetch<void>(`/api/users/${u.user_id}/follow`, { method: 'DELETE' })
        .catch((e: unknown) => {
          setOverlay(p => ({ ...p, [u.user_id]: cur }));
          Alert.alert(t('fr.failTitle'), e instanceof Error ? e.message : t('runSave.saveFailBody'));
        });
      return;
    }
    setOverlay(p => ({ ...p, [u.user_id]: 'following' }));
    apiRequest<void>(`/api/users/${u.user_id}/follow`, { method: 'POST' })
      .then(({ status }) => {
        if (status === 202) {
          setOverlay(p => ({ ...p, [u.user_id]: 'requested' }));
          usePendingFollows.getState().add(u.user_id);
          return;
        }
        usePendingFollows.getState().remove(u.user_id);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.code === 'follow_request_pending') {
          setOverlay(p => ({ ...p, [u.user_id]: 'requested' }));
          usePendingFollows.getState().add(u.user_id);
          return;
        }
        setOverlay(p => ({ ...p, [u.user_id]: cur }));
        Alert.alert(t('fr.failTitle'), e instanceof Error ? e.message : t('runSave.saveFailBody'));
      });
  }

  return { rows, available: !failed && (rows === null || rows.length > 0), stateFor, toggle };
}

export const SuggestedRunnersRow = React.memo(function SuggestedRunnersRow({ sr }: { sr: SuggestedRunnersState }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  // REACTIVE t — the mixed-locale seam fix (owner walk find, 2026-07-28):
  // bare t() froze mount-time locale (pre-hydration ko) while later triggers
  // repainted parts fresh (post-hydration en) → one component, two locales.
  // useT subscribes: hydration or a 언어 flip repaints the WHOLE row together.
  const T = useT();
  if (!sr.available) return null; // no empty theater — anywhere it's placed

  return (
    <View style={st.wrap}>
      <Text style={st.title}>{T('fr.title')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: S.gutter }}>
        {sr.rows === null
          ? [0, 1, 2].map(i => (
              <View key={i} style={[st.card, shadows.sm]}>
                <View style={[st.skelCircle, { backgroundColor: C.surfaceAlt }]} />
                <View style={[st.skelBar, { backgroundColor: C.surfaceAlt }]} />
              </View>
            ))
          : sr.rows.map(u => {
              const fs = sr.stateFor(u);
              return (
                <Pressable key={u.user_id} onPress={() => openProfile(u.user_id, u.nickname)} style={[st.card, shadows.sm]}>
                  <Avatar name={u.nickname} photoUrl={u.avatar_url} size={52} />
                  <Text style={st.name} numberOfLines={1}>{u.nickname}</Text>
                  <Pressable onPress={() => sr.toggle(u)} hitSlop={6} style={[st.pill, fs !== 'none' ? st.pillOn : st.pillOff]}>
                    {/* one line in ANY locale — shrink, never wrap (the widget-crunch grammar) */}
                    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[st.pillTxt, fs !== 'none' && { color: C.sub }]}>
                      {fs === 'following' ? T('fr.following') : fs === 'requested' ? T('fr.requested') : T('fr.follow')}
                    </Text>
                  </Pressable>
                </Pressable>
              );
            })}
      </ScrollView>
    </View>
  );
});

const makeSt = (C: Tokens) => StyleSheet.create({
  wrap:  { marginBottom: 4 },
  title: { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.3, paddingHorizontal: S.gutter, marginBottom: 10 },
  // v1.1 tighter card: 104w · avatar 52 · pill beneath nickname · no sub-line
  card:  { width: 104, alignItems: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, paddingVertical: 12, paddingHorizontal: 8, gap: 7 },
  name:  { fontSize: 13, fontWeight: '700', color: C.text, letterSpacing: -0.3, maxWidth: 86 },
  pill:    { paddingHorizontal: 12, paddingVertical: 5.5, borderRadius: R.pill, maxWidth: 88 },
  pillOff: { backgroundColor: C.accent },
  pillOn:  { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  pillTxt: { fontSize: 12, fontWeight: '700', color: C.accentText, letterSpacing: -0.2 },
  skelCircle: { width: 52, height: 52, borderRadius: 26 },
  skelBar:    { width: 64, height: 11, borderRadius: 6, marginTop: 2 },
});
