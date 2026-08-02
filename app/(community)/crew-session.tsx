/**
 * 크루 세션 뷰 (v3, 8/5 오너 룰 — 모달의 레저드 대안 승격): a session
 * folder's tap target as a ROUTE SCREEN. Every participant's run renders as
 * a full standard RunCard (the K1 grammar, each with its own ♥/comments).
 *
 * Members derive from a fresh crew-feed fetch ON FOCUS — the modal's
 * live-absorption traded for useFocusEffect refetch: returning from
 * run-post (or anywhere) re-pulls the feed, so later participants appear
 * on every re-entry. Card taps push run-post NORMALLY — back lands here,
 * back again lands on the crew feed (the route stack kills the modal's
 * tap-through bug class by construction).
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KudosSheet } from '@/components/kudos-sheet';
import { Icon } from '@/components/ui';
import { ApiError, apiFetch } from '@/lib/api';
import { getCrewRuns, type CrewRunItem } from '@/lib/crews-api';
import { tf } from '@/lib/i18n';
import { spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useSettings } from '@/store/use-settings';
import { RunCard } from './crew-runs';

export default function CrewSessionScreen() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const { crewId, sessionKey, crewName } = useLocalSearchParams<{ crewId: string; sessionKey: string; crewName?: string }>();
  const units = useSettings(s => s.settings.units);

  const [rows, setRows] = useState<CrewRunItem[] | null>(null);
  // K1 machinery — the crew-runs pattern verbatim (own instance: a route
  // screen can't share the parent's state the way the modal did)
  const [kudosOv, setKudosOv] = useState<Record<string, { on: boolean; delta: number }>>({});
  const [kudosOff403, setKudosOff403] = useState<Set<string>>(new Set());
  const [kudosSheetRun, setKudosSheetRun] = useState<{ id: string; count: number } | null>(null);

  // focus-refetch = the absorption mechanism (see header)
  useFocusEffect(useCallback(() => {
    if (!crewId) return;
    let cancelled = false;
    getCrewRuns(crewId, 0)
      .then(list => { if (!cancelled) { setRows(list); setKudosOv({}); } })
      .catch(() => { if (!cancelled) setRows(prev => prev ?? []); });
    return () => { cancelled = true; };
  }, [crewId]));

  function toggleKudos(run: CrewRunItem) {
    if (kudosOff403.has(run.run_id)) return;
    const cur = kudosOv[run.run_id]?.on ?? run.my_kudos;
    const next = !cur;
    setKudosOv(p => ({ ...p, [run.run_id]: { on: next, delta: (next ? 1 : 0) - (run.my_kudos ? 1 : 0) } }));
    apiFetch<void>(`/api/runs/${run.run_id}/kudos`, { method: next ? 'POST' : 'DELETE' })
      .catch((e: unknown) => {
        setKudosOv(p => ({ ...p, [run.run_id]: { on: run.my_kudos, delta: 0 } }));
        if (e instanceof ApiError && e.code === 'likes_disabled') {
          setKudosOff403(p => new Set(p).add(run.run_id));
        }
      });
  }

  function openRun(run: CrewRunItem) {
    router.push({
      pathname: '/run-post' as never,
      params: {
        runId: run.run_id,
        nickname: run.nickname ?? '러너',
        avatarUrl: run.avatar_url ?? '',
        allowLikes: run.allow_likes === true ? '1' : '0',
        allowComments: run.allow_comments === true ? '1' : '0',
      },
    });
  }

  const members = (rows ?? []).filter(r => r.session_key === sessionKey);
  const anchor = members[0];
  const isAnn = (sessionKey ?? '').startsWith('a:');
  const title = `${crewName ? `${crewName} · ` : ''}${isAnn ? '공지 러닝' : '함께 달림'}${anchor?.session_participant_count != null ? ` · ${tf('crw.nJoined', { n: anchor.session_participant_count })}` : ''}`;

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle} numberOfLines={1}>{title}</Text>
        <View style={{ width: 36 }} />
      </View>
      {rows === null ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={r => r.run_id}
          renderItem={({ item }) => {
            const ov = kudosOv[item.run_id];
            const shown = ov ? { ...item, my_kudos: ov.on, kudos_count: item.kudos_count + ov.delta } : item;
            return (
              <RunCard
                run={shown}
                units={units}
                mapLive
                onOpen={() => openRun(item)}
                kudosOff={item.allow_likes === false || kudosOff403.has(item.run_id)}
                onKudos={() => toggleKudos(item)}
                onCountPress={() => setKudosSheetRun({ id: shown.run_id, count: shown.kudos_count })}
              />
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          contentContainerStyle={{ padding: S.gutter, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        />
      )}
      {kudosSheetRun && (
        <KudosSheet runId={kudosSheetRun.id} kudosCount={kudosSheetRun.count} onClose={() => setKudosSheetRun(null)} />
      )}
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },
  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
