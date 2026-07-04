/**
 * 커뮤니티 tab — crew browse + my crews.
 */
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiniMap } from '@/components/mini-map';
import { Icon } from '@/components/ui';
import { joinCrew, useBrowseCrews, useMyCrews, type Crew } from '@/hooks/use-crews';
import { colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

const LEVELS = ['전체', '무관', '입문', '중급', '고급'] as const;
type Level = typeof LEVELS[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isFull(crew: Crew): boolean {
  // null max_members = unlimited — never treat as full
  return crew.max_members !== null && crew.member_count >= crew.max_members;
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────

function CommTabs({ active, onChange }: { active: string; onChange: (v: string) => void }) {
  return (
    <View style={st.tabRow}>
      {([{ id: 'crew', label: '크루' }, { id: 'discover', label: '둘러보기' }]).map(t => {
        const on = active === t.id;
        return (
          <Pressable key={t.id} onPress={() => onChange(t.id)} style={st.tabBtn}>
            <Text style={[st.tabTxt, { color: on ? C.text : C.faint }]}>{t.label}</Text>
            {on && <View style={st.tabUnderline} />}
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Level filter chips ───────────────────────────────────────────────────────

function LevelChips({ active, onChange }: { active: Level; onChange: (v: Level) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chipsWrap}>
      {LEVELS.map(lv => {
        const on = active === lv;
        return (
          <Pressable key={lv} onPress={() => onChange(lv)} style={[st.chip, on && st.chipActive]}>
            <Text style={[st.chipTxt, { color: on ? C.accentGrn : C.sub }]}>{lv}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ─── Shared states ────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <View style={st.centered}>
      <ActivityIndicator size="large" color={C.accent} />
    </View>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={st.centered}>
      <Icon name="warning-outline" size={36} color={C.faint} />
      <Text style={st.stateTitle}>불러올 수 없어요</Text>
      <Text style={[st.stateSub, { marginTop: 2 }]}>{message}</Text>
      <Pressable onPress={onRetry} style={st.retryBtn}>
        <Text style={st.retryTxt}>다시 시도</Text>
      </Pressable>
    </View>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={st.centered}>
      <Icon name="people-outline" size={42} color={C.faint} />
      <Text style={st.stateTitle}>{text}</Text>
    </View>
  );
}

// ─── Browse crew card ─────────────────────────────────────────────────────────

function BrowseCrewCard({
  crew, onPress, onJoin,
}: {
  crew: Crew;
  onPress: () => void;
  onJoin: () => void;
}) {
  const full = isFull(crew);
  const tags = crew.active_days?.slice(0, 4) ?? [];

  return (
    <Pressable onPress={full ? undefined : onPress} style={[st.card, { opacity: full ? 0.62 : 1 }]}>
      <View style={st.thumbWrap}>
        <MiniMap seed={crew.id} height={54} borderRadius={0} />
      </View>

      <View style={st.cardBody}>
        <Text style={st.cardName} numberOfLines={1}>{crew.name}</Text>
        <View style={st.cardMeta}>
          <Icon name="people-outline" size={12} color={C.faint} />
          <Text style={st.cardMetaTxt} numberOfLines={1}>
            {crew.member_count}{crew.max_members !== null ? `/${crew.max_members}` : ''}명 · {crew.area ?? ''}
          </Text>
        </View>
        {(tags.length > 0 || crew.level !== '무관') && (
          <View style={st.tagsRow}>
            {crew.level !== '무관' && <View style={st.tag}><Text style={st.tagTxt}>{crew.level}</Text></View>}
            {tags.map(d => <View key={d} style={st.tag}><Text style={st.tagTxt}>{d}</Text></View>)}
          </View>
        )}
      </View>

      {/* Join badge — pressable only when not full */}
      <Pressable
        onPress={full ? undefined : onJoin}
        disabled={full}
        style={[st.joinBadge, full ? st.joinFull : st.joinOpen]}
        hitSlop={6}
      >
        <Text style={[st.joinTxt, { color: full ? C.faint : C.accentText }]}>
          {full ? '모집 마감' : '가입'}
        </Text>
      </Pressable>
    </Pressable>
  );
}

// ─── My crew card ─────────────────────────────────────────────────────────────

function MyCrewCard({ crew, onPress }: { crew: Crew; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[st.card, shadows.sm]}>
      <View style={st.thumbWrap}>
        <MiniMap seed={crew.id} height={54} borderRadius={0} />
        {crew.color && (
          <View style={[st.colorDot, { backgroundColor: crew.color }]} />
        )}
      </View>

      <View style={st.cardBody}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={st.cardName} numberOfLines={1}>{crew.name}</Text>
          {crew.myRole === 'owner' && (
            <View style={st.ownerBadge}><Text style={st.ownerTxt}>크루장</Text></View>
          )}
        </View>
        <View style={st.cardMeta}>
          <Icon name="people-outline" size={12} color={C.faint} />
          <Text style={st.cardMetaTxt} numberOfLines={1}>
            {crew.member_count}명 · {crew.area ?? ''}
          </Text>
        </View>
        {(crew.level !== '무관' || crew.sport) && (
          <View style={st.tagsRow}>
            {crew.level !== '무관' && <View style={st.tag}><Text style={st.tagTxt}>{crew.level}</Text></View>}
            {crew.sport && <View style={st.tag}><Text style={st.tagTxt}>{crew.sport}</Text></View>}
          </View>
        )}
      </View>

      <Icon name="chevron-forward" size={16} color={C.faint} />
    </Pressable>
  );
}

// ─── Discover tab ─────────────────────────────────────────────────────────────

function DiscoverTab() {
  const [level, setLevel]     = useState<Level>('전체');
  const [showFull, setShowFull] = useState(false);
  const { crews, loading, error, refetch } = useBrowseCrews();

  // Refetch whenever the community tab regains focus (e.g. back from crew-detail)
  useFocusEffect(useCallback(() => {
    refetch();
  }, [refetch]));

  if (loading) return <LoadingState />;
  if (error)   return <ErrorState message={error} onRetry={refetch} />;

  const visible = crews.filter(c => {
    if (level !== '전체' && c.level !== level) return false;
    if (!showFull && isFull(c)) return false;
    return true;
  });

  function handleJoin(crew: Crew) {
    joinCrew(crew.id).then(({ error: err, code }) => {
      if (err) {
        // 23505 = unique_violation — user already has a row in crew_members
        const msg = code === '23505' ? '이미 가입한 크루예요' : err;
        Alert.alert('가입 실패', msg);
      } else {
        refetch();
        router.push({ pathname: '/(community)/crew-detail' as any, params: { crewId: crew.id } });
      }
    });
  }

  return (
    <FlatList
      data={visible}
      keyExtractor={c => c.id}
      renderItem={({ item }) => (
        <BrowseCrewCard
          crew={item}
          onPress={() => router.push({ pathname: '/(community)/crew-detail' as any, params: { crewId: item.id } })}
          onJoin={() => handleJoin(item)}
        />
      )}
      ListHeaderComponent={
        <View>
          <LevelChips active={level} onChange={setLevel} />
          <View style={st.toggleRow}>
            <Text style={st.toggleCount}>{visible.length}개 크루</Text>
            <Pressable onPress={() => setShowFull(v => !v)} style={st.toggleBtn}>
              <Text style={[st.toggleLabel, { color: showFull ? C.accentGrn : C.sub }]}>
                {showFull ? '가입 가능한 크루만 보기' : '모집 마감 크루도 보기'}
              </Text>
              <View style={[st.switch, { backgroundColor: showFull ? C.accent : C.border }]}>
                <View style={[st.switchThumb, { left: showFull ? 18 : 2 }]} />
              </View>
            </Pressable>
          </View>
        </View>
      }
      ListEmptyComponent={<EmptyState text="조건에 맞는 크루가 없어요" />}
      contentContainerStyle={{ paddingHorizontal: S.gutter, paddingBottom: 36 }}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      showsVerticalScrollIndicator={false}
    />
  );
}

// ─── My crews tab ─────────────────────────────────────────────────────────────

function MyCrewsTab() {
  const { crews, loading, error, signedOut, refetch } = useMyCrews();

  // Refetch whenever the community tab regains focus (e.g. back from crew-detail)
  useFocusEffect(useCallback(() => {
    refetch();
  }, [refetch]));

  if (loading)   return <LoadingState />;
  if (signedOut) return <EmptyState text="로그인이 필요해요" />;
  if (error)     return <ErrorState message={error} onRetry={refetch} />;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
      {/* Create crew — disabled placeholder */}
      <View style={{ paddingHorizontal: S.gutter, paddingTop: S.xl }}>
        <View style={st.sectionHead}>
          <Text style={st.sectionTitle}>내가 만든 크루</Text>
          <View style={[st.createBtn, { opacity: 0.45 }]}>
            <Icon name="lock-closed-outline" size={13} color={C.accentGrn} />
            <Text style={st.createTxt}>크루 생성</Text>
          </View>
        </View>
        <View style={st.emptyDashed}>
          <View style={st.emptyDashedIcon}>
            <Icon name="people-outline" size={20} color={C.accentGrn} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.emptyDashedTitle}>직접 크루 만들기</Text>
            <Text style={st.emptyDashedSub}>크루 생성은 다음 업데이트에서 지원돼요</Text>
          </View>
        </View>
      </View>

      {/* Joined crews */}
      <View style={{ paddingHorizontal: S.gutter, paddingTop: S.xl }}>
        <Text style={[st.sectionTitle, { marginBottom: 13 }]}>참여한 크루</Text>
        {crews.length === 0 ? (
          <EmptyState text="참여한 크루가 없어요" />
        ) : (
          <View style={{ gap: 13 }}>
            {crews.map(c => (
              <MyCrewCard
                key={c.id}
                crew={c}
                onPress={() => router.push({ pathname: '/(community)/crew-detail' as any, params: { crewId: c.id } })}
              />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'crew' | 'discover'>('crew');

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <Text style={st.title}>커뮤니티</Text>
        <Text style={st.subtitle}>내 크루와 함께 목표를 달려요</Text>
      </View>

      <CommTabs active={tab} onChange={v => setTab(v as 'crew' | 'discover')} />

      <View style={{ flex: 1 }}>
        {tab === 'crew'
          ? <MyCrewsTab />
          : <DiscoverTab />
        }
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root:     { flex: 1, backgroundColor: C.bg },

  header:   { paddingHorizontal: S.gutter, paddingTop: 12, paddingBottom: 4 },
  title:    { fontSize: 26, fontWeight: '700', letterSpacing: -0.7, color: C.text },
  subtitle: { fontSize: 13.5, color: C.sub, letterSpacing: -0.3, marginTop: 5 },

  // Tabs
  tabRow:       { flexDirection: 'row', gap: 22, paddingHorizontal: S.gutter, borderBottomWidth: 1, borderBottomColor: C.border },
  tabBtn:       { position: 'relative', paddingTop: 16, paddingBottom: 12 },
  tabTxt:       { fontSize: 15, fontWeight: '700', letterSpacing: -0.3 },
  tabUnderline: { position: 'absolute', bottom: -1, left: 0, right: 0, height: 2.5, borderRadius: 99, backgroundColor: C.accent },

  // Level chips
  chipsWrap: { paddingHorizontal: S.gutter, paddingTop: 14, paddingBottom: 2, gap: 8 },
  chip:      { height: 34, paddingHorizontal: 15, borderRadius: R.pill, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  chipActive:{ backgroundColor: C.accentDim, borderColor: C.accent },
  chipTxt:   { fontSize: 13, fontWeight: '700', letterSpacing: -0.2 },

  // Full toggle row
  toggleRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, paddingTop: 14, paddingBottom: 4 },
  toggleCount: { fontSize: 12.5, color: C.faint, fontWeight: '600' },
  toggleBtn:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleLabel: { fontSize: 13, fontWeight: '700', letterSpacing: -0.2 },
  switch:      { width: 40, height: 24, borderRadius: R.pill },
  switchThumb: {
    position: 'absolute', top: 2, width: 20, height: 20, borderRadius: R.pill,
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },

  // Cards (shared shape)
  card:     { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 13, ...shadows.sm },
  thumbWrap:{ width: 54, height: 54, borderRadius: 15, overflow: 'hidden', flexShrink: 0, position: 'relative' },
  colorDot: { position: 'absolute', bottom: 4, right: 4, width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: '#0C0F14' },
  cardBody: { flex: 1, minWidth: 0, gap: 4 },
  cardName: { fontSize: 15.5, fontWeight: '700', letterSpacing: -0.4, color: C.text },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardMetaTxt: { fontSize: 12, color: C.faint, letterSpacing: -0.2 },
  tagsRow:  { flexDirection: 'row', gap: 5, marginTop: 4, flexWrap: 'wrap' },
  tag:      { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tagTxt:   { fontSize: 10.5, fontWeight: '700', color: C.sub },

  // Join badge
  joinBadge:{ flexShrink: 0, height: 32, paddingHorizontal: 14, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center' },
  joinOpen: { backgroundColor: C.accent },
  joinFull: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  joinTxt:  { fontSize: 12.5, fontWeight: '700', letterSpacing: -0.2 },

  // Owner badge
  ownerBadge:{ backgroundColor: '#E8B53D', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  ownerTxt:  { fontSize: 10, fontWeight: '800', color: '#0D1A06', letterSpacing: 0.2 },

  // Section head + create CTA
  sectionHead:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 },
  sectionTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: C.text },
  createBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: 12, borderRadius: R.pill, borderWidth: 1.5, borderColor: C.accent, backgroundColor: C.accentDim },
  createTxt:    { fontSize: 13, fontWeight: '700', color: C.accentGrn, letterSpacing: -0.2 },

  // Empty dashed placeholder card
  emptyDashed:     { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, borderRadius: 18, padding: 16 },
  emptyDashedIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  emptyDashedTitle:{ fontSize: 14.5, fontWeight: '700', letterSpacing: -0.3, color: C.text },
  emptyDashedSub:  { fontSize: 12.5, color: C.faint, letterSpacing: -0.2, marginTop: 2 },

  // Loading / error / empty states
  centered:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 60 },
  stateTitle: { fontSize: 14, color: C.faint, letterSpacing: -0.2, fontWeight: '600' },
  stateSub:   { fontSize: 12, color: C.faint, letterSpacing: -0.2, textAlign: 'center' },
  retryBtn:   { marginTop: 4, paddingHorizontal: 20, paddingVertical: 10, borderRadius: R.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  retryTxt:   { fontSize: 14, fontWeight: '700', color: C.text },
});
