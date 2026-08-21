/**
 * 배틀 리더보드 셸 (8/21) — MOCK DATA ONLY, no endpoint calls by design.
 * The scoring engine (lib/battle-score) is live and drives every number on
 * this screen; only the inputs are fixtures. Row grammar = crew-detail's
 * 이번 주 랭킹 (medal/avatar/name/me-badge family). UNLINKED route — reach
 * via router.push('/battle-preview') for review; creation flow + community
 * tab scaffold + all wiring HELD for 지연's contract (owner ruling 8/21).
 *
 * TODO(contract): battle id/lifecycle (create/accept/decline) — no server shape
 * TODO(contract): opponent run feed — server-aggregated totals replace the
 *                 client aggregateScore() call (engine wires unchanged)
 * TODO(contract): window dates (starts_at/ends_at) — daysLeft is mocked
 * TODO(contract): battle notification types (invited/overtaken/won)
 * TODO(contract): server streak (real-time consecutive days) + milestone
 *                 memory (anti-cheat one-time bonuses) — engine ⚠ flags
 */
import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/ui';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { tfIn, useLang, useT } from '@/lib/i18n';
import { aggregateScore, type BattleRun, type BattleScore } from '@/lib/battle-score';
import { radius as R, spacing as S, shadows, type Tokens } from '@/lib/theme';

// ─── Mock fixtures (the desk-proof set + a second participant) ───────────────
const ME_RUNS: BattleRun[] = [
  { id: 'm1', ran_at: '2026-08-18T19:10:00+09:00', distance_km: 3.2, duration_sec: 1020, avg_pace_sec_per_km: 319 },
  { id: 'm2', ran_at: '2026-08-20T06:30:00+09:00', distance_km: 2.0, duration_sec: 780, avg_pace_sec_per_km: 390 },
  { id: 'm3', ran_at: '2026-08-21T08:00:00+09:00', distance_km: 12.0, duration_sec: 4200, avg_pace_sec_per_km: 350 },
];
const RIVAL_RUNS: BattleRun[] = [
  { id: 'r1', ran_at: '2026-08-19T06:20:00+09:00', distance_km: 5.4, duration_sec: 1980, avg_pace_sec_per_km: 366 },
  { id: 'r2', ran_at: '2026-08-20T21:00:00+09:00', distance_km: 1.2, duration_sec: 600, avg_pace_sec_per_km: 500 },
  { id: 'r3', ran_at: '2026-08-21T20:10:00+09:00', distance_km: 4.1, duration_sec: 1450, avg_pace_sec_per_km: 353 },
];
const MOCK = [
  { nickname: '이준', avatarUrl: null, me: true, streakDays: 4, baseline: 360, runs: ME_RUNS },
  { nickname: '테스트2', avatarUrl: null, me: false, streakDays: 2, baseline: 380, runs: RIVAL_RUNS },
];
const MOCK_DAYS_LEFT = 3; // TODO(contract): from ends_at

