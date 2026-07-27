/**
 * 추천 러너 — friends discovery v1 (owner ruling 2026-07-28). DELIBERATELY
 * DISPOSABLE surface behind the stable /users/suggested contract
 * (EVOLUTION-EXPECTED — no dismiss, no explainers, no algorithm affordances;
 * those belong to the real feature later).
 *
 * Grammar: the follow-list row's 3-state pill VERBATIM (202→요청됨 +
 * pending-follows cache · 409 adopt · optimistic with rollback). Card body →
 * user-profile. Row HIDES entirely on empty/all-followed/error (auxiliary
 * surface, no empty theater). Loading = 3 skeleton cards.
 */
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { t, tf } from '@/lib/i18n';
import { ApiError, apiFetch, apiRequest } from '@/lib/api';
import { getSuggestedUsers, type SuggestedUser } from '@/lib/profile-api';
import { openProfile } from '@/lib/profile-nav';
import { regionName } from '@/lib/korea-regions';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { usePendingFollows } from '@/store/pending-follows';

type BtnState = 'following' | 'requested' | 'none';

export function SuggestedRunners() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const [rows, setRows] = useState<SuggestedUser[] | null>(null); // null = loading
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

  if (failed || (rows !== null && rows.length === 0)) return null; // no empty theater

  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={st.title}>{t('fr.title')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: S.gutter }}>
        {rows === null
          ? [0, 1, 2].map(i => (
              <View key={i} style={[st.card, shadows.sm]}>
                <View style={[st.skelCircle, { backgroundColor: C.surfaceAlt }]} />
                <View style={[st.skelBar, { backgroundColor: C.surfaceAlt }]} />
                <View style={[st.skelBar, { width: 44, backgroundColor: C.surfaceAlt }]} />
              </View>
            ))
          : rows.map(u => {
              const fs = stateFor(u);
              return (
                <Pressable key={u.user_id} onPress={() => openProfile(u.user_id, u.nickname)} style={[st.card, shadows.sm]}>
                  <Avatar name={u.nickname} photoUrl={u.avatar_url} size={56} />
                  <Text style={st.name} numberOfLines={1}>{u.nickname}</Text>
                  <Text style={st.sub} numberOfLines={1}>
                    {u.area ? regionName(u.area) : tf('fr.runsN', { n: u.public_run_count })}
                  </Text>
                  <Pressable onPress={() => toggle(u)} hitSlop={6} style={[st.pill, fs !== 'none' ? st.pillOn : st.pillOff]}>
                    <Text style={[st.pillTxt, fs !== 'none' && { color: C.sub }]}>
                      {fs === 'following' ? t('fr.following') : fs === 'requested' ? t('fr.requested') : t('fr.follow')}
                    </Text>
                  </Pressable>
                </Pressable>
              );
            })}
      </ScrollView>
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.3, paddingHorizontal: S.gutter, marginBottom: 10 },
  card:  { width: 128, alignItems: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, paddingVertical: 14, paddingHorizontal: 10, gap: 6 },
  name:  { fontSize: 13.5, fontWeight: '700', color: C.text, letterSpacing: -0.3, maxWidth: 104 },
  sub:   { fontSize: 11.5, color: C.faint, letterSpacing: -0.2, maxWidth: 104 },
  pill:    { marginTop: 2, paddingHorizontal: 16, paddingVertical: 6, borderRadius: R.pill },
  pillOff: { backgroundColor: C.accent },
  pillOn:  { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  pillTxt: { fontSize: 12.5, fontWeight: '700', color: C.accentText, letterSpacing: -0.2 },
  skelCircle: { width: 56, height: 56, borderRadius: 28 },
  skelBar:    { width: 72, height: 11, borderRadius: 6, marginTop: 2 },
});
