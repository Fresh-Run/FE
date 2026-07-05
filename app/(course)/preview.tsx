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
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiniMap } from '@/components/mini-map';
import { Icon } from '@/components/ui';
import { avatarBg } from '@/lib/fr-hash';
import { courseStats, fmtDuration, fmtPace, type CourseStatsInput } from '@/lib/run-format';
import { clearPendingCourse, getPendingCourse } from '@/store/pending-course';
import {
  accentShadow,
  colors as C,
  radius as R,
  shadows,
  spacing as S,
} from '@/lib/theme';

function parseItem(raw: string | string[] | undefined): CourseStatsInput {
  if (typeof raw !== 'string') return {};
  try { return JSON.parse(raw) as CourseStatsInput; } catch { return {}; }
}

// Same mini avatar as the home feed (duplicated by design decision — item 10).
function Avatar({ name, size = 26 }: { name: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: avatarBg(name), alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontWeight: '700', fontSize: Math.round(size * 0.42), color: '#fff', letterSpacing: -0.3 }}>
        {name[0]}
      </Text>
    </View>
  );
}

export default function CoursePreviewScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ item?: string }>();
  const [pending] = useState(() => getPendingCourse());
  useEffect(() => () => clearPendingCourse(), []);

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
      });
    }
    return courseStats(parseItem(params.item));
  }, [pending, params.item]);

  const confirmRun = () => {
    // TODO(tracking): pop + push live tracking with this course once it exists.
    Alert.alert('준비 중', '러닝 추적은 다음 업데이트에서 지원됩니다.');
  };

  return (
    <View style={st.root}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* ── Hero map ─────────────────────────────────────────────── */}
        <View style={st.hero}>
          <MiniMap seed={s.seed ?? 'course-preview'} height={300} borderRadius={0} polyline={pending?.polyline ?? undefined} />
          <LinearGradient
            colors={['rgba(8,12,4,0.55)', 'rgba(8,12,4,0)']}
            style={st.heroScrim}
          />
          <View style={[st.heroTop, { top: insets.top + 6 }]}>
            <Pressable onPress={() => router.back()} hitSlop={8} style={st.backBtn}>
              <Icon name="arrow-back" size={20} color="#fff" />
            </Pressable>
            <View style={st.heroPill}>
              <Icon name="navigate-outline" size={14} color="#7CF03D" />
              <Text style={st.heroPillTxt}>코스 미리보기</Text>
            </View>
            <View style={{ width: 42 }} />
          </View>
          <View style={st.authorChip}>
            <Avatar name={s.name ?? '러너'} size={26} />
            <Text style={st.authorTxt}>{s.name ? `${s.name}님의 코스` : '추천 코스'}</Text>
          </View>
        </View>

        {/* ── Body ─────────────────────────────────────────────────── */}
        <View style={st.body}>
          <Text style={st.title}>{s.title ?? '추천 코스'}</Text>
          {s.tags.length > 0 && (
            <View style={st.tags}>
              {s.tags.map(t => (
                <View key={t} style={st.tag}><Text style={st.tagTxt}>{t}</Text></View>
              ))}
            </View>
          )}

          {/* Reference stats */}
          <View style={st.refHead}>
            <Text style={st.refTitle}>코스 기준 기록</Text>
            <Text style={st.refNote}>원작자 기준 · 내 기록 아님</Text>
          </View>
          <View style={st.statsRow}>
            {([
              ['resize-outline',      s.dist.toFixed(1), 'km',  '거리'],
              ['time-outline',        s.dur,             '',    '예상 시간'],
              ['speedometer-outline', s.pace,            '/km', '페이스'],
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
              <Text style={st.startLbl}>출발지</Text>
              <Text style={st.startVal} numberOfLines={1}>{s.area}</Text>
            </View>
          </View>
        </View>
        <View style={{ height: 18 }} />
      </ScrollView>

      {/* ── Confirm footer ─────────────────────────────────────────── */}
      <View style={[st.footer, { paddingBottom: Math.max(insets.bottom + 10, 26) }]}>
        <Text style={st.confirmTxt}>이 코스로 뛰시겠습니까?</Text>
        <Pressable
          onPress={confirmRun}
          style={({ pressed }) => [st.runBtn, accentShadow(C.accent), { opacity: pressed ? 0.9 : 1 }]}
        >
          <Icon name="play" size={19} color={C.accentText} />
          <Text style={st.runTxt}>네, 뛸게요</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [st.cancelBtn, { opacity: pressed ? 0.7 : 1 }]}>
          <Text style={st.cancelTxt}>취소</Text>
        </Pressable>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
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
  runBtn:     { height: 56, borderRadius: R.lg, backgroundColor: C.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  runTxt:     { fontSize: 16.5, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },
  cancelBtn:  { height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  cancelTxt:  { fontSize: 15, fontWeight: '700', color: C.sub, letterSpacing: -0.3 },
});
