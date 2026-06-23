#!/usr/bin/env bash
# =============================================================================
# PocketStubs build pre-flight gate (EAS, appVersionSource = "local")
#
# Validates the things that have actually broken our builds:
#   - building stale source (local main behind origin)
#   - version drift across app.config.js / Info.plist / widget pbxproj /
#     build.gradle (the #1 footgun — versions live in different files per platform)
#   - a Supabase service-role/secret key leaking into an EXPO_PUBLIC_* var
#   - forgetting the iOS main.jsbundle check / pending DB migrations
#
# Usage:  scripts/preflight-build.sh [ios|android|both]   (default: both)
#         scripts/preflight-build.sh both --full          (also runs tsc/lint/test)
# Exit code is non-zero if any HARD check fails.
# =============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."

PLATFORM="${1:-both}"
FULL=0; [[ "${2:-}" == "--full" || "${1:-}" == "--full" ]] && FULL=1
FAIL=0; WARN=0
ok(){   printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn(){ printf '  \033[33m⚠\033[0m %s\n' "$1"; WARN=$((WARN+1)); }
fail(){ printf '  \033[31m✗\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
hdr(){  printf '\n\033[1m%s\033[0m\n' "$1"; }

printf '\033[1m▶ PocketStubs build preflight (%s)\033[0m\n' "$PLATFORM"

# --- 1. Source freshness ----------------------------------------------------
hdr "[source]"
git fetch -q origin 2>/dev/null || warn "git fetch failed (offline?) — can't confirm freshness"
BRANCH=$(git branch --show-current)
COUNTS=$(git rev-list --left-right --count origin/main...HEAD 2>/dev/null || echo "? ?")
BEHIND=$(echo "$COUNTS" | awk '{print $1}')
[ "$BEHIND" = "0" ] && ok "up to date with origin/main" || fail "behind origin/main by $BEHIND commit(s) — PULL before building (you'd ship stale code)"
[ -z "$(git status --porcelain 2>/dev/null)" ] && ok "clean working tree" || warn "uncommitted changes present (intended for this build?)"
printf '    on branch: %s\n' "$BRANCH"

# --- 2. Native dirs → which version source EAS actually uses ----------------
hdr "[native projects]"
HAS_IOS=0; HAS_ANDROID=0
[ -d ios ]     && { HAS_IOS=1;     ok "ios/ present → Info.plist + widget pbxproj are authoritative (app.config.js iOS version is IGNORED)"; } \
               || warn "no ios/ → EAS prebuilds iOS from app.config.js version/buildNumber"
[ -d android ] && { HAS_ANDROID=1; ok "android/ present → android/app/build.gradle is authoritative"; } \
               || warn "no android/ → EAS uses app.config.js versionCode"

# --- 3. Versions (surface every source side-by-side) ------------------------
hdr "[versions]"
ACFG_VER=$(grep -m1 -E "^\s*version:"   app.config.js | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
ACFG_BUILD=$(grep -m1 -E "buildNumber:" app.config.js | grep -oE '[0-9]+' | head -1)
ACFG_VC=$(grep -m1 -E "versionCode:"    app.config.js | grep -oE '[0-9]+' | head -1)
printf '    app.config.js : version=%s  iOS buildNumber=%s  Android versionCode=%s\n' "$ACFG_VER" "$ACFG_BUILD" "$ACFG_VC"

if [ "$HAS_IOS" = 1 ] && [ "$PLATFORM" != "android" ]; then
  PLIST=$(ls ios/*/Info.plist 2>/dev/null | head -1)
  IOS_VER=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$PLIST" 2>/dev/null)
  IOS_BUILD=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$PLIST" 2>/dev/null)
  PBX=$(ls ios/*.xcodeproj/project.pbxproj 2>/dev/null | head -1)
  MKT_DISTINCT=$(grep -E "MARKETING_VERSION" "$PBX" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | sort -u)
  CPV_DISTINCT=$(grep -E "CURRENT_PROJECT_VERSION" "$PBX" | grep -oE '=[[:space:]]*[0-9]+' | grep -oE '[0-9]+' | sort -u)
  printf '    Info.plist    : version=%s  build=%s\n' "$IOS_VER" "$IOS_BUILD"
  printf '    pbxproj       : MARKETING_VERSION={%s}  CURRENT_PROJECT_VERSION={%s}\n' "$(echo $MKT_DISTINCT | tr '\n' ' ')" "$(echo $CPV_DISTINCT | tr '\n' ' ')"
  # consistency
  [ "$(echo "$MKT_DISTINCT" | wc -l | tr -d ' ')" = "1" ] && [ "$MKT_DISTINCT" = "$IOS_VER" ] \
    && ok "iOS marketing version consistent ($IOS_VER)" \
    || fail "iOS marketing version drift — pbxproj {$(echo $MKT_DISTINCT|tr '\n' ' ')} vs Info.plist $IOS_VER (App Store rejects mismatched app/widget versions)"
  [ "$(echo "$CPV_DISTINCT" | wc -l | tr -d ' ')" = "1" ] && [ "$CPV_DISTINCT" = "$IOS_BUILD" ] \
    && ok "iOS build number consistent ($IOS_BUILD)" \
    || fail "iOS build number drift — pbxproj {$(echo $CPV_DISTINCT|tr '\n' ' ')} vs Info.plist $IOS_BUILD (bump the widget target too)"
  [ "$IOS_VER" = "$ACFG_VER" ] || warn "Info.plist version ($IOS_VER) != app.config.js ($ACFG_VER) — keep them aligned to avoid confusion"
fi

if [ "$HAS_ANDROID" = 1 ] && [ "$PLATFORM" != "ios" ]; then
  GRADLE=android/app/build.gradle
  AND_VC=$(grep -m1 -E "versionCode" "$GRADLE" | grep -oE '[0-9]+' | head -1)
  AND_VN=$(grep -m1 -E "versionName" "$GRADLE" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  printf '    build.gradle  : versionCode=%s  versionName=%s\n' "$AND_VC" "$AND_VN"
  [ "$AND_VN" = "$ACFG_VER" ] || warn "build.gradle versionName ($AND_VN) != app.config.js ($ACFG_VER)"
fi

printf '    \033[33m→ confirm these are INCREMENTED vs the last submitted build before continuing.\033[0m\n'

# --- 4. Public-env secret scan ----------------------------------------------
hdr "[secrets]"
if [ -f scripts/check-public-env.mjs ]; then
  if node scripts/check-public-env.mjs >/dev/null 2>&1; then
    ok "no service-role/secret key in EXPO_PUBLIC_* (run under 'doppler run -c <cfg>' for a real check)"
  else
    fail "service-role/secret key found in an EXPO_PUBLIC_* var — see: node scripts/check-public-env.mjs"
  fi
else
  warn "scripts/check-public-env.mjs missing"
fi

# --- 5. Static checks (optional, --full) ------------------------------------
hdr "[static]"
if [ "$FULL" = 1 ]; then
  npx tsc --noEmit >/dev/null 2>&1 && ok "tsc clean" || fail "tsc errors (run: npx tsc --noEmit)"
  npm run lint >/dev/null 2>&1 && ok "lint clean" || fail "lint errors (run: npm run lint)"
  npm test -- --ci --passWithNoTests >/dev/null 2>&1 && ok "tests pass" || fail "tests failing (run: npm test)"
else
  warn "skipped tsc/lint/test — re-run with --full before a release build"
fi

# --- 6. Reminders (not gated, but don't forget) -----------------------------
hdr "[reminders]"
printf '  • iOS: after build, verify the .ipa embeds main.jsbundle → npm run verify:ios-bundle (P0 splash bug)\n'
printf '  • DB: ensure migrations the build depends on are applied to the TARGET env (e.g. avatar_type/avatar_config on prod)\n'
printf '  • OTA: only bump runtimeVersion when native deps change (JS-only changes ship via eas update)\n'
printf '  • Verify the correct EAS profile/channel + Doppler config for the target.\n'

# --- verdict ----------------------------------------------------------------
hdr "[verdict]"
if [ "$FAIL" -gt 0 ]; then
  printf '\033[31m✗ %d blocking issue(s), %d warning(s) — DO NOT build until resolved.\033[0m\n' "$FAIL" "$WARN"
  exit 1
fi
printf '\033[32m✓ preflight passed\033[0m with %d warning(s). Review warnings, then build.\n' "$WARN"
exit 0
