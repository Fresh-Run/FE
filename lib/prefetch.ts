// Prefetch — item ⑩ slice 3 (2026-11-21): warm the persistent GET cache for
// what the next tap is likely to need, so the screen opens already painted.
//   · app start (after the cache hydrates): the tab data behind the feed —
//     MY (profile, stats, runs, the weekly window's months), 그룹 (my crews),
//     배틀 list, unread count. The feed itself mounts first and fetches on its own.
//   · 그룹 list → the crew bundle for my first crews (crew, members, 공지,
//     ranking, challenge, 정기런 page, chat unread).
//   · feed → the post bundle (run detail + comments) for the top viewable
//     cards and on press-in of any card.
// Every call is fire-and-forget through apiFetch (which writes the cache);
// a key fetched within TTL or already in flight is skipped. Failures are
// silent — the screen's own fetch remains the source of truth.
import { apiFetch } from '@/lib/api';
import { dcAgeMs } from '@/lib/data-cache';
import { monthsInWindow } from '@/hooks/use-weekly-distance';

const FRESH_MS = 60_000;
const inflight = new Set<string>();

function warm(path: string): void {
  const age = dcAgeMs(path);
  if ((age != null && age < FRESH_MS) || inflight.has(path)) return;
  inflight.add(path);
  apiFetch<unknown>(path).catch(() => {}).finally(() => inflight.delete(path));
}

export function prefetchAppStart(): void {
  warm('/api/me/profile');
  warm('/api/me/stats');
  warm('/api/runs?limit=50');
  for (const { year, month } of monthsInWindow(12)) warm(`/api/me/stats/monthly?year=${year}&month=${month}`);
  warm('/api/crews/mine');
  warm('/api/battles');
  warm('/api/notifications/unread-count');
}

/** Crew detail bundle — members-only endpoints 403 for non-members, which is a silent skip. */
export function prefetchCrew(crewId: string, member: boolean): void {
  warm(`/api/crews/${crewId}`);
  warm(`/api/crews/${crewId}/members`);
  warm(`/api/crews/${crewId}/ranking`);
  warm(`/api/crews/${crewId}/challenges/current`);
  if (member) {
    warm(`/api/crews/${crewId}/announcements?limit=20&offset=0`);
    warm(`/api/crews/${crewId}/runs?limit=20&offset=0&session_only=true`);
    warm(`/api/crews/${crewId}/chat/unread`);
  }
}

/** Run post bundle — detail + first comments page. */
export function prefetchRunPost(runId: string): void {
  warm(`/api/runs/${runId}`);
  warm(`/api/runs/${runId}/comments?limit=20&offset=0`);
}
