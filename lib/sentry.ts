/**
 * Sentry 크래시 리포팅 (빌드 13 — 9/29 매니페스트).
 *
 * ~~오너 DSN 대기 (PENDING_OWNER)~~ **DSN 도착 (오너, 프로젝트 생성 10/9) —
 * 크래시 리포팅 LIVE 이 슬라이스부터** (OTA; sentryConfigured 게이트 개방).
 * __DEV__에서는 여전히 no-op.
 *
 * 빌드-타임 소스맵 업로드: ~~auth 토큰 부재 = 경고만~~ [9/30 정정 — 실빌드
 * 검거: org/slug 부재는 하드-페일]. eas.json 양 프로필 env의
 * SENTRY_DISABLE_AUTO_UPLOAD=true가 명시 비활성 (staging은 production
 * extends로 상속) — **10/9 현재 유지**: SENTRY_AUTH_TOKEN 미존재. 그 결과
 * 라이브 스택은 소스맵 전까지 minified로 수신된다 (크래시 발생 사실·빈도·
 * 디바이스 컨텍스트는 유효, 심볼은 아님). SENTRY_AUTH_TOKEN 발급 +
 * 업로드 재개(env 제거) = **빌드 14 컷 동승** (레저 컷 오더 참조).
 */
import * as Sentry from '@sentry/react-native';

export const SENTRY_DSN = 'https://02b403845331348d98d7ffc1b3549128@o4512221831561216.ingest.us.sentry.io/4512229278154752';

export const sentryConfigured = !SENTRY_DSN.startsWith('PENDING');

let inited = false;
/** 앱 엔트리 (모듈 스코프)에서 1회 — PENDING/개발 빌드는 no-op. */
export function initSentry() {
  if (inited || __DEV__ || !sentryConfigured) return;
  inited = true;
  Sentry.init({
    dsn: SENTRY_DSN,
    // 크래시/에러만 — 퍼포먼스 트레이싱은 별도 룰링 전 0 (조용한 시작)
    tracesSampleRate: 0,
  });
}
