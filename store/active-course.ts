// In-memory handoff of the course being run: preview's "네, 뛸게요" sets it
// (from the POST /routes/{id}/copy result), the tracking screen peeks it and
// clears on unmount. Same pattern as pending-run / pending-course.

import type { Coordinate } from '@/types';

export type ActiveCourse = {
  id: string | null; // copy's route id (runs.route_id link); null = AI-generated, unsaved (RouteResponse serves no id — ledgered 지연 ask)
  title: string;
  distanceKm: number;
  polyline: Coordinate[] | null;
};

let active: ActiveCourse | null = null;

export function setActiveCourse(course: ActiveCourse): void {
  active = course;
}

export function getActiveCourse(): ActiveCourse | null {
  return active;
}

export function clearActiveCourse(): void {
  active = null;
}
