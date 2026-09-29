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

export const googleConfigured =
  !GOOGLE_WEB_CLIENT_ID.startsWith('PENDING') && !GOOGLE_IOS_CLIENT_ID.startsWith('PENDING');

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
