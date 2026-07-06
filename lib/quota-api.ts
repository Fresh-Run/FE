// Tier + AI-generation quota — GET /api/me/quota per docs/API_GUIDE.md.
// tier is read-only client-side (PATCH /me/profile ignores it; IAP-only).

import { apiFetch } from '@/lib/api';

export type AiGenerationQuota = {
  used: number;
  limit: number | null;     // null for premium
  remaining: number | null; // null for premium
  reset_at: string | null;  // KST ISO; null for premium
  unlimited: boolean;
};

export type QuotaResponse = {
  tier: string; // 'free' | 'premium'
  ai_generation: AiGenerationQuota;
};

export function getQuota(): Promise<QuotaResponse> {
  return apiFetch<QuotaResponse>('/api/me/quota');
}
