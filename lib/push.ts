// Remote push wiring (BUILD #1 ②). The 12 알림 toggles + the server's
// send_for_notification path already exist; the ONLY missing piece was the
// client registering an Expo token. This module:
//   • presents foreground notifications (banner + list),
//   • registers the Expo token on login / unregisters on logout,
//   • routes a notification TAP through the shared deepLink() contract.
// Delivery still needs 지연's Expo-side APNs + push-security confirms; the app
// side is complete once a token is registered.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { deepLink, type DeepLinkTarget } from '@/lib/notif-routing';
import { registerPushToken, unregisterPushToken, type PushPlatform } from '@/lib/push-api';
import { useStore } from '@/store/use-store';

// Foreground presentation — a push that arrives while the app is open still
// shows (SDK 54: shouldShowBanner/shouldShowList replaced shouldShowAlert).
// No badge: we have no unread-count source of truth to keep it honest.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const thisPlatform: PushPlatform = Platform.OS === 'android' ? 'android' : 'ios';

/** Permission → Expo token, or null. 9/29 타이밍 룰링: 런치/로그인에선
    프롬프트 금지 — prompt=false(디폴트)는 이미 granted일 때만 토큰을 뽑고,
    프롬프트는 maybePromptPush(첫 의미 트리거)만 띄운다. Returns null
    silently on a simulator (no APNs), denial, or any failure — the app
    must never crash or block on push setup. */
export async function registerForPush(prompt = false): Promise<string | null> {
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && prompt) {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return null;
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return data ?? null;
  } catch {
    return null;
  }
}

const PUSH_PROMPT_KEY = '@fr_push_prompted';

/** 9/29 타이밍 룰링: 시스템 알림 프롬프트는 첫 의미 트리거 — **첫 러닝 저장
    성공** — 에서 1회만 (소셜 알림이 유의미해지는 시점; 런치 프롬프트 금지).
    양 저장 도어 (run-save·run-result)가 저장 성공 후 fire-and-forget 호출.
    거절해도 재프롬프트 없음 (1회성 플래그) — 설정 앱이 복귀 경로. */
export async function maybePromptPush(): Promise<void> {
  try {
    if (await AsyncStorage.getItem(PUSH_PROMPT_KEY)) return;
    await AsyncStorage.setItem(PUSH_PROMPT_KEY, '1');
    const token = await registerForPush(true);
    if (token && useStore.getState().session) {
      registerPushToken(token, thisPlatform).catch(() => {});
    }
  } catch { /* 저장 플로우를 절대 막지 않는다 */ }
}

/** Coerce a push's content.data into the deepLink contract and navigate.
    A remote push carries type/target_id/target_type/payload (BE send path) —
    no actor_nickname; deepLink degrades cleanly. Only routes while logged in
    (else AuthGuard owns the destination). */
function routeFromData(data: Record<string, unknown> | undefined | null): void {
  if (!data || typeof data.type !== 'string') return;
  if (!useStore.getState().session) return;
  const target: DeepLinkTarget = {
    type: data.type,
    target_id: (data.target_id as string | null) ?? null,
    payload: (data.payload as DeepLinkTarget['payload']) ?? null,
    actor_nickname: null,
  };
  deepLink(target)?.();
}

/** Mount once at the root. Sets up tap-routing (live taps + cold start) and
    keeps the Expo token in sync with the session (register on login,
    unregister on logout). */
export function usePushSync(): void {
  const session = useStore((s) => s.session);
  const tokenRef = useRef<string | null>(null);

  // Tap routing — live responses + the notification that cold-started the app.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      routeFromData(r.notification.request.content.data as Record<string, unknown>);
    });
    Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) routeFromData(r.notification.request.content.data as Record<string, unknown>);
    });
    return () => sub.remove();
  }, []);

  // Token lifecycle keyed on session.
  useEffect(() => {
    let cancelled = false;
    if (session) {
      registerForPush().then((token) => {
        if (cancelled || !token) return;
        tokenRef.current = token;
        // best-effort — a failed registration must not surface to the user
        registerPushToken(token, thisPlatform).catch(() => {});
      });
    } else if (tokenRef.current) {
      const stale = tokenRef.current;
      tokenRef.current = null;
      unregisterPushToken(stale).catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [session]);
}
