// LiveActivity bridge (④a) — the app-side ActivityKit calls. Activity
// request/update/end MUST run in the main app (never the extension); this
// local Expo module exposes them to JS. All three verbs ship in ④a so ④b
// (live stats) is pure JS — no further native change, OTA-able.
//
// The app deploys to iOS 15.1; every ActivityKit touch is @available-guarded
// (the widget TARGET is 16.2-only and needs no guards).

import ActivityKit
import ExpoModulesCore

/// Staleness contract (build #9): ④b pushes every ≤5s while the app lives,
/// so a stale activity ⇔ the app is dead (force-quit / crash). 90s = the
/// worst-case lie window (vs the pre-#9 HOURS). iOS flips context.isStale;
/// the widget renders the honest frozen state. No force-quit callback
/// exists — staleness is the achievable honesty ceiling.
let STALE_AFTER_S: TimeInterval = 90

public class LiveActivityModule: Module {
  private var actionObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("LiveActivity")

    // ④c: the run-control intents (RunControlIntents.swift, app copy) post
    // here from perform() — which LiveActivityIntent runs IN THIS PROCESS —
    // and JS (tracking.tsx) drives the same togglePause/endRun handlers the
    // on-screen buttons use.
    Events("onAction")

    OnStartObserving {
      self.actionObserver = NotificationCenter.default.addObserver(
        forName: freshrunLiveActivityAction, object: nil, queue: .main
      ) { [weak self] note in
        let action = note.userInfo?["action"] as? String ?? ""
        self?.sendEvent("onAction", ["action": action])
      }
    }

    OnStopObserving {
      if let observer = self.actionObserver {
        NotificationCenter.default.removeObserver(observer)
        self.actionObserver = nil
      }
    }

    /// iOS ≥16.2 AND the per-app Live Activities toggle is on.
    Function("isSupported") { () -> Bool in
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    /// Start the run activity (must be called foreground — beginRunning is).
    /// ④a state: clock only; stats zeroed until ④b feeds them.
    Function("startActivity") { (startedAtMs: Double) -> Bool in
      if #available(iOS 16.2, *) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
        let state = RunActivityAttributes.ContentState(
          startedAt: Date(timeIntervalSince1970: startedAtMs / 1000),
          pausedAt: nil, updatedAt: Date(), distanceM: 0, paceSecPerKm: nil, kcal: nil,
          pauseSource: nil, route: [])
        do {
          _ = try Activity.request(
            attributes: RunActivityAttributes(),
            content: .init(state: state, staleDate: Date().addingTimeInterval(STALE_AFTER_S)))
          return true
        } catch {
          return false // e.g. per-app LA limit — never breaks the run
        }
      }
      return false
    }

    /// ④b: push fresh stats to every live run activity. pausedAtMs non-nil
    /// freezes the clock (④c). route = normalized interleaved pairs ≤100.
    AsyncFunction("updateActivity") {
      (startedAtMs: Double, pausedAtMs: Double?, distanceM: Int,
       paceSecPerKm: Int?, kcal: Int?, pauseSource: String?, route: [Double]) in
      if #available(iOS 16.2, *) {
        let state = RunActivityAttributes.ContentState(
          startedAt: Date(timeIntervalSince1970: startedAtMs / 1000),
          pausedAt: pausedAtMs.map { Date(timeIntervalSince1970: $0 / 1000) },
          updatedAt: Date(),
          distanceM: distanceM, paceSecPerKm: paceSecPerKm, kcal: kcal,
          pauseSource: pauseSource,
          route: Array(route.prefix(100)))
        for activity in Activity<RunActivityAttributes>.activities {
          await activity.update(.init(state: state, staleDate: Date().addingTimeInterval(STALE_AFTER_S)))
        }
      }
    }

    /// End every run activity (stop/teardown call this — idempotent).
    AsyncFunction("endActivity") {
      if #available(iOS 16.2, *) {
        for activity in Activity<RunActivityAttributes>.activities {
          await activity.end(activity.content, dismissalPolicy: .immediate)
        }
      }
    }
  }
}
