import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/contexts/theme';

export function GrabHandle() {
  const { colors } = useTheme();
  return (
    <View style={styles.handleWrap}>
      <View style={[styles.handle, { backgroundColor: colors.outlineVariant }]} />
    </View>
  );
}

export function BottomSheet({
  visible,
  onClose,
  children,
  handle = true,
}: {
  visible: boolean;
  onClose?: () => void;
  children?: React.ReactNode;
  handle?: boolean;
  blur?: boolean;
}) {
  const { colors, elevation, radius } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Scrim */}
      <Pressable style={styles.scrim} onPress={onClose}>
        <View style={[styles.scrim, { backgroundColor: colors.scrim }]} />
      </Pressable>

      {/* Sheet */}
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surfaceContainerLowest,
            borderTopLeftRadius: radius.xxxl,
            borderTopRightRadius: radius.xxxl,
          },
          elevation.sheet,
        ]}
      >
        {handle ? <GrabHandle /> : null}
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 34,
  },
  handleWrap: { alignItems: 'center', paddingVertical: 12 },
  handle:     { width: 36, height: 4, borderRadius: 2 },
});
