#!/usr/bin/env bash
# =============================================================================
# Release version-bump gate (CI, appVersionSource = "local")
#
# Fails the build if app.config.js's build/version number is NOT strictly greater
# than the highest already-submitted git tag for the platform. Prevents burning a
# full build+submit cycle on a non-incrementing version (Apple/Google reject it),
# and — paired with the tag-on-submit step in app-store-submit.yml — gives the repo
# the release history it otherwise lacks.
#
# Tags are shaped:  ios-<buildNumber>   android-<versionCode>   (e.g. ios-32, android-55)
# Self-bootstrapping: with no prior tag for the platform, the current value is
# accepted (first tracked release).
#
# Usage:  scripts/verify-version-bump.sh <ios|android>
# Exit:   0 = OK to build, 1 = not incremented / unreadable, 2 = bad usage
# =============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."

PLATFORM="${1:?usage: verify-version-bump.sh <ios|android>}"

# Read a numeric field from app.config.js the same way preflight-build.sh does.
cfg_num() { grep -m1 -E "$1:" app.config.js | grep -oE '[0-9]+' | head -1; }

case "$PLATFORM" in
  ios)     PREFIX="ios";     CURRENT="$(cfg_num 'buildNumber')";  LABEL="iOS buildNumber" ;;
  android) PREFIX="android"; CURRENT="$(cfg_num 'versionCode')";  LABEL="Android versionCode" ;;
  *) echo "❌ unknown platform '$PLATFORM' (expected ios|android)" >&2; exit 2 ;;
esac

[ -n "$CURRENT" ] || { echo "❌ could not read $LABEL from app.config.js" >&2; exit 1; }

# Highest existing tag number for this platform.
LATEST="$(git tag --list "${PREFIX}-*" \
  | sed -E "s/^${PREFIX}-//" \
  | grep -E '^[0-9]+$' \
  | sort -n | tail -1)"

if [ -z "$LATEST" ]; then
  echo "✓ no prior ${PREFIX}-* tag — first tracked release. $LABEL=$CURRENT accepted."
  exit 0
fi

if [ "$CURRENT" -gt "$LATEST" ]; then
  echo "✅ $LABEL $CURRENT > last submitted $LATEST — OK to build."
  exit 0
fi

cat >&2 <<EOF
❌ RELEASE GATE FAILED: $LABEL is $CURRENT, but the last submitted build (${PREFIX}-${LATEST}) was $LATEST.
   A non-incrementing build is rejected by the store. Bump $LABEL in app.config.js to > $LATEST
   (remember: appVersionSource="local", so app.config.js is authoritative for clean CI prebuilds).
EOF
exit 1
