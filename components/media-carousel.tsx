/**
 * MediaCarousel — run/course hero (canvas: FrMediaCarousel, home-cards.jsx).
 * No photos → static map, no carousel, no dots (canvas-exact). With photos →
 * horizontal snap pager: map slide FIRST, then photo slides, dot pips overlay.
 * photos stays [] until run media lands server-side (R2, 지연-ask) — the
 * pager path ships typed but dormant.
 */
import React, { useRef, useState } from 'react';
import { FlatList, Image, StyleSheet, View } from 'react-native';

import { MiniMap } from '@/components/mini-map';
import { RealMap } from '@/components/real-map';
import { colors as C } from '@/lib/theme';
import type { Coordinate } from '@/types';

type Slide = { key: string; type: 'map' } | { key: string; type: 'photo'; uri: string };

type Props = {
  polyline: Coordinate[] | null;
  /** MiniMap seed when no polyline is available */
  seed: string;
  photos?: string[];
  height: number;
};

function MapSlide({ polyline, seed, height }: { polyline: Coordinate[] | null; seed: string; height: number }) {
  return polyline && polyline.length >= 2
    ? <RealMap height={height} polyline={polyline} />
    : <MiniMap seed={seed} height={height} borderRadius={0} polyline={polyline ?? undefined} />;
}

export function MediaCarousel({ polyline, seed, photos = [], height }: Props) {
  const [width, setWidth] = useState(0);
  const [idx, setIdx] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);

  // Canvas-exact: no photos → plain static map, no pager, no dots
  if (photos.length === 0) {
    return <MapSlide polyline={polyline} seed={seed} height={height} />;
  }

  const slides: Slide[] = [
    { key: 'map', type: 'map' },
    ...photos.map((uri, i) => ({ key: `photo-${i}`, type: 'photo' as const, uri })),
  ];

  return (
    <View style={{ height }} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <FlatList
          ref={listRef}
          data={slides}
          keyExtractor={s => s.key}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={e => {
            setIdx(Math.min(slides.length - 1, Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width))));
          }}
          renderItem={({ item }) => (
            <View style={{ width, height }}>
              {item.type === 'map'
                ? <MapSlide polyline={polyline} seed={seed} height={height} />
                : <Image source={{ uri: item.uri }} style={{ width, height }} resizeMode="cover" />}
            </View>
          )}
        />
      )}
      {/* dot pips — bottom-center overlay per canvas */}
      <View style={st.dotsWrap} pointerEvents="none">
        <View style={st.dotsPill}>
          {slides.map((s, i) => (
            <View key={s.key} style={[st.dot, { backgroundColor: i === idx ? C.accentGrn : 'rgba(255,255,255,0.55)' }]} />
          ))}
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  dotsWrap: { position: 'absolute', bottom: 10, left: 0, right: 0, alignItems: 'center' },
  dotsPill: { flexDirection: 'row', gap: 5, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  dot:      { width: 6, height: 6, borderRadius: 3 },
});
