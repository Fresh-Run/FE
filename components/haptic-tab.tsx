import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';

import { useSettings } from '@/store/use-settings';

// NOTE: currently UNMOUNTED (FreshTabBar replaced it; grep-verified
// 2026-07-23) — gated anyway under the toggle-scope ruling so a future
// mount can't reintroduce an ungated buzzer.
export function HapticTab(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      onPressIn={(ev) => {
        if (process.env.EXPO_OS === 'ios' && useSettings.getState().settings.run.haptics) {
          // Add a soft haptic feedback when pressing down on the tabs.
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}
