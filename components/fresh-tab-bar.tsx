import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/contexts/theme';
import { Icon } from '@/components/ui';
import { Text } from '@/components/ui';

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
  { route: 'create',    iconOutline: 'add',            iconFilled: 'add',    label: '코스생성', center: true },
  { route: 'records',   iconOutline: 'list-outline',   iconFilled: 'list',   label: '기록' },
  { route: 'profile',   iconOutline: 'person-outline', iconFilled: 'person', label: '프로필' },
];

export function FreshTabBar({ state, navigation }: BottomTabBarProps) {
  const { colors, elevation } = useTheme();
  const insets = useSafeAreaInsets();
  const c = colors;

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
      style={[
        styles.wrapper,
        { paddingBottom: insets.bottom + 8 },
        { backgroundColor: 'transparent' },
      ]}
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.pill,
          {
            backgroundColor: c.surfaceContainerLowest,
            borderColor: c.outlineVariant + '44',
          },
          elevation.sheet,
        ]}
      >
        {TABS.map((tab) => {
          const route = state.routes.find((r) => r.name === tab.route);
          const isFocused = route ? state.index === state.routes.indexOf(route) : false;

          if (tab.center) {
            return (
              <Pressable
                key={tab.route}
                onPress={() => route && handlePress(tab.route, route.key, isFocused)}
                style={({ pressed }) => [
                  styles.centerBtn,
                  {
                    backgroundColor: c.primary,
                    transform: [{ scale: pressed ? 0.93 : 1 }],
                  },
                  elevation.fab,
                ]}
              >
                <Icon name="add" size={28} color={c.onPrimary} />
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
                color={isFocused ? c.primary : c.onSurfaceVariant}
              />
              <Text
                variant="labelSm"
                color={isFocused ? 'primary' : 'onSurfaceVariant'}
                weight={isFocused ? '600' : '500'}
              >
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
  },
  pill: {
    height: 66,
    borderRadius: 33,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 8,
  },
  centerBtn: {
    width: 50,
    height: 50,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -10,
    marginHorizontal: 8,
  },
});
