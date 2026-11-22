// MY › 게시물 탭 (redesign 2b, 2026-11-19) — canvas "MY 게시물 — Figma 원본"
// (MyPostsOrig.dc.html): 내 게시물 grid (3 columns, square cells: first
// photo → route mini-map → seed art). The Figma's 태그됨 sub-tab is HIDDEN
// entirely (owner-ruled 2026-11-19: tagging is not decided, not an ask).
//
// "게시물" = own runs that are not private (public / followers — what a
// viewer could see on the profile), from the parent's shared useRuns list.
import { RouteMap } from '@/components/route-map';
import { router } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { SafeImage } from '@/components/safe-image';
import { Icon } from '@/components/ui';
import type { Run } from '@/hooks/use-runs';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useT } from '@/lib/i18n';
import { isPlausibleTrack } from '@/lib/track-plausibility';
import { spacing as S, type Tokens } from '@/lib/theme';

const COLS = 3;
const GAP = 2;

export function MyPostsTab({ runs, loading, loadingMore }: { runs: Run[]; loading: boolean; loadingMore: boolean }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  const { width } = useWindowDimensions();
  const cell = Math.floor((width - GAP * (COLS - 1)) / COLS);
  const posts = runs.filter(r => r.visibility !== 'private');

  return (
    <View style={{ paddingTop: S.sm }}>
      <View style={st.subTabs}>
        <View style={st.subTab}>
          <Text style={st.subTabTxt}>{T('my.myPosts')}</Text>
          <View style={[st.underline, { backgroundColor: C.accent }]} />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={C.faint} style={{ paddingVertical: 28 }} />
      ) : posts.length === 0 ? (
        <View style={st.empty}>
          <Icon name="images-outline" size={30} color={C.faint} />
          <Text style={st.emptyTxt}>{T('my.noPosts')}</Text>
        </View>
      ) : (
        <View style={st.grid}>
          {posts.map(run => {
            const hasTrack = !!run.polyline_thumb && run.polyline_thumb.length >= 2 && isPlausibleTrack(run.polyline_thumb, run.distance_km);
            return (
              <Pressable
                key={run.id}
                onPress={() => router.push({ pathname: '/(records)/activity', params: { runId: run.id } })}
                style={({ pressed }) => [{ width: cell, height: cell, backgroundColor: C.surfaceAlt }, pressed && { opacity: 0.8 }]}
                accessibilityRole="button"
                accessibilityLabel={run.title ?? T('my.tabPosts')}
              >
                <SafeImage uri={run.photo_thumb} style={{ width: cell, height: cell }}
                  fallback={<RouteMap id={run.id} polyline={hasTrack ? run.polyline_thumb : null} height={cell} width={cell} square />} />
              </Pressable>
            );
          })}
        </View>
      )}
      {loadingMore && <ActivityIndicator size="small" color={C.faint} style={{ paddingVertical: 12 }} />}
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  subTabs:   { flexDirection: 'row', paddingHorizontal: S.gutter, paddingBottom: S.md },
  subTab:    { alignItems: 'center', gap: 6 },
  subTabTxt: { fontSize: 13.5, fontWeight: '700', color: C.text },
  underline: { height: 2, width: '100%', borderRadius: 1 },
  grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  empty:     { alignItems: 'center', gap: 8, paddingVertical: 36 },
  emptyTxt:  { fontSize: 13, color: C.sub },
});
