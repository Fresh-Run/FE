/**
 * /battle-home — 얇은 라우트 래퍼 (9/1 오너 재룰링). 본체는
 * components/battle-home-body.tsx (커뮤니티 3번째 톱탭이 embedded 렌더).
 * 라우트는 딥링크 표면으로 존치 — 푸시 알림 (빌드 13)의 착지점.
 */
import React from 'react';

import { BattleHomeBody } from '@/components/battle-home-body';

export default function BattleHomeScreen() {
  return <BattleHomeBody mode="route" />;
}
