import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiniMap } from '@/components/mini-map';
import { Icon } from '@/components/ui';
import { useRunDetail } from '@/hooks/use-runs';
import { distUnit, fmtDist, fmtDuration, fmtPaceIn, fmtWhen, timeTitle } from '@/lib/run-format';
import { colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';
import { useSettings } from '@/store/use-settings';

// ─── Stat tile ────────────────────────────────────────────────────────────────

function StatTile({
  icon, label, value, unit, accent = false,
}: {
  icon: string; label: string; value: string; unit?: string; accent?: boolean;
}) {
  return (
    <View style={[st.tile, shadows.sm]}>
      <View style={st.tileTop}>
        <Icon name={icon} size={13} color={accent ? C.accentGrn : C.faint} />
        <Text style={st.tileLabel}>{label}</Text>
      </View>
      <Text style={[st.tileValue, accent && { color: C.accentGrn }]}>
        {value}
        {unit ? <Text style={st.tileUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

const HERO_H = 200;

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const { runId } = useLocalSearchParams<{ runId: string }>();
  const { run, loading, error, refetch } = useRunDetail(runId ?? null);
  const units = useSettings(s => s.settings.units);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[st.root, { paddingTop: insets.top }]}>
        <View style={st.loadingWrap}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      </View>
    );
  }

  // ── Error / not found ──────────────────────────────────────────────────────
  if (error || !run) {
    return (
      <View style={[st.root, { paddingTop: insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={[st.backBtnLight, { margin: S.lg }]}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <View style={st.centeredState}>
          <Icon name="warning-outline" size={36} color={C.faint} />
          <Text style={st.stateTxt}>{error ?? '기록을 찾을 수 없어요'}</Text>
          <Pressable onPress={refetch} style={st.retryBtn}>
            <Text style={st.retryTxt}>다시 시도</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const dist  = fmtDist(run.distance_km, units, 2);
  const dur   = fmtDuration(run.duration_sec);
  const pace  = run.avg_pace_sec_per_km != null ? fmtPaceIn(run.avg_pace_sec_per_km, units) : '--';
  const when  = fmtWhen(run.ran_at);
  const title = timeTitle(run.ran_at);

  return (
    <View style={st.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 48 }}
      >
        {/* ── Full-bleed MiniMap hero ────────────────────────────────────── */}
        <View style={[st.hero, { height: HERO_H + insets.top }]}>
          <MiniMap seed={run.id} height={HERO_H + insets.top} borderRadius={0} />
          <LinearGradient
            colors={['rgba(8,12,4,0.0)', 'rgba(8,12,4,0.72)']}
            style={StyleSheet.absoluteFillObject}
          />
          {/* Back button sits in safe area */}
          <View style={[StyleSheet.absoluteFillObject, { paddingTop: insets.top + S.sm }]}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              style={[st.backBtn, { marginLeft: S.gutter }]}
            >
              <Icon name="arrow-back" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* ── Content ───────────────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: S.gutter, paddingTop: S.lg }}>

          {/* Date line */}
          <View style={st.whenRow}>
            <View style={st.greenDot} />
            <Text style={st.whenTxt}>{when}</Text>
          </View>

          {/* Title */}
          <Text style={st.titleTxt}>{title}</Text>

          {/* Stat tiles */}
          <View style={st.tileRow}>
            <StatTile icon="location-outline"    label="거리"      value={dist}  unit={distUnit(units)} accent />
            <StatTile icon="time-outline"        label="시간"      value={dur} />
            <StatTile icon="speedometer-outline" label="평균 페이스" value={pace} />
          </View>

          {/* Notes — only when present */}
          {run.notes ? (
            <View style={[st.notesCard, shadows.sm]}>
              <View style={st.notesHeader}>
                <Icon name="create-outline" size={14} color={C.faint} />
                <Text style={st.notesLabel}>메모</Text>
              </View>
              <Text style={st.notesTxt}>{run.notes}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Hero
  hero:       { overflow: 'hidden' },
  backBtn:    { width: 40, height: 40, borderRadius: R.pill, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  backBtnLight:{ width: 40, height: 40, borderRadius: R.pill, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },

  // Content
  whenRow:  { flexDirection: 'row', alignItems: 'center', gap: 7 },
  greenDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accentGrn },
  whenTxt:  { fontSize: 12.5, fontWeight: '600', color: C.sub, letterSpacing: -0.2 },
  titleTxt: { fontSize: 23, fontWeight: '700', letterSpacing: -0.7, color: C.text, marginTop: S.sm },

  // Stat tiles
  tileRow:   { flexDirection: 'row', gap: 10, marginTop: S.lg },
  tile:      { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, padding: 13 },
  tileTop:   { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 7 },
  tileLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2, color: C.faint, textTransform: 'uppercase' },
  tileValue: { fontSize: 18, fontWeight: '700', letterSpacing: -0.5, color: C.text },
  tileUnit:  { fontSize: 11, fontWeight: '600', color: C.faint },

  // Notes
  notesCard:   { marginTop: S.lg, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, padding: S.md },
  notesHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  notesLabel:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.2, color: C.faint, textTransform: 'uppercase' },
  notesTxt:    { fontSize: 14, lineHeight: 21, color: C.sub, letterSpacing: -0.2 },

  // States
  centeredState: { paddingTop: 60, alignItems: 'center', gap: 12 },
  stateTxt:      { fontSize: 14, fontWeight: '600', color: C.faint, letterSpacing: -0.2, textAlign: 'center' },
  retryBtn:      { paddingHorizontal: 20, paddingVertical: 10, borderRadius: R.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  retryTxt:      { fontSize: 14, fontWeight: '700', color: C.text },
});
