// 크루 채팅 v1 (BE 5827c94, guide §214) — probed live 2026-07-26, full cycle:
// 멤버 전용(비크루원 404 은닉, unread 포함) · 폴링 전송모델(20~30s 권장,
// Realtime 아님) · 목록 최신순 + 역순 커서(before=<가장 오래된 created_at>,
// /runs와 동일 인코딩 규칙) · 반응 4종 고정(👍🔥👏💪, 그 외 422) 멱등 토글
// (unreact는 DELETE + body) · unread는 본인 메시지 제외 + muted 동봉 ·
// 삭제 = 본인 or 운영진(그 외 403), soft(content null·행 잔존) ·
// sender_nickname/avatar_url null 가능(탈퇴·프로필 없음) → '러너' 폴백.
// v1.5 (BE 2:03 AM deploy, probed): type 3종 렌더 분기 — text / system
// (content = RENDER KEY "announcement", 문구는 프론트 조립; payload
// {announcement_id, title} 공지 딥링크; 반응 가능·삭제 불가 403-everyone) /
// run_share (content = caption nullable; payload = 전송 시점 스냅샷 박제 —
// 원본 삭제·비공개 전환에도 카드 잔존, 카톡 선례; photo_thumb는 경로라
// 직접 렌더 금지; 카드 탭 → GET /runs 현재 권한 재평가, 404 가능).
// v3.5 (BE 9c29e7c, probed 2026-07-13): blocked:true = 차단 관계 발신자 —
// 서버가 content·payload·sender_nickname·sender_avatar_url를 null로 보냄
// (서버측 은닉, 클라 필터 아님; system·run_share도 동일하게 가려짐 — probed).
// sender_id는 잔존. 프론트 = "가려진 메시지" 플레이스홀더, 타입 분기보다
// 먼저 체크. reactions 집계는 유지(왜곡 방지), 새 반응 404(→ quiet no-op),
// 본인 반응 제거는 204(probed — 철회는 허용).

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
  /** v3.5: true = 차단 관계 발신자, 내용·신원 서버측 null (위 계약 주석) */
  blocked: boolean;
};

export type RunSharePayload = {
  run_id: string;
  distance_km: number;
  duration_sec: number;
  avg_pace_sec_per_km: number | null;
  title: string | null;
  area: string | null;
  ran_at: string;
  polyline_thumb: { lat: number; lng: number }[] | null;
  photo_thumb: string | null; // PATH, not a signed URL — never render raw
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

/** 기록 카드 공유 (v1.5, probed): 본인 run만(타인/없음 404 은닉),
    public·followers만(private 422). 201 = the run_share message. */
export function shareRun(crewId: string, runId: string, caption?: string): Promise<ChatMessage> {
  return apiFetch<ChatMessage>(`/api/crews/${crewId}/chat/share-run`, {
    method: 'POST', body: { run_id: runId, ...(caption ? { caption } : {}) },
  });
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
