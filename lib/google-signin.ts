/**
 * Google Sign In 상수 + 설정 (build 13 native module — the auth hold).
 *
 * ~~지연 클라이언트 ID 대기~~ **도착 (지연 10/4)** — 이 파일의 두 상수는 실값.
 * 남은 한 곳 = app.json iosUrlScheme (역방향 iOS ID, 네이티브) → 빌드 14 컷.
 *  - GOOGLE_WEB_CLIENT_ID  = GCP "Web application" 클라이언트 ID
 *    (id_token의 audience — Supabase Google provider의 Client ID와 동일값)
 *  - GOOGLE_IOS_CLIENT_ID  = GCP "iOS" 클라이언트 ID (bundle com.freshrun.app)
 *
 * 버튼 게이트 = googleConfigured (아래). ID 하프는 이제 true; 스킴 하프
 * BUILD_HAS_GOOGLE_SCHEME=false가 빌드 19/20에서 버튼을 계속 숨긴다 (죽은
 * 버튼 판매 금지 — honest-no-export 클래스). 빌드 14 컷 커밋에서 스킴과
 * 함께 true로 플립.
 */
import { GoogleSignin } from '@react-native-google-signin/google-signin';

// 지연 10/4: Supabase Google provider 설정 완료 (Skip-nonce ON). Web ID =
// id_token audience (Supabase가 이 값으로 토큰 검증), iOS ID = 네이티브 플로우.
// 역방향 iOS ID (app.json iosUrlScheme, 빌드 14 컷 동승):
//   com.googleusercontent.apps.669096073618-reks7q44la8qebd1dq8o4h79v9171dh3
export const GOOGLE_WEB_CLIENT_ID = '669096073618-feip6r2b6arcjoaaobb63j95l60rfm9j.apps.googleusercontent.com';
export const GOOGLE_IOS_CLIENT_ID = '669096073618-reks7q44la8qebd1dq8o4h79v9171dh3.apps.googleusercontent.com';

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
