/**
 * 배틀 생성 목-플로우 (8/21) — THE CONTRACT PROPOSAL, not a feature.
 * UNLINKED route (/battle-create-demo), never wired into nav; its purpose
 * is a screen-recordable clickable spec for 지연: three steps showing
 * exactly which fields + lifecycle the FE needs. The ONLY live call is
 * searchUsers (existing read-only endpoint); the final CTA posts NOTHING.
 *
 * SAFE ASSUMPTIONS (our design, survive any contract):
 *   duration 1–30d (30 cap baked) · format 순수 기록/포인트 · metric
 *   거리/횟수/페이스/스트릭 · the 3-step flow shape itself
 * TODO(contract) — everything below needs her shapes:
 *   eligibility doors on the picker (follow state? blocked? private? —
 *     v1 shows raw search results with no filter, deliberately)
 *   POST /battles body + response (id, status, invited-vs-active)
 *   invite lifecycle (does the battle start on create or on accept?)
 *   window anchoring (starts_at = accept time? create time? midnight?)
 *   stake/reward semantics if any
 */
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/ui';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { tfIn, useLang, useT } from '@/lib/i18n';
import { searchUsers, type UserSearchItem } from '@/lib/profile-api';
import { radius as R, spacing as S, shadows, type Tokens } from '@/lib/theme';

const DURATIONS = [3, 7, 14, 30] as const; // 30d max baked (owner spec)
const MIN_Q = 2;
const DEBOUNCE_MS = 400;

type Format = 'pure' | 'points';
type Metric = 'dist' | 'count' | 'pace' | 'streak';

