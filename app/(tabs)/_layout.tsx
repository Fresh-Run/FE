import { Tabs } from 'expo-router';
import React from 'react';

import { useT } from '@/lib/i18n';
import { FreshTabBar } from '@/components/fresh-tab-bar';

// Redesign N1 (owner-ruled 2026-11-19): 홈 · 피드 · 그룹 · MY in the pill, the
// run button beside it. `index` IS Home, so every `/(tabs)` redirect (auth
// guard, not-found) lands on Home. `records` left the bar: it stays a tab
// route (hidden via href: null) so post-save redirects keep working and the
// bar stays visible on it; item 2 folds it into MY's Records tab.
export default function TabLayout() {
  const T = useT();
  return (
    <Tabs
      tabBar={(props) => <FreshTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index"   options={{ title: T('tab.home') }} />
      <Tabs.Screen name="feed"    options={{ title: T('tab.feed') }} />
      <Tabs.Screen name="groups"  options={{ title: T('tab.groups') }} />
      <Tabs.Screen name="my"      options={{ title: T('tab.my') }} />
      <Tabs.Screen name="create"  options={{ title: T('tab.create') }} />
      {/* Hidden tab route — reachable via MY's temporary 기록 row + post-save redirects */}
      <Tabs.Screen name="records" options={{ title: T('tab.records'), href: null }} />
      {/* Hidden — Expo scaffold file, not part of our tab bar */}
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
