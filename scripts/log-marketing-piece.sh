#!/usr/bin/env bash
# Append a row to the Marketing Log in the Evermind vault under the correct
# ISO-week section. Direct filesystem append — no MCP dependency.
#
# Marketing Log: /Users/Shared/evermind/tormajs evermind/Projects/PocketStubs/Business/Marketing Log.md
#
# Usage:
#   scripts/log-marketing-piece.sh \
#     --date 2026-05-13 \
#     --platform twitter \
#     --format pillar \
#     --pillar "arrival" \
#     --utm-content arrival-positioning \
#     [--reach 0] [--engagement 0] [--clicks 0] [--signups 0] [--notes ""]
#
#   scripts/log-marketing-piece.sh --help
#
# ISO-week math uses macOS date(1):
#   date -j -f "%Y-%m-%d" "2026-05-13" "+%G-W%V"  → "2026-W20"
# The week section header in the log must already exist (e.g., "## Week of 2026-05-11 (W19)").
# If it doesn't, exit 1 with instructions to add it manually.

set -euo pipefail

# --- Anchor to cinetrak repo root regardless of caller's pwd ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

MARKETING_LOG="/Users/Shared/evermind/tormajs evermind/Projects/PocketStubs/Business/Marketing Log.md"

usage() {
  cat <<EOF
Usage: $(basename "$0") --date YYYY-MM-DD --platform <name> --format <name> --pillar <label> --utm-content <value> [options]

Required flags:
  --date YYYY-MM-DD       Date the post went live (ISO format)
  --platform <name>       One of: instagram, tiktok, twitter, reddit, youtube, discord, linkedin, hn
  --format <name>         One of: pillar, thread, reel, short, story, comment, post
  --pillar <label>        Short content theme label (e.g. "arrival", "feature-highlight")
  --utm-content <value>   The utm_content= value used on the link

Optional flags:
  --reach <n>             Impressions / views (default: empty)
  --engagement <n>        Likes + comments + shares sum (default: empty)
  --clicks <n>            Link clicks from Dub.sh / PostHog (default: empty)
  --signups <n>           Attributable signups via UTM (default: empty)
  --notes <text>          Anything unusual (default: empty)
  --help                  Show this message

Example:
  $(basename "$0") \\
    --date 2026-05-13 \\
    --platform twitter \\
    --format pillar \\
    --pillar arrival \\
    --utm-content arrival-positioning \\
    --reach 0 --engagement 0 --notes "First pillar post"

The ISO week is computed from --date and matched against week sections in the log.
Week sections must exist before you can log to them (e.g., "## Week of 2026-05-11 (W19)").

Marketing Log: ${MARKETING_LOG}
EOF
  exit 0
}

# --- Arg defaults ---
DATE=""
PLATFORM=""
FORMAT=""
PILLAR=""
UTM_CONTENT=""
REACH=""
ENGAGEMENT=""
CLICKS=""
SIGNUPS=""
NOTES=""

# --- Parse flags ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --date)         DATE="$2";         shift 2 ;;
    --platform)     PLATFORM="$2";     shift 2 ;;
    --format)       FORMAT="$2";       shift 2 ;;
    --pillar)       PILLAR="$2";       shift 2 ;;
    --utm-content)  UTM_CONTENT="$2";  shift 2 ;;
    --reach)        REACH="$2";        shift 2 ;;
    --engagement)   ENGAGEMENT="$2";   shift 2 ;;
    --clicks)       CLICKS="$2";       shift 2 ;;
    --signups)      SIGNUPS="$2";      shift 2 ;;
    --notes)        NOTES="$2";        shift 2 ;;
    --help|-h)      usage ;;
    *) echo "Unknown flag: $1" >&2; usage ;;
  esac
done

# --- Validate required flags ---
MISSING=()
[[ -z "$DATE"        ]] && MISSING+=("--date")
[[ -z "$PLATFORM"    ]] && MISSING+=("--platform")
[[ -z "$FORMAT"      ]] && MISSING+=("--format")
[[ -z "$PILLAR"      ]] && MISSING+=("--pillar")
[[ -z "$UTM_CONTENT" ]] && MISSING+=("--utm-content")

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "Error: Missing required flags: ${MISSING[*]}" >&2
  echo "" >&2
  usage
fi

