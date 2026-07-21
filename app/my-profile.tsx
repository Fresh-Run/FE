/**
 * 내 프로필 — social/public profile, own-view (canvas 2026-07-07; screenshot-
 * verified). Pushed from the home header avatar. Distinct from the 프로필 TAB —
 * the gear routes to 프로필 설정 (design-wave C — canvas my-profile.jsx
 * gear → profileSettings; the 설정 hub keeps its door inside that screen).
 *
 * Approved interim honesty (backend gaps, TODO'd):
 *  - location row shows `bio` when present (no location field on profiles);
 *  - section = "내 러닝" + real total ("공개 N개" reframing is its own item);
 *  - run cards are reduced feed-style: no per-run area/tags — title falls
 *    back to timeTitle(ran_at);
 *  - footer: ♥ kudos_count + likers sheet. NOT a toggle — self-kudos is a
 *    server 400; heart+count are one tap target. 💬 omitted entirely (run
 *    comments unshipped server-side — 지연 ask logged);
 *  - 프로필 공유 → 준비 중 (no shareable URL yet).
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

import { Avatar } from '@/components/avatar';
import { KudosSheet } from '@/components/kudos-sheet';
import { MiniMap } from '@/components/mini-map';
import { RealMap } from '@/components/real-map';
import { Icon } from '@/components/ui';
import { useMyPublicProfile, type MyRun } from '@/hooks/use-my-public-profile';
import { distUnit, fmtDist, fmtDuration, fmtPaceIn, fmtWhen, paceUnit, timeTitle } from '@/lib/run-format';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useSettings } from '@/store/use-settings';

// Own-list visibility is never null (legacy rows = 'followers' server-side)
const VIS_CAPTION: Record<MyRun['visibility'], string> = {
  public:    '공개 게시물',
  followers: '팔로워 공개',
  private:   '비공개',
};

// Reduced feed-style run card (canvas shows area/tags — no backend source
// for own runs; honest subset, tap → activity detail)
function RunCard({ run, name, photoUrl, units, mapLive, onKudos }: { run: MyRun; name: string; photoUrl?: string | null; units: ReturnType<typeof useSettings.getState>['settings']['units']; mapLive: boolean; onKudos: () => void }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  return (
    // Whole card → own-run SOCIAL view (owner correction 2026-07-12); the
    // 활동 상세 analysis screen's home is the 기록 tab — social links to it
    // via 분석 보기 inside run-post.
    <Pressable
      onPress={() => router.push({
        pathname: '/run-post' as never,
        params: { runId: run.id, own: '1', nickname: name, kudosCount: String(run.kudos_count) },
      })}
      style={[st.card, shadows.sm]}
    >
      <View style={st.cardHead}>
        <Avatar name={name} size={36} photoUrl={photoUrl} ring={C.accent} initialsRatio={0.38} upper />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.cardName}>{name}</Text>
          <Text style={st.cardDate}>{fmtWhen(run.ran_at)}</Text>
        </View>
      </View>
      {/* polyline_thumb slice: viewable + thumb → real map (card-mode, same
          perf pattern as the feed); off-screen/trackless → route-shaped or
          seed SVG per the ledger rulings */}
      {mapLive && run.polyline_thumb && run.polyline_thumb.length >= 2 ? (
        <RealMap height={150} polyline={run.polyline_thumb} />
      ) : (
        <MiniMap seed={run.id} height={150} polyline={run.polyline_thumb ?? undefined} />
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
      {/* Footer — ♥ + count are ONE tap target → likers sheet (own cards
          can't toggle: self-kudos = 400). 💬 is display-only: own runs have
          no post screen (card tap → activity analysis covers it). */}
      <View style={st.cardFooter}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={onKudos} hitSlop={8} style={({ pressed }) => [st.kudosBtn, pressed && { opacity: 0.6 }]}>
            <Icon name="heart-outline" size={18} color={C.sub} />
            <Text style={st.kudosCount}>{run.kudos_count}</Text>
          </Pressable>
          {/* 💬 display-only — taps fall through to the card (→ social view) */}
          <View style={[st.kudosBtn, { marginLeft: 14 }]}>
            <Icon name="chatbubble-outline" size={17} color={C.sub} />
            <Text style={st.kudosCount}>{run.comment_count}</Text>
          </View>
        </View>
        <Text style={st.visCaption}>{VIS_CAPTION[run.visibility]}</Text>
      </View>
    </Pressable>
  );
}

