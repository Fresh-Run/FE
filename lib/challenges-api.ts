// 크루 챌린지 — GET current + POST create per docs/API_GUIDE.md §커뮤니티
// (M2 slice). Create = 크루장·운영진 (owner||admin, BE f68a48f); 409 when a
// non-ended challenge exists (the UI renders this as a friendly state, not
// an error). starts_at/ends_at MUST carry timezone offsets (naive → 422 —
// same contract as announcements). Aggregation is automatic server-side:
// verified GPS runs only, visibility-independent, membership = participation
// (guide 206 — the "GPS 기록만 집계" caption is guide-recommended UI).

import { apiFetch } from '@/lib/api';

export type Challenge = {
  id: string;
  crew_id: string;
  title: string;
  goal_km: number;
  starts_at: string;
  ends_at: string;
  created_by: string;
  created_at: string;
  achieved_km: number;
  progress_pct: number;
  is_completed: boolean;
  is_active: boolean;
};

/** null = no active/upcoming challenge (probed 200-null contract). */
export function getCurrentChallenge(crewId: string): Promise<Challenge | null> {
  return apiFetch<Challenge | null>(`/api/crews/${crewId}/challenges/current`);
}

export function createChallenge(crewId: string, input: {
  title: string;
  goal_km: number;
  starts_at: string; // ISO 8601 WITH offset
  ends_at: string;   // ISO 8601 WITH offset
}): Promise<Challenge> {
  return apiFetch<Challenge>(`/api/crews/${crewId}/challenges`, { method: 'POST', body: input });
}

/** Calendar date N days from now, in KST (the serializer's input format). */
export function kstDateStr(offsetDays: number): string {
  const d = new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** KST-offset ISO for a date-only input — challenges span whole days:
    start = 00:00 KST, end = 23:59 KST. Null on invalid format. */
export function dateToKstIsoDay(date: string, boundary: 'start' | 'end'): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const mon = Number(mo), day = Number(d);
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
  return `${y}-${mo}-${d}T${boundary === 'start' ? '00:00:00' : '23:59:59'}+09:00`;
}
