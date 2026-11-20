import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useT } from '@/lib/i18n';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useSettings } from '@/store/use-settings';

// Redesign N1 (canvas "FreshRun 홈 리디자인" › NavBar.dc.html, owner-ruled
// 2026-11-19): a floating 4-tab pill (홈 · 피드 · 그룹 · MY, icons only, dot
// under the active tab) plus a SEPARATE 80px neon run button to its right.
// Icons are placeholders until the icon set is decided (canvas note ⑦).
// Colors ride tokens (surface / text / faint / neon) rather than the canvas's
// light-only hexes so dark mode keeps working — stated deviation.

type TabDef = {
  route: string;
  iconOutline: string;
  iconFilled: string;
  label: import('@/lib/i18n').StringKey; // key, resolved at render (static-capture rule)
};

// Geometry — single source of truth for the bar's screen footprint.
// The wrapper is position:absolute (floating look), so the navigator never
// insets content; tab screens self-compensate via useTabBarInset().
const PILL_HEIGHT = 68;     // canvas: dock 72px — owner trim 2026-11-19 (build 21 feedback: too big)
const PILL_RADIUS = 24;     // canvas: 26px — owner trim 2026-11-19
const RUN_SIZE = 74;        // canvas: 80px — owner trim 2026-11-19, still taller than the dock
const SIDE = 14;            // canvas: left/right 14px
const BOTTOM_BASE = 14;     // canvas: bottom 14px — + insets.bottom at runtime
const GAP = 10;             // canvas: gap between dock and run button
const ICON = 22;
const DOT = 4;
const DOT_GAP = 3;
const BREATHING = 12; // owner call 2026-07-10, pending 지연's taste vote

/** Recommended contentContainerStyle.paddingBottom for every tab screen's
    scroll container: full bar occlusion + breathing room. The run button
    (RUN_SIZE) is the tallest element, so it sets the occlusion height. */
export function useTabBarInset(): number {
  const insets = useSafeAreaInsets();
  return RUN_SIZE + BOTTOM_BASE + insets.bottom + BREATHING;
}

const TABS: TabDef[] = [
  { route: 'index',  iconOutline: 'home-outline',   iconFilled: 'home',   label: 'tab.home' },
  { route: 'feed',   iconOutline: 'list-outline',   iconFilled: 'list',   label: 'tab.feed' },
  { route: 'groups', iconOutline: 'people-outline', iconFilled: 'people', label: 'tab.groups' },
  { route: 'my',     iconOutline: 'person-outline', iconFilled: 'person', label: 'tab.my' },
];

const RUN_ROUTE = 'create'; // interim: today's create screen; later the D1 free-run landing

// Canvas dock shadow: 0 6px 24px rgba(18,23,18,.16) (+ a 1px 4px .07 underline
// RN can't stack). RN shadowRadius ≈ CSS blur / 2.
const dockShadow = {
  shadowColor:   '#121712',
  shadowOpacity: 0.16,
  shadowRadius:  12,
  shadowOffset:  { width: 0, height: 6 },
  elevation:     8,
} as const;

export function FreshTabBar({ state, navigation }: BottomTabBarProps) {
  const T = useT();
  const C = useTokens();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();

  function handlePress(routeName: string, routeKey: string, isFocused: boolean) {
    // Toggle-scope ruling (2026-07-23): 햅틱 피드백 governs ALL app-origin
    // haptics — the tab bar was the audit's ungated control group, now a
    // convicted scope violation. Fire-time snapshot (the staleness-class
    // idiom): no render-path subscription needed for a press handler.
    if (Platform.OS === 'ios' && useSettings.getState().settings.run.haptics) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const event = navigation.emit({
      type: 'tabPress',
      target: routeKey,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(routeName);
    }
  }

  function focusOf(routeName: string): { key: string; focused: boolean } | null {
    const route = state.routes.find((r) => r.name === routeName);
    if (!route) return null;
    return { key: route.key, focused: state.index === state.routes.indexOf(route) };
  }

  const run = focusOf(RUN_ROUTE);

  return (
    <View
      style={[styles.wrapper, { paddingBottom: insets.bottom + BOTTOM_BASE }]}
      pointerEvents="box-none"
    >
      <View style={[styles.pill, dockShadow]}>
        {TABS.map((tab) => {
          const f = focusOf(tab.route);
          const isFocused = f?.focused ?? false;
          const iconColor = isFocused ? C.text : C.faint;
          return (
            <Pressable
              key={tab.route}
              accessibilityRole="tab"
              accessibilityLabel={T(tab.label)}
              accessibilityState={{ selected: isFocused }}
              onPress={() => f && handlePress(tab.route, f.key, isFocused)}
              style={styles.tabBtn}
            >
              <Icon
                name={isFocused ? tab.iconFilled : tab.iconOutline}
                size={ICON}
                color={iconColor}
              />
              {/* Dot always laid out (transparent when inactive) so the icon
                  never shifts between states — small deviation from the
                  canvas, where inactive buttons omit the dot node. */}
              <View style={[styles.dot, { backgroundColor: isFocused ? C.text : 'transparent' }]} />
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={T('tab.run')}
        onPress={() => run && handlePress(RUN_ROUTE, run.key, run.focused)}
        style={({ pressed }) => [
          styles.runBtn,
          dockShadow,
          { backgroundColor: C.neon, transform: [{ scale: pressed ? 0.93 : 1 }] },
        ]}
      >
        <Icon name="play" size={24} color="#121712" />
      </Pressable>
    </View>
  );
}

const makeStyles = (C: Tokens) => StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SIDE,
    flexDirection: 'row',
    alignItems: 'center',
    gap: GAP,
    backgroundColor: 'transparent',
  },
  pill: {
    flex: 1,
    height: PILL_HEIGHT,
    borderRadius: PILL_RADIUS,
    backgroundColor: C.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: DOT_GAP,
    padding: 8,
    minWidth: 44,
    minHeight: 44,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
  },
  runBtn: {
    width: RUN_SIZE,
    height: RUN_SIZE,
    borderRadius: RUN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
