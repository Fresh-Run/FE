// 크루 채팅 v1 (BE 5827c94, guide §214) — probed live 2026-07-26, full cycle:
// 멤버 전용(비크루원 404 은닉, unread 포함) · 폴링 전송모델(20~30s 권장,
// Realtime 아님) · 목록 최신순 + 역순 커서(before=<가장 오래된 created_at>,
// /runs와 동일 인코딩 규칙) · 반응 4종 고정(👍🔥👏💪, 그 외 422) 멱등 토글
// (unreact는 DELETE + body) · unread는 본인 메시지 제외 + muted 동봉 ·
// 삭제 = 본인 or 운영진(그 외 403), soft(content null·행 잔존) ·
// sender_nickname/avatar_url null 가능(탈퇴·프로필 없음) → '러너' 폴백.
// type/payload 필드는 v1.5(시스템 메시지·기록 카드)의 자리 — v1은 text만.

import { apiFetch } from '@/lib/api';

export const CHAT_EMOJIS = ['👍', '🔥', '👏', '💪'] as const;
export type ChatEmoji = (typeof CHAT_EMOJIS)[number];

export type ChatMessage = {
  id: string;
  crew_id: string;
  sender_id: string | null;
  sender_nickname: string | null;
  sender_avatar_url: string | null;
  type: string; // 'text' in v1 — unknown types render as plain content or hide
  content: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  reactions: Record<string, number>;
  my_reactions: string[];
  deleted: boolean;
};

export type ChatUnread = { unread_count: number; muted: boolean };

export const CHAT_PAGE = 30;

/** Newest-first; pass the OLDEST loaded created_at to page further back. */
export function listMessages(crewId: string, before?: string): Promise<ChatMessage[]> {
  const cursor = before ? `&before=${encodeURIComponent(before)}` : '';
  return apiFetch<ChatMessage[]>(`/api/crews/${crewId}/chat/messages?limit=${CHAT_PAGE}${cursor}`);
}

export function sendMessage(crewId: string, content: string): Promise<ChatMessage> {
  return apiFetch<ChatMessage>(`/api/crews/${crewId}/chat/messages`, {
    method: 'POST', body: { content },
  });
}

export function reactMessage(crewId: string, messageId: string, emoji: ChatEmoji): Promise<void> {
  return apiFetch<void>(`/api/crews/${crewId}/chat/messages/${messageId}/react`, {
    method: 'POST', body: { emoji },
  });
}

export function unreactMessage(crewId: string, messageId: string, emoji: ChatEmoji): Promise<void> {
  return apiFetch<void>(`/api/crews/${crewId}/chat/messages/${messageId}/react`, {
    method: 'DELETE', body: { emoji },
  });
}

export function deleteMessage(crewId: string, messageId: string): Promise<void> {
  return apiFetch<void>(`/api/crews/${crewId}/chat/messages/${messageId}`, { method: 'DELETE' });
}

export function getUnread(crewId: string): Promise<ChatUnread> {
  return apiFetch<ChatUnread>(`/api/crews/${crewId}/chat/unread`);
}

export function markRead(crewId: string): Promise<void> {
  return apiFetch<void>(`/api/crews/${crewId}/chat/read`, { method: 'POST' });
}

export function setMute(crewId: string, muted: boolean): Promise<void> {
  return apiFetch<void>(`/api/crews/${crewId}/chat/mute`, { method: 'PATCH', body: { muted } });
}
