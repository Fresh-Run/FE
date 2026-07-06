/**
 * 내 프로필 — social/public profile, own-view (canvas 2026-07-07; screenshot-
 * verified). Pushed from the home header avatar. Distinct from the 프로필 TAB
 * (settings hub) — the gear here routes to it.
 *
 * Approved interim honesty (backend gaps, TODO'd):
 *  - location row shows `bio` when present (no location field on profiles);
 *  - section = "내 러닝" + real total, NO 공개 framing (run visibility
 *    doesn't exist server-side yet);
 *  - run cards are reduced feed-style: no per-run title/area/tags/likes on
 *    own runs — title falls back to timeTitle(ran_at), footer omitted;
 *  - count taps non-tappable; 프로필 공유 → 준비 중 (no shareable URL yet).
 */
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiniMap } from '@/components/mini-map';
import { Icon } from '@/components/ui';
import { useMyPublicProfile, type MyRun } from '@/hooks/use-my-public-profile';
import { avatarBg } from '@/lib/fr-hash';
import { distUnit, fmtDist, fmtDuration, fmtPaceIn, fmtWhen, paceUnit, timeTitle } from '@/lib/run-format';
import { colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';
import { useSettings } from '@/store/use-settings';

function Avatar({ name, size }: { name: string; size: number }) {
  return (
    <View style={[st.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarBg(name) }]}>
      <Text style={{ fontWeight: '700', fontSize: Math.round(size * 0.38), color: '#fff' }}>
        {name.trim()[0]?.toUpperCase() ?? '?'}
      </Text>
    </View>
  );
}

// Reduced feed-style run card (canvas shows title/area/tags/likes — no
// backend source for own runs; honest subset, tap → activity detail)
function RunCard({ run, name, units }: { run: MyRun; name: string; units: ReturnType<typeof useSettings.getState>['settings']['units'] }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/(records)/activity' as any, params: { runId: run.id } })}
      style={[st.card, shadows.sm]}
    >
      <View style={st.cardHead}>
        <Avatar name={name} size={36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.cardName}>{name}</Text>
          <Text style={st.cardDate}>{fmtWhen(run.ran_at)}</Text>
        </View>
      </View>
      <MiniMap seed={run.id} height={150} />
      <View style={st.cardBody}>
        <Text style={st.cardTitle}>{timeTitle(run.ran_at)}</Text>
        <View style={st.statsRow}>
          {([
            [fmtDist(run.distance_km, units, 1), distUnit(units), '거리'],
            [fmtDuration(run.duration_sec), '', '시간'],
            [run.avg_pace_sec_per_km != null ? fmtPaceIn(run.avg_pace_sec_per_km, units) : '--', paceUnit(units), '페이스'],
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
    </Pressable>
  );
}

export default function MyProfileScreen() {
  const insets = useSafeAreaInsets();
  const units = useSettings(s => s.settings.units);
  const { profile, runs, loading, error, refetch } = useMyPublicProfile();

  // Refetch on focus — 프로필 편집 renames must show on return
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const header = profile && (
    <View>
      {/* Identity */}
      <View style={st.identity}>
        <Avatar name={profile.nickname} size={110} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.name} numberOfLines={1}>{profile.nickname}</Text>
          {profile.bio ? (
            <View style={st.bioRow}>
              <Icon name="location-outline" size={14} color={C.faint} />
              <Text style={st.bioTxt} numberOfLines={1}>{profile.bio}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Counts — 팔로잉 · 팔로워 · 활동 (canvas order); non-tappable this slice */}
      <View style={st.countsRow}>
        {([
          [profile.followingCount, '팔로잉'],
          [profile.followerCount,  '팔로워'],
          [profile.runCount,       '활동'],
        ] as [number, string][]).map(([n, label]) => (
          <View key={label} style={st.countCell}>
            <Text style={st.countNum}>{n}</Text>
            <Text style={st.countLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Actions */}
      <View style={st.actionsRow}>
        <Pressable
          onPress={() => router.push({ pathname: '/personal-info' as any, params: { nickname: profile.nickname } })}
          style={({ pressed }) => [st.actionBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Icon name="pencil-outline" size={15} color={C.text} />
          <Text style={st.actionTxt}>프로필 편집</Text>
        </Pressable>
        <Pressable
          onPress={() => Alert.alert('준비 중', '프로필 공유는 다음 업데이트에서 지원돼요.')}
          style={({ pressed }) => [st.actionBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Icon name="share-social-outline" size={15} color={C.text} />
          <Text style={st.actionTxt}>프로필 공유</Text>
        </Pressable>
      </View>

      {/* Section head — "내 러닝" + real total (no 공개 framing until
          run visibility exists server-side) */}
      <View style={st.sectionHead}>
        <Text style={st.sectionTitle}>내 러닝</Text>
        <Text style={st.sectionCount}>{profile.runCount}개</Text>
      </View>
    </View>
  );

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      {/* App bar: back · title · gear → 프로필 tab (settings hub) */}
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.appBarBtn}>
          <Icon name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>내 프로필</Text>
        <Pressable onPress={() => router.push('/(tabs)/profile' as any)} hitSlop={12} style={st.appBarBtn}>
          <Icon name="settings-outline" size={20} color={C.text} />
        </Pressable>
      </View>

      {loading ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : error || !profile ? (
        <View style={st.centered}>
          <Icon name="warning-outline" size={36} color={C.faint} />
          <Text style={st.stateTxt}>{error ?? '프로필을 불러올 수 없어요'}</Text>
          <Pressable onPress={refetch} style={st.retryBtn}><Text style={st.retryTxt}>다시 시도</Text></Pressable>
        </View>
      ) : (
        <FlatList
          data={runs}
          keyExtractor={r => r.id}
          ListHeaderComponent={header}
          renderItem={({ item }) => (
            <View style={{ paddingHorizontal: S.gutter }}>
              <RunCard run={item} name={profile.nickname} units={units} />
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          ListEmptyComponent={
            <View style={st.centered}>
              <Icon name="walk-outline" size={36} color={C.faint} />
              <Text style={st.stateTxt}>아직 기록한 러닝이 없어요</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 36 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, paddingVertical: 10 },
  appBarBtn:   { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },

  identity: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: S.gutter, paddingTop: 10 },
  avatar:   { alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: C.accent },
  name:     { fontSize: 24, fontWeight: '700', letterSpacing: -0.6, color: C.text },
  bioRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  bioTxt:   { fontSize: 13.5, color: C.sub, letterSpacing: -0.2 },

  countsRow:  { flexDirection: 'row', gap: 26, paddingHorizontal: S.gutter, paddingTop: 20 },
  countCell:  { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  countNum:   { fontSize: 17, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  countLabel: { fontSize: 13.5, color: C.faint, letterSpacing: -0.2 },

  actionsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: S.gutter, paddingTop: 16 },
  actionBtn:  { flex: 1, height: 46, borderRadius: R.md, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionTxt:  { fontSize: 14, fontWeight: '700', color: C.text, letterSpacing: -0.3 },

  sectionHead:  { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: S.gutter, paddingTop: 28, paddingBottom: 14 },
  sectionTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.5, color: C.text },
  sectionCount: { fontSize: 13, color: C.faint, letterSpacing: -0.2 },

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

  centered: { alignItems: 'center', gap: 12, paddingVertical: 60 },
  stateTxt: { fontSize: 14, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: R.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  retryTxt: { fontSize: 14, fontWeight: '700', color: C.text },
});
