// 크루 공지 — CRUD + RSVP per docs/API_GUIDE.md §커뮤니티 (M1 slice).
// Members-only read (403 outside); create/update/delete = 크루장·운영진
// (owner||admin, BE f68a48f permissions table). Create fans out one
// notification to every member (no separate send endpoint). RSVP is a
// 3-state overwrite vote. ⚠️ run_at / rsvp_closes_at MUST carry a timezone
// offset (ISO 8601) — naive datetimes are a 422 ("타임존이 필요합니다",
// probed 2026-07-11). List paginates limit/offset.

import { apiFetch } from '@/lib/api';

export type RsvpStatus = 'going' | 'not_going' | 'maybe';

export type Announcement = {
  id: string;
  crew_id: string;
  author_id: string;
  author_nickname: string | null;
  title: string;
  body: string;
  run_at: string | null;
  place_name: string | null;
  place_lat: number | null;
  place_lng: number | null;
  rsvp_closes_at: string | null;
  rsvp_open: boolean;
  rsvp: { going: number; not_going: number; maybe: number };
  my_rsvp: RsvpStatus | null;
  created_at: string;
  updated_at: string | null;
};

export type AnnouncementDetail = Announcement & {
  going_members: { user_id: string; nickname: string | null }[];
};

export type AnnouncementInput = {
  title: string;
  body: string;
  run_at?: string | null;          // ISO 8601 WITH offset, e.g. 2026-07-18T20:00:00+09:00
  place_name?: string | null;
  place_lat?: number | null;
  place_lng?: number | null;
  rsvp_closes_at?: string | null;  // same offset rule
};

export function listAnnouncements(crewId: string, limit = 20, offset = 0): Promise<Announcement[]> {
  return apiFetch<Announcement[]>(`/api/crews/${crewId}/announcements?limit=${limit}&offset=${offset}`);
}

export function getAnnouncement(crewId: string, announcementId: string): Promise<AnnouncementDetail> {
  return apiFetch<AnnouncementDetail>(`/api/crews/${crewId}/announcements/${announcementId}`);
}

export function createAnnouncement(crewId: string, input: AnnouncementInput): Promise<Announcement> {
  return apiFetch<Announcement>(`/api/crews/${crewId}/announcements`, { method: 'POST', body: input });
}

export function updateAnnouncement(crewId: string, announcementId: string, input: AnnouncementInput): Promise<Announcement> {
  return apiFetch<Announcement>(`/api/crews/${crewId}/announcements/${announcementId}`, { method: 'PATCH', body: input });
}

export function deleteAnnouncement(crewId: string, announcementId: string): Promise<void> {
  return apiFetch<void>(`/api/crews/${crewId}/announcements/${announcementId}`, { method: 'DELETE' });
}

export function rsvpAnnouncement(crewId: string, announcementId: string, status: RsvpStatus): Promise<void> {
  return apiFetch<void>(`/api/crews/${crewId}/announcements/${announcementId}/rsvp`, {
    method: 'PUT',
    body: { status },
  });
}

/** KST-offset ISO from local date/time parts — the composer's serializer.
    Input is what the user typed as Korean local time; output satisfies the
    server's timezone-required contract. Returns null on invalid parts. */
export function toKstIso(date: string, time: string): string | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!dm || !tm) return null;
  const [, y, mo, d] = dm;
  const h = Number(tm[1]), mi = Number(tm[2]);
  if (h > 23 || mi > 59) return null;
  const mon = Number(mo), day = Number(d);
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
  return `${y}-${mo}-${d}T${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:00+09:00`;
}
