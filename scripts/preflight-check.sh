#!/bin/bash
# preflight-check.sh — shared publish pre-flight guards (8/25).
#
# Run before ANY eas update publish, from the repo root:
#   sourced   — dual-stage.sh does `source scripts/preflight-check.sh`
#   executed  — manual publishes run `scripts/preflight-check.sh` first
# Either way a failing guard stops the flow with exit/return 2.

# Apple Sign In hazard guard (8/25, ledgered — TODO.md 스탠딩 퍼블리시 해저드):
# the held-unstaged build-13 native integration must never ride an OTA —
# builds ≤12 lack the expo-apple-authentication native module, and a bundle
# importing it crashes the login screen on existing installs. Publishing
# requires these files clean (stash first). Self-clearing: the files' commit
# is itself gated on the build-13 cut, so clean = safe; close out this guard
# when the ledger section closes at build 13.
APPLE_DIRTY=$(git status --porcelain -- app.json "app/(auth)/sign-in.tsx" store/use-store.ts lib/strings/ko.ts lib/strings/en.ts package.json package-lock.json)
if [[ -n "$APPLE_DIRTY" ]]; then
  echo "✖ apple-signin guard: build-13 files dirty — stash before publishing:"
  echo "$APPLE_DIRTY"
  return 2 2>/dev/null || exit 2
fi
