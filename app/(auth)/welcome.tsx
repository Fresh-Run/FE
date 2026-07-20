import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';

import { Button, Text } from '@/components/ui';
import { md3 } from '@/lib/theme';
import { useStore } from '@/store/use-store';

const ROUTE_PATH =
  'M18,195 C52,168 76,102 128,85 C164,72 178,112 222,105 C260,99 282,78 372,70';
const START = { cx: 18,  cy: 195 };
const END   = { cx: 372, cy: 70  };

export default function WelcomeScreen() {
  const { colors } = md3;
  const _devBypassAuth = useStore((s) => s._devBypassAuth);
  const c = colors;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top', 'bottom']}>

      {/* Brand */}
      <View style={styles.brand}>
        <View style={[styles.brandDot, { backgroundColor: c.primary }]} />
        <Text variant="bodyLg" weight="700">FreshRun</Text>
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
          stroke="#42e355"
          strokeWidth={14}
          fill="none"
          opacity={0.10}
          strokeLinecap="round"
        />
        {/* Route line */}
        <Path
          d={ROUTE_PATH}
          stroke="#42e355"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Start dot */}
        <Circle cx={START.cx} cy={START.cy} r={5} fill="#42e355" />
        {/* End dot */}
        <Circle cx={END.cx} cy={END.cy} r={5} fill="#42e355" />
        {/* Distance label */}
        <SvgText
          x={END.cx - 8}
          y={END.cy - 14}
          fontSize={11}
          fontWeight="500"
          fill={c.onSurfaceVariant}
          textAnchor="end"
        >
          5.2 km · 28분
        </SvgText>
      </Svg>

      {/* Headline + subtitle */}
      <View style={styles.copy}>
        <Text variant="headlineXl" weight="700">
          매번 새로운 길로,{'\n'}서울을 달리세요
        </Text>
        <Text variant="bodyMd" color="onSurfaceVariant" style={styles.subtitle}>
          AI가 거리·경유지에 맞춰 한 번도{'\n'}달려본 적 없는 코스를 만들어 드려요.
        </Text>
      </View>

      <View style={styles.spacer} />

      {/* CTAs */}
      <View style={styles.ctas}>
        <Button
          label="이메일로 시작하기"
          onPress={() => router.push('/(auth)/sign-up')}
          large
        />
        <Pressable onPress={() => router.push('/(auth)/sign-in')} style={styles.loginLink}>
          <Text variant="bodyMd" color="onSurfaceVariant" center>로그인</Text>
        </Pressable>
      </View>

      {__DEV__ && (
        <Pressable
          onPress={_devBypassAuth}
          style={[styles.devBtn, { borderColor: c.outlineVariant }]}
        >
          <Text variant="labelSm" color="onSurfaceVariant">DEV: 로그인 건너뛰기 →</Text>
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
  brandDot: { width: 9, height: 9, borderRadius: 5 },

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
