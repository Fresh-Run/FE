/**
 * Branded not-found — the belt for the whole dead-href class (incident
 * 7/31: 앱 설정 → deleted-in-5237b7d '/settings' → expo-router's DEFAULT
 * Unmatched → back fell to the (course) group as stack base → the 코스 설정
 * trap with a dead X. This screen guarantees every unmatched route has a
 * branded, escapable landing. Route deletions grep route-strings, not
 * filenames.)
 */
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { radius as R, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';

export default function NotFoundScreen() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  const insets = useSafeAreaInsets();
  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.centered}>
        <Icon name="compass-outline" size={40} color={C.faint} />
        <Text style={st.title}>{T('nf.title')}</Text>
        <Text style={st.body}>{T('nf.body')}</Text>
        <Pressable onPress={() => router.replace('/(tabs)' as never)} style={st.homeBtn}>
          <Text style={st.homeTxt}>{T('nf.home')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root:     { flex: 1, backgroundColor: C.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
  title:    { fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: C.text, marginTop: 6 },
  body:     { fontSize: 13.5, color: C.sub, letterSpacing: -0.2, textAlign: 'center', lineHeight: 19 },
  homeBtn:  { marginTop: 14, height: 46, paddingHorizontal: 26, borderRadius: R.pill, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  homeTxt:  { fontSize: 15, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },
});
