import { Tabs } from 'expo-router';
import React from 'react';

import { useT } from '@/lib/i18n';
import { FreshTabBar } from '@/components/fresh-tab-bar';

export default function TabLayout() {
  const T = useT();
  return (
    <Tabs
      tabBar={(props) => <FreshTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index"     options={{ title: T('tab.home') }} />
      <Tabs.Screen name="community" options={{ title: T('tab.community') }} />
      <Tabs.Screen name="create"    options={{ title: T('tab.create') }} />
      <Tabs.Screen name="records"   options={{ title: T('tab.records') }} />
      <Tabs.Screen name="profile"   options={{ title: T('tab.profile') }} />
      {/* Hidden — Expo scaffold file, not part of our tab bar */}
      <Tabs.Screen name="explore"   options={{ href: null }} />
    </Tabs>
  );
}
