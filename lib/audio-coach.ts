/**
 * 오디오 코치 v1 — LOCAL cue composition + speech (owner-approved scope
 * 2026-07-14). Pure client: expo-speech reads Korean cue text computed from
 * the tracker's own state; zero server involvement (coach-script narration
 * for AI courses = v1.5). Premium gate + mute live at the call site
 * (tracking.tsx). HONEST-ESTIMATE RULE (owner correction): the kcal line
 * speaks ONLY when estimateKcal returned a real number (user-confirmed
 * weight) — no weight → the line is silently omitted, never a zero/guess.
 */
import * as Speech from 'expo-speech';

import type { AudioCoachSettings } from '@/store/use-audio-coach';

function fmtKm(km: number): string {
  return Number.isInteger(km) ? `${km}` : km.toFixed(1);
}
function fmtMinSec(totalSec: number): string {
  const m = Math.floor(totalSec / 60), s = Math.round(totalSec % 60);
  return s > 0 ? `${m}분 ${s}초` : `${m}분`;
}

/** Self-verifying start cue (M1 episode fix, 2026-07-22): announces the
    ARMED interval so a surprise value is audible in the first three seconds
    of every run — the armed-value-invisibility defect's cure. */
export function composeStartCue(intervalKm: number): string {
  return `러닝을 시작합니다. ${fmtKm(intervalKm)}킬로미터마다 안내할게요.`;
}

/** null when every enabled item has nothing to say (e.g. all toggles off). */
export function composeSplitCue(args: {
  km: number;                       // the crossed threshold (not raw distance)
  elapsedSec: number;
  paceSecPerKm: number | null;      // tracker's current pace; null → omit
  kcal: number | null;              // estimateKcal output; null → omit (honest rule)
  items: AudioCoachSettings['items'];
}): string | null {
  const parts: string[] = [];
  if (args.items.dist) {
    parts.push(`${fmtKm(args.km)}킬로미터 지점입니다. 경과 시간 ${fmtMinSec(args.elapsedSec)}.`);
  }
  if (args.items.pace && args.paceSecPerKm != null && args.paceSecPerKm > 0) {
    parts.push(`현재 페이스, 킬로미터당 ${fmtMinSec(args.paceSecPerKm)}.`);
  }
  if (args.items.kcal && args.kcal != null) {
    parts.push(`소모 칼로리 약 ${args.kcal}칼로리.`);
  }
  return parts.length ? parts.join(' ') : null;
}

// ── 설정 샘플 라인 (지연 feature ask, 2026-07-21) — slider release feedback ──
export function composeRateSample(): string {
  return '이 속도로 안내해 드릴게요.';
}
export function composeIntervalSample(km: number): string {
  return `${fmtKm(km)}킬로미터마다 안내해 드릴게요.`;
}

export function composeFinishCue(distanceKm: number, elapsedSec: number): string {
  return `러닝 종료. 총 ${distanceKm.toFixed(2)}킬로미터, ${fmtMinSec(elapsedSec)} 달렸어요.`;
}

export function speakCue(text: string, rate: number): void {
  // stop any in-flight cue — a fresh split always wins
  Speech.stop();
  Speech.speak(text, { language: 'ko-KR', rate });
}

export function stopSpeech(): void {
  Speech.stop();
}
