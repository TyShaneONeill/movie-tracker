#!/usr/bin/env bash
# Sync secrets from Doppler → EAS environment variables (modern eas env API).
# Phase 3a of the Doppler migration. See Workflows/Secrets Management.md.
#
# Usage:
#   scripts/sync-eas-secrets.sh dev
#   scripts/sync-eas-secrets.sh prd
#
# Maps Doppler config → EAS environment:
#   dev → development
#   stg → preview
#   prd → production
#
# Strategy: idempotent delete-then-create. Delete is silent if var doesn't
# exist; create with --visibility sensitive obfuscates the value in build logs.
#
# Prereqs:
#   - doppler CLI authenticated and bound to cinetrak project
#   - eas-cli authenticated (eas login) with access to the pocketstubs project
#   - Run from worktree root (eas reads app.json/eas.json for project linking)

set -euo pipefail

CONFIG="${1:-}"
if [[ -z "$CONFIG" ]]; then
  echo "Usage: $0 <dev|prd>" >&2
  exit 1
fi

case "$CONFIG" in
  dev) EAS_ENV="development" ;;
  stg) EAS_ENV="preview" ;;
  prd) EAS_ENV="production" ;;
  *) echo "Unknown config: $CONFIG (expected dev|stg|prd)"; exit 1 ;;
esac

if [[ "$CONFIG" == "prd" ]]; then
  read -p "⚠️  Pushing to EAS PRODUCTION env vars. Type 'yes' to continue: " confirm
  [[ "$confirm" == "yes" ]] || { echo "Aborted."; exit 1; }
fi

EAS_KEYS=(
  EXPO_PUBLIC_SUPABASE_URL
  EXPO_PUBLIC_SUPABASE_ANON_KEY
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  EXPO_PUBLIC_SENTRY_DSN
  EXPO_PUBLIC_POSTHOG_API_KEY
  EXPO_PUBLIC_POSTHOG_HOST
  EXPO_PUBLIC_DISCORD_MODERATION_WEBHOOK
  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
  EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY
  EXPO_PUBLIC_REVENUECAT_WEB_API_KEY
  TMDB_API_KEY
  TMDB_READ_ACCESS_TOKEN
  SENTRY_AUTH_TOKEN
  EXPO_ACCESS_TOKEN
)

PUSHED=0
SKIPPED=0
ERR=$(mktemp)
trap "rm -f $ERR" EXIT

echo "→ Pushing to EAS environment: $EAS_ENV"
echo ""

for key in "${EAS_KEYS[@]}"; do
  value=$(doppler secrets get "$key" --plain --config "$CONFIG" 2>/dev/null || echo "")
  if [[ -z "$value" ]]; then
    echo "  ⏭  $key not in Doppler $CONFIG — skipped"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # EAS rule: EXPO_PUBLIC_* vars can't be marked 'secret' because they end up
  # plaintext in the JS bundle anyway. Use 'sensitive' for those (still
  # obfuscates them in EAS logs/dashboard), and 'secret' for everything else
  # (truly server-side keys never readable outside EAS).
  if [[ "$key" == EXPO_PUBLIC_* ]]; then
    VIZ="sensitive"
  else
    VIZ="secret"
  fi

  if output=$(eas env:create \
       --name "$key" \
       --value "$value" \
       --environment "$EAS_ENV" \
       --visibility "$VIZ" \
       --force \
       --non-interactive 2>&1); then
    echo "  ✅ $key ($VIZ)"
    PUSHED=$((PUSHED + 1))
  elif echo "$output" | grep -q "cannot change a secret variable"; then
    # Existing var is at 'secret' visibility; EAS won't downgrade. Retry as secret.
    if output2=$(eas env:create \
         --name "$key" \
         --value "$value" \
         --environment "$EAS_ENV" \
         --visibility secret \
         --force \
         --non-interactive 2>&1); then
      echo "  ✅ $key (kept existing 'secret' visibility — manual reset needed in EAS dashboard if you want it 'sensitive')"
      PUSHED=$((PUSHED + 1))
    else
      echo "  ❌ $key — fallback also failed:"
      echo "$output2" | sed 's/^/      /'
      exit 1
    fi
  else
    echo "  ❌ $key — full output:"
    echo "$output" | sed 's/^/      /'
    exit 1
  fi
done

echo ""
echo "Pushed $PUSHED keys, skipped $SKIPPED. Environment: $EAS_ENV"
echo "Verify with: eas env:list --environment $EAS_ENV"
