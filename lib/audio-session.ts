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
import { Platform } from 'react-native';

import { abandonAudioFocus, requestTransientDuckFocus } from '@/modules/audio-focus';

export function activateRunAudioSession(): void {
  // fire-and-forget: a session failure must never break tracking itself —
  // worst case is the pre-#12 behavior the walk documented
  setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'duckOthers',
  }).catch(() => {});
}

/** Per-cue duck ENGAGE (third-parse fix, 2026-07-27): ducking is an
    ACTIVATION-time effect and our code never called setActive(true) — cue 1
    ducked on iOS's one implicit activation (cold session); after each
    explicit release the synthesizer's warm engine re-renders WITHOUT a fresh
    activation, so no later cue ever ducked. Both duck edges are now OURS:
    this before every speak (mode re-assert = idempotent belt; setActive(true)
    = the duck trigger), the three-hook release after. Fire-and-forget ahead
    of a sync speak — worst case the dim lands milliseconds into the first
    syllable (accepted at ruling). */
export function engageCueAudioSession(): void {
  setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'duckOthers',
  }).catch(() => {});
  setIsAudioActiveAsync(true).catch(() => {});
  // ANDROID (big-five ⑤, 2026-10-09): the duck EDGE on Android is audio focus,
  // and expo-audio's setIsAudioActiveAsync(true) requests none (recon:
  // AudioModule.kt requests focus only from AudioPlayer.play(); expo-speech
  // never touches AudioManager). Our native module asks for
  // AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK here — same fire-and-forget grammar as
  // the iOS engage above; a denial (another app holds exclusive focus, e.g. a
  // call) is ignored and TTS proceeds, exactly as iOS does. iOS: not reached.
  if (Platform.OS === 'android') requestTransientDuckFocus();
}

export function deactivateRunAudioSession(): void {
  setIsAudioActiveAsync(false).catch(() => {});
  // ANDROID: the release EDGE — every cue's onDone/onStopped/onError lands
  // here (audio-coach's shared `done`), so focus is never held between cues;
  // also the tracking-unmount path. Idempotent. iOS: not reached.
  if (Platform.OS === 'android') abandonAudioFocus();
  setIdleAudioPosture(); // back to the mixable idle posture after every run
}

/** Mixable-idle preventive (build-8 rider, ruled 2026-07-24): an explicitly
    MIXABLE idle category (.ambient — playsInSilentMode:false + mixWithOthers)
    at app start, so no implicit activation can ever hard-pause others' music
    (the OBSERVED-VANISHED first-launch class — deterministic for every new
    tester's first open if the reading holds). Called at root mount and after
    every run's deactivation. HONEST LIMIT: JS runs after native init — a
    pre-JS implicit activation is outside this guard's reach; this narrows
    the window and hardens everything after boot. */
export function setIdleAudioPosture(): void {
  setAudioModeAsync({
    playsInSilentMode: false,
    shouldPlayInBackground: false,
    interruptionMode: 'mixWithOthers',
  }).catch(() => {});
}
