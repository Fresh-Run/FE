/**
 * 도움말 센터 — canvas FrHelpCenter (settings-screens.jsx): FAQ accordion +
 * 문의. The profile row's 준비 중 dead-end dies (the B1 grammar).
 *
 * HONEST-CONTENT ADAPTATIONS (stated): canvas FAQ #3 (Premium) re-worded to
 * the B1 page's truthful feature list (the canvas's "심층 퍼포먼스 분석"
 * phrasing overclaims — guide §132 fields don't exist). Canvas FAQ #4
 * referenced Apple 건강 sync — that row was REMOVED this same slice (A2
 * ruling), so the FAQ is replaced with a truthful visibility Q&A. 이메일
 * 문의 opens the real mail composer (canvas pushed a stub screen —
 * a mailto: link is the honest version of that row). Address = the real
 * mailbox freshrun0609@gmail.com (owner correction 2026-07-14 — help@freshrun.app
 * doesn't exist; a bouncing address is a dead affordance in a working button).
 */
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useT, type StringKey } from '@/lib/i18n';
import { useStyles, useTokens } from '@/hooks/use-tokens';

const FAQ: [StringKey, StringKey][] = [
  ['hc.q1', 'hc.a1'],
  ['hc.q2', 'hc.a2'],
  ['hc.q3', 'hc.a3'],
  ['hc.q4', 'hc.a4'],
];

export default function HelpCenterScreen() {
  const C = useTokens();
  const T = useT();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(-1);

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>{T('prof.rowHelp')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: S.gutter, paddingBottom: 28 }}>
        <Text style={st.groupTitle}>{T('hc.faq')}</Text>
        <View style={[st.card, shadows.sm]}>
          {FAQ.map(([q, a], i) => (
            <React.Fragment key={q}>
              {i > 0 && <View style={st.divider} />}
              <Pressable onPress={() => setOpen(open === i ? -1 : i)} style={({ pressed }) => [st.qRow, pressed && { opacity: 0.7 }]}>
                <Text style={st.qTxt}>{T(q)}</Text>
                <View style={{ transform: [{ rotate: open === i ? '90deg' : '0deg' }] }}>
                  <Icon name="chevron-forward" size={17} color={C.faint} />
                </View>
              </Pressable>
              {open === i && <Text style={st.aTxt}>{T(a)}</Text>}
            </React.Fragment>
          ))}
        </View>

        <Text style={st.groupTitle}>{T('hc.contact')}</Text>
        <View style={[st.card, shadows.sm]}>
          <Pressable
            onPress={() => Linking.openURL('mailto:freshrun0609@gmail.com').catch(() => {})}
            style={({ pressed }) => [st.qRow, pressed && { opacity: 0.7 }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <Icon name="mail-outline" size={18} color={C.sub} />
              <View>
                <Text style={st.qTxt}>{T('hc.emailUs')}</Text>
                <Text style={st.mailSub}>freshrun0609@gmail.com</Text>
              </View>
            </View>
            <Icon name="chevron-forward" size={16} color={C.faint} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, paddingVertical: 10 },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16.5, fontWeight: '700', letterSpacing: -0.4, color: C.text },

  groupTitle: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, color: C.faint, textTransform: 'uppercase', paddingTop: 22, paddingBottom: 8, paddingLeft: 4 },
  card:    { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, paddingHorizontal: 16 },
  divider: { height: 1, backgroundColor: C.border },

  qRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15 },
  qTxt: { flex: 1, fontSize: 14.5, fontWeight: '600', color: C.text, letterSpacing: -0.3 },
  aTxt: { fontSize: 13.5, lineHeight: 22, color: C.sub, letterSpacing: -0.2, paddingBottom: 14 },
  mailSub: { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },
});
