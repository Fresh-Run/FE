/**
 * PhotoViewer — full-screen photo enlarge (⑦, 2026-07-16). B7's tap-to-
 * enlarge grammar extended from the map slide to photo slides: tap a photo →
 * this modal, swipe between photos, × or backdrop-tap to close. v1 is
 * paging + contain-fit only — NO pinch-zoom yet (stated scope; the modal
 * owns the surface a zoom gesture would later live on).
 */
import React, { useRef, useState } from 'react';
import { FlatList, Modal, Pressable, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';

type Props = {
  visible: boolean;
  photos: string[];
  /** which photo opens first (the tapped slide) */
  initialIndex: number;
  onClose: () => void;
};

export function PhotoViewer({ visible, photos, initialIndex, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [idx, setIdx] = useState(initialIndex);
  const listRef = useRef<FlatList<string>>(null);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={st.root}>
        {/* backdrop tap closes — the photo itself is inside the same surface,
            so any tap closes; swipes page (Pressable vs pan, the carousel rule) */}
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <FlatList
          ref={listRef}
          data={photos}
          keyExtractor={(u, i) => `${i}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={Math.min(initialIndex, Math.max(0, photos.length - 1))}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={e => {
            setIdx(Math.min(photos.length - 1, Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width))));
          }}
          renderItem={({ item }) => (
            <Pressable onPress={onClose} style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
              <Image source={{ uri: item }} style={{ width, height: height * 0.82 }} resizeMode="contain" />
            </Pressable>
          )}
        />
        {/* × — safe-area top-right */}
        <Pressable onPress={onClose} hitSlop={12} style={[st.closeBtn, { top: insets.top + 8 }]}>
          <Icon name="close" size={22} color="#fff" />
        </Pressable>
        {/* counter — only with 2+ photos */}
        {photos.length > 1 && (
          <View style={[st.counter, { bottom: Math.max(insets.bottom, 16) + 8 }]} pointerEvents="none">
            <Text style={st.counterTxt}>{idx + 1} / {photos.length}</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' },
  closeBtn:   { position: 'absolute', right: 16, width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  counter:    { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  counterTxt: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.85)', letterSpacing: 0.3 },
});
