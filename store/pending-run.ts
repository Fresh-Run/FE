// Pending-run handoff: tracking → 러닝 저장 (compose) → 수고했어요.
//
// CRASH SAFETY (owner requirement): the unsaved run + any typed compose
// fields persist to AsyncStorage the moment tracking ends, and survive an
// app kill. On next launch, recovery is offered (components/
// pending-run-recovery.tsx) instead of silent loss. The disk copy is
// cleared on successful save or explicit discard — never implicitly.

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { GpsPoint, SavedRun } from '@/lib/runs-api';
import type { CrewSessionTag } from '@/store/active-course';
import { useSettings } from '@/store/use-settings';
import type { Coordinate } from '@/types';

const DISK_KEY = '@fr_pending_run';

export type PendingRun = {
  distanceKm: number;
  elapsedSec: number;
  avgPaceSecPerKm: number | null;
  kcal: number | null; // MET×weight estimate; null = no saved weight
  path: Coordinate[]; // client-filtered; on-screen polyline source
  /** RAW received fixes — uploaded as gps_track at save. Persists to disk
      with the rest (a crash can't lose the track). Optional: disk copies
      written before this field existed recover as track-less saves. */
  gpsTrack?: GpsPoint[];
  endedAt: number;
  /** Present when the run was started from a course ("이 코스 달리기"). */
  course?: { id: string | null; title: string };
  /** L1: present when started via "크루 러닝 시작" — the 정기런 tag rides to save */
  crewSession?: CrewSessionTag;
};

export type RunVisibility = 'public' | 'followers' | 'private';

export type PendingDraft = {
  title: string;
  memo: string;
  visibility: RunVisibility;
  /** Local URIs, ALREADY re-encoded (EXIF-free) at pick time — crash-safe
      like the text fields; uploaded after the run save (attach-after). */
  photos: string[];
};

const EMPTY_DRAFT: PendingDraft = { title: '', memo: '', visibility: 'public', photos: [] };

let pending: PendingRun | null = null;
let draft: PendingDraft = EMPTY_DRAFT;
let savedResult: SavedRun | null = null;

function writeDisk() {
  if (!pending) return;
  AsyncStorage.setItem(DISK_KEY, JSON.stringify({ run: pending, draft })).catch(() => {});
}

export function setPendingRun(run: PendingRun): void {
  pending = run;
  // settings.feed.auto_publish (v1.5, server-backed) decides the fresh
  // draft's default 공개 범위 — OFF → 비공개 start
  draft = { ...EMPTY_DRAFT, visibility: useSettings.getState().settings.feed.auto_publish ? 'public' : 'private' };
  savedResult = null;
  writeDisk();
}

export function getPendingRun(): PendingRun | null {
  return pending;
}

export function getPendingDraft(): PendingDraft {
  return draft;
}

/** Compose-field persistence — called as the user types (fire-and-forget). */
export function updatePendingDraft(next: Partial<PendingDraft>): void {
  draft = { ...draft, ...next };
  writeDisk();
}

/** Cold-start recovery: load an unsaved run left by a killed session.
    Returns null when memory already holds a run (normal in-session flow). */
export async function loadPendingFromDisk(): Promise<{ run: PendingRun; draft: PendingDraft } | null> {
  if (pending) return null;
  try {
    const raw = await AsyncStorage.getItem(DISK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { run: PendingRun; draft?: PendingDraft };
    if (!parsed?.run) return null;
    return { run: parsed.run, draft: { ...EMPTY_DRAFT, ...parsed.draft } };
  } catch {
    return null;
  }
}

/** Adopt a disk-recovered run into memory (recovery → resume compose). */
export function adoptRecovered(run: PendingRun, recoveredDraft: PendingDraft): void {
  pending = run;
  draft = recoveredDraft;
  savedResult = null;
}

/** Successful POST: keep the run in memory for 수고했어요, drop the disk
    copy (nothing left to lose — the server has it), stash the response. */
export function markSaved(saved: SavedRun): void {
  savedResult = saved;
  AsyncStorage.removeItem(DISK_KEY).catch(() => {});
}

export function getSavedResult(): SavedRun | null {
  return savedResult;
}

export function clearPendingRun(): void {
  pending = null;
  draft = EMPTY_DRAFT;
  savedResult = null;
  AsyncStorage.removeItem(DISK_KEY).catch(() => {});
}
