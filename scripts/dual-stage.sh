#!/bin/bash
# dual-stage.sh — the dual-lane mirror publish, scripted (class audit #3, 8/6).
#
# Replaces the hand-typed choreography that produced the dist-capture gap
# (polish-pair round) and carries version literals nowhere: the straight
# lane's version comes FROM app.json; the flip target is an explicit,
# validated argument (the next native cut changes the numbers — nothing
# here goes stale).
#
# Usage: scripts/dual-stage.sh "<message>" <flip-version>
#   e.g. scripts/dual-stage.sh "픽스 설명 (커밋)" 1.0.5
#
# Steps: env-guard → straight publish (current version) → capture dist hash
#        → flip app.json → publish → capture → revert (TRAPPED: the revert
#        runs on ANY exit, error included — a half-flipped tree is the worst
#        outcome and cannot survive this script) → serve-check both lanes →
#        print group ids + per-lane tie verdicts. Exit nonzero on any
#        mismatch or failure, always with a clean tree.
set -euo pipefail

MSG="${1:?usage: dual-stage.sh \"<message>\" <flip-version>}"
FLIP="${2:?usage: dual-stage.sh \"<message>\" <flip-version>}"
PROJ="99f17a15-d9ba-4497-adb2-a25a8ac93c61"

CUR=$(python3 -c "import json;print(json.load(open('app.json'))['expo']['version'])")
[[ "$FLIP" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "✖ flip-version '$FLIP' is not X.Y.Z"; exit 2; }
[[ "$FLIP" != "$CUR" ]] || { echo "✖ flip-version equals current ($CUR) — nothing to mirror"; exit 2; }

# env-guard (standing pre-flight)
grep -q "EXPO_PUBLIC_API_URL=https://freshrun-api.fly.dev" .env.local || { echo "✖ env-guard: staging URL missing"; exit 2; }
! grep -qE "localhost|127\.0\.0\.1|192\.168\." .env.local || { echo "✖ env-guard: local address in .env.local"; exit 2; }
[[ -z "$(git status --porcelain app.json)" ]] || { echo "✖ app.json already dirty — refusing to start"; exit 2; }

BACKUP=$(mktemp)
cp app.json "$BACKUP"
FLIPPED=0
cleanup() {
  if [[ "$FLIPPED" == 1 ]]; then
    cp "$BACKUP" app.json
    echo "↩ app.json restored ($CUR) — tree clean"
  fi
  rm -f "$BACKUP"
}
trap cleanup EXIT

dist_hash() {
  python3 - <<'PY'
import hashlib, base64, glob
d = open(glob.glob('dist/_expo/static/js/ios/entry-*.hbc')[0], 'rb').read()
print(base64.urlsafe_b64encode(hashlib.sha256(d).digest()).rstrip(b'=').decode())
PY
}

publish() { # $1 = message suffix
  npx eas-cli update --channel staging -m "$MSG ($1)" --non-interactive 2>&1 \
    | grep -E "Update group ID" | awk '{print $NF}'
}

serve_hash() { # $1 = runtime
  curl -s "https://u.expo.dev/$PROJ" \
    -H "expo-channel-name: staging" -H "expo-runtime-version: $1" -H "expo-platform: ios" \
    | python3 -c "import sys,json,re;print(json.loads(re.search(r'\{\"id\":.*?\}\s*(?=\r?\n-----)',sys.stdin.read(),re.S).group(0))['launchAsset']['hash'])"
}

echo "── straight publish ($CUR)"
G1=$(publish "$CUR")
H1=$(dist_hash)
echo "   group $G1 · dist $H1"

[[ -z "${DUAL_STAGE_FAIL_AFTER_FLIP:-}" ]] || true  # demo hook (see below)

echo "── flip → $FLIP"
python3 - "$CUR" "$FLIP" <<'PY'
import sys
cur, flip = sys.argv[1], sys.argv[2]
s = open('app.json', encoding='utf-8').read()
needle = '"version": "%s",' % cur
assert s.count(needle) == 1, 'version anchor not unique'
open('app.json', 'w', encoding='utf-8').write(s.replace(needle, '"version": "%s",' % flip, 1))
PY
FLIPPED=1
if [[ -n "${DUAL_STAGE_FAIL_AFTER_FLIP:-}" ]]; then
  echo "✖ induced failure (demo) — trap must restore"; exit 9
fi

echo "── flipped publish ($FLIP)"
G2=$(publish "$FLIP, 플립")
H2=$(dist_hash)
echo "   group $G2 · dist $H2"

cp "$BACKUP" app.json; FLIPPED=0
echo "↩ app.json reverted ($CUR)"

echo "── per-lane serve ties"
S1=$(serve_hash "$CUR"); S2=$(serve_hash "$FLIP")
OK=0
[[ "$S1" == "$H1" ]] && echo "   staging/$CUR: $G1 · TIE MATCH" || { echo "   staging/$CUR: MISMATCH ($S1 vs $H1)"; OK=1; }
[[ "$S2" == "$H2" ]] && echo "   staging/$FLIP: $G2 · TIE MATCH" || { echo "   staging/$FLIP: MISMATCH ($S2 vs $H2)"; OK=1; }
[[ "$H1" == "$H2" ]] && echo "   cross-lane: CONVERGED ($H1)" || echo "   cross-lane: DIVERGED (per-lane basis or same-commit ruling at stamp)"
[[ -z "$(git status --porcelain app.json)" ]] && echo "   tree: clean" || { echo "   tree: DIRTY"; OK=1; }
exit $OK
