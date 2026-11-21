/**
 * 배틀 생성 플로우 — spec §2.6-2 (v0 LOCKED 8/29) · redesign 8b (2026-11-21):
 * REAL wire-in. Opponent = any user via GET /users/search (contract ruling
 * ②: eligibility = everyone minus blocked/private, enforced server-side as a
 * hidden 404 — no follow requirement, v1 = invite-only). Submit = POST
 * /battles (403 battle_free_limit · 409 battle_active_cap · 404 → honest
 * alerts). v1 = 1v1 points battle (format/metric pickers died with v0).
 * Route: /battle-create (?opponent=<uid> prefill = the rematch CTA).
 */
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { BattleTermsCard } from '@/components/battle-terms';
import { SeededSlider } from '@/components/seeded-slider';
import { Icon } from '@/components/ui';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { track } from '@/lib/analytics';
import { ApiError } from '@/lib/api';
import { BATTLE_DAYS_MAX, BATTLE_DAYS_MIN, BATTLE_EMOJIS, DEFAULT_BATTLE_EMOJI } from '@/lib/battles-api';
import { errorMessage } from '@/lib/error-copy';
import { t, tfIn, useLang, useT } from '@/lib/i18n';
import { searchUsers, type UserSearchItem } from '@/lib/profile-api';
import { radius as R, spacing as S, shadows, type Tokens } from '@/lib/theme';
import { useBattles, type BattleProfile } from '@/store/use-battles';
import { useStore } from '@/store/use-store';

const DURATIONS = [3, 7, 14, 30] as const; // spec §2.2 preset chips (30d max)
const clampDays = (v: number) => Math.min(BATTLE_DAYS_MAX, Math.max(BATTLE_DAYS_MIN, Math.round(v)));
const TITLE_MAX = 30;
type Opp = { user_id: string; nickname: string; avatar_url: string | null };

