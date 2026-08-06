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

import { getLang, t, tf } from '@/lib/i18n';
import { deactivateRunAudioSession, engageCueAudioSession } from '@/lib/audio-session';
import { durationWords, KM_PER_MI } from '@/lib/run-format';

type Units = 'km' | 'mi';

// 안내 항목 shape — callers map settings.audio_coach.announce_* into this
// (the composer keeps its own vocabulary; server names stay at the edge)
type CueItems = { dist: boolean; pace: boolean; kcal: boolean };

function fmtNum(v: number): string {
  return Number.isInteger(v) ? `${v}` : v.toFixed(1);
}

// ── Spoken-phrase helpers (TTS-lang, owner-ruled 8/6) ────────────────────────
// SPOKEN strings verbalize differently from visual copy: full unit WORDS
// (kilometers/miles/minutes), never abbreviations — en-US TTS reads "km" as
// "kay-em". All helpers read getLang() at CALL time (= speak time): a locale
// flip mid-session changes the very next cue, never a composer-time capture.
// en plurals handled (1 minute / 2 minutes); ko needs none.

/** distance in the USER'S unit — mi users hear miles (item-3 rule). */
function spokenDist(km: number, units: Units): string {
  const en = getLang() === 'en';
  const v = units === 'mi' ? km / KM_PER_MI : km;
  const n = fmtNum(Math.round(v * 10) / 10);
  if (en) return `${n} ${units === 'mi' ? (n === '1' ? 'mile' : 'miles') : (n === '1' ? 'kilometer' : 'kilometers')}`;
  return `${n}${units === 'mi' ? '마일' : '킬로미터'}`;
}

function spokenDur(totalSec: number): string {
  // 8/6: delegates to the consolidated, HOUR-FOLDING home — 61-minute runs
  // now speak "1시간 1분" / "1 hour 1 minute" (the flagged candidate, ruled).
  return durationWords(totalSec, getLang(), true);
}

/** pace in the USER'S unit — sec/km converts to sec/mi for mi users. */
function spokenPace(paceSecPerKm: number, units: Units): string {
  const perUnitSec = units === 'mi' ? paceSecPerKm * KM_PER_MI : paceSecPerKm;
  return spokenDur(Math.round(perUnitSec));
}

function unitWord(units: Units): string {
  const en = getLang() === 'en';
  if (units === 'mi') return en ? 'mile' : '마일';
  return en ? 'kilometer' : '킬로미터';
}

/** Self-verifying start cue (M1 episode fix, 2026-07-22): announces the
    ARMED interval so a surprise value is audible in the first three seconds
    of every run — the armed-value-invisibility defect's cure. */
export function composeStartCue(intervalKm: number, units: Units): string {
  return tf('spk.start', { d: spokenDist(intervalKm, units) });
}

/** null when every enabled item has nothing to say (e.g. all toggles off). */
export function composeSplitCue(args: {
  km: number;                       // the crossed threshold (not raw distance)
  elapsedSec: number;
  paceSecPerKm: number | null;      // tracker's current pace; null → omit
  kcal: number | null;              // estimateKcal output; null → omit (honest rule)
  units: Units;                     // TTS-lang 8/6: mi users hear miles
  items: CueItems;
}): string | null {
  const parts: string[] = [];
  if (args.items.dist) {
    parts.push(tf('spk.splitDist', { d: spokenDist(args.km, args.units), t: spokenDur(args.elapsedSec) }));
  }
  if (args.items.pace && args.paceSecPerKm != null && args.paceSecPerKm > 0) {
    parts.push(tf('spk.splitPace', { p: spokenPace(args.paceSecPerKm, args.units), u: unitWord(args.units) }));
  }
  if (args.items.kcal && args.kcal != null) {
    parts.push(tf('spk.splitKcal', { n: args.kcal }));
  }
  return parts.length ? parts.join(' ') : null;
}

// ── 설정 샘플 라인 (지연 feature ask, 2026-07-21) — slider release feedback ──
export function composeRateSample(): string {
  return t('spk.rateSample');
}
export function composeIntervalSample(km: number, units: Units): string {
  return tf('spk.intervalSample', { d: spokenDist(km, units) });
}

export function composeFinishCue(distanceKm: number, elapsedSec: number, units: Units): string {
  return tf('spk.finish', { d: spokenDist(distanceKm, units), t: spokenDur(elapsedSec) });
}

// Duck-release (walk defect 2026-07-24): speech AUTO-ACTIVATES the session
// (duckOthers engages — field-confirmed) but nothing released it, so music
// stayed dimmed forever. The release: setIsAudioActiveAsync(false) — whose
// native body is setActive(false, .notifyOthersOnDeactivation), the exact
// iOS restore signal, already in build 7's binary. Per-utterance: dim during
// speech, RESTORE between cues, re-duck on the next cue (speech re-activates
// on its own). onStopped inherits the release for preemption and
// stopSpeech (pause/leave); onError for TTS failure. Preemption race is
// benign by construction: a stale release landing after the next utterance
// started throws inside iOS (I/O running) and the catch swallows it — the
// session stays active for the live cue, whose own onDone releases.
const releaseAudioSession = () => { deactivateRunAudioSession(); };

export function speakCue(text: string, rate: number): void {
  // stop any in-flight cue — a fresh split always wins
  Speech.stop();
  engageCueAudioSession(); // explicit duck ENGAGE — every cue, not just the cold first
  Speech.speak(text, {
    // TTS-lang (owner-ruled 8/6): the voice follows the LOCALE, read at
    // SPEAK time — a flip changes the very next cue; there is no queue to
    // strand (stop-then-speak, fresh-wins), and an utterance already in
    // flight finishes in its old voice (accepted, stated). Voice
    // availability: en-US/ko-KR are system-bundled on iOS; a missing voice
    // lands in onError → the duck releases and the run continues — cue
    // loss only, never a stuck session (the duck-release architecture is
    // the graceful fallback).
    language: getLang() === 'en' ? 'en-US' : 'ko-KR',
    rate,
    onDone: releaseAudioSession,
    onStopped: releaseAudioSession,
    onError: releaseAudioSession,
  });
}

export function stopSpeech(): void {
  Speech.stop();
}