export default function BattlePreviewScreen() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const T = useT();
  const lang = useLang(); // render-path interpolation anchor (house tfIn rule)

  const scored = MOCK.map(p => ({
    ...p,
    score: aggregateScore(p.runs, { baselinePaceSecPerKm: p.baseline, streakDays: p.streakDays }),
  })).sort((a, b) => b.score.totalPts - a.score.totalPts);

  return (
    <View style={st.root}>
      <View style={[st.appBar, { marginTop: insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appTitle}>{T('bt.title')}</Text>
        <View style={{ width: 20 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        {/* 진행 중 banner */}
        <View style={st.liveBanner}>
          <View style={st.liveDot} />
          <Text style={st.liveTxt}>{T('bt.live')}</Text>
          <Text style={st.daysTxt}>{tfIn(lang, 'bt.daysLeft', { n: MOCK_DAYS_LEFT })}</Text>
        </View>
        <View style={st.mockChip}><Text style={st.mockChipTxt}>{T('bt.mockNotice')}</Text></View>

        {scored.map((p, i) => (
          <View key={p.nickname} style={[st.card, shadows.sm, i === 0 && st.cardLead]}>
            {/* participant head — the rank-row grammar */}
            <View style={st.head}>
              <View style={[st.rankMedal, { backgroundColor: i === 0 ? C.crown : C.faint }]}>
                <Text style={st.rankMedalTxt}>{i + 1}</Text>
              </View>
              <Avatar name={p.nickname} size={34} photoUrl={p.avatarUrl} />
              <Text style={st.name} numberOfLines={1}>{p.nickname}</Text>
              <Text style={st.total}>{tfIn(lang, 'bt.totalPts', { n: p.score.totalPts })}</Text>
            </View>
            {/* breakdown strip */}
            <Breakdown score={p.score} streakDays={p.streakDays} />
            {/* per-run contributions */}
            {p.score.runs.map(r => {
              const run = p.runs.find(x => x.id === r.runId)!;
              return (
                <View key={r.runId} style={st.runRow}>
                  <Icon name={r.qualified ? 'checkmark-circle' : 'remove-circle-outline'} size={15} color={r.qualified ? C.accent : C.faint} />
                  <Text style={st.runDist}>{run.distance_km.toFixed(1)}km</Text>
                  {r.earlyBird > 0 && <Icon name="sunny-outline" size={13} color={C.sun} />}
                  {r.milestone > 0 && <Icon name="trophy-outline" size={13} color={C.crown} />}
                  <View style={{ flex: 1 }} />
                  <Text style={[st.runPts, !r.qualified && { color: C.faint }]}>
                    {r.qualified ? tfIn(lang, 'bt.runPts', { n: r.pts }) : T('bt.notQualified')}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function Breakdown({ score, streakDays }: { score: BattleScore; streakDays: number }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  const lang = useLang();
  const base = score.runs.reduce((a, r) => a + r.base, 0);
  const bonus = score.rawPts - base;
  return (
    <View style={st.breakRow}>
      <View style={st.breakPill}>
        <Text style={st.breakLabel}>{T('bt.ptsBase')}</Text>
        <Text style={st.breakVal}>{base}</Text>
      </View>
      <View style={st.breakPill}>
        <Text style={st.breakLabel}>{T('bt.ptsBonus')}</Text>
        <Text style={st.breakVal}>{bonus}</Text>
      </View>
      {score.streakMultiplier > 1 && (
        <View style={[st.breakPill, { backgroundColor: C.accentDim }]}>
          <Icon name="flame" size={12} color={C.accentGrn} />
          <Text style={[st.breakVal, { color: C.accentGrn }]}>
            {tfIn(lang, 'bt.streakBadge', { n: streakDays, m: score.streakMultiplier.toFixed(2) })}
          </Text>
        </View>
      )}
    </View>
  );
}

const makeSt = (C: Tokens) => ({
  root: { flex: 1, backgroundColor: C.bg },
  appBar: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: S.lg, paddingVertical: 10 },
  backBtn: { padding: 2 },
  appTitle: { fontSize: 17, fontWeight: '800' as const, color: C.text },
  liveBanner: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 10 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  liveTxt: { fontSize: 13, fontWeight: '800' as const, color: C.accentGrn },
  daysTxt: { fontSize: 13, color: C.sub },
  mockChip: { alignSelf: 'flex-start' as const, backgroundColor: C.surfaceAlt, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4, marginBottom: S.md },
  mockChipTxt: { fontSize: 11, color: C.faint, fontWeight: '600' as const },
  card: { backgroundColor: C.surface, borderRadius: R.xl, borderWidth: 1, borderColor: C.border, padding: S.md, marginBottom: S.md },
  cardLead: { borderColor: C.accent + '66' },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginBottom: 10 },
  rankMedal: { width: 22, height: 22, borderRadius: 11, alignItems: 'center' as const, justifyContent: 'center' as const },
  rankMedalTxt: { fontSize: 12, fontWeight: '800' as const, color: '#0D1A06' },
  name: { flex: 1, fontSize: 15, fontWeight: '700' as const, color: C.text },
  total: { fontSize: 18, fontWeight: '800' as const, color: C.accentGrn, fontVariant: ['tabular-nums' as const] },
  breakRow: { flexDirection: 'row' as const, gap: 6, marginBottom: 10, flexWrap: 'wrap' as const },
  breakPill: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, backgroundColor: C.surfaceAlt, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4 },
  breakLabel: { fontSize: 11, color: C.sub },
  breakVal: { fontSize: 12, fontWeight: '800' as const, color: C.text, fontVariant: ['tabular-nums' as const] },
  runRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 7, paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.border },
  runDist: { fontSize: 13, fontWeight: '700' as const, color: C.text, fontVariant: ['tabular-nums' as const] },
  runPts: { fontSize: 12, fontWeight: '700' as const, color: C.sub },
});
