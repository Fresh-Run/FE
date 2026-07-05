// In-memory handoff of a feed course → course preview. Needed because
// GET /routes/{id} is owner-only server-side (a non-owner can't refetch a
// public course by id) and the polyline is too large for router params.
// Same peek/clear pattern as pending-run.

import type { PublicRoute } from '@/lib/routes-api';

let pending: PublicRoute | null = null;

export function setPendingCourse(course: PublicRoute): void {
  pending = course;
}

export function getPendingCourse(): PublicRoute | null {
  return pending;
}

export function clearPendingCourse(): void {
  pending = null;
}
