// 둘러보기 location-filter handoff (region picker → community tab) —
// same peek pattern as pending-course. Default = 현재 위치 (pure lat/lng
// mode, owner call 2026-07-09: distance sort, no admin-name mapping).

export type CrewLocationFilter =
  | { mode: 'current' }
  | { mode: 'region'; sido: string; sigungu?: string };

let filter: CrewLocationFilter = { mode: 'current' };

export function getCrewFilter(): CrewLocationFilter {
  return filter;
}

export function setCrewFilter(next: CrewLocationFilter): void {
  filter = next;
}
