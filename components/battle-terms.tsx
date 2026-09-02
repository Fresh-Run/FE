/**
 * 배틀 규칙 카드 — 스펙 §2.2/Q4의 "룰 UI 명시 필수" 요건의 단일 소스.
 * 생성 확인 스텝 + 초대 화면 양쪽이 이 카드를 렌더한다. 특히 30분 정산
 * 마감 (오너 룰링 8/29)은 여기 명시가 계약 조건 — 문구를 지울 때는 스펙
 * Q4 재론이 선행돼야 한다.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { tfIn, useLang, useT } from '@/lib/i18n';
import { radius as R, spacing as S, type Tokens } from '@/lib/theme';

export function BattleTermsCard({ durationDays }: { durationDays: number }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT();
  const lang = useLang(); // render-path interpolation anchor (house rule)

  const rows: [string, string][] = [
    ['calendar-outline', tfIn(lang, 'bat.termDuration', { n: durationDays })],
    ['flash-outline', T('bat.termAuto')],
    ['moon-outline', T('bat.termStart')],
    ['timer-outline', T('bat.termSettle')],
    ['hourglass-outline', T('bat.termExpire')],
  ];
  return (
    <View style={st.card}>
      <Text style={st.title}>{T('bat.termsTitle')}</Text>
      {rows.map(([icon, text]) => (
        <View key={text} style={st.row}>
          <Icon name={icon} size={14} color={C.sub} />
          <Text style={st.rowTxt}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  card:   { backgroundColor: C.surfaceAlt, borderRadius: R.lg, padding: S.md, gap: 8, alignSelf: 'stretch' },
  title:  { fontSize: 13, fontWeight: '800', color: C.text, marginBottom: 2 },
  row:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowTxt: { flex: 1, fontSize: 12, color: C.sub, lineHeight: 17 },
});
