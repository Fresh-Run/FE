// Run-control App Intents (④c) — the Live Activity's 일시정지/종료 buttons.
// ⚠️ DUPLICATED VERBATIM in modules/live-activity/ios/ (App Intents must be
// compiled into BOTH the extension — where Button(intent:) references them —
// and the app, where LiveActivityIntent.perform() actually executes; the two
// copies MUST stay byte-identical — edit both or neither).
//
// LiveActivityIntent runs perform() IN THE APP PROCESS (launching it in the
// background if needed). perform() posts to NotificationCenter; the
// LiveActivityModule (app target) observes and forwards to JS, where
// tracking.tsx drives the SAME togglePause/endRun handlers the on-screen
// buttons use — one code path, no drift.
//
// 종료 has NO confirm (owner-ratified 2026-07-16): Apple's own Workout/Timer
// Live Activities act immediately on tap, and stop is recoverable-by-design —
// the run lands in the save flow with everything intact. openAppWhenRun=true
// on stop so the phone opens INTO that save flow (the Workout-app precedent).
// Accidental-tap safety is STRUCTURAL (owner ruling, build #7): the buttons
// live in the expanded DI only — 지연's design from the start — so 종료 sits
// behind a deliberate long-press, unreachable by a pocket brush.

import AppIntents
import Foundation

let freshrunLiveActivityAction = Notification.Name("freshrun.liveactivity.action")

@available(iOS 17.0, *)
struct PauseRunIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "러닝 일시정지/재개"
  static var openAppWhenRun: Bool = false // toggles in place — no UI needed

  func perform() async throws -> some IntentResult {
    NotificationCenter.default.post(
      name: freshrunLiveActivityAction, object: nil, userInfo: ["action": "pause"])
    return .result()
  }
}

@available(iOS 17.0, *)
struct StopRunIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "러닝 종료"
  static var openAppWhenRun: Bool = true // 종료 → the app opens into 러닝 저장

  func perform() async throws -> some IntentResult {
    NotificationCenter.default.post(
      name: freshrunLiveActivityAction, object: nil, userInfo: ["action": "stop"])
    return .result()
  }
}
