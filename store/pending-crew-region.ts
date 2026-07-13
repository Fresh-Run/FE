/**
 * In-memory handoff for the region-picker → crew form (create/edit). The
 * picker (with target=form) writes the picked 시/도·구/군 here; the form reads
 * it on focus and clears. Same one-shot pattern as active-course. Distinct
 * from crew-filter (the 둘러보기 filter the picker's default path writes).
 */
export type PendingCrewRegion = { sido: string; sigungu: string | null };

let pending: PendingCrewRegion | null = null;

export function setPendingCrewRegion(r: PendingCrewRegion): void {
  pending = r;
}

/** Read-and-clear: the form consumes it once on focus. */
export function takePendingCrewRegion(): PendingCrewRegion | null {
  const r = pending;
  pending = null;
  return r;
}
