// In-memory handoff of a feed/saved course → course-post detail (R1).
// Same peek/clear pattern and rationale as pending-course: GET /routes/{id}
// is owner-only server-side and the polyline is too large for router params.
// Separate from pending-course so opening a post never clobbers an
// in-flight preview handoff.

import type { PublicRoute } from '@/lib/routes-api';

let pending: PublicRoute | null = null;

export function setPendingPost(course: PublicRoute): void {
  pending = course;
}

export function getPendingPost(): PublicRoute | null {
  return pending;
}

export function clearPendingPost(): void {
  pending = null;
}
