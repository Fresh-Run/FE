import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTabBarInset } from '@/components/fresh-tab-bar';
import { useStyles } from '@/hooks/use-tokens';
import { useT } from '@/lib/i18n';
import { spacing as S, type Tokens } from '@/lib/theme';

// Redesign/v1 Home PLACEHOLDER (owner-ruled 2026-11-19): the app opens here;
// the real Home design (canvas 홈 파이널 G2/H1/H2) is the LAST redesign item.
// TODO(redesign/v1): replace with the chosen Home design; then revisit the
// run-save / run-result landings that were pointed at Feed meanwhile.
export default function HomeScreen() {
  const T = useT();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset();
  return (
    <View style={[st.root, { paddingTop: insets.top + S.xl, paddingBottom: tabBarInset }]}>
      <Text style={st.screenTitle}>{T('tab.home')}</Text>
      <View style={st.center}>
        <Text style={st.title}>{T('home.comingSoon')}</Text>
        <Text style={st.sub}>{T('home.comingSoonSub')}</Text>
      </View>
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  screenTitle: { fontSize: 26, fontWeight: '700', letterSpacing: -0.8, color: C.text, paddingHorizontal: S.gutter },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: S.gutter, gap: 6 },
  title:       { fontSize: 17, fontWeight: '700', color: C.text },
  sub:         { fontSize: 13, color: C.sub, textAlign: 'center' },
});