export default function BattleCreateScreen() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const T = useT();
  const lang = useLang();
  const myName = useStore(s => s.displayName);
  const myPhoto = useStore(s => s.photoUrl);

  // Rematch prefill: /battle-create?opponent=<uid> — the profile is already in
  // the battles store (the settle screen came from it); fall back to a fetch.
  const { opponent: prefillId } = useLocalSearchParams<{ opponent?: string }>();
  const profiles = useBattles(s => s.profiles);
  const prefill: Opp | null = prefillId ? (profiles[prefillId] as BattleProfile | undefined) ?? null : null;
  const [step, setStep] = useState(prefill ? 1 : 0);
  const [opponent, setOpponent] = useState<Opp | null>(prefill);
  useEffect(() => {
    if (prefillId && !opponent) {
      useBattles.getState().ensureProfiles([prefillId]).then(() => {
        const p = useBattles.getState().profiles[prefillId];
        if (p) { setOpponent(p); setStep(1); }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillId]);

  // Opponent search — the start-picker idiom (300ms debounce + seq stale-guard); q ≥ 2 (server 422 below).
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchItem[] | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { seq.current++; setResults(null); return; }
    const mine = ++seq.current;
    const h = setTimeout(() => {
      searchUsers(q, 20)
        .then(rows => { if (seq.current === mine) setResults(rows); })
        .catch(() => { if (seq.current === mine) setResults([]); });
    }, 300);
    return () => clearTimeout(h);
  }, [query]);

  const [days, setDays] = useState<number>(7);
  const [custom, setCustom] = useState(false);
  const [emoji, setEmoji] = useState<string>(DEFAULT_BATTLE_EMOJI);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const steps = [T('bc.stepOpponent'), T('bc.stepSettings'), T('bc.stepConfirm')];
  const canNext = step === 0 ? opponent != null : true;

  async function submit() {
    if (!opponent || busy) return;
    setBusy(true);
    try {
      const finalTitle = title.trim() || tfIn(lang, 'bat.vsName', { name: opponent.nickname });
      await useBattles.getState().create(opponent.user_id, days, finalTitle.slice(0, 60), emoji);
      track('battle_create', { duration_days: days });
      router.back(); // lands on the 그룹 › 배틀 view as a pending (sent) row
    } catch (e: unknown) {
      const code = e instanceof ApiError ? e.code : null;
      const status = e instanceof ApiError ? e.status : 0;
      const msg = code === 'battle_free_limit' ? t('bat.freeLimit')
        : code === 'battle_active_cap' ? t('bat.activeCap')
        : status === 404 ? t('bat.oppUnavailable')
        : errorMessage(e);
      Alert.alert(t('bat.createFail'), msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={st.root}>
      <View style={[st.appBar, { marginTop: insets.top }]}>
        <Pressable onPress={() => (step > 0 ? setStep(s => s - 1) : router.back())} hitSlop={12}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appTitle}>{T('bc.title')}</Text>
        <View style={{ width: 20 }} />
      </View>
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
            <Text style={st.hint}>{T('bc.searchHint')}</Text>
            <View style={st.searchBar}>
              <Icon name="search" size={16} color={C.faint} />
              <TextInput value={query} onChangeText={setQuery} placeholder={T('bc.searchPh')} placeholderTextColor={C.faint} autoCorrect={false} autoCapitalize="none" returnKeyType="search" style={st.searchInput} />
              {query.length > 0 && <Pressable onPress={() => setQuery('')} hitSlop={8}><Icon name="close-circle" size={16} color={C.faint} /></Pressable>}
            </View>
            {opponent && (
              <View style={[st.userRow, st.userRowSel]}>
                <Avatar name={opponent.nickname} size={36} photoUrl={opponent.avatar_url} />
                <Text style={[st.userName, { flex: 1 }]} numberOfLines={1}>{opponent.nickname}</Text>
                <Icon name="checkmark-circle" size={20} color={C.accent} />
              </View>
            )}
            {query.trim().length >= 2 && results === null && <ActivityIndicator size="small" color={C.faint} style={{ paddingVertical: 16 }} />}
            {results?.filter(u => u.user_id !== opponent?.user_id).map(u => (
              <Pressable key={u.user_id} onPress={() => setOpponent(u)} style={st.userRow}>
                <Avatar name={u.nickname} size={36} photoUrl={u.avatar_url} />
                <Text style={[st.userName, { flex: 1 }]} numberOfLines={1}>{u.nickname}</Text>
              </Pressable>
            ))}
            {results && results.length === 0 && <Text style={st.hint}>{T('region.noResults')}</Text>}
          </>
        )}

        {step === 1 && (
          <>
            <Text style={st.secLabel}>{T('bc.duration')}</Text>
            <View style={st.chipRow}>
              {DURATIONS.map(d => (
                <Pressable key={d} onPress={() => { setCustom(false); setDays(d); }} style={[st.chip, !custom && days === d && st.chipSel]}>
                  <Text style={[st.chipTxt, !custom && days === d && st.chipTxtSel]}>{tfIn(lang, 'bc.days', { n: d })}</Text>
                </Pressable>
              ))}
              <Pressable onPress={() => setCustom(true)} style={[st.chip, custom && st.chipSel]}>
                <Text style={[st.chipTxt, custom && st.chipTxtSel]}>{T('bc.durationCustom')}</Text>
              </Pressable>
            </View>
            {custom && (
              <View style={st.customBox}>
                <Text style={st.customValue}>{tfIn(lang, 'bc.days', { n: days })}</Text>
                <SeededSlider siteId="battle-days" style={st.slider} minimumValue={BATTLE_DAYS_MIN} maximumValue={BATTLE_DAYS_MAX} step={1} value={days}
                  onValueChange={v => setDays(clampDays(v))} minimumTrackTintColor={C.accent} maximumTrackTintColor={C.border} thumbTintColor={C.accent} />
                <View style={st.sliderLabels}>
                  <Text style={st.sliderLabel}>{tfIn(lang, 'bc.days', { n: BATTLE_DAYS_MIN })}</Text>
                  <Text style={st.sliderLabel}>{tfIn(lang, 'bc.days', { n: BATTLE_DAYS_MAX })}</Text>
                </View>
              </View>
            )}
            <Text style={st.secLabel}>{T('bc.emojiLabel')}</Text>
            <View style={st.emojiRow}>
              {BATTLE_EMOJIS.map(e => (
                <Pressable key={e} onPress={() => setEmoji(e)} style={[st.emojiChip, emoji === e && st.emojiChipSel]}>
                  <Text style={st.emojiTxt}>{e}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={st.secLabel}>{T('bat.optTitle')}</Text>
            <View style={st.titleBox}>
              <TextInput style={st.titleInput} value={title} onChangeText={v => setTitle(v.slice(0, TITLE_MAX))} placeholder={T('bat.titlePh')} placeholderTextColor={C.faint} maxLength={TITLE_MAX} />
            </View>
          </>
        )}

        {step === 2 && opponent && (
          <View style={[st.confirmCard, shadows.sm]}>
            <Text style={st.confirmEmoji}>{emoji}</Text>
            <View style={st.vsRow}>
              <View style={st.vsSide}>
                <Avatar name={myName ?? T('bat.me')} size={48} photoUrl={myPhoto} />
                <Text style={st.userName}>{T('bat.me')}</Text>
              </View>
              <Text style={st.vsTxt}>{T('bc.vs')}</Text>
              <View style={st.vsSide}>
                <Avatar name={opponent.nickname} size={48} photoUrl={opponent.avatar_url} />
                <Text style={st.userName} numberOfLines={1}>{opponent.nickname}</Text>
              </View>
            </View>
            {title.trim().length > 0 && <Text style={st.battleTitle}>{title.trim()}</Text>}
            <BattleTermsCard durationDays={days} />
          </View>
        )}
      </ScrollView>

      <View style={[st.footer, { paddingBottom: insets.bottom + 10 }]}>
        {step < 2 ? (
          <Pressable disabled={!canNext} onPress={() => setStep(s => s + 1)} style={[st.cta, !canNext && { opacity: 0.4 }]}>
            <Text style={st.ctaTxt}>{T('bc.next')}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={submit} disabled={busy} style={[st.cta, busy && { opacity: 0.6 }]}>
            {busy ? <ActivityIndicator size="small" color="#0D1A06" /> : <Text style={st.ctaTxt}>{T('bc.start')}</Text>}
          </Pressable>
        )}
      </View>
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
  hint: { fontSize: 13, color: C.faint, marginBottom: S.md },
  searchBar: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingHorizontal: 12, height: 44, marginBottom: 10 },
  searchInput: { flex: 1, fontSize: 14.5, fontWeight: '600' as const, color: C.text, paddingVertical: 0 },
  userRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: 10, marginBottom: 8 },
  userRowSel: { borderColor: C.accent },
  userName: { fontSize: 14, fontWeight: '700' as const, color: C.text },
  secLabel: { fontSize: 13, fontWeight: '700' as const, color: C.sub, marginTop: S.md, marginBottom: 8 },
  chipRow: { flexDirection: 'row' as const, gap: 8, flexWrap: 'wrap' as const },
  chip: { backgroundColor: C.surface, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 8 },
  chipSel: { backgroundColor: C.accent, borderColor: C.accent },
  chipTxt: { fontSize: 13, fontWeight: '600' as const, color: C.text },
  chipTxtSel: { color: '#0D1A06', fontWeight: '800' as const },
  customBox: { marginTop: 10, backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: 12 },
  customValue: { fontSize: 17, fontWeight: '800' as const, color: C.text, textAlign: 'center' as const, fontVariant: ['tabular-nums' as const] },
  slider: { marginTop: 4 },
  sliderLabels: { flexDirection: 'row' as const, justifyContent: 'space-between' as const },
  sliderLabel: { fontSize: 11, color: C.faint },
  emojiRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  emojiChip: { width: 44, height: 44, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center' as const, justifyContent: 'center' as const },
  emojiChipSel: { borderColor: C.accent, backgroundColor: C.accentDim },
  emojiTxt: { fontSize: 20 },
  confirmEmoji: { fontSize: 34 },
  titleBox: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12 },
  titleInput: { paddingVertical: 11, fontSize: 15, color: C.text },
  confirmCard: { backgroundColor: C.surface, borderRadius: R.xl, borderWidth: 1, borderColor: C.border, padding: S.lg, alignItems: 'center' as const, gap: 12 },
  vsRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 16 },
  vsSide: { alignItems: 'center' as const, gap: 6, minWidth: 80 },
  vsTxt: { fontSize: 18, fontWeight: '800' as const, color: C.accentGrn },
  battleTitle: { fontSize: 15, fontWeight: '800' as const, color: C.text },
  footer: { position: 'absolute' as const, left: 0, right: 0, bottom: 0, paddingHorizontal: S.lg, paddingTop: 10, backgroundColor: C.bg },
  cta: { backgroundColor: C.accent, borderRadius: R.pill, alignItems: 'center' as const, paddingVertical: 14 },
  ctaTxt: { fontSize: 15, fontWeight: '800' as const, color: '#0D1A06' },
});
