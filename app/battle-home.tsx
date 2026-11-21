/**
 * /battle-home — deep-link surface kept for old push payloads; the battle
 * home IS the 그룹 tab's 배틀 view since redesign 8b (2026-11-21), so this
 * route redirects there with the view pre-selected.
 */
import { Redirect } from 'expo-router';
import React from 'react';

export default function BattleHomeScreen() {
  return <Redirect href={{ pathname: '/(tabs)/groups', params: { tab: 'battle' } } as never} />;
}
