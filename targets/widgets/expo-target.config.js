// FreshRun Live Activity — WidgetKit extension target (④a).
// @bacons/apple-targets materializes this at prebuild; EAS signs it with the
// same ASC-key credential path as the app (bundle id auto-registered).
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'FreshRunWidgets',
  // ActivityKit floor is 16.1; Text(timerInterval:) styling is solid from
  // 16.2 — both test devices confirmed ≥16.2 (owner 2026-07-15).
  deploymentTarget: '16.2',
  // → com.freshrun.app.widgets (dot-prefix appends to the app id)
  bundleIdentifier: '.widgets',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
};
