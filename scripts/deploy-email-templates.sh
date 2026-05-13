#!/usr/bin/env bash
# Deploy committed email templates from email_templates/*.html to the Supabase
# project's auth email config via the Management API.
#
# Eliminates drift between the repo and the Supabase dashboard. Templates in the
# dashboard are authoritative for the auth mailer; this script makes the repo
# the source of truth.
#
# Usage:
#   scripts/deploy-email-templates.sh             # dry-run (default)
#   scripts/deploy-email-templates.sh --dry-run   # explicit dry-run
#   scripts/deploy-email-templates.sh --apply     # push to Supabase (prod gate)
#   scripts/deploy-email-templates.sh --help      # show usage
#
# Prereqs:
#   - SUPABASE_MANAGEMENT_TOKEN set in env (from Doppler, see below)
#   - curl + jq on PATH
#
# Add the token to Doppler if missing:
#   doppler secrets set SUPABASE_MANAGEMENT_TOKEN --project pocketstubs --config dev
# Token is created at https://supabase.com/dashboard/account/tokens
#
# Templates pushed:
#   confirmation.html  → mailer_subjects_confirmation + mailer_templates_confirmation_content
#   reset_password.html → mailer_subjects_recovery + mailer_templates_recovery_content
#
# Each template HTML starts with an HTML comment of the form
#   <!--
#   SUBJECT: ...
#   -->
# which is parsed and pushed as the mailer subject. The full file (including the
# comment) is pushed as the body — Supabase strips HTML comments before render.
#
# Docs: https://supabase.com/docs/reference/api/v1-update-auth-service-config
#
# Smoke tests (manual, no live API hit):
#   unset SUPABASE_MANAGEMENT_TOKEN && ./scripts/deploy-email-templates.sh
#     → exits 1 with "MISSING TOKEN" + doppler-set instructions
#   SUPABASE_MANAGEMENT_TOKEN=placeholder ./scripts/deploy-email-templates.sh
#     → prints dry-run preview (template names, subjects, body byte counts)
#   ./scripts/deploy-email-templates.sh --help
#     → prints usage

set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT_REF="wliblwulvsrfgqcnbzeh"
TEMPLATES_DIR="email_templates"
API_BASE="https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth"

MODE="dry-run"

usage() {
  cat <<EOF
Usage: $0 [--dry-run | --apply | --help]

  (no flags)   Dry-run: preview what would be pushed. Default.
  --dry-run    Same as no flags.
  --apply      Push templates to Supabase (prompts for confirmation).
  --help       Show this message.

Reads SUPABASE_MANAGEMENT_TOKEN from env. If missing, prints the doppler
command to set it.

Templates deployed from ${TEMPLATES_DIR}/:
  - confirmation.html    (mailer_subjects_confirmation + ..._content)
  - reset_password.html  (mailer_subjects_recovery + ..._content)

Project ref: ${PROJECT_REF}
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) MODE="dry-run"; shift ;;
    --apply)   MODE="apply";   shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown flag: $1" >&2; usage >&2; exit 1 ;;
  esac
done

# Verify prereq binaries
for bin in curl jq; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "❌ Missing required binary: $bin" >&2
    exit 1
  fi
done

# Token check
if [[ -z "${SUPABASE_MANAGEMENT_TOKEN:-}" ]]; then
  cat <<EOF >&2
❌ MISSING TOKEN: SUPABASE_MANAGEMENT_TOKEN is not set.

Create one at https://supabase.com/dashboard/account/tokens, then add to Doppler:

  doppler secrets set SUPABASE_MANAGEMENT_TOKEN --project pocketstubs --config dev

And re-run via:

  doppler run -- ./scripts/deploy-email-templates.sh ${MODE:+--$MODE}
EOF
  exit 1
fi

# Templates to push: filename:subject_field:body_field
TEMPLATES=(
  "confirmation.html:mailer_subjects_confirmation:mailer_templates_confirmation_content"
  "reset_password.html:mailer_subjects_recovery:mailer_templates_recovery_content"
)

# Parse `SUBJECT: ...` from the leading HTML comment block of a template.
extract_subject() {
  local file="$1"
  local subject
  subject=$(awk '
    /^<!--/ { in_comment=1; next }
    /-->/ { if (in_comment) exit }
    in_comment && /^[[:space:]]*SUBJECT:/ {
      sub(/^[[:space:]]*SUBJECT:[[:space:]]*/, "")
      print
      exit
    }
  ' "$file")
  if [[ -z "$subject" ]]; then
    echo "❌ Could not parse SUBJECT from $file (expected leading <!-- SUBJECT: ... --> block)" >&2
    exit 1
  fi
  printf '%s' "$subject"
}

# Preview
echo "Project ref: ${PROJECT_REF}"
if [[ "$MODE" == "dry-run" ]]; then
  echo "🔎 Dry run — no API calls will be made."
else
  echo "🚀 Apply mode — will PATCH ${API_BASE}"
fi
echo ""

# Build JSON payload via jq (handles HTML escaping correctly).
PAYLOAD=$(jq -n '{}')

for entry in "${TEMPLATES[@]}"; do
  IFS=':' read -r filename subject_field body_field <<< "$entry"
  path="${TEMPLATES_DIR}/${filename}"
  if [[ ! -f "$path" ]]; then
    echo "❌ Template not found: $path" >&2
    exit 1
  fi

  subject=$(extract_subject "$path")
  body_bytes=$(wc -c < "$path" | tr -d ' ')

  echo "→ ${filename}"
  echo "    subject: ${subject}"
  echo "    body:    ${body_bytes} bytes"
  echo "    target:  ${subject_field} + ${body_field}"
  echo ""

  PAYLOAD=$(jq \
    --arg sf "$subject_field" --arg s "$subject" \
    --arg bf "$body_field"    --rawfile b "$path" \
    '.[$sf] = $s | .[$bf] = $b' \
    <<< "$PAYLOAD")
done

if [[ "$MODE" == "dry-run" ]]; then
  echo "To push for real: ./scripts/deploy-email-templates.sh --apply"
  exit 0
fi

# Apply mode — prod gate
read -p "⚠️  Pushing to PRODUCTION Supabase auth config. Type 'yes' to continue: " confirm
[[ "$confirm" == "yes" ]] || { echo "Aborted."; exit 1; }

echo ""
echo "Pushing templates..."
RESP=$(mktemp)
trap "rm -f $RESP" EXIT

HTTP_CODE=$(curl -sS -o "$RESP" -w "%{http_code}" \
  -X PATCH "$API_BASE" \
  -H "Authorization: Bearer ${SUPABASE_MANAGEMENT_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary "@-" <<< "$PAYLOAD")

if [[ "$HTTP_CODE" =~ ^2 ]]; then
  echo "✅ Pushed. (HTTP $HTTP_CODE)"
  echo "Verify in dashboard: https://supabase.com/dashboard/project/${PROJECT_REF}/auth/templates"
  exit 0
fi

echo "❌ Push failed (HTTP $HTTP_CODE). Response:" >&2
cat "$RESP" >&2
echo "" >&2
exit 1
