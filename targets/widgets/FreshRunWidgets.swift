// FreshRun Live Activity UI (④a) — 지연's canvas spec "FreshRun Live
// Activity.html" (design source of truth): lock-screen card + Dynamic Island
// compact / minimal / expanded, lime #39FF14 on ink #0D1A06, elapsed time
// self-counting via Text(timerInterval:) (zero updates needed for the clock).
//
// Stated adaptations (checkpointed):
// • The runner glyph = SF Symbol figure.run (the canvas's hand-drawn stick
//   runner as a custom Path is a fidelity risk; the symbol is the honest
//   platform equivalent).
// • The 러닝 중 dot doesn't pulse — WidgetKit forbids free-running
//   animations; static dot.
// • ④a OMITS the expanded 일시정지/종료 buttons — they're App Intents (④c);
//   dead buttons on a lock screen would be the dead-affordance lie at
//   maximum visibility. Stats-only until they work.

import ActivityKit
import SwiftUI
import WidgetKit

// ── Design tokens (canvas) ───────────────────────────────────────────────────
private let lime = Color(red: 57 / 255, green: 255 / 255, blue: 20 / 255)   // #39FF14 — rebrand 8/20; NATIVE: lands with the next binary cut (the widget shows the old green until then, stated drift)
private let ink = Color(red: 13 / 255, green: 26 / 255, blue: 6 / 255)       // #0D1A06
private let textHi = Color(red: 234 / 255, green: 241 / 255, blue: 230 / 255) // #EAF1E6
private let textLo = Color(red: 154 / 255, green: 166 / 255, blue: 154 / 255) // #9AA69A
private let unitLo = Color(red: 138 / 255, green: 150 / 255, blue: 138 / 255) // #8A968A
private let panelBg = Color(red: 14 / 255, green: 17 / 255, blue: 22 / 255)   // #0E1116

// ── Formatters ───────────────────────────────────────────────────────────────
private func fmtKm(_ m: Int) -> String { String(format: "%.2f", Double(m) / 1000) }
private func fmtPace(_ secPerKm: Int?) -> String {
  guard let s = secPerKm, s > 0 else { return "—" }
  return "\(s / 60)'\(String(format: "%02d", s % 60))\""
}
private func fmtElapsed(_ from: Date, to: Date) -> String {
  let s = max(0, Int(to.timeIntervalSince(from)))
  return s >= 3600
    ? String(format: "%d:%02d:%02d", s / 3600, (s / 60) % 60, s % 60)
    : String(format: "%d:%02d", s / 60, s % 60)
}

// ── Shared pieces ────────────────────────────────────────────────────────────
private struct RunnerGlyph: View {
  var size: CGFloat
  var color: Color = lime
  var body: some View {
    Image(systemName: "figure.run")
      .font(.system(size: size, weight: .bold))
      .foregroundStyle(color)
  }
}

private struct LogoBox: View {
  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 8)
        .fill(LinearGradient(
          colors: [Color(red: 28 / 255, green: 47 / 255, blue: 16 / 255),
                   Color(red: 12 / 255, green: 18 / 255, blue: 6 / 255)],
          startPoint: .topLeading, endPoint: .bottomTrailing))
      RunnerGlyph(size: 13)
    }
    .frame(width: 26, height: 26)
  }
}

private struct LiveBadge: View {
  var isStale: Bool = false
  /// Build 11: non-nil while paused — "auto" shows 자동 일시정지, anything
  /// else 일시정지. Stale outranks paused (a dead app's pause claim would
  /// be the staleness lie wearing new copy).
  var pauseSource: String? = nil
  var body: some View {
    let paused = pauseSource != nil
    let dim = Color(white: 0.65)
    HStack(spacing: 5) {
      Circle().fill(isStale || paused ? Color(white: 0.55) : lime).frame(width: 7, height: 7)
      Text(isStale ? "업데이트 끊김" : paused ? (pauseSource == "auto" ? "자동 일시정지" : "일시정지") : "러닝 중")
        .font(.system(size: 11, weight: .bold))
        .foregroundStyle(isStale || paused ? dim : lime)
    }
  }
}

