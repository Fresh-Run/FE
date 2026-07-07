// 알림 — staging-probed 2026-07-07: GET list (limit only, offset ignored;
// limit=100 returns everything current accounts have), unread-count,
// PATCH {id}/read + read-all (both 204). Rows carry NO message/target-name —
// copy is composed client-side from type + actor_nickname.
import { apiFetch } from '@/lib/api';

export type NotificationType =
  | 'route_liked'
  | 'route_commented'
  | 'crew_joined'
  | 'challenge_completed'
  | 'user_followed'
  | 'crew_announcement'
  | 'join_requested'
  | 'join_approved'
  | 'run_kudoed';

export type AppNotification = {
  id: string;
  // string, not the union: unknown future types must render, not crash
  type: string;
  actor_id: string | null;
  actor_nickname: string | null;
  target_type: string | null;
  target_id: string | null;
  // Incoming (지연, announced 2026-07-07): crew_announcement rows will carry
  // the crew id. OLD rows lack it — every consumer must treat it as optional
  // and degrade to non-tappable when absent.
  crew_id?: string | null;
  is_read: boolean;
  created_at: string;
};

export function getNotifications(limit = 100): Promise<AppNotification[]> {
  return apiFetch<AppNotification[]>(`/api/notifications?limit=${limit}`);
}

export function getUnreadCount(): Promise<{ count: number }> {
  return apiFetch<{ count: number }>('/api/notifications/unread-count');
}

export function markNotificationRead(id: string): Promise<void> {
  return apiFetch<void>(`/api/notifications/${id}/read`, { method: 'PATCH' });
}

export function markAllNotificationsRead(): Promise<void> {
  return apiFetch<void>('/api/notifications/read-all', { method: 'PATCH' });
}
