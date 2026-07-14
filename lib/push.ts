// Remote push wiring (BUILD #1 ②). The 12 알림 toggles + the server's
// send_for_notification path already exist; the ONLY missing piece was the
// client registering an Expo token. This module:
//   • presents foreground notifications (banner + list),
//   • registers the Expo token on login / unregisters on logout,
//   • routes a notification TAP through the shared deepLink() contract.
// Delivery still needs 지연's Expo-side APNs + push-security confirms; the app
// side is complete once a token is registered.
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

/** Permission (prompt once if undetermined) → Expo token, or null. Returns
    null silently on a simulator (no APNs), denial, or any failure — the app
    must never crash or block on push setup. */
export async function registerForPush(): Promise<string | null> {
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
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
