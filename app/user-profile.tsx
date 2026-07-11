/**
 * 타인 프로필 (canvas: FrOtherProfile). Reached from any tappable name via
 * lib/profile-nav openProfile() — self lands on 내 프로필 instead.
 *
 * Approved deltas (2026-07-08, no-backend fields): location line + card
 * tags omitted; 💬 omitted (graduates with the thread slice, both
 * surfaces); visibility caption omitted (server sends null on others'
 * rows — 지연 ask logged); 활동 = public_run_count with the 공개 N개
 * framing explaining the number.
 */
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
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
import { RealMap } from '@/components/real-map';
import { Icon } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { avatarBg } from '@/lib/fr-hash';
import { distUnit, fmtDist, fmtDuration, fmtPaceIn, fmtWhen, paceUnit, timeTitle } from '@/lib/run-format';
import { colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';
import { useUserProfile, type UserRun } from '@/hooks/use-user-profile';
import { useSettings } from '@/store/use-settings';

function Avatar({ name, size, ring = C.border }: { name: string; size: number; ring?: string }) {
  return (
    <View style={[st.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarBg(name), borderColor: ring }]}>
      <Text style={{ fontWeight: '700', fontSize: Math.round(size * 0.38), color: '#fff' }}>
        {name.trim()[0]?.toUpperCase() ?? '?'}
      </Text>
    </View>
  );
}

