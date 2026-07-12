// Profile writes — PATCH /api/me/profile (ProfileUpdate: nickname 2~20,
// 409 on duplicate). Reads stay on the existing direct-Supabase use-profile
// hook until a feature touches them.

import { apiFetch } from '@/lib/api';

export type ProfileResponse = {
  user_id: string;
  nickname: string;
  avatar_url: string | null;
  bio: string | null;
  tier: string;
  created_at: string;
  updated_at: string;
};

export function updateNickname(nickname: string): Promise<ProfileResponse> {
  return apiFetch<ProfileResponse>('/api/me/profile', {
    method: 'PATCH',
    body: { nickname },
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

/** Onboarding/profile writes — ⚠️ `nickname` is REQUIRED on every
    ProfileUpdate (probed 422 without it), so all partial updates must carry
    it. A profile-less account's first PATCH CREATES the row (probed 200 —
    the onboarding gate's contract). */
export function updateProfile(input: {
  nickname: string;
  weight_kg?: number | null;
  height_cm?: number | null;
  avatar_url?: string | null;
}): Promise<ProfileResponse> {
  return apiFetch<ProfileResponse>('/api/me/profile', { method: 'PATCH', body: input });
}
