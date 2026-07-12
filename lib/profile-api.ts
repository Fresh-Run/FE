// Profile writes — PATCH /api/me/profile (ProfileUpdate: nickname 2~20,
// 409 on duplicate). Reads stay on the existing direct-Supabase use-profile
// hook until a feature touches them.

import { apiFetch } from '@/lib/api';

/** 계정 공개 범위 (비공개 프로필 v1, BE acc1ad1 — write path probed live
    2026-07-26; the read-side gate is staging-dark, 지연-reported). */
export type ProfileVisibility = 'public' | 'followers' | 'private';

export type ProfileResponse = {
  user_id: string;
  nickname: string;
  avatar_url: string | null;
  bio: string | null;
  tier: string;
  visibility: ProfileVisibility;
  follow_approval: boolean; // v2 팔로우 승인제 (BE 610c7f3)
  created_at: string;
  updated_at: string;
};

/** Own profile read — 404 on a profile-less account (pre-onboarding). */
export function getMyProfile(timeoutMs?: number): Promise<ProfileResponse> {
  return apiFetch<ProfileResponse>('/api/me/profile', { timeoutMs });
}

export function updateNickname(nickname: string): Promise<ProfileResponse> {
  return apiFetch<ProfileResponse>('/api/me/profile', {
    method: 'PATCH',
    body: { nickname },
  });
}

// ─── 팔로우 승인제 (v2, BE 610c7f3 — probed live 2026-07-13) ─────────────────

export type FollowRequestItem = {
  user_id: string;
  nickname: string | null;   // null (탈퇴/프로필 없음) → '러너' fallback
  avatar_url: string | null;
  followed_at: string;
  is_following: boolean;     // do I follow the requester back
};

/** 내게 온 팔로우 요청 목록 (승인제 ON일 때 쌓임). */
export function listFollowRequests(): Promise<FollowRequestItem[]> {
  return apiFetch<FollowRequestItem[]>('/api/me/follow-requests');
}

/** 승인(follows 생성+알림) / 거절(무알림). 없음/이미 처리 → 404. */
export function respondFollowRequest(requesterId: string, approve: boolean): Promise<void> {
  return apiFetch<void>(`/api/me/follow-requests/${requesterId}`, {
    method: 'PATCH', body: { approve },
  });
}

/** 회원 탈퇴 (guide §241, probed 2026-07-15): 204 = account + all data
    gone (FK cascade; backups ≤90d), old token → 401 immediately.
    409 {error: crew_owner, crew_ids} = owns crews WITH members — transfer
    or delete them first (solo owned crews auto-delete). 403 demo_account
    on the seeded fixtures. Re-signup with the same email = fresh account. */
export function deleteAccount(): Promise<void> {
  return apiFetch<void>('/api/me', { method: 'DELETE' });
}

/** Profile writes — partial semantics since BE 8483115: omit = keep,
    single-field PATCHes valid (probed). `nickname` is required ONLY at
    first-ever creation (onboarding passes it; her preserved rule). */
export function updateProfile(input: {
  nickname?: string;
  weight_kg?: number | null;
  height_cm?: number | null;
  avatar_url?: string | null;
  visibility?: ProfileVisibility;
  follow_approval?: boolean;
}, timeoutMs?: number): Promise<ProfileResponse> {
  return apiFetch<ProfileResponse>('/api/me/profile', { method: 'PATCH', body: input, timeoutMs });
}
