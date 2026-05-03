#!/usr/bin/env bash
# Sync secrets from Doppler → Supabase edge function secrets.
# Phase 3 of the Doppler migration. See Workflows/Secrets Management.md.
#
# Usage:
#   scripts/sync-supabase-secrets.sh dev
#   scripts/sync-supabase-secrets.sh prd
#
# Prereqs:
#   - doppler CLI authenticated (doppler login)
#   - supabase CLI linked to the right project
#   - DOPPLER_PROJECT set in env, or `doppler setup` already run in this dir
#
# Notes:
#   - Only EDGE_* prefixed secrets are pushed to Supabase. Doppler holds
#     everything; Supabase only needs server-side keys for edge functions.
#   - Adjust the grep filter below if a new edge function needs new env vars.

set -euo pipefail

CONFIG="${1:-}"
if [[ -z "$CONFIG" ]]; then
  echo "Usage: $0 <dev|stg|prd>" >&2
  exit 1
fi

if [[ "$CONFIG" == "prd" ]]; then
  read -p "⚠️  Pushing to PRODUCTION Supabase. Type 'yes' to continue: " confirm
  [[ "$confirm" == "yes" ]] || { echo "Aborted."; exit 1; }
fi

TMPFILE=$(mktemp)
trap "rm -f $TMPFILE" EXIT

doppler secrets download --no-file --format env --config "$CONFIG" \
  | grep -E '^(TMDB_|OMDB_|SENTRY_|REVENUECAT_|GEMINI_|EXPO_ACCESS_TOKEN|DISCORD_)' \
  > "$TMPFILE"

LINE_COUNT=$(wc -l < "$TMPFILE" | tr -d ' ')
echo "Pushing $LINE_COUNT secrets to Supabase ($CONFIG)..."

supabase secrets set --env-file "$TMPFILE"

echo "✅ Done. Verify with: supabase secrets list"
