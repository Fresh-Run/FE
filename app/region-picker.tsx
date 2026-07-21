/**
 * 시·도 선택 — 둘러보기 location filter picker (canvas screen ②).
 * 현재 위치 사용 = pure lat/lng mode (owner call 2026-07-09: distance sort,
 * no admin-name mapping — the Apple-geocoder→표준명 normalization table is
 * deferred). Manual path: 17 sido (guide-exact strings) → sigungu drill-down
 * from the bundled dataset (세종 has none → sido-only). Selection lands in
 * store/crew-filter; the community tab reads it on focus.
 */
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { SIDO_LIST, SIGUNGU, type Sido } from '@/lib/korea-regions';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { setCrewFilter } from '@/store/crew-filter';
import { setPendingCrewRegion } from '@/store/pending-crew-region';

export default function RegionPickerScreen() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  // target=form → crew create/edit (writes pending-crew-region); default →
  // the 둘러보기 filter (crew-filter). One picker, two consumers.
  const { target } = useLocalSearchParams<{ target?: string }>();
  const forForm = target === 'form';
  const commit = (sido: Sido, sigungu: string | null) => {
    if (forForm) setPendingCrewRegion({ sido, sigungu });
    else setCrewFilter(sigungu ? { mode: 'region', sido, sigungu } : { mode: 'region', sido });
    router.back();
  };
  const [drill, setDrill] = useState<Sido | null>(null); // null = sido level
  const [query, setQuery] = useState('');

  const q = query.trim();
  const rows: string[] = drill
    ? ['전체', ...SIGUNGU[drill].filter(g => !q || g.includes(q))]
    : SIDO_LIST.filter(s => !q || s.includes(q));

  function pickCurrent() {
    setCrewFilter({ mode: 'current' });
    router.back();
  }

  function pickRow(name: string) {
    if (!drill) {
      const sido = name as Sido;
      if (SIGUNGU[sido].length === 0) {
        commit(sido, null); // 세종 — no sigungu level; sido-only
        return;
      }
      setDrill(sido);
      setQuery('');
      return;
    }
    commit(drill, name === '전체' ? null : name);
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable
          onPress={() => (drill ? (setDrill(null), setQuery('')) : router.back())}
          hitSlop={12}
          style={st.appBarBtn}
        >
          <Icon name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>{drill ?? '시·도 선택'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* 현재 위치 사용 — 자동 (lat/lng mode). Filter-only: a crew's region
          must be an explicit admin area, so hidden in form mode. */}
      {!drill && !forForm && (
        <Pressable onPress={pickCurrent} style={({ pressed }) => [st.currentRow, shadows.sm, pressed && { opacity: 0.8 }]}>
          <View style={st.currentIcon}>
            <Icon name="locate" size={17} color={C.accentGrn} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.currentTitle}>현재 위치 사용</Text>
            <Text style={st.currentSub}>가까운 크루부터 자동으로 보여드려요</Text>
          </View>
          <Icon name="chevron-forward" size={16} color={C.faint} />
        </Pressable>
      )}

      {/* Search */}
      <View style={st.searchWrap}>
        <Icon name="search" size={16} color={C.faint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={drill ? '시·군·구 검색' : '시·도 검색'}
          placeholderTextColor={C.faint}
          style={st.searchInput}
          autoCorrect={false}
        />
      </View>

      <FlatList
        data={rows}
        keyExtractor={r => r}
        renderItem={({ item }) => (
          <Pressable onPress={() => pickRow(item)} style={({ pressed }) => [st.row, pressed && { opacity: 0.6 }]}>
            <Text style={[st.rowTxt, item === '전체' && { color: C.accentGrn, fontWeight: '700' }]}>
              {item === '전체' ? `${drill} 전체` : item}
            </Text>
            {!drill && <Icon name="chevron-forward" size={15} color={C.faint} />}
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={st.divider} />}
        ListEmptyComponent={<Text style={st.emptyTxt}>검색 결과가 없어요</Text>}
        contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, paddingVertical: 10 },
  appBarBtn:   { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },

  currentRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: S.gutter, marginBottom: 4, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 13 },
  currentIcon:  { width: 38, height: 38, borderRadius: R.md, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  currentTitle: { fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  currentSub:   { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },

  searchWrap:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: S.gutter, marginVertical: 12, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: 12 },
  searchInput: { flex: 1, height: 42, fontSize: 14.5, color: C.text },

  row:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15, paddingHorizontal: S.gutter + 4 },
  rowTxt:  { fontSize: 15, fontWeight: '600', color: C.text, letterSpacing: -0.3 },
  divider: { height: 1, backgroundColor: C.border, marginHorizontal: S.gutter },

  emptyTxt: { textAlign: 'center', paddingTop: 40, fontSize: 13.5, color: C.faint },
});
