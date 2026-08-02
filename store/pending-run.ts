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
  /** TRUE wall-clock start (③'s HK anchor — never endedAt − elapsed, which
      compresses paused time out). Optional: pre-anchor disk copies recover. */
  startedAtMs?: number;
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
  /** 8/7 safety-net thread: the crew-banner checkbox is compose state like
      title/memo — before this it lived only in run-save's local useState,
      so a crash after unchecking saved via the run-result net WITHOUT the
      field (server default ON). Persisted here on toggle; the net save
      reads it. Old disk copies recover as true via the EMPTY_DRAFT merge
      (the contract default). */
  showCrew: boolean;
  /** 8/8 tagKept rider (the ledgered sibling gap): the crew-tag × removal
      is compose state too — before this, a crash after removing the tag
      meant the net save re-tagged the run. Persisted on both transitions
      (× and undo); old disk copies recover as true via the merge. */
  tagKept: boolean;
};

const EMPTY_DRAFT: PendingDraft = { title: '', memo: '', visibility: 'public', photos: [], showCrew: true, tagKept: true };

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

/** Same run re-entering the 저장 checkpoint (back → resume → 종료 again):
    numbers refresh, the typed draft SURVIVES. setPendingRun stays the
    new-run door (it resets the draft). */
export function refreshPendingRun(run: PendingRun): void {
  pending = run;
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

/** ① kill-recovery: throttled MID-RUN persist (run-session.ts). Same disk
    key/shape as a finished run, so the existing cold-start recovery offers a
    killed run with zero new machinery. Never touches in-memory pending/draft
    — a live run has no compose state yet; the stored draft carries only the
    auto_publish visibility default (setPendingRun's rule). A clean stop
    overwrites this with the real final via setPendingRun. */
export function persistActiveRun(run: PendingRun): void {
  const visibility: RunVisibility =
    useSettings.getState().settings.feed.auto_publish ? 'public' : 'private';
  AsyncStorage.setItem(DISK_KEY, JSON.stringify({ run, draft: { ...EMPTY_DRAFT, visibility } }))
    .catch(() => {});
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
