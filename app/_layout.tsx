import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { router, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { ThemeProvider, useTheme } from '@/contexts/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useStore } from '@/store/use-store';

export const unstable_settings = {
  anchor: '(tabs)',
};

function AuthGuard() {
  const session        = useStore((s) => s.session);
  const sessionLoading = useStore((s) => s.sessionLoading);
  const hydrate        = useStore((s) => s.hydrate);
  const segments       = useSegments();

  // Run once on mount — checks AsyncStorage + Supabase for an existing session.
  useEffect(() => { hydrate(); }, []);

  useEffect(() => {
    if (sessionLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      // Logged out but trying to access a protected route → send to welcome.
      router.replace('/(auth)/welcome');
    } else if (session && inAuthGroup) {
      // Already logged in but landed on an auth screen → send to tabs.
      router.replace('/(tabs)');
    }
  }, [session, sessionLoading, segments]);

  return null;
}

function LoadingScreen() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

function RootLayoutInner() {
  const sessionLoading = useStore((s) => s.sessionLoading);
  const colorScheme    = useColorScheme();
  const { dark }       = useTheme();

  // Block rendering until we know the session state to prevent flash.
  if (sessionLoading) return <LoadingScreen />;

  return (
    <NavThemeProvider value={dark ? DarkTheme : DefaultTheme}>
      {/* Native headers hidden by default — every screen renders its own
          in-content header per the design. Future sub-screens inherit this. */}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(course)"       options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="weather-detail" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="modal"          options={{ presentation: 'modal', title: '', headerShown: true }} />
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthGuard />
      <RootLayoutInner />
    </ThemeProvider>
  );
}
