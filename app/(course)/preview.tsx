/**
 * 코스 미리보기 — course preview + confirm, reached from a feed card's
 * "이 코스 달리기". Rebuilt 1:1 from the course-preview.jsx bundle spec.
 *
 * Course data arrives via store/pending-course (set by the feed — the
 * backend's GET /routes/{id} is owner-only, so a non-owner can't refetch
 * a public course by id). Falls back to the legacy JSON `item` param.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
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

import { Avatar } from '@/components/avatar';
import { MiniMap } from '@/components/mini-map';
import { RealMap } from '@/components/real-map';
import { Icon } from '@/components/ui';
import { errorMessage } from '@/lib/error-copy';
import { t, tfIn, useLang, useT } from '@/lib/i18n';
import { copyRoute } from '@/lib/routes-api';
import { courseStats, distUnit, fmtDist, fmtDuration, fmtPace, fmtPaceIn, paceUnit, type CourseStatsInput } from '@/lib/run-format';
import { useSettings } from '@/store/use-settings';
import { setActiveCourse } from '@/store/active-course';
import { clearPendingCourse, getPendingCourse } from '@/store/pending-course';
import { setRouteMap } from '@/store/route-map';
import { accentShadow,
  radius as R,
  shadows,
  spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';

function parseItem(raw: string | string[] | undefined): CourseStatsInput {
  if (typeof raw !== 'string') return {};
  try { return JSON.parse(raw) as CourseStatsInput; } catch { return {}; }
}

export default function CoursePreviewScreen() {
  const T = useT();
  const lang = useLang();
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ item?: string }>();
  const [pending] = useState(() => getPendingCourse());
  const units = useSettings(s => s.settings.units);
  useEffect(() => () => clearPendingCourse(), []);

  // Unit-aware pace: only computable for the feed-handoff path (we have raw
  // minutes+km). The legacy param path carries preformatted km strings — shown
  // as-is (documented skip; that path is dead since the feed handoff).
  const paceSecPerKm = pending && pending.estimated_duration_min != null && pending.total_distance_km > 0
    ? Math.round((pending.estimated_duration_min * 60) / pending.total_distance_km)
    : null;

  const s = useMemo(() => {
    if (pending) {
      const dist = pending.total_distance_km;
      const estMin = pending.estimated_duration_min;
      return courseStats({
        dist,
        dur:  estMin != null ? fmtDuration(Math.round(estMin * 60)) : undefined,
        pace: estMin != null && dist > 0 ? fmtPace(Math.round((estMin * 60) / dist)) : undefined,
        title: pending.summary,
        seed:  pending.id,
        name:  pending.owner_nickname ?? undefined,
      }, lang);
    }
    return courseStats(parseItem(params.item), lang);
  }, [pending, params.item, lang]);

  const [starting, setStarting] = useState(false);

  // 이 코스 저장 (repair slice ③) REMOVED 2026-07-21 — owner step-back
  // ruling, returns post-launch. Implementation at commit 82c5bc9 (seeded
  // bookmark square beside 네-뛸게요, others' courses only).

  const confirmRun = async () => {
    if (starting) return;
    // Legacy param-only path (no feed handoff) has no route id to copy/link.
    if (!pending) {
      Alert.alert(t('pv.soonT'), t('pv.soonB'));
      return;
    }
    setStarting(true);
    try {
      if (pending.is_mine) {
        // 내 코스 direct-run (D3 ruling): no copy — runs.route_id links the
        // ORIGINAL row (owner reads are visibility-unscoped, so published-own
        // and private-own run identically). Copying own routes would mint a
        // duplicate 내 코스 row per run.
        setActiveCourse({
          id: pending.id,
          title: pending.summary,
          distanceKm: pending.total_distance_km,
          polyline: pending.polyline ?? null,
        });
      } else {
        // "이 코스 달리기" = copy into my account; the copy's id links runs.route_id
        const copy = await copyRoute(pending.id);
        setActiveCourse({
          id: copy.id,
          title: copy.summary,
          distanceKm: copy.total_distance_km,
          polyline: copy.polyline ?? pending.polyline ?? null,
        });
      }
      // replace: back from tracking-idle should land on the feed, not here
      router.replace('/(course)/tracking' as any);
    } catch (e: unknown) {
      Alert.alert(t('pv.startFailT'), errorMessage(e));
      setStarting(false);
    }
  };

  return (
    <View style={st.root}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* ── Hero map ─────────────────────────────────────────────── */}
        <View style={st.hero}>
          {pending?.polyline && pending.polyline.length >= 2 ? (
            // real course geometry — hero class (cache=false) + 출발지 pin;
            // tap → full route map (tap-to-enlarge grammar)
            <Pressable onPress={() => {
              setRouteMap({ title: pending.summary, polyline: pending.polyline! });
              router.push('/(course)/route-map' as never);
            }}>
              <RealMap height={300} borderRadius={0} polyline={pending.polyline} startPin cache={false} />
            </Pressable>
          ) : (
            <MiniMap seed={s.seed ?? 'course-preview'} height={300} borderRadius={0} />
          )}
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(8,12,4,0.55)', 'rgba(8,12,4,0)']}
            style={st.heroScrim}
          />
          <View style={[st.heroTop, { top: insets.top + 6 }]}>
            <Pressable onPress={() => router.back()} hitSlop={8} style={st.backBtn}>
              <Icon name="arrow-back" size={20} color="#fff" />
            </Pressable>
            <View style={st.heroPill}>
              <Icon name="navigate-outline" size={14} color="#7CF03D" />
              <Text style={st.heroPillTxt}>{T('pv.pill')}</Text>
            </View>
            <View style={{ width: 42 }} />
          </View>
          <View style={st.authorChip}>
            {/* initials-only: preview's payload carries no avatar_url */}
            <Avatar name={s.name} size={26} letterSpacing={-0.3} />
            <Text style={st.authorTxt}>{s.name ? tfIn(lang, 'pv.byName', { name: s.name }) : T('pv.suggested')}</Text>
          </View>
        </View>

        {/* ── Body ─────────────────────────────────────────────────── */}
        <View style={st.body}>
          <Text style={st.title}>{s.title ?? T('pv.suggested')}</Text>
          {s.tags.length > 0 && (
            <View style={st.tags}>
              {s.tags.map(t => (
                <View key={t} style={st.tag}><Text style={st.tagTxt}>{t}</Text></View>
              ))}
            </View>
          )}

          {/* Reference stats */}
          <View style={st.refHead}>
            <Text style={st.refTitle}>{T('pv.refTitle')}</Text>
            <Text style={st.refNote}>{T('pv.refNote')}</Text>
          </View>
          <View style={st.statsRow}>
            {([
              ['resize-outline',      fmtDist(s.dist, units, 1), distUnit(units), T('cp.dist')],
              ['time-outline',        s.dur,                     '',              T('cp.estTime')],
              paceSecPerKm != null
                ? ['speedometer-outline', fmtPaceIn(paceSecPerKm, units), paceUnit(units), T('pv.pace')]
                : ['speedometer-outline', s.pace,                         '/km',           T('pv.pace')],
            ] as [string, string, string, string][]).map(([icon, val, unit, label], i) => (
              <View key={i} style={[st.statTile, shadows.sm]}>
                <Icon name={icon} size={17} color={C.sub} />
                <Text style={st.statVal}>
                  {val}{unit ? <Text style={st.statUnit}> {unit}</Text> : null}
                </Text>
                <Text style={st.statLbl}>{label}</Text>
              </View>
            ))}
          </View>

          {/* Start point */}
          <View style={st.startRow}>
            <View style={st.startIcon}>
              <Icon name="location" size={18} color={C.accentGrn} />
            </View>
            <View style={{ minWidth: 0 }}>
              <Text style={st.startLbl}>{T('pv.start')}</Text>
              <Text style={st.startVal} numberOfLines={1}>{s.area}</Text>
            </View>
          </View>
        </View>
        <View style={{ height: 18 }} />
      </ScrollView>

      {/* ── Confirm footer ─────────────────────────────────────────── */}
      <View style={[st.footer, { paddingBottom: Math.max(insets.bottom + 10, 26) }]}>
        <Text style={st.confirmTxt}>{T('pv.confirmAsk')}</Text>
        <View style={st.actionRow}>
          <Pressable
            onPress={confirmRun}
            disabled={starting}
            style={({ pressed }) => [st.runBtn, accentShadow(C.accent), { opacity: pressed || starting ? 0.9 : 1 }]}
          >
            {starting
              ? <ActivityIndicator size="small" color={C.accentText} />
              : (
                <>
                  <Icon name="play" size={19} color={C.accentText} />
                  <Text style={st.runTxt}>{T('pv.yes')}</Text>
                </>
              )}
          </Pressable>
        </View>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [st.cancelBtn, { opacity: pressed ? 0.7 : 1 }]}>
          <Text style={st.cancelTxt}>{T('common.cancel')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Hero
  hero:      { position: 'relative' },
  heroScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 120 },
  heroTop:   { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:   { width: 42, height: 42, borderRadius: R.pill, backgroundColor: 'rgba(12,14,10,0.6)', alignItems: 'center', justifyContent: 'center' },
  heroPill:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(12,14,10,0.6)', borderRadius: R.pill, paddingHorizontal: 14, paddingVertical: 8 },
  heroPillTxt: { fontSize: 12.5, fontWeight: '700', color: '#fff', letterSpacing: -0.2 },
  authorChip:  { position: 'absolute', left: 16, bottom: 14, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(12,14,10,0.55)', borderRadius: R.pill, paddingTop: 5, paddingBottom: 5, paddingLeft: 5, paddingRight: 12 },
  authorTxt:   { fontSize: 12.5, fontWeight: '700', color: '#fff', letterSpacing: -0.2 },

  // Body
  body:   { paddingTop: 20, paddingHorizontal: S.gutter },
  title:  { fontSize: 24, fontWeight: '700', letterSpacing: -0.7, color: C.text },
  tags:   { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 11 },
  tag:    { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 3 },
  tagTxt: { fontSize: 11.5, fontWeight: '600', color: C.sub },

  refHead:  { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 22, marginBottom: 10, paddingHorizontal: 2 },
  refTitle: { fontSize: 13.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  refNote:  { fontSize: 11.5, color: C.faint, letterSpacing: -0.2 },

  statsRow: { flexDirection: 'row', gap: 10 },
  statTile: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', gap: 7 },
  statVal:  { fontSize: 16.5, fontWeight: '700', color: C.text, letterSpacing: -0.4 },
  statUnit: { fontSize: 10.5, color: C.faint, fontWeight: '600' },
  statLbl:  { fontSize: 11, color: C.faint, letterSpacing: -0.1 },

  startRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, paddingVertical: 13, paddingHorizontal: 15 },
  startIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  startLbl:  { fontSize: 11.5, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },
  startVal:  { fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3, marginTop: 2 },

  // Footer
  footer:     { paddingTop: 16, paddingHorizontal: S.gutter, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg },
  confirmTxt: { fontSize: 16, fontWeight: '700', color: C.text, letterSpacing: -0.4, textAlign: 'center', marginBottom: 14 },
  actionRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  runBtn:     { flex: 1, height: 56, borderRadius: R.lg, backgroundColor: C.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  runTxt:     { fontSize: 16.5, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },
  cancelBtn:  { height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  cancelTxt:  { fontSize: 15, fontWeight: '700', color: C.sub, letterSpacing: -0.3 },
});
