import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { router, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { useTokens } from '@/hooks/use-tokens';
import { useScheme } from '@/store/use-scheme';
import { usePushSync } from '@/lib/push';
import { endLiveActivity } from '@/modules/live-activity';
// ① background GPS: the location task must be DEFINED at bundle evaluation on
// EVERY launch — including an OS relaunch into the task — or iOS invokes an
// undefined task and crashes. This side-effect import puts run-session's
// module-scope TaskManager.defineTask on the entry import graph, which
// executes when the bundle loads, before any React render.
import { runSession } from '@/store/run-session';
import { useStore } from '@/store/use-store';

export const unstable_settings = {
  anchor: '(tabs)',
};

function AuthGuard() {
  const session        = useStore((s) => s.session);
  const sessionLoading = useStore((s) => s.sessionLoading);
  const profileMissing = useStore((s) => s.profileMissing);
  const hydrate        = useStore((s) => s.hydrate);
  const segments       = useSegments();

  // Run once on mount — checks AsyncStorage + Supabase for an existing session.
  useEffect(() => { hydrate(); }, []);

  useEffect(() => {
    if (sessionLoading) return;

    const inAuthGroup    = segments[0] === '(auth)';
    const inOnboarding   = inAuthGroup && segments[1] === 'onboarding-name';

    if (!session && !inAuthGroup) {
      // Logged out but trying to access a protected route → send to welcome.
      router.replace('/(auth)/welcome');
    } else if (session && profileMissing === true && !inOnboarding) {
      // 온보딩 게이트 (plan A, 2026-07-13): the server has no profile row —
      // fresh signups AND legacy profile-less accounts (every write 404s
      // until the row exists). Hard gate: nickname required to proceed.
      // profileMissing null (offline/unknown) fails OPEN — no lockout.
      router.replace('/(auth)/onboarding-name');
    } else if (session && inAuthGroup && !inOnboarding) {
      // Already logged in but landed on an auth screen → send to tabs.
      router.replace('/(tabs)');
    } else if (session && inOnboarding && profileMissing === false) {
      // Gate satisfied (profile created or already existed) → release.
      // Funnel v1 (owner ruling 2026-07-21): release lands on the 러닝 hub —
      // MUST match onboarding-name's own replace (the two race; same target
      // makes the race harmless). Sign-in re-entry (branch above) stays home.
      router.replace('/(tabs)/create');
    }
  }, [session, sessionLoading, profileMissing, segments]);

  return null;
}

/** Remote push (BUILD #1 ②): registers the Expo token on login / unregisters
    on logout and routes notification taps. Null-render, mounted at the root
    like AuthGuard. Inert until a token registers — safe on simulator/denial. */
function PushSync() {
  usePushSync();
  // ④c stale-LA sweeper: a force-quit mid-run leaves a zombie lock-screen
  // card (iOS doesn't end activities on kill; the kill-recovery flow owns
  // the RUN, nothing owned the CARD). At boot with no live session, end
  // whatever lingers — idempotent no-op in the common case.
  useEffect(() => {
    if (runSession.getState() === 'idle') endLiveActivity();
  }, []);
  return null;
}

function LoadingScreen() {
  const C = useTokens();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
      <ActivityIndicator size="large" color={C.accent} />
    </View>
  );
}

function RootLayoutInner() {
  const sessionLoading = useStore((s) => s.sessionLoading);
  // Phase 5 (epic complete): resolution is LIVE — mode 시스템/라이트/다크
  // (default 시스템 follows the OS via the scheme store's Appearance
  // listener). Navigator chrome + status bar ride `resolved` with the rest
  // of the app. The Phase-0 pin and the dev override are history.
  const resolved = useScheme((s) => s.resolved);

  // Block rendering until we know the session state to prevent flash.
  if (sessionLoading) return <LoadingScreen />;

  return (
    <NavThemeProvider value={resolved === 'dark' ? DarkTheme : DefaultTheme}>
      {/* Native headers hidden by default — every screen renders its own
          in-content header per the design. Future sub-screens inherit this. */}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(course)"       options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="weather-detail" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
      <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <>
      <AuthGuard />
      <PushSync />
      <RootLayoutInner />
    </>
  );
}
