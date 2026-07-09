// 장소 검색 — GET /api/places per docs/API_GUIDE.md §홈 (경유지 후보 검색).
// Backend proxies Kakao Local keyword search server-side (her key, her quota);
// results are proximity-biased around the required lat/lng. Reused by the
// start-picker's address search — an off-label reuse of the 경유지 endpoint
// (soft 지연 heads-up logged in TODO.md, non-blocking).
// Bounds (422 outside): keyword 1–50자, radius_m ≤ 20000, limit ≤ 15.

import { apiFetch } from '@/lib/api';

export type Place = {
  name: string;
  coordinate: { lat: number; lng: number };
  category: string | null;
  address: string | null;
};

export function searchPlaces(
  keyword: string,
  lat: number,
  lng: number,
  opts: { radiusM?: number; limit?: number } = {},
): Promise<Place[]> {
  const q = new URLSearchParams();
  q.set('keyword', keyword);
  q.set('lat', String(lat));
  q.set('lng', String(lng));
  q.set('radius_m', String(opts.radiusM ?? 20000));
  q.set('limit', String(opts.limit ?? 10));
  return apiFetch<Place[]>(`/api/places?${q.toString()}`);
}
