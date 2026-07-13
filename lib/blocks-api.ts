// 차단 (block) — 지연's block stack (probed staging 2026-07-14). Bidirectional:
// block clears BOTH follow directions + BOTH pending requests server-side and
// 404-hides the two users from each other everywhere. unblock is NON-restoring
// (the cleared follow stays gone — re-follow required, policy). All idempotent;
// self-block → 400. GET /me/blocks returns the FollowUser shape (is_following
// is always false — the relationship was cleared), newest first.
import { apiFetch } from '@/lib/api';
import type { FollowUser } from '@/hooks/use-follow-list';

export type BlockedUser = FollowUser;

/** Block a user — 204 (idempotent). self → 400. Clears follows/requests both ways. */
export function blockUser(userId: string): Promise<void> {
  return apiFetch<void>(`/api/users/${userId}/block`, { method: 'POST' });
}

/** Unblock — 204 (idempotent). Does NOT restore the prior follow (policy). */
export function unblockUser(userId: string): Promise<void> {
  return apiFetch<void>(`/api/users/${userId}/block`, { method: 'DELETE' });
}

/** 내가 차단한 사용자 목록 (프로필 설정 → 차단 관리), 최신순. */
export function listBlocks(): Promise<BlockedUser[]> {
  return apiFetch<BlockedUser[]>('/api/me/blocks');
}
