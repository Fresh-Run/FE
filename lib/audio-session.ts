/**
 * Run audio session (#12 session rider, BLOCKER-class 2026-07-23) — the
 * fix-walk's three findings share one root: no configured session, so
 * AVSpeechSynthesizer took iOS defaults (pause-not-duck; dead when
 * backgrounded/locked). Contract:
 *  - ACTIVATE when a run arms (idle→countdown — ~3s headroom before the
 *    start cue needs ducking to already be in force);
 *  - DEACTIVATE on tracking unmount (rides the same safety as stopSpeech).
 * duckOthers: cues LOWER music and restore — never pause, never suppressed.
 * shouldPlayInBackground: cues fire backgrounded AND locked (the plist half
 * — UIBackgroundModes audio — shipped in the binary at build #11 prep,
 * deliberately waiting for this JS half).
 * API verified against the INSTALLED SDK-54 typings (expo-audio ~1.1.1):
 * setAudioModeAsync(Partial<AudioMode>) · setIsAudioActiveAsync(boolean) ·
 * InterruptionMode = 'mixWithOthers' | 'doNotMix' | 'duckOthers'.
 * NATIVE-DEP-GATED: rides binary #12 (1.0.4). Never reaches 1.0.3 — the
 * runtime bump rides the same commit as this module (the standing rule),
 * so post-commit exports can only target the 1.0.4 lane.
 */
import { setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';

export function activateRunAudioSession(): void {
  // fire-and-forget: a session failure must never break tracking itself —
  // worst case is the pre-#12 behavior the walk documented
  setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'duckOthers',
  }).catch(() => {});
}

export function deactivateRunAudioSession(): void {
  setIsAudioActiveAsync(false).catch(() => {});
}
