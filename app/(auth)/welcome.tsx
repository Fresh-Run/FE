import { router } from 'expo-router';
import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';

import { Button, Text } from '@/components/ui';
import { useTokens } from '@/hooks/use-tokens';
import { useT } from '@/lib/i18n';
import { useScheme } from '@/store/use-scheme';
import { useStore } from '@/store/use-store';

const ROUTE_PATH =
  'M18,195 C52,168 76,102 128,85 C164,72 178,112 222,105 C260,99 282,78 372,70';
const START = { cx: 18,  cy: 195 };
const END   = { cx: 372, cy: 70  };

export default function WelcomeScreen() {
  const T = useT();
  const C = useTokens();
  const resolved = useScheme((s) => s.resolved);
  const _devBypassAuth = useStore((s) => s._devBypassAuth);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: C.bg }]} edges={['top', 'bottom']}>

      {/* Brand — 9/2 wordmark PNG (scheme-aware: dark→green, light→black).
          The lockup replaces the dot+text pair — the dot was a logo stand-in.
          Green over white on dark: it matches the accent dot it replaces and
          the route line below (the screen's one brand hue, not a second ink). */}
      <View style={styles.brand}>
        <Image
          source={resolved === 'dark'
            ? require('@/assets/images/logo-green.png')
            : require('@/assets/images/logo-black.png')}
          resizeMode="contain"
          style={styles.brandLogo}
        />
      </View>

      {/* Route SVG — no wrapper, sits directly in the flex column, full width */}
      <Svg
        width="100%"
        height={220}
        viewBox="0 0 390 220"
        preserveAspectRatio="none"
      >
        {/* Glow */}
        <Path
          d={ROUTE_PATH}
          stroke={C.accent}
          strokeWidth={14}
          fill="none"
          opacity={0.10}
          strokeLinecap="round"
        />
        {/* Route line */}
        <Path
          d={ROUTE_PATH}
          stroke={C.accent}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Start dot */}
        <Circle cx={START.cx} cy={START.cy} r={5} fill={C.accent} />
        {/* End dot */}
        <Circle cx={END.cx} cy={END.cy} r={5} fill={C.accent} />
        {/* Distance label */}
        <SvgText
          x={END.cx - 8}
          y={END.cy - 14}
          fontSize={11}
          fontWeight="500"
          fill={C.sub}
          textAnchor="end"
        >
          {`5.2 km · ${T('wel.demoMin')}`}
        </SvgText>
      </Svg>

      {/* Headline + subtitle */}
      <View style={styles.copy}>
        <Text variant="headlineXl" weight="700">
          {T('wel.headline')}
        </Text>
        <Text variant="bodyMd" color="sub" style={styles.subtitle}>
          {T('wel.sub')}
        </Text>
      </View>

      <View style={styles.spacer} />

      {/* CTAs */}
      <View style={styles.ctas}>
        {/* 10/3 ruling: generic 시작하기 → the auth landing (Apple first-class,
            Google slot, email secondary). The email flow itself is untouched. */}
        <Button
          label={T('wel.start')}
          onPress={() => router.push('/(auth)/auth-landing')}
          large
        />
        <Pressable onPress={() => router.push('/(auth)/sign-in')} style={styles.loginLink}>
          <Text variant="bodyMd" color="sub" center>{T('wel.login')}</Text>
        </Pressable>
      </View>

      {__DEV__ && (
        <Pressable
          onPress={_devBypassAuth}
          style={[styles.devBtn, { borderColor: C.border }]}
        >
          <Text variant="labelSm" color="sub">DEV: 로그인 건너뛰기 →</Text>
        </Pressable>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:     { flex: 1 },

  brand:    {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 4,
  },
  // old bodyLg(≈17pt) 700 text의 시각 무게 매치 — aspect 5.05
  brandLogo: { width: 96, height: 19 },

  copy:     { paddingHorizontal: 24, paddingTop: 28, gap: 12 },
  subtitle: { lineHeight: 24 },

  spacer:   { flex: 1 },

  ctas:     { paddingHorizontal: 24, paddingBottom: 8, gap: 12 },
  loginLink:{ paddingVertical: 14, alignItems: 'center' },

  devBtn: {
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderRadius: 8,
    borderStyle: 'dashed',
  },
});
