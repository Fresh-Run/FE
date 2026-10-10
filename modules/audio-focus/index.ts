// JS bridge for the Android audio-focus native module (big-five ⑤). Loaded
// via requireOptionalNativeModule: resolves null on iOS (the module's
// expo-module.config is platforms ["android"] — iOS autolinking never builds
// it, exactly like live-activity is never built on Android), in Expo Go, and
// on any binary predating the module — every call degrades to a no-op, so
// the JS half is safe in a bundle any runtime could load.
import { requireOptionalNativeModule } from 'expo-modules-core';

type AudioFocusNative = {
  /** AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK — true iff granted. */
  request(): boolean;
  abandon(): void;
};

const native = requireOptionalNativeModule<AudioFocusNative>('AudioFocus');

/** Ask for transient-may-duck focus for one TTS cue. false = denied (another
    app holds exclusive focus — a call) or unavailable; the caller proceeds
    with speech regardless (the iOS lane's grammar). */
export function requestTransientDuckFocus(): boolean {
  try { return native?.request() ?? false; } catch { return false; }
}

/** Release focus — run on every cue end (onDone/onStopped/onError). Idempotent. */
export function abandonAudioFocus(): void {
  try { native?.abandon(); } catch { /* never break a cue */ }
}
