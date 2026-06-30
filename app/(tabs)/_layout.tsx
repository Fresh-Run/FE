import { Tabs } from 'expo-router';
import React from 'react';

import { FreshTabBar } from '@/components/fresh-tab-bar';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FreshTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index"     options={{ title: '홈' }} />
      <Tabs.Screen name="community" options={{ title: '커뮤니티' }} />
      <Tabs.Screen name="create"    options={{ title: '코스생성' }} />
      <Tabs.Screen name="records"   options={{ title: '기록' }} />
      <Tabs.Screen name="profile"   options={{ title: '프로필' }} />
      {/* Hidden — Expo scaffold file, not part of our tab bar */}
      <Tabs.Screen name="explore"   options={{ href: null }} />
    </Tabs>
  );
}
