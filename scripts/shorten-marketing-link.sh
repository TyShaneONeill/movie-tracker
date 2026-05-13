#!/usr/bin/env bash
# Shorten a long UTM-tagged URL using the Dub.sh API.
# Returns the short URL on stdout — suitable for piping into other commands.
#
# Usage:
#   scripts/shorten-marketing-link.sh <long-url>
#   scripts/shorten-marketing-link.sh --help
#
# Examples:
#   ./scripts/shorten-marketing-link.sh "https://pocketstubs.com/?utm_source=twitter&utm_medium=social&utm_campaign=w19-arrival&utm_content=arrival-positioning"
#   SHORT=$(doppler run -- ./scripts/shorten-marketing-link.sh "$LONG_URL")
#
# Prereqs:
#   - DUB_API_TOKEN in env. Not yet in Doppler — add it:
#       doppler secrets set DUB_API_TOKEN --project pocketstubs --config dev
#     Token: sign up at https://dub.sh, generate at https://app.dub.co/settings/tokens
#   - curl + jq on PATH
#
# Notes:
#   - Dub.sh deduplicates identical URLs by default — safe to run multiple times.
#   - Default domain is dub.sh. Configure pocketstubs.com as a custom domain in
#     the Dub.sh dashboard to get pocketstubs.com/xyz links instead.
#   - API docs: https://dub.co/docs/api-reference/endpoint/create-a-link

set -euo pipefail

# --- Anchor to cinetrak repo root regardless of caller's pwd ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

DUB_API="https://api.dub.co/links"

usage() {
  cat <<EOF
Usage: $(basename "$0") <long-url>

Shortens a UTM-tagged URL via the Dub.sh API.
Prints the short URL to stdout (one line, no decoration — pipe-friendly).

Arguments:
  <long-url>   The full URL to shorten. Must start with http:// or https://.

Examples:
  $(basename "$0") "https://pocketstubs.com/?utm_source=twitter&utm_medium=social&utm_campaign=w19"
  SHORT=\$(doppler run -- $(basename "$0") "\$LONG_URL")
  echo "Short link: \$SHORT"

Prereqs:
  DUB_API_TOKEN must be in env. It is Doppler-managed for pocketstubs:
    doppler run -- $(basename "$0") <url>

  If the token is not yet in Doppler, add it:
    doppler secrets set DUB_API_TOKEN --project pocketstubs --config dev
  Get a token at: https://app.dub.co/settings/tokens

API docs: https://dub.co/docs/api-reference/endpoint/create-a-link
EOF
}
# Note: usage() does not call exit — callers control the exit code.
# --help path exits 0; error paths exit 1.

# --- Parse args ---
if [[ $# -lt 1 ]]; then
  echo "Error: missing required argument <long-url>" >&2
  usage >&2
  exit 1
fi
case "$1" in
  --help|-h) usage; exit 0 ;;
esac

LONG_URL="$1"

# --- Validate URL format ---
if [[ ! "$LONG_URL" =~ ^https?:// ]]; then
  echo "Error: URL must start with http:// or https://" >&2
  echo "Got: ${LONG_URL}" >&2
  exit 1
fi

# --- Verify prereq binaries ---
for bin in curl jq; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "Error: Missing required binary: $bin" >&2
    exit 1
  fi
done

# --- Token check ---
if [[ -z "${DUB_API_TOKEN:-}" ]]; then
  cat <<EOF >&2
MISSING TOKEN: DUB_API_TOKEN is not set.

Sign up at https://dub.sh, then generate a token at:
  https://app.dub.co/settings/tokens

Add to Doppler:
  doppler secrets set DUB_API_TOKEN --project pocketstubs --config dev

Then re-run via:
  doppler run -- ./scripts/shorten-marketing-link.sh "${LONG_URL}"
EOF
  exit 1
fi

# --- Call Dub.sh API ---
PAYLOAD=$(jq -n --arg url "$LONG_URL" '{"url": $url}')

RESP_FILE=$(mktemp -t dub-resp.XXXXXX)
trap "rm -f $RESP_FILE" EXIT

HTTP_CODE=$(curl -sS -o "$RESP_FILE" -w "%{http_code}" \
  -X POST "$DUB_API" \
  -H "Authorization: Bearer ${DUB_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary "$PAYLOAD")

# Dub returns 200 (existing) or 201 (created) on success
if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "201" ]]; then
  SHORT_URL=$(jq -r '.shortLink // .shortUrl // .short_link // empty' "$RESP_FILE")
  if [[ -z "$SHORT_URL" ]]; then
    echo "Error: Could not parse short URL from API response." >&2
    echo "Response body:" >&2
    cat "$RESP_FILE" >&2
    exit 1
  fi
  printf '%s\n' "$SHORT_URL"
  exit 0
fi

echo "Error: Dub.sh API returned HTTP ${HTTP_CODE}" >&2
cat "$RESP_FILE" >&2
echo "" >&2
exit 1
