// 크루 이번 주 함께 달린 거리 — redesign item 8a (2026-11-21). The server has
// NO crew weekly-total endpoint (probed 2026-11-21: /crews/{id}/stats and
// /weekly 404); GET /crews/{id}/ranking is "이번 주 KST 거리순, verified
// runs only" (guide §241) and readable for non-member crews (probed), so
// the total = Σ ranking distance_km. Module cache (5 min) so a card
// re-mount does not re-fetch; null while loading or on failure (card
// shows a dash — never an invented number).
import { dcGet } from '@/lib/data-cache';
import { useEffect, useState } from 'react';

import { getCrewRanking } from '@/lib/crews-api';

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { km: number; at: number }>();

export async function fetchCrewWeeklyKm(crewId: string): Promise<number> {
  const hit = cache.get(crewId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.km;
  const rows = await getCrewRanking(crewId);
  const km = rows.reduce((a, r) => a + (r.distance_km ?? 0), 0);
  cache.set(crewId, { km, at: Date.now() });
  return km;
}

export function useCrewWeeklyKm(crewId: string | null): number | null {
  const [km, setKm] = useState<number | null>(() => {
    const hit = crewId ? cache.get(crewId) : undefined;
    if (hit && Date.now() - hit.at < TTL_MS) return hit.km;
    // item ⑩: last session's ranking page seeds the number until the refetch lands
    const rows = crewId ? dcGet<{ distance_km: number }[]>(`/api/crews/${crewId}/ranking`) : undefined;
    return rows ? rows.reduce((a, r) => a + (r.distance_km ?? 0), 0) : null;
  });
  useEffect(() => {
    if (!crewId) return;
    let alive = true;
    fetchCrewWeeklyKm(crewId).then(v => { if (alive) setKm(v); }).catch(() => {});
    return () => { alive = false; };
  }, [crewId]);
  return km;
}