/// Self-counting clock; frozen at pausedAt while paused (④c sets it).
/// minimumScaleFactor: the hero must shrink, never clip, if the height
/// budget tightens (the ④c lock-card overflow lesson).
private struct ElapsedClock: View {
  let state: RunActivityAttributes.ContentState
  var font: Font
  var isStale: Bool = false
  var body: some View {
    Group {
      if isStale {
        // build #9 staleness: FROZEN at the last real update (updatedAt is
        // carried in the state — ActivityViewContext hides the stale date).
        // A ticking Text(timerInterval:) would keep lying after app death.
        Text(fmtElapsed(state.startedAt, to: state.pausedAt ?? state.updatedAt))
      } else if let pausedAt = state.pausedAt {
        Text(fmtElapsed(state.startedAt, to: pausedAt))
      } else {
        Text(timerInterval: state.startedAt...Date.distantFuture, countsDown: false)
      }
    }
    .font(font)
    .monospacedDigit()
    .lineLimit(1)
    .minimumScaleFactor(0.7)
    .foregroundStyle(.white)
  }
}

/// Mini route panel — grid + lime path from normalized [x0,y0,x1,y1,…].
/// Empty route (④a) renders the grid alone: an honest "no shape yet".
private struct MiniRoute: View {
  let route: [Double]
  var body: some View {
    Canvas { ctx, size in
      var grid = Path()
      for fx in [1.0 / 3.0, 2.0 / 3.0] {
        grid.move(to: CGPoint(x: size.width * fx, y: 0))
        grid.addLine(to: CGPoint(x: size.width * fx, y: size.height))
        grid.move(to: CGPoint(x: 0, y: size.height * fx))
        grid.addLine(to: CGPoint(x: size.width, y: size.height * fx))
      }
      ctx.stroke(grid, with: .color(.white.opacity(0.08)), lineWidth: 1)

      guard route.count >= 4 else { return }
      var path = Path()
      let pad = 0.12 // keep the shape off the panel edges
      func pt(_ i: Int) -> CGPoint {
        CGPoint(x: (pad + route[i] * (1 - 2 * pad)) * size.width,
                y: (pad + route[i + 1] * (1 - 2 * pad)) * size.height)
      }
      path.move(to: pt(0))
      var i = 2
      while i + 1 < route.count { path.addLine(to: pt(i)); i += 2 }
      ctx.stroke(path, with: .color(lime),
                 style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
      ctx.fill(Path(ellipseIn: CGRect(x: pt(0).x - 3, y: pt(0).y - 3, width: 6, height: 6)),
               with: .color(panelBg))
      ctx.stroke(Path(ellipseIn: CGRect(x: pt(0).x - 3, y: pt(0).y - 3, width: 6, height: 6)),
                 with: .color(lime), lineWidth: 2)
      let last = pt(route.count - 2)
      ctx.fill(Path(ellipseIn: CGRect(x: last.x - 3.5, y: last.y - 3.5, width: 7, height: 7)),
               with: .color(lime))
    }
    .background(panelBg)
  }
}

// ④c action row — 일시정지(재개)/종료, EXPANDED DI ONLY (owner ruling,
// build #7 — exactly where 지연's mock draws them, at her 46pt). iOS 17+
// (Button(intent:) is a 17 API); 16.2 renders stats-only. 종료 = no confirm
// (recoverable-by-design → save flow); pocket-brush safety is structural —
// the row sits behind the long-press.
private struct RunActionsRow: View {
  let paused: Bool
  var body: some View {
    if #available(iOS 17.0, *) {
      HStack(spacing: 10) {
        Button(intent: PauseRunIntent()) {
          HStack(spacing: 7) {
            Image(systemName: paused ? "play.fill" : "pause.fill").font(.system(size: 13, weight: .bold))
            Text(paused ? "재개" : "일시정지").font(.system(size: 14, weight: .bold))
          }
          .foregroundStyle(.white)
          .frame(maxWidth: .infinity, minHeight: 46)
          .background(.white.opacity(0.14), in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
        Button(intent: StopRunIntent()) {
          HStack(spacing: 7) {
            RoundedRectangle(cornerRadius: 3).fill(.white).frame(width: 13, height: 13)
            Text("종료").font(.system(size: 14, weight: .bold))
          }
          .foregroundStyle(.white)
          .frame(maxWidth: .infinity, minHeight: 46)
          // #E85A5A — the adopted dark `danger` (지연 ruling (c)+, 2026-07-21):
          // lock-screen 종료 == in-app hold-stop, one red across the system.
          // (Was #F0483C, the pre-adoption value — the LA rider's one drift.)
          .background(Color(red: 232 / 255, green: 90 / 255, blue: 90 / 255),
                      in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
      }
    }
  }
}

private struct StatCol: View {
  let label: String
  let value: String
  var unit: String? = nil
  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      // Build 11 type ramp, option (a) (owner-ruled 8/1): label 10.5→11.5 ·
      // value 19→22 bold (the conservative end of the ruled 22-23 — StatCol
      // is SHARED with the tighter DI expanded row) · unit 12→13. Funded by
      // the lock card's section padding (15/14→12, below).
      Text(label).font(.system(size: 11.5, weight: .semibold)).foregroundStyle(textLo)
      HStack(alignment: .firstTextBaseline, spacing: 2) {
        // Expanded-LA crunch fix (build 9, ruled 2026-07-26): the trailing
        // stat pair absorbed all the row's squeeze and TRUNCATED ("0… km").
        // Scale-down beats truncation; priority keeps the value whole.
        // minimumScaleFactor 0.6 SURVIVES the ramp (the build-9 lesson).
        Text(value).font(.system(size: 22, weight: .bold)).monospacedDigit()
          .foregroundStyle(textHi)
          .lineLimit(1).minimumScaleFactor(0.6).layoutPriority(1)
        if let unit { Text(unit).font(.system(size: 13, weight: .semibold)).foregroundStyle(unitLo) }
      }
    }
  }
}

// ── Lock-screen card (canvas frame 1) ────────────────────────────────────────
private struct LockScreenView: View {
  let state: RunActivityAttributes.ContentState
  var isStale: Bool = false
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 9) {
        LogoBox()
        Text("FreshRun").font(.system(size: 13, weight: .bold)).foregroundStyle(textHi)
        Spacer()
        LiveBadge(isStale: isStale, pauseSource: state.pausedAt != nil ? (state.pauseSource ?? "manual") : nil)
      }
      // Lock card = 지연's canvas 1:1 (owner ruling, build #7): header ·
      // hero · mini-route · stats. NO buttons here — her design never had
      // them; 일시정지/종료 live in the expanded DI where her mock draws
      // them. (The button row was OUR invention, and every compression
      // since was paying interest on it — ledgered lesson.)
      HStack(alignment: .center, spacing: 16) {
        VStack(alignment: .leading, spacing: 2) {
          Text("경과 시간").font(.system(size: 11, weight: .semibold)).foregroundStyle(textLo)
          ElapsedClock(state: state, font: .system(size: 34, weight: .bold), isStale: isStale)
        }
        Spacer()
        // No geometry yet → no panel (an invisible-grid dark box reads
        // broken, not honest). The panel appears with the first accepted
        // shape — the one stated deviation from her mock (it always drew one).
        if !state.route.isEmpty {
          MiniRoute(route: state.route)
            .frame(width: 88, height: 58)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
      }
      .padding(.top, 12) // 15→12: type-ramp funding (option (a))
      HStack(spacing: 26) {
        StatCol(label: "거리", value: fmtKm(state.distanceM), unit: "km")
        StatCol(label: "평균 페이스", value: fmtPace(state.paceSecPerKm), unit: "/km")
        if let kcal = state.kcal { // honest-kcal: hidden without saved weight
          StatCol(label: "칼로리", value: "\(kcal)", unit: "kcal")
        }
      }
      .padding(.top, 12) // 14→12: type-ramp funding (option (a))
      .overlay(Rectangle().fill(.white.opacity(0.10)).frame(height: 0.5), alignment: .top)
    }
    .padding(EdgeInsets(top: 16, leading: 18, bottom: 17, trailing: 18))
    .opacity(isStale ? 0.62 : 1) // dim — the card visibly stops claiming live
    .activityBackgroundTint(Color(red: 18 / 255, green: 20 / 255, blue: 17 / 255).opacity(0.62))
    .activitySystemActionForegroundColor(lime)
  }
}