# --- Validate date format ---
if [[ ! "$DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "Error: --date must be in YYYY-MM-DD format. Got: ${DATE}" >&2
  exit 1
fi

# --- Compute ISO week from date (macOS date command) ---
ISO_WEEK=$(date -j -f "%Y-%m-%d" "$DATE" "+%G-W%V" 2>/dev/null) || {
  echo "Error: Could not parse date '${DATE}' with macOS date(1)." >&2
  echo "Expected format: YYYY-MM-DD (e.g. 2026-05-13)" >&2
  exit 1
}

# Extract just the week number (e.g. "W19" from "2026-W19")
WEEK_NUM="${ISO_WEEK##*-}"   # e.g. "W19"

# --- Verify Marketing Log exists ---
if [[ ! -f "$MARKETING_LOG" ]]; then
  echo "Error: Marketing Log not found at:" >&2
  echo "  ${MARKETING_LOG}" >&2
  echo "" >&2
  echo "Verify the Evermind vault is mounted and the file exists." >&2
  exit 1
fi

# --- Find the week section header in the log ---
# The log uses headers like: ## Week of 2026-05-11 (W19)
# We search for the section that mentions the ISO week number (e.g. W19).
WEEK_PATTERN="## Week of .*(${WEEK_NUM})"

if ! grep -qE "$WEEK_PATTERN" "$MARKETING_LOG"; then
  cat <<EOF >&2
Error: Week section for ${ISO_WEEK} not found in Marketing Log.

Expected a header matching: ## Week of YYYY-MM-DD (${WEEK_NUM})
in: ${MARKETING_LOG}

Add it manually by appending a new section to the file, e.g.:

## Week of $(date -j -f "%G-W%V" "${ISO_WEEK}" "+%Y-%m-%d" 2>/dev/null || echo "YYYY-MM-DD") (${WEEK_NUM})

| Date | Platform | Format | Topic / Pillar | UTM content | Reach | Engagement | Clicks | Signups | Notes |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | |

**Week summary:**
-

---
EOF
  exit 1
fi

# --- Build the new table row ---
NEW_ROW="| ${DATE} | ${PLATFORM} | ${FORMAT} | ${PILLAR} | ${UTM_CONTENT} | ${REACH} | ${ENGAGEMENT} | ${CLICKS} | ${SIGNUPS} | ${NOTES} |"

# --- Insert the row after the table header row in the correct week section ---
# Strategy:
#   1. Find the line number of the week section header that matches WEEK_NUM
#   2. From there, find the first table separator row (|---|...)
#   3. Insert the new row after that separator row
#   4. Use a Python one-liner for safe in-place file modification (no sed -i gotchas)

python3 - "$MARKETING_LOG" "$WEEK_PATTERN" "$NEW_ROW" <<'PYEOF'
import sys
import re

log_path = sys.argv[1]
week_pattern = sys.argv[2]
new_row = sys.argv[3]

with open(log_path, 'r') as f:
    lines = f.readlines()

# Find the week section
section_start = None
for i, line in enumerate(lines):
    if re.search(week_pattern, line):
        section_start = i
        break

if section_start is None:
    print(f"Error: Week section not found (pattern: {week_pattern})", file=sys.stderr)
    sys.exit(1)

# From section_start, find the first table separator row (|---|...)
separator_idx = None
for i in range(section_start, len(lines)):
    stripped = lines[i].strip()
    # A separator row starts and ends with | and contains only |, -, and spaces
    if re.match(r'^\|[-| ]+\|$', stripped):
        separator_idx = i
        break

if separator_idx is None:
    print(f"Error: Could not find table separator row in week section.", file=sys.stderr)
    sys.exit(1)

# Insert the new row after the separator
insert_at = separator_idx + 1
lines.insert(insert_at, new_row + '\n')

with open(log_path, 'w') as f:
    f.writelines(lines)

print(f"Inserted at line {insert_at + 1} (after separator in {week_pattern!r} section)")
PYEOF

# --- Confirm what was appended ---
echo ""
echo "✅ Appended to Marketing Log (${ISO_WEEK} section):"
echo ""
echo "${NEW_ROW}"
echo ""
echo "File: ${MARKETING_LOG}"
echo ""
echo "Verify the log looks correct:"
echo "  grep -A 5 '${WEEK_NUM}' \"${MARKETING_LOG}\""
