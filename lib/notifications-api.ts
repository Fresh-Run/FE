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
  // Landed 2026-07-07 (staging-probed): crew_announcement rows carry the crew
  // id NESTED in payload ({crew_id}); old rows have payload: null and their
  // target_id is an ANNOUNCEMENT id (not a crew id — never navigate with it).
  payload?: { crew_id?: string | null } | null;
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

export function deleteNotification(id: string): Promise<void> {
  return apiFetch<void>(`/api/notifications/${id}`, { method: 'DELETE' });
}

// NOTE: DELETE /api/notifications (clear-all) also exists on staging —
// deliberately unwired: no 모두 지우기 affordance in any 시안 (TODO design ask).