// ── The Live Activity widget ─────────────────────────────────────────────────
struct RunLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: RunActivityAttributes.self) { context in
      LockScreenView(state: context.state, isStale: context.isStale)
    } dynamicIsland: { context in
      DynamicIsland {
        // Expanded (canvas frame 4, stats-only in ④a — buttons arrive at ④c)
        DynamicIslandExpandedRegion(.leading) { LogoBox().padding(.leading, 4) }
        DynamicIslandExpandedRegion(.trailing) { LiveBadge(isStale: context.isStale, pauseSource: context.state.pausedAt != nil ? (context.state.pauseSource ?? "manual") : nil).padding(.trailing, 4) }
        DynamicIslandExpandedRegion(.bottom) {
          // Physical truth (build #8): the WHOLE expanded presentation caps
          // at the DOCUMENTED ~160pt — 지연's expanded mock draws ~1.6× that
          // (illustrative, not budget-true). Prior rounds stacked 161–173pt
          // in this region alone and iOS silently CULLED the trailing button
          // row (it never rendered here on ANY build; #7 merely unmasked it
          // by removing the lock-card copy). Her ELEMENTS survive at DI
          // scale: route · clock · 거리/페이스 · her 46pt buttons — the
          // buttons get their full height, everything above compresses.
          // Stack: row max(44, ~42) + 8 + 46 ≈ 98pt.
          VStack(spacing: 8) {
            HStack(alignment: .center, spacing: 12) {
              if !context.state.route.isEmpty { // same no-geometry rule as the lock card
                MiniRoute(route: context.state.route)
                  .frame(width: 56, height: 44) // 8pt headroom to the stat pair (crunch-fix margin — the class's history argues for it)
                  .clipShape(RoundedRectangle(cornerRadius: 10))
              }
              VStack(alignment: .leading, spacing: 1) {
                Text("경과 시간").font(.system(size: 10, weight: .semibold)).foregroundStyle(textLo)
                ElapsedClock(state: context.state, font: .system(size: 24, weight: .bold), isStale: context.isStale)
              }
              Spacer(minLength: 0)
              HStack(spacing: 14) {
                StatCol(label: "거리", value: fmtKm(context.state.distanceM), unit: "km")
                StatCol(label: "평균 페이스", value: fmtPace(context.state.paceSecPerKm), unit: "/km")
              }
            }
            RunActionsRow(paused: context.state.pausedAt != nil)
          }
        }
      } compactLeading: {
        // Canvas frame 2: lime runner glyph …
        RunnerGlyph(size: 12)
      } compactTrailing: {
        // … + the self-counting run time (the owner's ask, next to the
        // location indicator). Width-capped: the island slot is narrow.
        ElapsedClock(state: context.state, font: .system(size: 14, weight: .semibold), isStale: context.isStale)
          .foregroundStyle(lime)
          .frame(maxWidth: 52)
      } minimal: {
        // Canvas frame 3: circular lime glyph, ink figure
        ZStack {
          Circle().fill(lime)
          RunnerGlyph(size: 11, color: ink)
        }
      }
      .keylineTint(lime)
    }
  }
}

@main
struct FreshRunWidgets: WidgetBundle {
  var body: some Widget {
    RunLiveActivity()
  }
}
