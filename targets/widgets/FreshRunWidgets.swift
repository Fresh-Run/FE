// FreshRun Live Activity UI (④a) — 지연's canvas spec "FreshRun Live
// Activity.html" (design source of truth): lock-screen card + Dynamic Island
// compact / minimal / expanded, lime #74E827 on ink #0D1A06, elapsed time
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
private let lime = Color(red: 116 / 255, green: 232 / 255, blue: 39 / 255)   // #74E827
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
  var body: some View {
    HStack(spacing: 5) {
      Circle().fill(lime).frame(width: 7, height: 7) // static — no WidgetKit pulse
      Text("러닝 중").font(.system(size: 11, weight: .bold)).foregroundStyle(lime)
    }
  }
}

/// Self-counting clock; frozen at pausedAt while paused (④c sets it).
private struct ElapsedClock: View {
  let state: RunActivityAttributes.ContentState
  var font: Font
  var body: some View {
    Group {
      if let pausedAt = state.pausedAt {
        Text(fmtElapsed(state.startedAt, to: pausedAt))
      } else {
        Text(timerInterval: state.startedAt...Date.distantFuture, countsDown: false)
      }
    }
    .font(font)
    .monospacedDigit()
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
      ctx.stroke(grid, with: .color(.white.opacity(0.05)), lineWidth: 1)

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

private struct StatCol: View {
  let label: String
  let value: String
  var unit: String? = nil
  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(label).font(.system(size: 10.5, weight: .semibold)).foregroundStyle(textLo)
      HStack(alignment: .firstTextBaseline, spacing: 2) {
        Text(value).font(.system(size: 19, weight: .semibold)).monospacedDigit()
          .foregroundStyle(textHi)
        if let unit { Text(unit).font(.system(size: 12, weight: .semibold)).foregroundStyle(unitLo) }
      }
    }
  }
}

// ── Lock-screen card (canvas frame 1) ────────────────────────────────────────
private struct LockScreenView: View {
  let state: RunActivityAttributes.ContentState
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 9) {
        LogoBox()
        Text("FreshRun").font(.system(size: 13, weight: .bold)).foregroundStyle(textHi)
        Spacer()
        LiveBadge()
      }
      HStack(alignment: .center, spacing: 16) {
        VStack(alignment: .leading, spacing: 2) {
          Text("경과 시간").font(.system(size: 11, weight: .semibold)).foregroundStyle(textLo)
          ElapsedClock(state: state, font: .system(size: 34, weight: .bold))
        }
        Spacer()
        MiniRoute(route: state.route)
          .frame(width: 88, height: 58)
          .clipShape(RoundedRectangle(cornerRadius: 14))
      }
      .padding(.top, 15)
      HStack(spacing: 26) {
        StatCol(label: "거리", value: fmtKm(state.distanceM), unit: "km")
        StatCol(label: "페이스", value: fmtPace(state.paceSecPerKm), unit: "/km")
        if let kcal = state.kcal { // honest-kcal: hidden without saved weight
          StatCol(label: "칼로리", value: "\(kcal)", unit: "kcal")
        }
      }
      .padding(.top, 14)
      .overlay(Rectangle().fill(.white.opacity(0.10)).frame(height: 0.5), alignment: .top)
    }
    .padding(EdgeInsets(top: 16, leading: 18, bottom: 17, trailing: 18))
    .activityBackgroundTint(Color(red: 18 / 255, green: 20 / 255, blue: 17 / 255).opacity(0.62))
    .activitySystemActionForegroundColor(lime)
  }
}

// ── The Live Activity widget ─────────────────────────────────────────────────
struct RunLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: RunActivityAttributes.self) { context in
      LockScreenView(state: context.state)
    } dynamicIsland: { context in
      DynamicIsland {
        // Expanded (canvas frame 4, stats-only in ④a — buttons arrive at ④c)
        DynamicIslandExpandedRegion(.leading) { LogoBox().padding(.leading, 4) }
        DynamicIslandExpandedRegion(.trailing) { LiveBadge().padding(.trailing, 4) }
        DynamicIslandExpandedRegion(.bottom) {
          HStack(alignment: .top, spacing: 14) {
            MiniRoute(route: context.state.route)
              .frame(width: 96, height: 70)
              .clipShape(RoundedRectangle(cornerRadius: 16))
            VStack(alignment: .leading, spacing: 4) {
              Text("경과 시간").font(.system(size: 11, weight: .semibold)).foregroundStyle(textLo)
              ElapsedClock(state: context.state, font: .system(size: 38, weight: .bold))
              HStack(spacing: 20) {
                StatCol(label: "거리", value: fmtKm(context.state.distanceM), unit: "km")
                StatCol(label: "페이스", value: fmtPace(context.state.paceSecPerKm), unit: "/km")
              }
              .padding(.top, 5)
            }
            Spacer(minLength: 0)
          }
          .padding(.top, 6)
        }
      } compactLeading: {
        // Canvas frame 2: lime runner glyph …
        RunnerGlyph(size: 12)
      } compactTrailing: {
        // … + the self-counting run time (the owner's ask, next to the
        // location indicator). Width-capped: the island slot is narrow.
        ElapsedClock(state: context.state, font: .system(size: 14, weight: .semibold))
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
