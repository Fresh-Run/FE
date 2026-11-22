// Layout skeletons — redesign item ⑩ slice 1 (2026-11-21). A first-ever open
// shows the screen's shape in the neutral surface token; never a centered
// spinner. One primitive (`Skel`) + per-screen compositions sized to the
// boards they stand in for.
import React from 'react';
import { View, type ViewStyle } from 'react-native';

import { useTokens } from '@/hooks/use-tokens';
import { spacing as S } from '@/lib/theme';

export function Skel({ w, h, r = 10, style }: { w?: number | `${number}%`; h: number; r?: number; style?: ViewStyle }) {
  const C = useTokens();
  return <View style={[{ width: w ?? '100%', height: h, borderRadius: r, backgroundColor: C.surfaceAlt }, style]} />;
}

function Lines({ widths, gap = 8 }: { widths: (number | `${number}%`)[]; gap?: number }) {
  return <View style={{ gap }}>{widths.map((w, i) => <Skel key={i} w={w} h={12} r={6} />)}</View>;
}

/** Avatar + two lines, repeated — lists (notifications, chat, feeds, rosters). */
export function RowsSkeleton({ rows = 7, avatar = true, pad = S.gutter }: { rows?: number; avatar?: boolean; pad?: number }) {
  return (
    <View style={{ paddingHorizontal: pad, paddingTop: 16, gap: 18 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {avatar && <Skel w={38} h={38} r={19} />}
          <View style={{ flex: 1 }}><Lines widths={[i % 2 ? '55%' : '70%', '38%']} /></View>
        </View>
      ))}
    </View>
  );
}

/** Feed (Main board): header row · full-bleed media · stats pill · footer. */
export function FeedSkeleton() {
  return (
    <View style={{ paddingTop: 20, gap: 28 }}>
      {[0, 1].map(i => (
        <View key={i}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: S.gutter + 2, marginBottom: 12 }}>
            <Skel w={34} h={34} r={17} />
            <View style={{ flex: 1 }}><Lines widths={['36%', '52%']} gap={6} /></View>
          </View>
          <Skel h={290} r={0} />
          <View style={{ paddingHorizontal: 16, marginTop: -30 }}><Skel h={64} r={16} /></View>
          <View style={{ flexDirection: 'row', gap: 14, paddingHorizontal: S.gutter + 2, marginTop: 14 }}>
            <Skel w={44} h={12} r={6} /><Skel w={56} h={12} r={6} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Crew detail (CrewR1): hero · tabs · next-run card · notice · ranking rows. */
export function CrewDetailSkeleton() {
  return (
    <View>
      <Skel h={270} r={0} />
      <View style={{ flexDirection: 'row', gap: 20, paddingHorizontal: S.gutter + 2, paddingTop: 16 }}>
        {[36, 36, 36, 36].map((w, i) => <Skel key={i} w={w} h={14} r={7} />)}
      </View>
      <View style={{ paddingHorizontal: S.gutter + 2, paddingTop: 22, gap: 10 }}>
        <Skel w={120} h={14} r={7} />
        <Skel h={86} r={20} />
        <Skel h={46} r={16} />
        <Skel w={120} h={14} r={7} style={{ marginTop: 12 }} />
        <Skel h={160} r={20} />
      </View>
    </View>
  );
}

/** 그룹 tab (CommV1): section title · cover card · title · two minis. */
export function GroupsSkeleton() {
  return (
    <View style={{ paddingHorizontal: S.gutter + 2, paddingTop: 20, gap: 10 }}>
      <Skel w={64} h={13} r={6} />
      <Skel h={206} r={22} />
      <Skel w={96} h={13} r={6} style={{ marginTop: 12 }} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[0, 1].map(i => <View key={i} style={{ flex: 1 }}><Skel h={92} r={18} /><View style={{ paddingTop: 10, gap: 8 }}><Skel w="70%" h={12} r={6} /><Skel w="55%" h={10} r={5} /><Skel h={32} r={16} /></View></View>)}
      </View>
    </View>
  );
}

/** Profile (own / other): avatar · name · stat row · two cards. */
export function ProfileSkeleton({ identity = true }: { identity?: boolean }) {
  return (
    <View style={{ paddingHorizontal: S.gutter, paddingTop: 20, gap: 16 }}>
      {identity && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Skel w={76} h={76} r={38} />
          <View style={{ flex: 1 }}><Lines widths={['46%', '30%']} /></View>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 10 }}>{[0, 1, 2].map(i => <Skel key={i} w={90} h={44} r={12} />)}</View>
      <Skel h={120} r={20} />
      <Skel h={200} r={20} />
    </View>
  );
}

/** Run post / activity detail: author row · hero media · lines. */
export function PostSkeleton() {
  return (
    <View style={{ paddingTop: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: S.gutter, marginBottom: 12 }}>
        <Skel w={36} h={36} r={18} />
        <View style={{ flex: 1 }}><Lines widths={['40%', '28%']} gap={6} /></View>
      </View>
      <Skel h={260} r={0} />
      <View style={{ paddingHorizontal: S.gutter, paddingTop: 16, gap: 10 }}>
        <Skel w="60%" h={16} r={8} />
        <View style={{ flexDirection: 'row', gap: 18 }}>{[0, 1, 2].map(i => <Skel key={i} w={64} h={36} r={8} />)}</View>
        <Skel h={80} r={14} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}
