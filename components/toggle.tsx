/**
 * Toggle — THE house toggle, one source of truth (extraction 2026-07-23,
 * native-haptic convict slice). Retires four local copies (profile / create /
 * ai-course-prefs identical; crew-perms' disabled-capable variant folded in
 * as the optional `disabled` prop) and the 9 RN Switch instances whose
 * built-in UISwitch haptic leaked past 햅틱 피드백 (the two-idiom
 * inconsistency WAS the leak — owner ledger (d); the 9th, crew-create's
 * challenge toggle, surfaced only in the untruncated residue sweep).
 *
 * Buzz: Light impact behind run.haptics, fire-time snapshot idiom (owner
 * ruling (b): OFF = truly silent, ON = the native toggle feel,
 * app-controlled — the setting governs it in both directions).
 */
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useSettings } from '@/store/use-settings';
import type { Tokens } from '@/lib/theme';

export function Toggle({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  return (
    <Pressable
      onPress={() => {
        if (useSettings.getState().settings.run.haptics) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onChange(!on);
      }}
      disabled={disabled}
      style={[st.toggleTrack, { backgroundColor: on ? C.accent : C.border }, disabled && { opacity: 0.4 }]}
      hitSlop={6}
    >
      <View style={[st.toggleThumb, { transform: [{ translateX: on ? 18 : 0 }] }]} />
    </Pressable>
  );
}

const makeSt = (_C: Tokens) => StyleSheet.create({
  toggleTrack: { width: 46, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
});
