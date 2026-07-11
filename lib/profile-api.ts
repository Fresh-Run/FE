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
