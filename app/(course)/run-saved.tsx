/**
 * 기록에 저장됐어요 — save confirmation (bundle: course-flow.jsx screen 7).
 * Reached only from run-result after feedback. Back is allowed here (nothing
 * left to lose); the pending run is cleared on unmount.
 */
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiniMap } from '@/components/mini-map';
import { Icon } from '@/components/ui';
import { fmtWhen } from '@/lib/run-format';
import { accentShadow, colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';
import { clearPendingRun, getPendingRun } from '@/store/pending-run';

export default function RunSavedScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    runId?: string; liked?: string; ranAt?: string; dist?: string; durSec?: string;
  }>();
  const [pending] = useState(() => getPendingRun());
  useEffect(() => () => clearPendingRun(), []);

  const liked = params.liked === '1';
  const dist = Number(params.dist) || pending?.distanceKm || 0;
  const durMin = Math.max(1, Math.round((Number(params.durSec) || pending?.elapsedSec || 0) / 60));
  const when = params.ranAt ? fmtWhen(params.ranAt) : fmtWhen(new Date().toISOString());

  // Pop-in checkmark
  const scale = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.timing(scale, { toValue: 1, duration: 500, easing: Easing.out(Easing.back(2.2)), useNativeDriver: true }).start();
  }, [scale]);

  const viewLog = () => {
    if (!params.runId) { router.replace('/(tabs)' as any); return; }
    router.replace({ pathname: '/(records)/activity' as any, params: { runId: params.runId } });
  };

  return (
    <View style={st.root}>
      <View style={st.center}>
        <Animated.View style={[st.checkCircle, accentShadow(C.accent), { transform: [{ scale }] }]}>
          <Icon name="checkmark" size={42} color={C.accentText} />
        </Animated.View>
        <Text style={st.title}>기록에 저장됐어요</Text>
        <Text style={st.sub}>이 러닝이 내 기록에 추가됐어요.{'\n'}다음 추천이 더 정확해져요.</Text>

        {/* Summary card */}
        <View style={[st.card, shadows.sm]}>
          <View style={st.miniMapWrap}>
            <MiniMap seed="run-saved" height={72} borderRadius={14} polyline={pending?.path} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.cardTitle} numberOfLines={1}>자유 러닝 {dist.toFixed(2)}km</Text>
            <View style={st.cardMeta}>
              <Icon name="time-outline" size={12} color={C.faint} />
              <Text style={st.cardMetaTxt} numberOfLines={1}>{when} · {durMin}분</Text>
            </View>
            <View style={[st.fbBadge, { backgroundColor: liked ? C.accentDim : C.danger + '14' }]}>
              <View style={{ transform: [{ rotate: liked ? '0deg' : '180deg' }] }}>
                <Icon name={liked ? 'heart' : 'heart-outline'} size={12} color={liked ? C.accentGrn : C.danger} />
              </View>
              <Text style={[st.fbBadgeTxt, { color: liked ? C.accentGrn : C.danger }]}>
                {liked ? '좋았어요' : '별로였어요'} 피드백 반영됨
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={[st.footer, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
        <Pressable onPress={viewLog} style={({ pressed }) => [st.logBtn, { opacity: pressed ? 0.85 : 1 }]}>
          <Text style={st.logTxt}>기록 보기</Text>
        </Pressable>
        <Pressable
          onPress={() => router.replace('/(tabs)' as any)}
          style={({ pressed }) => [st.homeBtn, accentShadow(C.accent), { opacity: pressed ? 0.9 : 1 }]}
        >
          <Text style={st.homeTxt}>홈으로</Text>
        </Pressable>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },

  checkCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  title:       { fontSize: 26, fontWeight: '700', letterSpacing: -0.7, color: C.text, marginTop: 26 },
  sub:         { fontSize: 14.5, lineHeight: 22, color: C.sub, letterSpacing: -0.3, marginTop: 10, textAlign: 'center', maxWidth: 280 },

  card:        { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 30, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, padding: 16 },
  miniMapWrap: { width: 72, height: 72, borderRadius: 14, overflow: 'hidden', flexShrink: 0 },
  cardTitle:   { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.4 },
  cardMeta:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  cardMetaTxt: { fontSize: 12.5, color: C.sub, letterSpacing: -0.2 },
  fbBadge:     { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 9, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4 },
  fbBadgeTxt:  { fontSize: 11.5, fontWeight: '700', letterSpacing: -0.2 },

  footer:  { flexDirection: 'row', gap: 10, paddingTop: 12, paddingHorizontal: S.gutter },
  logBtn:  { flex: 1, height: 54, borderRadius: 15, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  logTxt:  { fontSize: 15.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  homeBtn: { flex: 1, height: 54, borderRadius: 15, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  homeTxt: { fontSize: 15.5, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },
});
