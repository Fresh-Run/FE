/**
 * Sentry 크래시 리포팅 (빌드 13 — 9/29 매니페스트).
 *
 * ★ 오너 DSN 대기 (PENDING_OWNER — google-signin의 PENDING_JIYEON 이디엄):
 * 실 DSN 도착 시 이 파일 한 곳 교체. PENDING 동안 initSentry()는 no-op —
 * 죽은 계측 없음 (honest-interim 클래스). __DEV__에서도 항상 no-op.
 *
 * 빌드-타임 소스맵 업로드: ~~auth 토큰 부재 = 경고만~~ [9/30 정정 — 실빌드
 * 검거: org/slug 부재는 하드-페일]. eas.json 양 프로필 env의
 * SENTRY_DISABLE_AUTO_UPLOAD=true가 명시 비활성 (staging은 production
 * extends로 상속). 실 DSN + SENTRY_AUTH_TOKEN 드롭 슬라이스에서 그 env를
 * 제거해 업로드를 켠다 — Sentry 라이브부터는 소스맵이 중요하다.
 */
import * as Sentry from '@sentry/react-native';

export const SENTRY_DSN = 'PENDING_OWNER';

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
