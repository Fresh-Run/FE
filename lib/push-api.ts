// Expo push-token registration (BUILD #1 ②). BE POST/DELETE /me/push-token,
// both 204 (live-probed 2026-07-15 on staging: valid Expo token → 204, bad
// format → 422, DELETE-with-body → 204). The server hard-validates the
// `ExponentPushToken[...]` shape, so only a real getExpoPushTokenAsync value
// is accepted. DELETE sends the token in the BODY (never a querystring — the
// token stays out of access logs).
import { apiRequest } from '@/lib/api';

export type PushPlatform = 'ios' | 'android';

/** Upsert this device's Expo token. Idempotent server-side (token PK upsert);
    safe to call on every login. */
export async function registerPushToken(token: string, platform: PushPlatform = 'ios'): Promise<void> {
  await apiRequest('/api/me/push-token', { method: 'POST', body: { token, platform } });
}

/** Remove this device's token on logout so a shared device stops receiving the
    previous account's pushes. Scoped server-side to (token, user) — a no-op if
    already gone. */
export async function unregisterPushToken(token: string): Promise<void> {
  await apiRequest('/api/me/push-token', { method: 'DELETE', body: { token } });
}
