package expo.modules.audiofocus

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android audio focus for the voice coach (big-five ⑤, 2026-10-09).
 *
 * The Android twin of the iOS AVAudioSession duck: `request()` asks for
 * AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK so the user's music lowers for a TTS cue
 * and recovers when `abandon()` runs (every cue's onDone/onStopped/onError —
 * no focus is ever held between cues). Recon (expo-audio 1.1.1 AudioModule.kt):
 * setIsAudioActiveAsync(true) requests NOTHING on Android — focus is only ever
 * requested from AudioPlayer.play(); expo-speech never touches AudioManager.
 * Hence this module: one request, one abandon, no listeners/state beyond the
 * current request handle.
 *
 * Attributes: USAGE_ASSISTANCE_NAVIGATION_GUIDANCE + CONTENT_TYPE_SPEECH — the
 * platform's own class for spoken prompts over music (same duck semantics as
 * media, correct routing/volume stream for speech).
 *
 * Denial (another app holds exclusive focus, e.g. a call): returns false and the
 * caller proceeds with TTS regardless — mirrors the iOS lane, where the session
 * engage is fire-and-forget and Speech.speak runs; the OS decides audibility.
 */
class AudioFocusModule : Module() {
  private var focusRequest: AudioFocusRequest? = null
  // Required by the API; we track no state from it (the current request
  // handle is the only thing abandon() needs).
  private val focusListener = AudioManager.OnAudioFocusChangeListener { }

  private fun audioManager(): AudioManager? =
    appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  override fun definition() = ModuleDefinition {
    Name("AudioFocus")

    /** Transient-may-duck focus request. true iff AUDIOFOCUS_REQUEST_GRANTED. */
    Function("request") {
      val am = audioManager() ?: return@Function false
      val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        abandonInternal(am) // never stack handles — one live request at most
        val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
          .setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
              .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
              .build()
          )
          .setOnAudioFocusChangeListener(focusListener)
          .build()
        focusRequest = req
        am.requestAudioFocus(req)
      } else {
        @Suppress("DEPRECATION")
        am.requestAudioFocus(
          focusListener,
          AudioManager.STREAM_MUSIC,
          AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
        )
      }
      result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    }

    /** Abandon the current request (idempotent — safe on every release hook). */
    Function("abandon") {
      audioManager()?.let { abandonInternal(it) }
    }
  }

  private fun abandonInternal(am: AudioManager) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focusRequest?.let { am.abandonAudioFocusRequest(it) }
      focusRequest = null
    } else {
      @Suppress("DEPRECATION")
      am.abandonAudioFocus(focusListener)
    }
  }
}