// Likers sheet extracted to components/kudos-sheet.tsx (2026-07-12 — the
// own-run social view became its second consumer, per the original scoping
// note's graduation condition).

export default function MyProfileScreen() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const units = useSettings(s => s.settings.units);
  const { profile, runs, loading, error, refetch } = useMyPublicProfile();
  const [kudosRun, setKudosRun] = React.useState<MyRun | null>(null);

  // polyline_thumb slice — real-map-only-for-viewable-cells (feed pattern:
  // stable refs, 25% threshold; off-screen cells keep the SVG)
  const [liveIds, setLiveIds] = React.useState<Set<string>>(new Set());
  const viewabilityConfig = React.useRef({ itemVisiblePercentThreshold: 25 }).current;
  const onViewableItemsChanged = React.useRef(
    ({ viewableItems }: { viewableItems: { key: string }[] }) => {
      setLiveIds(new Set(viewableItems.map(v => v.key)));
    },
  ).current;

  // Refetch on focus — 프로필 편집 renames must show on return
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const header = profile && (
    <View>
      {/* Identity */}
      <View style={st.identity}>
        <Avatar name={profile.nickname} size={76} photoUrl={profile.avatarUrl} ring={C.accent} initialsRatio={0.38} upper />
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

      {/* Counts — 팔로잉/팔로워 tap → follow list; 활동 non-tappable */}
      <View style={st.countsRow}>
        {([
          [profile.followingCount, '팔로잉', 'following'],
          [profile.followerCount,  '팔로워', 'followers'],
          [profile.runCount,       '활동',   null],
        ] as [number, string, string | null][]).map(([n, label, tabParam]) => (
          <Pressable
            key={label}
            disabled={!tabParam}
            onPress={() => router.push({ pathname: '/follow-list' as any, params: { tab: tabParam! } })}
            style={st.countCell}
          >
            <Text style={st.countNum}>{n}</Text>
            <Text style={st.countLabel}>{label}</Text>
          </Pressable>
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
      {/* App bar: back · title · gear → 프로필 설정 (canvas: profileSettings) */}
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.appBarBtn}>
          <Icon name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>내 프로필</Text>
        <Pressable onPress={() => router.push('/profile-settings' as any)} hitSlop={12} style={st.appBarBtn}>
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
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          ListHeaderComponent={header}
          renderItem={({ item }) => (
            <View style={{ paddingHorizontal: S.gutter }}>
              <RunCard run={item} name={profile.nickname} photoUrl={profile.avatarUrl} units={units} mapLive={liveIds.has(item.id)} onKudos={() => setKudosRun(item)} />
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

      {kudosRun && <KudosSheet runId={kudosRun.id} kudosCount={kudosRun.kudos_count} onClose={() => setKudosRun(null)} />}
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, paddingVertical: 10 },
  appBarBtn:   { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },

  identity: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: S.gutter, paddingTop: 20 },
  name:     { fontSize: 22, fontWeight: '700', letterSpacing: -0.6, color: C.text },
  bioRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  bioTxt:   { fontSize: 13.5, color: C.sub, letterSpacing: -0.2 },

  countsRow:  { flexDirection: 'row', gap: 22, paddingHorizontal: S.gutter, paddingTop: 16 },
  countCell:  { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  countNum:   { fontSize: 16, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  countLabel: { fontSize: 12.5, color: C.faint, letterSpacing: -0.2 },

  actionsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: S.gutter, paddingTop: 14 },
  actionBtn:  { flex: 1, height: 36, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionTxt:  { fontSize: 13, fontWeight: '600', color: C.text, letterSpacing: -0.2 },

  sectionHead:  { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: S.gutter, paddingTop: 24, paddingBottom: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: C.text },
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

  // Card footer (canvas: hairline top, 8/14/12 padding)
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 12, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: C.border },
  kudosBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  kudosCount: { fontSize: 13.5, fontWeight: '700', color: C.sub, letterSpacing: -0.2 },
  visCaption: { fontSize: 11.5, color: C.faint, letterSpacing: -0.2 },

  // Likers sheet (canvas: grab bar, centered title, 68% max height)
  // (likers-sheet styles moved to components/kudos-sheet.tsx)

  centered: { alignItems: 'center', gap: 12, paddingVertical: 60 },
  stateTxt: { fontSize: 14, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: R.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  retryTxt: { fontSize: 14, fontWeight: '700', color: C.text },
});
