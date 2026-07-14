// LiveActivity bridge (④a) — the app-side ActivityKit calls. Activity
// request/update/end MUST run in the main app (never the extension); this
// local Expo module exposes them to JS. All three verbs ship in ④a so ④b
// (live stats) is pure JS — no further native change, OTA-able.
//
// The app deploys to iOS 15.1; every ActivityKit touch is @available-guarded
// (the widget TARGET is 16.2-only and needs no guards).

import ActivityKit
import ExpoModulesCore

public class LiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LiveActivity")

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
          pausedAt: nil, distanceM: 0, paceSecPerKm: nil, kcal: nil, route: [])
        do {
          _ = try Activity.request(
            attributes: RunActivityAttributes(),
            content: .init(state: state, staleDate: nil))
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
       paceSecPerKm: Int?, kcal: Int?, route: [Double]) in
      if #available(iOS 16.2, *) {
        let state = RunActivityAttributes.ContentState(
          startedAt: Date(timeIntervalSince1970: startedAtMs / 1000),
          pausedAt: pausedAtMs.map { Date(timeIntervalSince1970: $0 / 1000) },
          distanceM: distanceM, paceSecPerKm: paceSecPerKm, kcal: kcal,
          route: Array(route.prefix(100)))
        for activity in Activity<RunActivityAttributes>.activities {
          await activity.update(.init(state: state, staleDate: nil))
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
