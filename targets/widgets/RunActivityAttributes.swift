// RunActivityAttributes — the ActivityKit contract between the app and the
// widget extension. ⚠️ DUPLICATED VERBATIM in modules/live-activity/ios/
// (ActivityKit matches app↔extension by type name + Codable shape; the two
// copies MUST stay byte-identical — edit both or neither).
//
// The FULL ④b schema ships in ④a (owner-approved) so live-stats updates are
// pure JS later: ④a starts activities with zeroed state; ④b fills it.

import ActivityKit
import Foundation

struct RunActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// Timer base for Text(timerInterval:) — shifted forward on resume so
    /// pauses never inflate the visible clock (④c adjusts it).
    var startedAt: Date
    /// Non-nil while paused (④c): views freeze the clock at pausedAt.
    var pausedAt: Date?
    /// Set Swift-side on EVERY push (build #9 staleness contract): when
    /// context.isStale, views freeze the clock at fmtElapsed(startedAt →
    /// updatedAt) — the elapsed as of the last real update. Zero JS surface.
    var updatedAt: Date
    /// Gated odometer meters (the honest number — never raw).
    var distanceM: Int
    /// Rolling pace; nil = not moving / unknown → views show —.
    var paceSecPerKm: Int?
    /// MET×weight estimate; nil = no saved weight → row hidden (honest-kcal).
    var kcal: Int?
    /// Build 11: why the run is paused — "auto" | "manual" | nil (running).
    /// Drives the badge caption (자동 일시정지 vs 일시정지); the truth source
    /// is run-session's pauseSource, passed on every push.
    var pauseSource: String?
    /// Downsampled route as interleaved normalized pairs [x0,y0,x1,y1,…] in
    /// 0…1 SCREEN space (y grows downward — the JS side flips latitude).
    /// ≤50 points (100 floats): ActivityKit caps a content state at 4 KB —
    /// this is a shape hint, not a map. Empty = no route yet (④a).
    var route: [Double]
  }

  // No fixed attributes — everything lives in ContentState so ④b/④c can
  // update it. (Attributes are immutable after request.)
}
