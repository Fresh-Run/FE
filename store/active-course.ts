// In-memory handoff of the course being run: preview's "네, 뛸게요" sets it
// (from the POST /routes/{id}/copy result), the tracking screen peeks it and
// clears on unmount. Same pattern as pending-run / pending-course.

import type { Coordinate } from '@/types';

/** L1 크루 러닝 세션 태그 — set by crew-detail's "크루 러닝 시작", rides the
    ActiveCourse → PendingRun → save chain → POST /runs {crew_id, announcement_id}.
    announcementId links a 집결 공지 (precise a:{id} grouping); null = plain crew
    run (c:{crew}:{date} grouping). */
export type CrewSessionTag = {
  crewId: string;
  crewName: string;
  announcementId: string | null;
  /** the linked 집결 공지's title — display only, for the save tag line */
  announcementTitle?: string | null;
};

export type ActiveCourse = {
  id: string | null; // copy's route id (runs.route_id link); null = AI-generated, unsaved (RouteResponse serves no id — ledgered 지연 ask)
  title: string;
  distanceKm: number;
  polyline: Coordinate[] | null;
  /** L1: present when started via "크루 러닝 시작" — tags the saved run */
  crewSession?: CrewSessionTag;
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
