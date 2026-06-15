#!/usr/bin/env bash
# Release guard: fail hard if a built iOS artifact has no embedded main.jsbundle.
#
# Why: iOS 1.4.1 shipped to the App Store as a brick — the .ipa had NO
# main.jsbundle, so there was no JS to run and the app hung forever on the logo
# splash. Root cause was a stale local ios/ dir dropping the embedded bundle on
# EAS. (RCA: vault "2026-06-10 iOS 1.4.1 infinite splash - missing JS bundle".)
# This gate makes that failure mode un-shippable.
#
# Usage:
#   ./scripts/verify-ios-jsbundle.sh <path.ipa>        # check a local .ipa
#   ./scripts/verify-ios-jsbundle.sh --build-id <id>   # download an EAS build + check
#   (auto) runs as the EAS `eas-build-on-success` hook on the build worker —
#          inspects the freshly built .app and logs the bundle size on every build.
#
# The known-good 1.4.0/1.4.2 bundle is ~7.6 MB; anything under JSBUNDLE_FLOOR_BYTES
# (default ~1 MB) is treated as missing/empty. Note: EXUpdates.bundle/app.manifest
# `launchAsset: {}` is NORMAL (the good build has it too) — gate on the bundle
# FILE, not the manifest field.
set -euo pipefail

FLOOR_BYTES="${JSBUNDLE_FLOOR_BYTES:-1000000}"   # ~1 MB

fail() { echo "❌ iOS jsbundle gate FAILED: $1" >&2; exit 1; }

size_of() {
  # macOS (BSD stat) vs Linux/EAS worker (GNU stat)
  stat -f%z "$1" 2>/dev/null || stat -c%s "$1"
}

# Find + validate main.jsbundle under a directory that contains a *.app bundle
# (an extracted ipa's Payload/, or the Xcode build products dir on the worker).
check_app_dir() {
  local root="$1"
  local bundle
  bundle="$(find "$root" -path '*.app/main.jsbundle' -type f -print -quit 2>/dev/null || true)"
  [ -n "$bundle" ] || fail "no main.jsbundle found under '$root' — the build has no JS to run (App Store brick)."
  local sz
  sz="$(size_of "$bundle")"
  echo "✓ main.jsbundle: ${bundle#"$root"/} (${sz} bytes)"
  [ "$sz" -ge "$FLOOR_BYTES" ] || fail "main.jsbundle is ${sz} bytes (< ${FLOOR_BYTES} floor) — suspiciously small/empty."
  echo "✅ iOS jsbundle gate PASSED (floor ${FLOOR_BYTES} bytes)."
}

check_ipa() {
  local ipa="$1"
  [ -f "$ipa" ] || fail "ipa not found: $ipa"
  local tmp; tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  unzip -q "$ipa" 'Payload/*' -d "$tmp" || fail "could not unzip $ipa"
  check_app_dir "$tmp/Payload"
}

# --- Mode 1: EAS build worker (eas-build-on-success hook) -------------------
if [ "${EAS_BUILD:-}" = "true" ] || [ -n "${EAS_BUILD_WORKINGDIR:-}" ]; then
  if [ "${EAS_BUILD_PLATFORM:-}" != "ios" ]; then
    echo "↷ ${EAS_BUILD_PLATFORM:-non-ios} build — iOS jsbundle gate not applicable."
    exit 0
  fi
  echo "iOS jsbundle gate (eas-build-on-success): inspecting built .app…"
  check_app_dir "${EAS_BUILD_WORKINGDIR:-.}/ios"
  exit 0
fi

# --- Mode 2: explicit .ipa path --------------------------------------------
case "${1:-}" in
  *.ipa) check_ipa "$1"; exit 0 ;;
esac

# --- Mode 3: EAS build id (download artifact, then check) -------------------
if [ "${1:-}" = "--build-id" ] && [ -n "${2:-}" ]; then
  echo "Resolving EAS build $2…"
  url="$(eas build:view "$2" --json | python3 -c "import sys,json;print(json.load(sys.stdin)['artifacts']['applicationArchiveUrl'])")"
  [ -n "$url" ] || fail "could not resolve applicationArchiveUrl for build $2"
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  echo "Downloading artifact…"
  curl -sL "$url" -o "$tmp/app.ipa" || fail "artifact download failed"
  check_ipa "$tmp/app.ipa"
  exit 0
fi

cat >&2 <<'USAGE'
usage:
  scripts/verify-ios-jsbundle.sh <path.ipa>        # check a local .ipa
  scripts/verify-ios-jsbundle.sh --build-id <id>   # download an EAS build + check
  (auto: runs as an EAS eas-build-on-success hook on the build worker)
USAGE
exit 2
