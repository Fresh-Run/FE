/**
 * Google Sign In 상수 + 설정 (build 13 native module — the auth hold).
 *
 * ★ 지연 클라이언트 ID 대기 (recon 9/5 hand-off list): 실 ID 도착 시
 * 바뀌는 곳은 이 파일 + app.json의 iosUrlScheme(역방향 iOS ID) 딱 두 곳.
 *  - GOOGLE_WEB_CLIENT_ID  = GCP "Web application" 클라이언트 ID
 *    (id_token의 audience — Supabase Google provider의 Client ID와 동일값)
 *  - GOOGLE_IOS_CLIENT_ID  = GCP "iOS" 클라이언트 ID (bundle com.freshrun.app)
 *
 * PENDING 마커가 남아 있는 동안 googleConfigured=false → sign-in 화면이
 * 버튼 자체를 숨긴다 (죽은 버튼 판매 금지 — honest-no-export 클래스).
 */
import { GoogleSignin } from '@react-native-google-signin/google-signin';

export const GOOGLE_WEB_CLIENT_ID = 'PENDING_JIYEON';
export const GOOGLE_IOS_CLIENT_ID = 'PENDING_JIYEON';

/** 빌드 13은 Google URL 스킴 자체가 바이너리에 없다 (9/30 룰링): 플레이스홀더
    스킴이 Apple 검증 90158 (RFC1738 — 언더스코어)로 리젝 → app.json에서
    iosUrlScheme 전면 제거, 실 스킴(지연 iOS 클라이언트 ID 역방향)은 빌드 14
    네이티브 컷에 동승. 이 상수가 false인 한 클라이언트 ID를 OTA로 플립해도
    리다이렉트가 완결될 수 없으므로 버튼은 절대 노출 금지 — googleConfigured가
    이중 게이트한다. 빌드 14 컷 커밋에서 true로 플립 (스킴과 같은 커밋). */
export const BUILD_HAS_GOOGLE_SCHEME = false;

export const googleConfigured =
  BUILD_HAS_GOOGLE_SCHEME
  && !GOOGLE_WEB_CLIENT_ID.startsWith('PENDING') && !GOOGLE_IOS_CLIENT_ID.startsWith('PENDING');

let configured = false;
/** 1회 설정 — sign-in 마운트에서 호출 (placeholder 상태면 no-op). */
export function configureGoogleSignin() {
  if (configured || !googleConfigured) return;
  configured = true;
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
  });
}
