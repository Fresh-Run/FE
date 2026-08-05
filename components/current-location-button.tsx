/**
 * 현재 위치 button — the picker-class recenter affordance, ONE source of
 * truth (Toggle-unification precedent). Look = the tracking screen's ⌖
 * idiom verbatim: 40×40 surface pill, border, locate icon, busy swap.
 *
 * Tracking's own inline recenter STAYS separate by design — it is follow
 * machinery (Reanimated ride, suspension-gated visibility, follow-resume
 * side effect), a different behavior class from "animate to my fix".
 *
 * Honest affordance: the button is ALWAYS visible — it doubles as the
 * permission door (tap = request). When the tap can't do its job
 * (permission denied, GPS miss) a transient caption says why nothing
 * moved — never a silent no-op, never a hidden door.
 *
 * Recentering the VIEW never touches a picker's pin — callers receive the
 * fix and animate the camera only.
 */
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/ui';
import { t } from '@/lib/i18n';
import { radius as R, shadows, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';

const CAPTION_MS = 3200;

export function CurrentLocationButton({ onFix, style }: {
  /** receives the GPS fix — the caller animates its own camera */
  onFix: (c: { lat: number; lng: number }) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const [locating, setLocating] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);
  const captionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (captionTimer.current) clearTimeout(captionTimer.current); }, []);

  function showCaption(msg: string) {
    setCaption(msg);
    if (captionTimer.current) clearTimeout(captionTimer.current);
    captionTimer.current = setTimeout(() => setCaption(null), CAPTION_MS);
  }

  async function tap() {
    if (locating) return;
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showCaption(t('loc.permOff'));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      onFix({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      showCaption(t('loc.notFound'));
    } finally {
      setLocating(false);
    }
  }

  return (
    <View style={style} pointerEvents="box-none">
      {caption !== null && (
        <View style={[st.caption, shadows.sm]} pointerEvents="none">
          <Text style={st.captionTxt}>{caption}</Text>
        </View>
      )}
      <Pressable onPress={tap} style={st.btn} hitSlop={6}>
        <Icon name={locating ? 'ellipsis-horizontal' : 'locate'} size={18} color={C.text} />
      </Pressable>
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  // tracking's recenterBtn verbatim — the named idiom
  btn: { width: 40, height: 40, borderRadius: R.pill, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', ...shadows.sm },
  // transient why-nothing-moved pill, extending leftward beside the button
  caption:    { position: 'absolute', right: 46, top: 0, height: 40, maxWidth: 260, justifyContent: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.pill, paddingHorizontal: 14 },
  captionTxt: { fontSize: 12, fontWeight: '600', color: C.sub, letterSpacing: -0.2 },
});
