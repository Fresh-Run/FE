/**
 * 사진 위치 조정 — circular avatar framing step (owner veto on losing crop,
 * 2026-07-14): PHPicker keeps the fast present, this screen restores the
 * user's control over WHICH part of the image lands in the circle.
 *
 * Pinch-zoom + pan under a circular mask → 확인 crops the visible square
 * via expo-image-manipulator (crop + ≤1024 resize, JPEG) → the caller's
 * existing upload path. 다시 선택 fires ONLY after this Modal's real
 * dismissal (onDismiss + fallback, once-only) so re-opening the native
 * picker never races a dismissing modal — the exact mechanism of 지연
 * bug ②, handled here so every consumer inherits it.
 *
 * Hand-rolled on react-native-gesture-handler + reanimated (both already
 * deps): no maintained Expo-Go-compatible crop-UI lib exists — the usual
 * candidate (react-native-image-crop-picker) requires native code.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { accentShadow, colors as C } from '@/lib/theme';

export type CropSource = { uri: string; width: number; height: number };

const WIN = Dimensions.get('window');
const AVATAR_D = Math.min(WIN.width - 56, 320); // 1:1 avatar circle diameter
const MASK_BW = 600;                            // huge-border mask trick (any shape)
const COVER_RADIUS = 16;                         // rounded-rect corner for wide crops

export function AvatarCrop({ src, aspect = 1, onClose, onConfirm, onRetake }: {
  src: CropSource | null;
  /** Crop window width:height. 1 = circular avatar (default); e.g. 16/9 = wide cover. */
  aspect?: number;
  /** Close without a result (X). Parent clears `src`. */
  onClose: () => void;
  /** Cropped JPEG local uri (square when aspect=1, else `aspect`-shaped) — parent closes + uploads/stores. */
  onConfirm: (croppedUri: string) => void;
  /** Called AFTER the modal has really dismissed — safe to relaunch the picker. */
  onRetake: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);

  // Crop-window dims: square for the avatar, wide rounded-rect for a cover.
  const circular = aspect === 1;
  const CW = circular ? AVATAR_D : Math.min(WIN.width - 40, 380);
  const CH = circular ? AVATAR_D : CW / aspect;

  // Cover-fit display size: at zoom 1 the image exactly fills the crop window
  const base = src ? Math.max(CW / src.width, CH / src.height) : 1;
  const dispW = src ? src.width * base : CW;
  const dispH = src ? src.height * base : CH;

  const zoom = useSharedValue(1);
  const savedZoom = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  // Fresh image → reset framing
  useEffect(() => {
    zoom.value = 1; savedZoom.value = 1;
    tx.value = 0; ty.value = 0; savedTx.value = 0; savedTy.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src?.uri]);

  const clamp = (dw: number, dh: number) => {
    'worklet';
    const maxX = Math.max(0, (dw * zoom.value - CW) / 2);
    const maxY = Math.max(0, (dh * zoom.value - CH) / 2);
    tx.value = Math.min(maxX, Math.max(-maxX, tx.value));
    ty.value = Math.min(maxY, Math.max(-maxY, ty.value));
  };

  const pinch = Gesture.Pinch()
    .onUpdate(e => {
      zoom.value = Math.min(6, Math.max(1, savedZoom.value * e.scale));
      clamp(dispW, dispH);
    })
    .onEnd(() => { savedZoom.value = zoom.value; savedTx.value = tx.value; savedTy.value = ty.value; });
  const pan = Gesture.Pan()
    .onUpdate(e => {
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
      clamp(dispW, dispH);
    })
    .onEnd(() => { savedTx.value = tx.value; savedTy.value = ty.value; });
  const gestures = Gesture.Simultaneous(pinch, pan);

  const imgStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: zoom.value }],
  }));

  // 다시 선택 must not relaunch the picker over this dismissing Modal
  // (지연 bug ② mechanism) — run it once on real onDismiss, 700ms fallback.
  const pendingRetake = useRef(false);
  const fireRetakeOnce = () => {
    if (!pendingRetake.current) return;
    pendingRetake.current = false;
    onRetake();
  };
  const handleRetake = () => {
    pendingRetake.current = true;
    onClose();
    setTimeout(fireRetakeOnce, 700);
  };

  async function confirmCrop() {
    if (!src || saving) return;
    setSaving(true);
    try {
      // Screen px per original-image px at the current zoom
      const s = base * zoom.value;
      const cropPxW = CW / s;
      const cropPxH = CH / s;
      const rawX = (src.width - cropPxW) / 2 - tx.value / s;
      const rawY = (src.height - cropPxH) / 2 - ty.value / s;
      const originX = Math.round(Math.min(Math.max(0, rawX), src.width - cropPxW));
      const originY = Math.round(Math.min(Math.max(0, rawY), src.height - cropPxH));
      const cw = Math.floor(Math.min(cropPxW, src.width - originX));
      const ch = Math.floor(Math.min(cropPxH, src.height - originY));
      const ctx = ImageManipulator.manipulate(src.uri)
        .crop({ originX, originY, width: cw, height: ch })
        .resize({ width: Math.min(1024, cw) }); // width-only resize preserves aspect
      const img = await ctx.renderAsync();
      const saved = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
      onConfirm(saved.uri);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={!!src} animationType="slide" onDismiss={fireRetakeOnce} onRequestClose={onClose}>
      <GestureHandlerRootView style={st.root}>
        {/* Image under gestures */}
        <View style={st.stage}>
          {src && (
            <GestureDetector gesture={gestures}>
              <Animated.View style={st.imgWrap}>
                <Animated.Image
                  source={{ uri: src.uri }}
                  style={[{ width: dispW, height: dispH }, imgStyle]}
                />
              </Animated.View>
            </GestureDetector>
          )}
          {/* Mask (huge-border trick) + framing outline — circle or rounded-rect */}
          <View pointerEvents="none" style={st.maskWrap}>
            <View style={[st.mask, {
              width: CW + MASK_BW * 2, height: CH + MASK_BW * 2,
              borderRadius: circular ? (CW + MASK_BW * 2) / 2 : MASK_BW + COVER_RADIUS,
            }]} />
          </View>
          <View pointerEvents="none" style={[st.frameOutline, {
            marginTop: -CH / 2, width: CW, height: CH,
            borderRadius: circular ? CW / 2 : COVER_RADIUS,
          }]} />
        </View>

        {/* Header */}
        <View style={[st.header, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <Pressable onPress={onClose} hitSlop={12} style={st.closeBtn}>
            <Icon name="close" size={22} color="#fff" />
          </Pressable>
          <Text style={st.title}>사진 위치 조정</Text>
          <View style={{ width: 40 }} />
        </View>
        <Text style={[st.hint, { marginTop: CH / 2 + 18 }]} pointerEvents="none">핀치로 확대 · 드래그로 이동</Text>

        {/* Footer actions */}
        <View style={[st.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <Pressable onPress={handleRetake} disabled={saving} style={st.retakeBtn}>
            <Text style={st.retakeTxt}>다시 선택</Text>
          </Pressable>
          <Pressable onPress={confirmCrop} disabled={saving} style={[st.confirmBtn, accentShadow(C.accent)]}>
            {saving
              ? <ActivityIndicator color={C.accentText} />
              : <Text style={st.confirmTxt}>확인</Text>}
          </Pressable>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const st = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#0B0D09' },
  stage:   { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  imgWrap: { alignItems: 'center', justifyContent: 'center' },

  maskWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  mask: { borderWidth: MASK_BW, borderColor: 'rgba(11,13,9,0.72)' }, // dims + radius set inline (shape-dependent)
  frameOutline: {
    position: 'absolute', alignSelf: 'center', top: '50%',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)', // dims + radius set inline
  },

  header:   { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title:    { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: -0.3 },
  hint:     { position: 'absolute', top: '50%', alignSelf: 'center', fontSize: 12.5, color: 'rgba(255,255,255,0.65)', letterSpacing: -0.2 }, // marginTop set inline

  footer:     { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 10, paddingHorizontal: 20 },
  retakeBtn:  { flex: 1, height: 52, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center' },
  retakeTxt:  { fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: -0.3 },
  confirmBtn: { flex: 1.4, height: 52, borderRadius: 16, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  confirmTxt: { fontSize: 15, fontWeight: '800', color: C.accentText, letterSpacing: -0.3 },
});
