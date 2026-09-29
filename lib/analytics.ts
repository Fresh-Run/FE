/**
 * Mixpanel 애널리틱스 래퍼 (빌드 13 — 9/29 매니페스트, 9/5 승인 이벤트 드래프트).
 *
 * ★ 오너 토큰 대기 (PENDING_OWNER): 실 토큰 도착 시 이 파일 한 곳 교체.
 * PENDING 동안 track()은 완전 no-op — SDK 인스턴스 자체를 만들지 않는다.
 * track은 어떤 경로에서도 앱을 깨지 않는다 (전체 try/catch).
 *
 * 이벤트 유니언 = 승인 드래프트의 전 카테고리 (auth/run/generation/battle/
 * share/social/screens). 이 슬라이스는 무논란 6종만 계측 (app_open ·
 * sign_in · run_start · run_complete · course_generate · share_export) —
 * 나머지는 각 피처 슬라이스에 동승.
 */
import { Mixpanel } from 'mixpanel-react-native';

export const MIXPANEL_TOKEN = 'PENDING_OWNER';

export const analyticsConfigured = !MIXPANEL_TOKEN.startsWith('PENDING');

export type AnalyticsEvent =
  // auth
  | 'app_open' | 'sign_in' | 'sign_up' | 'sign_out'
  // run
  | 'run_start' | 'run_complete'
  // generation
  | 'course_generate'
  // battle (계측은 슬라이스 2 동승)
  | 'battle_create' | 'battle_accept' | 'battle_settle'
  // share
  | 'share_export'
  // social (계측은 각 피처 동승)
  | 'kudos_give' | 'comment_post' | 'follow'
  // screens
  | 'screen_view';

let mp: Mixpanel | null = null;
function instance(): Mixpanel | null {
  if (!analyticsConfigured) return null;
  if (!mp) {
    // trackAutomaticEvents=false — 수동 계측만 (승인 드래프트 스코프)
    mp = new Mixpanel(MIXPANEL_TOKEN, false);
    mp.init().catch(() => { mp = null; });
  }
  return mp;
}

export function track(event: AnalyticsEvent, props?: Record<string, string | number | boolean>) {
  try {
    instance()?.track(event, props);
  } catch { /* 애널리틱스는 절대 앱을 깨지 않는다 */ }
}
