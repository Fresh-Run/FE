// 장소 검색 — GET /api/places per docs/API_GUIDE.md §홈 (경유지·출발지).
// Backend proxies Kakao Local keyword search server-side (her key, her quota).
// Two modes (BE 61d7656, guide-tabled): ① `near` coords → proximity-sorted,
// radius_m ≤ 20000 (Kakao's own cap) — the 경유지 path; ② no coords →
// nationwide relevance-sorted — the 출발지 search path. Contract 422s:
// one coord without the other, radius_m without coords, keyword outside 1–50자.

import { apiFetch } from '@/lib/api';

export type Place = {
  name: string;
  coordinate: { lat: number; lng: number };
  category: string | null;
  /** Kakao category_group_code (CE7 카페 등) — served since BE 2026-07-22,
      typed 8/26 for the pitstop_place wire (observational, optional server-side). */
  category_code: string | null;
  address: string | null;
};

export function searchPlaces(
  keyword: string,
  opts: { near?: { lat: number; lng: number }; radiusM?: number; limit?: number } = {},
): Promise<Place[]> {
  const q = new URLSearchParams();
  q.set('keyword', keyword);
  if (opts.near) {
    q.set('lat', String(opts.near.lat));
    q.set('lng', String(opts.near.lng));
    // radius only rides with coords — sending it alone is a contract 422
    q.set('radius_m', String(opts.radiusM ?? 20000));
  }
  q.set('limit', String(opts.limit ?? 10));
  return apiFetch<Place[]>(`/api/places?${q.toString()}`);
}
