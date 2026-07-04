import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { accentShadow, colors as C, shadows } from '@/lib/theme';

type TabDef = {
  route: string;
  iconOutline: string;
  iconFilled: string;
  label: string;
  center?: boolean;
};

const TABS: TabDef[] = [
  { route: 'index',     iconOutline: 'home-outline',   iconFilled: 'home',   label: '홈' },
  { route: 'community', iconOutline: 'people-outline', iconFilled: 'people', label: '커뮤니티' },
  { route: 'create',    iconOutline: 'add',            iconFilled: 'add',    label: '뛰러 가기', center: true },
  { route: 'records',   iconOutline: 'list-outline',   iconFilled: 'list',   label: '기록' },
  { route: 'profile',   iconOutline: 'person-outline', iconFilled: 'person', label: '프로필' },
];

export function FreshTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  function handlePress(routeName: string, routeKey: string, isFocused: boolean) {
    if (Platform.OS === 'ios') {
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

  return (
    <View
      style={[styles.wrapper, { paddingBottom: insets.bottom + 8 }]}
      pointerEvents="box-none"
    >
      <View style={[styles.pill, shadows.md]}>
        {TABS.map((tab) => {
          const route = state.routes.find((r) => r.name === tab.route);
          const isFocused = route ? state.index === state.routes.indexOf(route) : false;
          const iconColor = isFocused ? C.accentGrn : C.faint;

          if (tab.center) {
            return (
              <Pressable
                key={tab.route}
                onPress={() => {
                  if (route) handlePress(tab.route, route.key, isFocused);
                }}
                style={({ pressed }) => [
                  styles.centerOuter,
                  { transform: [{ scale: pressed ? 0.93 : 1 }] },
                ]}
              >
                <View style={[styles.centerCircle, { backgroundColor: C.accent }, accentShadow(C.accent)]}>
                  <Icon name="add" size={26} color={C.accentText} />
                </View>
                <Text style={[styles.lbl, { color: C.accentGrn, fontWeight: '700' }]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          }

          return (
            <Pressable
              key={tab.route}
              onPress={() => route && handlePress(tab.route, route.key, isFocused)}
              style={styles.tabBtn}
            >
              <Icon
                name={isFocused ? tab.iconFilled : tab.iconOutline}
                size={22}
                color={iconColor}
              />
              <Text style={[styles.lbl, { color: iconColor, fontWeight: isFocused ? '700' : '500' }]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: 'transparent',
  },
  pill: {
    height: 66,
    borderRadius: 33,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 8,
  },
  centerOuter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 8,
  },
  centerCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  lbl: {
    fontSize: 10,
    letterSpacing: -0.1,
  },
});
