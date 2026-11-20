import { Tabs } from 'expo-router';
import React from 'react';

import { useT } from '@/lib/i18n';
import { FreshTabBar } from '@/components/fresh-tab-bar';

// Redesign N1 (owner-ruled 2026-11-19): 홈 · 피드 · 그룹 · MY in the pill, the
// run button beside it (it PUSHES (course)/run — not a tab since the
// full-screen amendment 2026-11-19). `index` IS Home, so every `/(tabs)` redirect (auth
// guard, not-found) lands on Home. `records` is RETIRED (2b): post-save
// redirects land on MY with ?tab=records.
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
      {/* Hidden — Expo scaffold file, not part of our tab bar */}
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