// Run card — other-user variant: ♥ is a real toggle (my_kudos), no 💬,
// no visibility caption (approved deltas). Card tap → 러닝 포스트 (R3',
// BE 4cd5685 opened non-owner run detail) with entry-payload seeds.
function RunCard({ run, units, mapLive, onKudos, onOpen }: {
  run: UserRun;
  units: ReturnType<typeof useSettings.getState>['settings']['units'];
  mapLive: boolean;
  onKudos: () => void;
  onOpen?: () => void;
}) {
  return (
    <Pressable onPress={onOpen} disabled={!onOpen} style={({ pressed }) => [st.card, shadows.sm, pressed && !!onOpen && { opacity: 0.85 }]}>
      <View style={st.cardHead}>
        <Avatar name={run.nickname} size={36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.cardName}>{run.nickname}</Text>
          <Text style={st.cardDate}>{fmtWhen(run.ran_at)}</Text>
        </View>
      </View>
      {/* polyline_thumb slice: viewable + thumb → real map; off-screen /
          trackless → route-shaped or seed SVG (ledger rulings) */}
      {mapLive && run.polyline_thumb && run.polyline_thumb.length >= 2 ? (
        <RealMap height={200} polyline={run.polyline_thumb} />
      ) : (
        <MiniMap seed={run.run_id} height={200} polyline={run.polyline_thumb ?? undefined} />
      )}
      <View style={st.cardBody}>
        <Text style={st.cardTitle}>{run.title ?? timeTitle(run.ran_at)}</Text>
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
      <View style={st.cardFooter}>
        <Pressable onPress={onKudos} hitSlop={8} style={({ pressed }) => [st.kudosBtn, pressed && { opacity: 0.6 }]}>
          <Icon name={run.my_kudos ? 'heart' : 'heart-outline'} size={18} color={run.my_kudos ? C.danger : C.sub} />
          <Text style={[st.kudosCount, run.my_kudos && { color: C.danger }]}>{run.kudos_count}</Text>
        </Pressable>
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

export default function UserProfileScreen() {
  const insets = useSafeAreaInsets();
  const { uid, nickname: nickParam } = useLocalSearchParams<{ uid: string; nickname?: string }>();
  const units = useSettings(s => s.settings.units);
  const { profile, runs, loading, error, refetch } = useUserProfile(uid ?? null);

  // Optimistic overlays — follow state + per-run kudos
  const [followOverlay, setFollowOverlay] = useState<boolean | null>(null);
  const [kudosOverlay, setKudosOverlay]   = useState<Record<string, { on: boolean; delta: number }>>({});

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const isFollowing = followOverlay ?? profile?.is_following ?? false;

  // polyline_thumb slice — feed viewability pattern (stable refs, 25%)
  const [liveIds, setLiveIds] = useState<Set<string>>(new Set());
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 25 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: { key: string }[] }) => {
      setLiveIds(new Set(viewableItems.map(v => v.key)));
    },
  ).current;

  function toggleFollow() {
    if (!profile) return;
    const next = !isFollowing;
    setFollowOverlay(next);
    apiFetch<void>(`/api/users/${profile.user_id}/follow`, { method: next ? 'POST' : 'DELETE' })
      .then(() => refetch()) // follower count + followers-only runs change
      .catch(() => {
        setFollowOverlay(!next);
        Alert.alert('실패', '팔로우 상태를 변경하지 못했어요. 잠시 후 다시 시도해 주세요.');
      });
  }

  function toggleKudos(run: UserRun) {
    const cur = kudosOverlay[run.run_id]?.on ?? run.my_kudos;
    const next = !cur;
    setKudosOverlay(p => ({ ...p, [run.run_id]: { on: next, delta: (next ? 1 : 0) - (run.my_kudos ? 1 : 0) } }));
    apiFetch<void>(`/api/runs/${run.run_id}/kudos`, { method: next ? 'POST' : 'DELETE' })
      .catch(() => setKudosOverlay(p => ({ ...p, [run.run_id]: { on: run.my_kudos, delta: 0 } })));
  }

  const title = profile?.nickname ?? nickParam ?? '프로필';

  const header = profile && (
    <View>
      {/* Identity — border ring (own profile keeps the accent ring) */}
      <View style={st.identity}>
        <Avatar name={profile.nickname} size={76} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.name} numberOfLines={1}>{profile.nickname}</Text>
          {profile.bio ? <Text style={st.bioTxt} numberOfLines={1}>{profile.bio}</Text> : null}
        </View>
      </View>

      {/* Counts — 팔로잉/팔로워 → that user's follow lists */}
      <View style={st.countsRow}>
        {([
          [profile.following_count, '팔로잉', 'following'],
          [profile.follower_count,  '팔로워', 'followers'],
          [profile.public_run_count, '활동',  null],
        ] as [number, string, string | null][]).map(([n, label, tabParam]) => (
          <Pressable
            key={label}
            disabled={!tabParam}
            onPress={() => router.push({ pathname: '/follow-list' as any, params: { tab: tabParam!, uid: profile.user_id, name: profile.nickname } })}
            style={st.countCell}
          >
            <Text style={st.countNum}>{n}</Text>
            <Text style={st.countLabel}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Follow-state button (canvas: replaces edit/share) */}
      <View style={{ paddingHorizontal: S.gutter, paddingTop: 14 }}>
        <Pressable
          onPress={toggleFollow}
          style={({ pressed }) => [
            st.followBtn,
            isFollowing ? st.followBtnOutlined : st.followBtnFilled,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={isFollowing ? st.followTxtOutlined : st.followTxtFilled}>
            {isFollowing ? '팔로잉' : '팔로우'}
          </Text>
        </Pressable>
      </View>

      <View style={st.sectionHead}>
        <Text style={st.sectionTitle}>게시한 러닝</Text>
        <Text style={st.sectionCount}>공개 {runs.length}개</Text>
      </View>
    </View>
  );

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.appBarBtn}>
          <Icon name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle} numberOfLines={1}>{title}</Text>
        <View style={{ width: 40 }} />
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
          keyExtractor={r => r.run_id}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          ListHeaderComponent={header}
          renderItem={({ item }) => {
            const ov = kudosOverlay[item.run_id];
            const shown: UserRun = ov
              ? { ...item, my_kudos: ov.on, kudos_count: item.kudos_count + ov.delta }
              : item;
            return (
              <View style={{ paddingHorizontal: S.gutter }}>
                <RunCard
                  run={shown}
                  units={units}
                  mapLive={liveIds.has(item.run_id)}
                  onKudos={() => toggleKudos(item)}
                  // Own rows keep no tap here (내 프로필/기록 → activity is
                  // the own-run analysis path); others → 러닝 포스트
                  onOpen={!shown.is_mine ? () => router.push({
                    pathname: '/run-post' as never,
                    params: {
                      runId: shown.run_id,
                      nickname: shown.nickname,
                      myKudos: shown.my_kudos ? '1' : '0',
                      kudosCount: String(shown.kudos_count),
                    },
                  }) : undefined}
                />
              </View>
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          ListEmptyComponent={
            <View style={st.centered}>
              <Icon name="walk-outline" size={36} color={C.faint} />
              <Text style={st.stateTxt}>아직 공개된 러닝이 없어요</Text>
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

  avatar: { alignItems: 'center', justifyContent: 'center', borderWidth: 2 },

  identity: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: S.gutter, paddingTop: 20 },
  name:     { fontSize: 22, fontWeight: '700', letterSpacing: -0.6, color: C.text },
  bioTxt:   { fontSize: 13, color: C.sub, letterSpacing: -0.2, marginTop: 4 },

  countsRow:  { flexDirection: 'row', gap: 22, paddingHorizontal: S.gutter, paddingTop: 16 },
  countCell:  { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  countNum:   { fontSize: 16, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  countLabel: { fontSize: 12.5, color: C.faint, letterSpacing: -0.2 },

  followBtn:         { height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  followBtnFilled:   { backgroundColor: C.accent, shadowColor: C.accent, shadowOpacity: 0.28, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  followBtnOutlined: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  followTxtFilled:   { fontSize: 14, fontWeight: '700', color: C.accentText, letterSpacing: -0.2 },
  followTxtOutlined: { fontSize: 14, fontWeight: '700', color: C.sub, letterSpacing: -0.2 },

  sectionHead:  { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: S.gutter, paddingTop: 24, paddingBottom: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: C.text },
  sectionCount: { fontSize: 12.5, color: C.faint, letterSpacing: -0.2 },

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

  centered: { alignItems: 'center', gap: 12, paddingVertical: 60 },
  stateTxt: { fontSize: 14, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: R.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  retryTxt: { fontSize: 14, fontWeight: '700', color: C.text },
});
