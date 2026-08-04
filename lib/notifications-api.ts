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
  | 'run_kudoed'
  | 'crew_invited'   // BE 23d2936 — payload {crew_id, crew_name, invite_code}
  | 'pb_achieved';   // BE 8cee8d8 — self-targeted; payload {record_types[]}, target_id=run_id

export type AppNotification = {
  id: string;
  // string, not the union: unknown future types must render, not crash
  type: string;
  actor_id: string | null;
  actor_nickname: string | null;
  actor_avatar_url: string | null; // BE 5009cbe (avatar wire-up)
  target_type: string | null;
  target_id: string | null;
  // Landed 2026-07-07 (staging-probed): crew_announcement rows carry the crew
  // id NESTED in payload ({crew_id}); old rows have payload: null and their
  // target_id is an ANNOUNCEMENT id (not a crew id — never navigate with it).
  // crew_invited (probed 2026-07-13): {crew_id, crew_name, invite_code}.
  // pb_achieved (probed 2026-07-13): {record_types: string[]}, target_id=run_id.
  payload?: {
    crew_id?: string | null;
    crew_name?: string | null;
    invite_code?: string | null;
    record_types?: string[] | null;
    /** 8/4 FORWARD-WIRED, NOT YET SERVED (probed 2026-08-04 cross-account:
        the owner-case and reply-case run_commented rows are IDENTICAL but for
        actor/id/created_at — payload is {run_id} on both). 지연's additive
        lands in EITHER shape and the copy branches with zero further FE work;
        absent = today's behaviour, unchanged. See notifications.tsx's
        isReplyNotif + the ask in TODO.md. */
    is_reply?: boolean | null;
    parent_comment_id?: string | null;
  } | null;
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
