#!/usr/bin/env bash
# Gated iOS submission: verify the artifact embeds main.jsbundle, THEN submit.
# Use this instead of bare `eas submit` so a JS-less brick (cf. 1.4.1) can never
# reach App Store Connect.
#
# Usage:
#   ./scripts/submit-ios.sh <eas-build-id> [extra `eas submit` args...]
set -euo pipefail

BUILD_ID="${1:?usage: submit-ios.sh <eas-build-id> [extra eas submit args...]}"
shift || true

HERE="$(cd "$(dirname "$0")" && pwd)"
echo "── Pre-submit gate ──────────────────────────────────────────"
bash "$HERE/verify-ios-jsbundle.sh" --build-id "$BUILD_ID"
echo "─────────────────────────────────────────────────────────────"
echo "Gate passed — submitting build $BUILD_ID to App Store Connect…"
exec eas submit --platform ios --profile production --id "$BUILD_ID" --non-interactive "$@"
