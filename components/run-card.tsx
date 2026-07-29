/**
 * RunCard — the shared run card (extracted VERBATIM from user-profile.tsx,
 * 2026-07-16, 전체-discovery slice; one card, no parallel component).
 * Additive prop: `onAvatarPress` — absent = the pre-extraction behavior
 * (user-profile: you are already on the profile); present = the discovery
 * funnel (전체: avatar → openProfile → 팔로우).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/ui';
import { MiniMap } from '@/components/mini-map';
import { RealMap } from '@/components/real-map';
import { distUnit, fmtDist, fmtDuration, fmtPaceIn, fmtWhen, paceUnit, timeTitle } from '@/lib/run-format';
import { shadows, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useRunTrack } from '@/lib/track-cache';
import type { UserRun } from '@/hooks/use-user-profile';
import type { useSettings } from '@/store/use-settings';
import { useT } from '@/lib/i18n';

// Course affordances (이 코스 달리기 CTA + header bookmark, canvas card B)
// REMOVED 2026-07-21 — owner step-back ruling; the feature returns
// post-launch. Full prop/UI/style implementation lives at commit 82c5bc9.
export function RunCard({ run, units, mapLive, onKudos, kudosOff, onOpen, onAvatarPress, onCountPress }: {
  run: UserRun;
  units: ReturnType<typeof useSettings.getState>['settings']['units'];
  mapLive: boolean;
  onKudos: () => void;
  /** v1.5 likes_disabled — hides the press affordance (count-only) */
  kudosOff?: boolean;
  onOpen?: () => void;
  /** discovery funnel: avatar tap → profile (absent = not tappable) */
  onAvatarPress?: () => void;
  /** K1: like-count tap → likers sheet (absent = inert count, pre-K1 render) */
  onCountPress?: () => void;
}) {
  // reactive anchor (owner ruling 4a-now): subscribes the card to lang —
  // long-lived FlatList instances repaint on mid-session flips, and the
  // timeTitle() fallback in this render body resolves fresh on that repaint
  const T = useT();
  const C = useTokens();
  const st = useStyles(makeSt);
  // visual-split ruling: full track when fetched, thumb while loading
  const { line: cardLine, pending: linePending } = useRunTrack(mapLive ? run.run_id : null, run.polyline_thumb);
  return (
    <Pressable onPress={onOpen} disabled={!onOpen} style={({ pressed }) => [st.card, shadows.sm, pressed && !!onOpen && { opacity: 0.85 }]}>
      <View style={st.cardHead}>
        <Pressable onPress={onAvatarPress} disabled={!onAvatarPress} hitSlop={6}>
          <Avatar name={run.nickname} size={36} photoUrl={run.avatar_url} ring={C.border} initialsRatio={0.38} upper />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.cardName}>{run.nickname}</Text>
          <Text style={st.cardDate}>{fmtWhen(run.ran_at)}</Text>
        </View>
      </View>
      {/* polyline_thumb slice: viewable + thumb → real map; off-screen /
          trackless → route-shaped or seed SVG (ledger rulings) */}
      {mapLive && ((cardLine && cardLine.length >= 2) || linePending) ? (
        <RealMap height={200} polyline={cardLine ?? run.polyline_thumb} lineHidden={linePending} />
      ) : (
        <MiniMap seed={run.run_id} height={200} polyline={cardLine ?? undefined} />
      )}
      <View style={st.cardBody}>
        <Text style={st.cardTitle}>{run.title ?? timeTitle(run.ran_at)}</Text>
        <View style={st.statsRow}>
          {([
            [fmtDist(run.distance_km, units, 1), distUnit(units), T('runSave.statDist')],
            [fmtDuration(run.duration_sec), '', T('res.time')],
            [run.avg_pace_sec_per_km != null ? fmtPaceIn(run.avg_pace_sec_per_km, units) : '--', paceUnit(units), T('res.pace')],
          ] as [string, string, string][]).map(([val, unit, label], i) => (
            <View key={i} style={{ gap: 2 }}>
              <Text style={st.statVal}>
                {val}{unit ? <Text style={st.statUnit}> {unit}</Text> : null}
              </Text>
              <Text style={st.statLbl}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={st.cardFooter}>
        {/* K1 split: ♥ owns the toggle, the COUNT owns the likers sheet
            (onCountPress — optional: unwired parents render an inert count).
            kudosOff hides only the toggle; existing likes stay viewable. */}
        <View style={st.kudosBtn}>
          {kudosOff ? (
            <Icon name="heart-outline" size={18} color={C.sub} />
          ) : (
            <Pressable onPress={onKudos} hitSlop={8} style={({ pressed }) => pressed ? { opacity: 0.6 } : null}>
              <Icon name={run.my_kudos ? 'heart' : 'heart-outline'} size={18} color={run.my_kudos ? C.danger : C.sub} />
            </Pressable>
          )}
          <Pressable
            onPress={onCountPress}
            disabled={!onCountPress}
            hitSlop={8}
            style={({ pressed }) => pressed && !!onCountPress ? { opacity: 0.6 } : null}
          >
            <Text style={[st.kudosCount, !kudosOff && run.my_kudos && { color: C.danger }]}>{run.kudos_count}</Text>
          </Pressable>
        </View>
        {/* 💬 read-only count — tap opens the post, same as the card body */}
        <Pressable
          onPress={onOpen}
          disabled={!onOpen}
          hitSlop={8}
          style={({ pressed }) => [st.kudosBtn, { marginLeft: 14 }, pressed && !!onOpen && { opacity: 0.6 }]}
        >
          <Icon name="chatbubble-outline" size={17} color={C.sub} />
          <Text style={st.kudosCount}>{run.comment_count}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  card:      { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, overflow: 'hidden' },
  cardHead:  { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 11, paddingHorizontal: 14 },
  cardName:  { fontSize: 14, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  cardDate:  { fontSize: 11.5, color: C.faint, letterSpacing: -0.2, marginTop: 1 },
  cardBody:  { paddingTop: 12, paddingBottom: 14, paddingHorizontal: 14 },
  cardTitle: { fontSize: 15.5, fontWeight: '700', color: C.text, letterSpacing: -0.4, marginBottom: 9 },
  statsRow:  { flexDirection: 'row', gap: 18 },
  statVal:   { fontSize: 16, fontWeight: '700', color: C.text, letterSpacing: -0.4 },
  statUnit:  { fontSize: 11, color: C.faint, fontWeight: '600' },
  statLbl:   { fontSize: 10.5, color: C.faint, letterSpacing: -0.1 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', paddingTop: 8, paddingBottom: 12, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: C.border },
  kudosBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  kudosCount: { fontSize: 13.5, fontWeight: '700', color: C.sub, letterSpacing: -0.2 },
});
