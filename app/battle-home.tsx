/**
 * /battle-home — 얇은 라우트 래퍼 (9/1 오너 재룰링). 본체는
 * components/battle-home-body.tsx (커뮤니티 3번째 톱탭이 embedded 렌더).
 * 라우트는 딥링크 표면으로 존치 — 푸시 알림 (빌드 13)의 착지점.
 */
import { Redirect } from 'expo-router';
import React from 'react';

import { BattleHomeBody } from '@/components/battle-home-body';
import { BATTLE_ENABLED } from '@/store/battle-mock';

export default function BattleHomeScreen() {
  // 9/16 플래그: 슬라이스 2까지 inert — 딥링크 표면은 존치, 착지만 우회
  if (!BATTLE_ENABLED) return <Redirect href="/(tabs)/community" />;
  return <BattleHomeBody mode="route" />;
}