export default function BattleCreateDemoScreen() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const T = useT();
  const lang = useLang();

  const [step, setStep] = useState(0);
  const [opponent, setOpponent] = useState<UserSearchItem | null>(null);
  const [days, setDays] = useState<number>(7);
  const [format, setFormat] = useState<Format>('points');
  const [metric, setMetric] = useState<Metric>('dist');
  const [toast, setToast] = useState(false);

  // ── opponent search — user-search's exact machinery (debounce + seq) ──
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<UserSearchItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const seqRef = useRef(0);
  const trimmed = q.trim();
  useEffect(() => {
    if (trimmed.length < MIN_Q) { seqRef.current++; setRows(null); setLoading(false); return; }
    const seq = ++seqRef.current;
    setLoading(true);
    const t = setTimeout(() => {
      // TODO(contract): eligibility doors — follow state / blocked / private
      // accounts are shown UNFILTERED here; her rules decide who is battle-able
      searchUsers(trimmed)
        .then(r => { if (seqRef.current === seq) { setRows(r); setLoading(false); } })
        .catch(() => { if (seqRef.current === seq) { setRows([]); setLoading(false); } });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [trimmed]);

  const fmtLabel = format === 'pure' ? T('bc.formatPure') : T('bc.formatPoints');
  const steps = [T('bc.stepOpponent'), T('bc.stepSettings'), T('bc.stepConfirm')];
  const canNext = step === 0 ? opponent != null : true;

  return (
    <View style={st.root}>
      <View style={[st.appBar, { marginTop: insets.top }]}>
        <Pressable onPress={() => (step > 0 ? setStep(s => s - 1) : router.back())} hitSlop={12}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appTitle}>{T('bc.title')}</Text>
        <View style={{ width: 20 }} />
      </View>
      {/* step dots */}
      <View style={st.stepRow}>
        {steps.map((label, i) => (
          <View key={label} style={st.stepItem}>
            <View style={[st.stepDot, i <= step && { backgroundColor: C.accent }]} />
            <Text style={[st.stepLbl, i === step && { color: C.text, fontWeight: '700' }]}>{label}</Text>
          </View>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + 90 }} keyboardShouldPersistTaps="handled">
        {step === 0 && (
          <>
            <View style={st.searchBox}>
              <Icon name="search" size={16} color={C.faint} />
              <TextInput
                style={st.searchInput}
                value={q}
                onChangeText={setQ}
                placeholder={T('bc.searchPh')}
                placeholderTextColor={C.faint}
                autoFocus
              />
            </View>
            {trimmed.length > 0 && trimmed.length < MIN_Q && <Text style={st.hint}>{T('bc.searchHint')}</Text>}
            {rows?.length === 0 && !loading && <Text style={st.hint}>{T('bc.noResults')}</Text>}
            {(rows ?? []).map(u => (
              <Pressable key={u.user_id} onPress={() => setOpponent(u)} style={[st.userRow, opponent?.user_id === u.user_id && st.userRowSel]}>
                <Avatar name={u.nickname} size={36} photoUrl={u.avatar_url} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.userName} numberOfLines={1}>{u.nickname}</Text>
                  {!!u.bio && <Text style={st.userBio} numberOfLines={1}>{u.bio}</Text>}
                </View>
                {opponent?.user_id === u.user_id && <Icon name="checkmark-circle" size={20} color={C.accent} />}
              </Pressable>
            ))}
          </>
        )}

        {step === 1 && (
          <>
            <Text style={st.secLabel}>{T('bc.duration')}</Text>
            <View style={st.chipRow}>
              {DURATIONS.map(d => (
                <Pressable key={d} onPress={() => setDays(d)} style={[st.chip, days === d && st.chipSel]}>
                  <Text style={[st.chipTxt, days === d && st.chipTxtSel]}>{tfIn(lang, 'bc.days', { n: d })}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={st.secLabel}>{T('bc.format')}</Text>
            {([['points', 'bc.formatPoints', 'bc.formatPointsSub'], ['pure', 'bc.formatPure', 'bc.formatPureSub']] as const).map(([val, tKey, subKey]) => (
              <Pressable key={val} onPress={() => setFormat(val)} style={[st.fmtCard, format === val && st.userRowSel]}>
                <View style={{ flex: 1 }}>
                  <Text style={st.userName}>{T(tKey)}</Text>
                  <Text style={st.userBio}>{T(subKey)}</Text>
                </View>
                {format === val && <Icon name="checkmark-circle" size={20} color={C.accent} />}
              </Pressable>
            ))}
            {format === 'pure' && (
              <>
                <Text style={st.secLabel}>{T('bc.metric')}</Text>
                <View style={st.chipRow}>
                  {([['dist', 'bc.metricDist'], ['count', 'bc.metricCount'], ['pace', 'bc.metricPace'], ['streak', 'bc.metricStreak']] as const).map(([val, tKey]) => (
                    <Pressable key={val} onPress={() => setMetric(val)} style={[st.chip, metric === val && st.chipSel]}>
                      <Text style={[st.chipTxt, metric === val && st.chipTxtSel]}>{T(tKey)}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
          </>
        )}

        {step === 2 && opponent && (
          <View style={[st.confirmCard, shadows.sm]}>
            <View style={st.vsRow}>
              <View style={st.vsSide}>
                <Avatar name="이준" size={48} photoUrl={null} />
                <Text style={st.userName}>이준</Text>
              </View>
              <Text style={st.vsTxt}>{T('bc.vs')}</Text>
              <View style={st.vsSide}>
                <Avatar name={opponent.nickname} size={48} photoUrl={opponent.avatar_url} />
                <Text style={st.userName} numberOfLines={1}>{opponent.nickname}</Text>
              </View>
            </View>
            <Text style={st.summaryTxt}>
              {tfIn(lang, 'bc.summary', { days, format: fmtLabel })}
              {format === 'pure' ? ` · ${T(({ dist: 'bc.metricDist', count: 'bc.metricCount', pace: 'bc.metricPace', streak: 'bc.metricStreak' } as const)[metric])}` : ''}
            </Text>
            {/* TODO(contract): starts_at anchoring + invite lifecycle — this
                card asserts nothing about WHEN the battle begins */}
          </View>
        )}
      </ScrollView>

      <View style={[st.footer, { paddingBottom: insets.bottom + 10 }]}>
        {step < 2 ? (
          <Pressable disabled={!canNext} onPress={() => setStep(s => s + 1)} style={[st.cta, !canNext && { opacity: 0.4 }]}>
            <Text style={st.ctaTxt}>{T('bc.next')}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => { setToast(true); setTimeout(() => setToast(false), 1600); }} style={st.cta}>
            <Text style={st.ctaTxt}>{T('bc.start')}</Text>
          </Pressable>
        )}
      </View>
      {toast && (
        <View style={st.toast}><Text style={st.toastTxt}>{T('bc.demoToast')}</Text></View>
      )}
    </View>
  );
}

const makeSt = (C: Tokens) => ({
  root: { flex: 1, backgroundColor: C.bg },
  appBar: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: S.lg, paddingVertical: 10 },
  appTitle: { fontSize: 17, fontWeight: '800' as const, color: C.text },
  stepRow: { flexDirection: 'row' as const, justifyContent: 'center' as const, gap: 18, paddingVertical: 8 },
  stepItem: { alignItems: 'center' as const, gap: 4 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border },
  stepLbl: { fontSize: 11, color: C.faint },
  searchBox: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, marginBottom: S.md },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 15, color: C.text },
  hint: { fontSize: 13, color: C.faint, textAlign: 'center' as const, marginTop: S.md },
  userRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: 10, marginBottom: 8 },
  userRowSel: { borderColor: C.accent },
  userName: { fontSize: 14, fontWeight: '700' as const, color: C.text },
  userBio: { fontSize: 12, color: C.sub },
  secLabel: { fontSize: 13, fontWeight: '700' as const, color: C.sub, marginTop: S.md, marginBottom: 8 },
  chipRow: { flexDirection: 'row' as const, gap: 8, flexWrap: 'wrap' as const },
  chip: { backgroundColor: C.surface, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 8 },
  chipSel: { backgroundColor: C.accent, borderColor: C.accent },
  chipTxt: { fontSize: 13, fontWeight: '600' as const, color: C.text },
  chipTxtSel: { color: '#0D1A06', fontWeight: '800' as const },
  fmtCard: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 8 },
  confirmCard: { backgroundColor: C.surface, borderRadius: R.xl, borderWidth: 1, borderColor: C.border, padding: S.lg, alignItems: 'center' as const, gap: 12 },
  vsRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 16 },
  vsSide: { alignItems: 'center' as const, gap: 6, minWidth: 80 },
  vsTxt: { fontSize: 18, fontWeight: '800' as const, color: C.accentGrn },
  summaryTxt: { fontSize: 14, color: C.sub },
  footer: { position: 'absolute' as const, left: 0, right: 0, bottom: 0, paddingHorizontal: S.lg, paddingTop: 10, backgroundColor: C.bg },
  cta: { backgroundColor: C.accent, borderRadius: R.pill, alignItems: 'center' as const, paddingVertical: 14 },
  ctaTxt: { fontSize: 15, fontWeight: '800' as const, color: '#0D1A06' },
  toast: { position: 'absolute' as const, bottom: 110, alignSelf: 'center' as const, backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: R.pill, paddingHorizontal: 16, paddingVertical: 9 },
  toastTxt: { fontSize: 13, color: '#fff', fontWeight: '600' as const },
});
