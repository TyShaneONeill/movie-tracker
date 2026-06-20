#!/usr/bin/env bash
# Provision / refresh the PocketStubs STAGING Supabase project so it mirrors prod.
#
# Run this ONCE after creating the staging project in the Supabase dashboard, and
# again whenever staging drifts (new migrations or new edge functions on main).
#
# What it does (idempotent):
#   1. Links the Supabase CLI to the staging project ref.
#   2. Applies all supabase/migrations/*.sql via `db push`.
#   3. Deploys every edge function to staging.
#   4. Pushes the `stg` Doppler secrets to staging edge functions.
#
# Prereqs:
#   - supabase CLI authenticated (`supabase login`)
#   - doppler CLI authenticated, with an `stg` config that already has the
#     staging Supabase URL/keys + SANDBOX RevenueCat/Stripe keys.
#   - STAGING_REF exported (or passed as $1) = the staging project ref.
#
# Usage:
#   STAGING_REF=abcd... scripts/setup-staging.sh
#   scripts/setup-staging.sh abcd...
#
# SAFETY: this LINKS the CLI to staging. When you're done, re-link prod before
# running any prod-targeted supabase command:
#   supabase link --project-ref wliblwulvsrfgqcnbzeh

set -euo pipefail

STAGING_REF="${1:-${STAGING_REF:-}}"
PROD_REF="wliblwulvsrfgqcnbzeh"

if [[ -z "$STAGING_REF" ]]; then
  echo "ERROR: pass the staging project ref as \$1 or export STAGING_REF." >&2
  exit 1
fi

if [[ "$STAGING_REF" == "$PROD_REF" ]]; then
  echo "ERROR: STAGING_REF equals the PROD ref ($PROD_REF). Refusing to run." >&2
  exit 1
fi

echo "▶ Linking Supabase CLI to STAGING ($STAGING_REF)…"
supabase link --project-ref "$STAGING_REF"

# The baseline migration (20260525063629_remote_schema.sql) is a prod schema
# snapshot whose webhook triggers reference supabase_functions.http_request and
# hardcode the PROD functions URL. On a fresh project that schema doesn't exist
# (it's created by enabling Database Webhooks), so db push fails. We install an
# INERT stub instead: the triggers get created but do nothing — staging never
# calls prod functions. Guarded so it never clobbers a real http_request.
echo "▶ Installing inert supabase_functions.http_request stub (staging isolation)…"
supabase db query --linked "create schema if not exists supabase_functions; do \$\$ begin if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='supabase_functions' and p.proname='http_request') then create function supabase_functions.http_request() returns trigger language plpgsql as \$f\$ begin return null; end; \$f\$; end if; end \$\$;"

echo "▶ Applying migrations to staging…"
echo "y" | supabase db push

echo "▶ Deploying all edge functions to staging…"
# `functions deploy` with no name deploys every function in supabase/functions
# (honoring per-function verify_jwt from config.toml).
# NOTE: some edge functions are NOT in source control and live only on prod
# (known: discover-movies, get-movie-lists, get-movie-details, search-movies).
# Pull them from prod before deploying so staging has them:
#   for fn in discover-movies get-movie-lists get-movie-details search-movies; do
#     supabase functions download "$fn" --project-ref wliblwulvsrfgqcnbzeh
#   done
# (Better fix: commit these to supabase/functions/ — see the risk note.)
supabase functions deploy --project-ref "$STAGING_REF"

echo "▶ Syncing staging secrets (Doppler stg → Supabase)…"
# Requires the supabase CLI to be linked to staging (done above).
scripts/sync-supabase-secrets.sh stg

cat <<EOF

✅ Staging is provisioned.

Next:
  - Seed a test auth user (dashboard → Authentication → Add user, or sign up in a
    staging build) and confirm onboarding_completed=false for it.
  - IMPORTANT: re-link prod before any prod command:
      supabase link --project-ref $PROD_REF
EOF
