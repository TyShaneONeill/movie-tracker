#!/usr/bin/env bash
# C2 — Film Anniversary Post
# Queries TMDB for films with a milestone-year anniversary today, picks the
# highest vote_count qualifying film, downloads 1 poster + 3 backdrops,
# generates 3 IG caption variants (1 templated + 2 Gemini PocketStubs-voice),
# writes vault note to approval queue, pings Discord.
#
# Usage:
#   ./scripts/anniversary-post.sh                    # today
#   ./scripts/anniversary-post.sh --date 2026-06-25  # specific date (testing)
#   ./scripts/anniversary-post.sh --dry-run          # don't write/post; just print
#   ./scripts/anniversary-post.sh --force            # overwrite existing vault note
#   ./scripts/anniversary-post.sh --help
#
# Env overrides:
#   ANNIVERSARY_VOTE_COUNT_MIN  — default 500
#   ANNIVERSARY_MILESTONES      — space-separated, default "10 15 20 25 30 40 50 60 70 75 80 90 100"
#
# Spec: docs/superpowers/specs/2026-05-14-anniversary-post-design.md

set -euo pipefail

# --- Anchor to cinetrak repo root ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# --- Constants ---
VAULT_QUEUE_DIR="/Users/Shared/evermind/tormajs evermind/Projects/PocketStubs/Business/Marketing Sprints/Queue"
TMDB_BASE="https://api.themoviedb.org/3"
TMDB_IMG_BASE="https://image.tmdb.org/t/p"
GEMINI_BASE="https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

VOTE_COUNT_MIN=${ANNIVERSARY_VOTE_COUNT_MIN:-500}
DEFAULT_MILESTONES="10 15 20 25 30 40 50 60 70 75 80 90 100"
# Read env override into a space-separated list; expanded into MILESTONE_YEARS array below.
MILESTONES_RAW="${ANNIVERSARY_MILESTONES:-$DEFAULT_MILESTONES}"
read -r -a MILESTONE_YEARS <<<"$MILESTONES_RAW"

# --- Default flags ---
DRY_RUN=false
FORCE=false
DATE_OVERRIDE=""
GEMINI_FAILED=false
# Temp file used as a signal flag — bash subshells (command substitution) can't
# mutate parent-shell variables, so call_gemini() touches this file on fallback.
GEMINI_FAILED_FLAG="$(mktemp -t anniv-gemini-failed.XXXXXX)"

usage() {
  cat <<USAGE
Usage: $(basename "$0") [--date YYYY-MM-DD] [--dry-run] [--force] [--help]

  --date YYYY-MM-DD   Use a specific date instead of today (for testing)
  --dry-run           Print what would happen; don't write vault note or ping Discord
  --force             Overwrite existing vault note for the date
  --help              Show this message

Generates a daily Letterboxd-style film anniversary post:
- Iterates milestone years (${MILESTONE_YEARS[*]}); for each, queries TMDB
  /discover/movie with primary_release_date == (TARGET_YEAR - milestone)-MM-DD
- Picks the highest vote_count film with vote_count > $VOTE_COUNT_MIN
- Downloads 1 poster + 3 backdrops to ~/Downloads/anniversary-post-<DATE>/
- Drafts 3 caption variants (Letterboxd-mimic + 2 Gemini PocketStubs-voice)
- Writes vault note to "$VAULT_QUEUE_DIR/<DATE>-anniversary-<film-slug>.md"
- Pings Discord webhook with status + film + 3 captions inline

Env overrides:
  ANNIVERSARY_VOTE_COUNT_MIN  — default 500
  ANNIVERSARY_MILESTONES      — default "$DEFAULT_MILESTONES"

Spec: docs/superpowers/specs/2026-05-14-anniversary-post-design.md
USAGE
}

# --- Parse args ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --date) DATE_OVERRIDE="${2:?--date requires YYYY-MM-DD value}"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --force) FORCE=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Error: Unknown argument: $1" >&2; usage >&2; exit 1 ;;
  esac
done

# --- Compute date ---
if [[ -n "$DATE_OVERRIDE" ]]; then
  if ! date -j -f "%Y-%m-%d" "$DATE_OVERRIDE" "+%Y-%m-%d" >/dev/null 2>&1; then
    echo "Error: --date must be YYYY-MM-DD format. Got: $DATE_OVERRIDE" >&2
    exit 1
  fi
  TARGET_DATE="$DATE_OVERRIDE"
else
  TARGET_DATE="$(date "+%Y-%m-%d")"
fi
TARGET_YEAR=$(date -j -f "%Y-%m-%d" "$TARGET_DATE" "+%Y")
TARGET_MM_DD="$(date -j -f "%Y-%m-%d" "$TARGET_DATE" "+%m-%d")"

# --- SIGINT trap: cleanup partial download dir ---
DOWNLOAD_DIR="$HOME/Downloads/anniversary-post-$TARGET_DATE"
cleanup_hint() {
  echo "" >&2
  echo "Interrupted. To clean up partial state and retry:" >&2
  echo "  rm -rf \"$DOWNLOAD_DIR\"" >&2
  exit 130
}
trap cleanup_hint INT

# --- Prereq checks ---
check_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Error: '$1' not found on PATH. $2" >&2
    exit 1
  }
}
check_cmd curl "Install with: brew install curl"
check_cmd jq "Install with: brew install jq"
check_cmd python3 "Install with: brew install python3"
check_cmd doppler "Install with: brew install dopplerhq/cli/doppler"

# --- Verify required secrets ---
check_secret() {
  local var="$1"
  local hint="$2"
  if [[ -z "${!var:-}" ]]; then
    echo "Error: \$$var is not set." >&2
    echo "  $hint" >&2
    exit 1
  fi
}
check_secret TMDB_READ_ACCESS_TOKEN "Add via: doppler secrets set TMDB_READ_ACCESS_TOKEN --project pocketstubs --config dev"
check_secret GEMINI_API_KEY "Add via: doppler secrets set GEMINI_API_KEY --project pocketstubs --config dev"
check_secret DISCORD_METRICS_WEBHOOK_URL "Add via: doppler secrets set DISCORD_METRICS_WEBHOOK_URL --project pocketstubs --config dev"

echo "Target date: $TARGET_DATE (MM-DD: $TARGET_MM_DD, year: $TARGET_YEAR)"
echo "Milestones: ${MILESTONE_YEARS[*]}"
echo "Vote-count min: $VOTE_COUNT_MIN"
echo "Dry-run: $DRY_RUN | Force: $FORCE"
echo ""

# --- Early idempotency check (before any API calls) ---
# Use bash nullglob (whitespace-safe; ls-parsing is fragile with spaces in the vault path).
shopt -s nullglob
EXISTING_NOTES=("$VAULT_QUEUE_DIR/$TARGET_DATE-anniversary-"*.md)
shopt -u nullglob
if [[ ${#EXISTING_NOTES[@]} -gt 0 && "$FORCE" != "true" ]]; then
  echo "ℹ️ Vault note already exists for $TARGET_DATE: ${EXISTING_NOTES[0]}"
  echo "   Use --force to regenerate."
  exit 0
fi

# --- Temp-file accumulator + cleanup ---
TEMP_FILES=("$GEMINI_FAILED_FLAG")
trap '[[ ${#TEMP_FILES[@]} -gt 0 ]] && rm -f "${TEMP_FILES[@]}"' EXIT

# --- Discord ping helpers ---
send_discord() {
  local msg="$1"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [DRY RUN] Would send Discord: $msg"
    return 0
  fi
  curl -sS --connect-timeout 10 --max-time 30 -X POST -H "Content-Type: application/json" \
    -d "$(jq -n --arg c "$msg" '{content: $c}')" \
    "$DISCORD_METRICS_WEBHOOK_URL" >/dev/null || true
}

send_error_and_exit() {
  local reason="$1"
  echo "Error: $reason" >&2
  send_discord "⚠️ Anniversary post ERRORED: $reason. Date: $TARGET_DATE."
  exit 1
}

# --- Step A: Iterate milestone years, accumulate candidates ---
echo "Querying TMDB across milestone years..."

CANDIDATES_JSON="$(mktemp -t anniv-cand.XXXXXX.json)"
TEMP_FILES+=("$CANDIDATES_JSON")
echo "[]" > "$CANDIDATES_JSON"

TMDB_FAILS=0
TMDB_ATTEMPTS=0

for Y in "${MILESTONE_YEARS[@]}"; do
  RELEASE_YEAR=$((TARGET_YEAR - Y))
  RELEASE_DATE="$RELEASE_YEAR-$TARGET_MM_DD"
  TMDB_ATTEMPTS=$((TMDB_ATTEMPTS + 1))

  DISC_RESP="$(mktemp -t anniv-disc.XXXXXX.json)"
  TEMP_FILES+=("$DISC_RESP")

  HTTP_CODE=$(curl -sS --connect-timeout 10 --max-time 30 -o "$DISC_RESP" -w "%{http_code}" \
    -H "Authorization: Bearer $TMDB_READ_ACCESS_TOKEN" \
    -H "Accept: application/json" \
    "$TMDB_BASE/discover/movie?primary_release_date.gte=$RELEASE_DATE&primary_release_date.lte=$RELEASE_DATE&language=en-US&sort_by=vote_count.desc" \
    || echo "000")

  if [[ "$HTTP_CODE" != "200" ]]; then
    echo "  WARN: TMDB discover returned HTTP $HTTP_CODE for milestone=$Y ($RELEASE_DATE); skipping."
    TMDB_FAILS=$((TMDB_FAILS + 1))
    continue
  fi

  # Annotate each result with the milestone + release_year, append to candidates
  jq -s \
    --argjson m "$Y" \
    --argjson ry "$RELEASE_YEAR" \
    '.[0] + (.[1].results | map(. + {milestone_years: $m, anniversary_release_year: $ry}))' \
    "$CANDIDATES_JSON" "$DISC_RESP" > "${CANDIDATES_JSON}.tmp"
  mv "${CANDIDATES_JSON}.tmp" "$CANDIDATES_JSON"

  COUNT_THIS_YEAR=$(jq --argjson ry "$RELEASE_YEAR" 'map(select(.anniversary_release_year == $ry)) | length' "$CANDIDATES_JSON")
  echo "  Milestone $Y yr → $RELEASE_DATE → $COUNT_THIS_YEAR result(s) returned"
done

if [[ "$TMDB_FAILS" -ge "$TMDB_ATTEMPTS" ]]; then
  send_error_and_exit "TMDB discover failed on all $TMDB_ATTEMPTS milestone queries"
fi

# --- Step B: Filter + sort candidates ---
FILTERED_JSON="$(mktemp -t anniv-filt.XXXXXX.json)"
TEMP_FILES+=("$FILTERED_JSON")

jq --argjson min "$VOTE_COUNT_MIN" '
  map(select(.vote_count > $min))
  | sort_by(-.vote_count)
' "$CANDIDATES_JSON" > "$FILTERED_JSON"

QUALIFYING_COUNT=$(jq 'length' "$FILTERED_JSON")
echo ""
echo "  $QUALIFYING_COUNT qualifying film(s) across all milestones (vote_count > $VOTE_COUNT_MIN)."

if [[ "$QUALIFYING_COUNT" -eq 0 ]]; then
  echo "  No qualifying anniversary today."
  MILE_STR="$(IFS=/; echo "${MILESTONE_YEARS[*]}")"
  EMPTY_MSG="⏭ No notable anniversary today (vote_count > $VOTE_COUNT_MIN across all milestones: $MILE_STR). No post generated."
  send_discord "$EMPTY_MSG"
  echo "  Discord pinged (empty case)."
  exit 0
fi

# Pick top film
TOP=$(jq '.[0]' "$FILTERED_JSON")
FILM_ID=$(echo "$TOP" | jq -r '.id')
FILM_TITLE=$(echo "$TOP" | jq -r '.title // .original_title // "Unknown Title"')
if [[ -z "$FILM_TITLE" || "$FILM_TITLE" == "null" ]]; then
  FILM_TITLE=$(echo "$TOP" | jq -r '.original_title // "Unknown Title"')
fi
FILM_RELEASE_DATE=$(echo "$TOP" | jq -r '.release_date')
FILM_RELEASE_YEAR=$(echo "$TOP" | jq -r '.anniversary_release_year')
FILM_VOTE_COUNT=$(echo "$TOP" | jq -r '.vote_count')
FILM_VOTE_AVG=$(echo "$TOP" | jq -r '.vote_average')
MILESTONE=$(echo "$TOP" | jq -r '.milestone_years')

# Slug: lowercase, non-alphanumerics → hyphen, collapse, trim
FILM_SLUG=$(echo "$FILM_TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g; s/--*/-/g; s/^-//; s/-$//')
# Hashtag: strip non-alphanumerics, preserve original casing
FILM_HASHTAG=$(echo "$FILM_TITLE" | sed 's/[^a-zA-Z0-9]//g')

echo "  Selected: $FILM_TITLE ($FILM_RELEASE_YEAR) — TMDB id=$FILM_ID, milestone=$MILESTONE yr, vote_count=$FILM_VOTE_COUNT"
echo ""

# --- Step C: Fetch images for the chosen film ---
echo "Fetching images for $FILM_TITLE (TMDB id=$FILM_ID)..."

IMAGES_RESP="$(mktemp -t anniv-images.XXXXXX.json)"
TEMP_FILES+=("$IMAGES_RESP")

HTTP_CODE=$(curl -sS --connect-timeout 10 --max-time 30 -o "$IMAGES_RESP" -w "%{http_code}" \
  -H "Authorization: Bearer $TMDB_READ_ACCESS_TOKEN" \
  -H "Accept: application/json" \
  "$TMDB_BASE/movie/$FILM_ID/images?include_image_language=en,null" \
  || echo "000")

if [[ "$HTTP_CODE" != "200" ]]; then
  send_error_and_exit "TMDB /movie/$FILM_ID/images returned HTTP $HTTP_CODE"
fi

# Select images:
#   1 poster: prefer iso_639_1=en OR null, sort by vote_average DESC
#   3 backdrops: prefer iso_639_1=null (text-free); top up from any-lang if <3
POSTER_PATH=$(jq -r '
  .posters
  | map(select(.iso_639_1 == "en" or .iso_639_1 == null))
  | sort_by(-.vote_average)
  | (.[0].file_path // empty)
' "$IMAGES_RESP")

if [[ -z "$POSTER_PATH" ]]; then
  # Loosen: any poster
  POSTER_PATH=$(jq -r '.posters | sort_by(-.vote_average) | (.[0].file_path // empty)' "$IMAGES_RESP")
fi

# Backdrops: take 3, text-free first
BACKDROPS_JSON=$(jq '
  (.backdrops | map(select(.iso_639_1 == null)) | sort_by(-.vote_average)) as $textfree
  | (.backdrops | sort_by(-.vote_average)) as $all
  | ($textfree + $all)
  | unique_by(.file_path)
  | .[0:3]
  | map(.file_path)
' "$IMAGES_RESP")

BACKDROP_COUNT=$(echo "$BACKDROPS_JSON" | jq 'length')

# If no poster at all, fall back to first backdrop as poster
USED_BACKDROP_AS_POSTER=false
if [[ -z "$POSTER_PATH" && "$BACKDROP_COUNT" -gt 0 ]]; then
  POSTER_PATH=$(echo "$BACKDROPS_JSON" | jq -r '.[0]')
  USED_BACKDROP_AS_POSTER=true
  echo "  WARN: No poster found; using first backdrop as poster."
fi

# Count totals; if <2 total images available, error
TOTAL_IMAGES=0
[[ -n "$POSTER_PATH" ]] && TOTAL_IMAGES=$((TOTAL_IMAGES + 1))
TOTAL_IMAGES=$((TOTAL_IMAGES + BACKDROP_COUNT))

if [[ "$TOTAL_IMAGES" -lt 2 ]]; then
  send_error_and_exit "Film $FILM_TITLE has only $TOTAL_IMAGES image(s) available; need at least 2"
fi

echo "  Poster: $POSTER_PATH"
echo "  Backdrops: $BACKDROP_COUNT"

# --- Step D: Download images ---
echo "Downloading images to $DOWNLOAD_DIR..."
mkdir -p "$DOWNLOAD_DIR"

IMG_SIZE="w1280"
DOWNLOADED_IMAGES_JSON="[]"
DOWNLOAD_FAILS=0

download_image() {
  local file_path="$1"
  local out_path="$2"
  local label="$3"
  local url="$TMDB_IMG_BASE/$IMG_SIZE$file_path"
  local code
  code=$(curl -sS --connect-timeout 10 --max-time 60 -o "$out_path" -w "%{http_code}" "$url" || echo "000")
  if [[ "$code" != "200" ]]; then
    echo "  WARN: $label download failed (HTTP $code); removing partial file"
    rm -f "$out_path"
    return 1
  fi
  echo "  Downloaded $label → $out_path"
  return 0
}

# Poster (index 1)
POSTER_OUT="$DOWNLOAD_DIR/1-poster-$FILM_SLUG.jpg"
if [[ -n "$POSTER_PATH" ]]; then
  if download_image "$POSTER_PATH" "$POSTER_OUT" "poster"; then
    DOWNLOADED_IMAGES_JSON=$(echo "$DOWNLOADED_IMAGES_JSON" | jq --arg p "$POSTER_OUT" '. + [{role: "poster", path: $p}]')
  else
    DOWNLOAD_FAILS=$((DOWNLOAD_FAILS + 1))
  fi
fi

# Backdrops (indexes 2..4)
INDEX=2
while IFS= read -r bp; do
  [[ -z "$bp" || "$bp" == "null" ]] && continue
  OUT="$DOWNLOAD_DIR/$INDEX-still-$FILM_SLUG.jpg"
  if download_image "$bp" "$OUT" "backdrop $((INDEX - 1))"; then
    DOWNLOADED_IMAGES_JSON=$(echo "$DOWNLOADED_IMAGES_JSON" | jq --arg p "$OUT" '. + [{role: "backdrop", path: $p}]')
  else
    DOWNLOAD_FAILS=$((DOWNLOAD_FAILS + 1))
  fi
  INDEX=$((INDEX + 1))
done < <(echo "$BACKDROPS_JSON" | jq -r '.[]')

DOWNLOADED_TOTAL=$(echo "$DOWNLOADED_IMAGES_JSON" | jq 'length')
echo "  Downloaded $DOWNLOADED_TOTAL image(s); $DOWNLOAD_FAILS failure(s)."

if [[ "$DOWNLOADED_TOTAL" -lt 2 ]]; then
  send_error_and_exit "Only $DOWNLOADED_TOTAL of expected 4 images downloaded; need at least 2"
fi
echo ""

# --- Step E: Generate Variant A — templated Letterboxd-mimic ---
echo "Generating Variant A (templated Letterboxd-mimic)..."

# Pre-compute release-month-name from FILM_RELEASE_DATE for "Released July 3, 1996" style.
# Use python3 to format because date -j on macOS can produce different output across locales.
RELEASE_LONG=$(python3 -c "
import datetime,sys
d = datetime.datetime.strptime('$FILM_RELEASE_DATE','%Y-%m-%d')
print(d.strftime('%B %-d, %Y'))
" 2>/dev/null || echo "$FILM_RELEASE_DATE")

VARIANT_A=$(printf '%s years ago today: %s (%s)\n\nReleased %s.\n\n#%s #FilmAnniversary' \
  "$MILESTONE" "$FILM_TITLE" "$FILM_RELEASE_YEAR" "$RELEASE_LONG" "$FILM_HASHTAG")

echo "  Variant A:"
echo "$VARIANT_A" | sed 's/^/    /'
echo ""

# --- Step F: Generate Variants B + C via Gemini ---
echo "Generating Variants B + C via Gemini..."

VOICE_PROMPT_TEMPLATE="$REPO_ROOT/scripts/anniversary-post-voice-prompt.txt"
if [[ ! -f "$VOICE_PROMPT_TEMPLATE" ]]; then
  send_error_and_exit "Voice prompt template not found at $VOICE_PROMPT_TEMPLATE"
fi

INSTRUCTION_B="Cinephile-authority hot take. State a defensible thesis about what the film means $MILESTONE years on — its influence, its rewatchability, its critical re-evaluation, or how it has aged. 1-2 sentences. No CTA. Confident, not casual."
INSTRUCTION_C="Short PocketStubs-style nostalgia framing. Open by stating the film's age (\"$FILM_TITLE turns $MILESTONE today.\") then a single short CTA: \"Track every viewing in PocketStubs.\" or \"Add it to your stubs.\". No emoji except the hashtag block. Maximum 3 lines."

# Year-math validator: returns 0 if pass, 1 if fail.
# Caption MUST contain "{{MILESTONE}} years" AND any 4-digit year in [19|20]XX must be in {RELEASE_YEAR, TARGET_YEAR}.
validate_gemini_year_math() {
  local caption="$1"
  local milestone="$2"
  local release_year="$3"
  local target_year="$4"

  if ! grep -qF "${milestone} years" <<<"$caption"; then
    echo "  WARN: year-math reject — missing literal '${milestone} years'" >&2
    return 1
  fi

  local bad
  bad=$(grep -oE '\b(19|20)[0-9]{2}\b' <<<"$caption" | sort -u | awk -v ry="$release_year" -v ty="$target_year" '$0 != ry && $0 != ty')
  if [[ -n "$bad" ]]; then
    echo "  WARN: year-math reject — disallowed year(s): $(echo "$bad" | tr '\n' ' ')" >&2
    return 1
  fi

  return 0
}

call_gemini() {
  local instruction="$1"
  local label="$2"

  # Substitute placeholders into the prompt template via python3 (multiline-safe).
  local rendered_prompt
  rendered_prompt=$(python3 - \
    "$VOICE_PROMPT_TEMPLATE" \
    "$FILM_TITLE" \
    "$FILM_HASHTAG" \
    "$FILM_RELEASE_DATE" \
    "$FILM_RELEASE_YEAR" \
    "$TARGET_DATE" \
    "$TARGET_YEAR" \
    "$MILESTONE" \
    "$instruction" <<'PYEOF'
import sys, pathlib
tpl_path, film_title, film_hashtag, release_date, release_year, target_date, target_year, milestone, instr = sys.argv[1:10]
text = pathlib.Path(tpl_path).read_text()
text = text.replace("{{FILM_TITLE}}", film_title)
text = text.replace("{{FILM_HASHTAG}}", film_hashtag)
text = text.replace("{{RELEASE_DATE}}", release_date)
text = text.replace("{{RELEASE_YEAR}}", release_year)
text = text.replace("{{TARGET_DATE}}", target_date)
text = text.replace("{{TARGET_YEAR}}", target_year)
text = text.replace("{{MILESTONE_YEARS}}", milestone)
text = text.replace("{{VARIANT_INSTRUCTION}}", instr)
print(text, end="")
PYEOF
)

  local resp_file
  resp_file=$(mktemp -t anniv-gemini.XXXXXX.json)
  TEMP_FILES+=("$resp_file")

  local req_body
  req_body=$(jq -n --arg p "$rendered_prompt" \
    '{contents: [{parts: [{text: $p}]}]}')

  local http_code
  http_code=$(curl -sS --connect-timeout 10 --max-time 30 -o "$resp_file" -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d "$req_body" \
    "${GEMINI_BASE}?key=${GEMINI_API_KEY}" || echo "000")

  if [[ "$http_code" != "200" ]]; then
    echo "  Gemini failed for $label (HTTP $http_code). Falling back to templated." >&2
    echo "failed" > "$GEMINI_FAILED_FLAG"
    echo "$VARIANT_A"
    return 0
  fi

  local text
  text=$(jq -r '.candidates[0].content.parts[0].text // empty' "$resp_file")

  # Sanitize: strip markdown code fences and stray YAML separator lines.
  text=$(echo "$text" | python3 -c '
import sys
lines = sys.stdin.read().splitlines()
lines = [l for l in lines if not l.startswith("```") and l.strip() != "---"]
while lines and not lines[0].strip(): lines.pop(0)
while lines and not lines[-1].strip(): lines.pop()
print("\n".join(lines))
')

  if [[ -z "$text" ]]; then
    echo "  Gemini returned empty for $label. Falling back to templated." >&2
    echo "failed" > "$GEMINI_FAILED_FLAG"
    echo "$VARIANT_A"
    return 0
  fi

  # Year-math validation
  if ! validate_gemini_year_math "$text" "$MILESTONE" "$FILM_RELEASE_YEAR" "$TARGET_YEAR"; then
    echo "  Gemini output for $label failed year-math validation. Falling back to templated." >&2
    echo "failed" > "$GEMINI_FAILED_FLAG"
    echo "$VARIANT_A"
    return 0
  fi

  echo "$text"
}

VARIANT_B=$(call_gemini "$INSTRUCTION_B" "B (cinephile-take)")
VARIANT_C=$(call_gemini "$INSTRUCTION_C" "C (pocketstubs-listicle)")

echo "  Variant B (cinephile-take):"
echo "$VARIANT_B" | sed 's/^/    /'
echo ""
echo "  Variant C (pocketstubs-listicle):"
echo "$VARIANT_C" | sed 's/^/    /'
echo ""

# --- Step G: Write vault note ---
VAULT_NOTE_PATH="$VAULT_QUEUE_DIR/$TARGET_DATE-anniversary-$FILM_SLUG.md"

if [[ -f "$VAULT_NOTE_PATH" && "$FORCE" != "true" ]]; then
  echo "Vault note already exists for $TARGET_DATE: $VAULT_NOTE_PATH"
  echo "   Use --force to regenerate."
  exit 0
fi

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[DRY RUN] Would write vault note to: $VAULT_NOTE_PATH"
  echo "[DRY RUN] Would send Discord ping with 3 caption options."
  exit 0
fi

mkdir -p "$VAULT_QUEUE_DIR"

echo "Writing vault note: $VAULT_NOTE_PATH"

# yaml_quote: Single-quote-wrap a YAML scalar; escape embedded single quotes per YAML spec.
yaml_quote() {
  printf "'%s'" "${1//\'/\'\'}"
}

# Indent each caption variant by 6 spaces for YAML literal-block compatibility
indent_for_yaml() {
  echo "$1" | sed 's/^/      /'
}

# Build images YAML block
IMAGES_YAML=""
while IFS= read -r img; do
  ROLE=$(echo "$img" | jq -r '.role')
  IPATH=$(echo "$img" | jq -r '.path')
  IMAGES_YAML+="  - role: $ROLE"$'\n'
  IMAGES_YAML+="    path: $(yaml_quote "$IPATH")"$'\n'
done < <(echo "$DOWNLOADED_IMAGES_JSON" | jq -c '.[]')

VARIANT_A_INDENTED=$(indent_for_yaml "$VARIANT_A")
VARIANT_B_INDENTED=$(indent_for_yaml "$VARIANT_B")
VARIANT_C_INDENTED=$(indent_for_yaml "$VARIANT_C")

# gemini_failed flag line (only present when captions degraded)
GEMINI_FAILED_LINE=""
if [[ -s "$GEMINI_FAILED_FLAG" ]]; then
  GEMINI_FAILED=true
  GEMINI_FAILED_LINE="gemini_failed: true"$'\n'
fi

# Pre-compute yaml_quote expansions outside the heredoc (heredoc doesn't expand functions).
YAML_DATE=$(yaml_quote "$TARGET_DATE")
YAML_TITLE=$(yaml_quote "$FILM_TITLE")
YAML_RELEASE_DATE=$(yaml_quote "$FILM_RELEASE_DATE")

cat > "$VAULT_NOTE_PATH" <<NOTE
---
status: pending
${GEMINI_FAILED_LINE}date: $YAML_DATE
type: anniversary
film:
  title: $YAML_TITLE
  tmdb_id: $FILM_ID
  release_date: $YAML_RELEASE_DATE
  release_year: $FILM_RELEASE_YEAR
  vote_count: $FILM_VOTE_COUNT
  vote_average: $FILM_VOTE_AVG
milestone_years: $MILESTONE
target_year: $TARGET_YEAR
images:
${IMAGES_YAML%$'\n'}
captions:
  - variant: letterboxd-mimic
    source: template
    text: |
$VARIANT_A_INDENTED
  - variant: cinephile-take
    source: gemini
    text: |
$VARIANT_B_INDENTED
  - variant: pocketstubs-listicle
    source: gemini
    text: |
$VARIANT_C_INDENTED
---

# Anniversary post — $TARGET_DATE — $FILM_TITLE ($MILESTONE years)

Drag images from \`$DOWNLOAD_DIR/\` into IG (poster first, then stills in order). Pick one of the 3 captions above + add your twist.

**Approve**: flip \`status: pending\` → \`status: published\`.
**Skip**: flip \`status: pending\` → \`status: skipped\`.
NOTE

echo "  Vault note written."

# --- Step H: Send Discord webhook ping (success case) ---
echo "Sending Discord ping..."

VAULT_URI_PATH=$(echo "Projects/PocketStubs/Business/Marketing Sprints/Queue/$TARGET_DATE-anniversary-$FILM_SLUG" | sed 's/ /%20/g')
OBSIDIAN_URI="obsidian://open?vault=evermind&file=$VAULT_URI_PATH"

# Per-caption truncation (400 char cap)
truncate_for_discord() {
  local text="$1"
  local max_chars=400
  if [[ ${#text} -gt $max_chars ]]; then
    echo "${text:0:$max_chars}..."
  else
    echo "$text"
  fi
}

VARIANT_A_DISCORD=$(truncate_for_discord "$VARIANT_A")
VARIANT_B_DISCORD=$(truncate_for_discord "$VARIANT_B")
VARIANT_C_DISCORD=$(truncate_for_discord "$VARIANT_C")

DISCORD_MSG=$(printf '🎞 Anniversary ready: %s (%s years)\nVault: %s\n\n**Option 1 (Letterboxd mimic):**\n%s\n\n**Option 2 (cinephile take):**\n%s\n\n**Option 3 (PocketStubs listicle):**\n%s\n\nPick + twist. Images in %s/' \
  "$FILM_TITLE" "$MILESTONE" "$OBSIDIAN_URI" \
  "$VARIANT_A_DISCORD" "$VARIANT_B_DISCORD" "$VARIANT_C_DISCORD" \
  "$DOWNLOAD_DIR")

# Final length safety
if [[ ${#DISCORD_MSG} -gt 1900 ]]; then
  DISCORD_MSG="${DISCORD_MSG:0:1900}...[truncated; full content in vault]"
fi

DISCORD_PAYLOAD=$(jq -n --arg c "$DISCORD_MSG" '{content: $c}')

HTTP_CODE=$(curl -sS --connect-timeout 10 --max-time 30 -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d "$DISCORD_PAYLOAD" \
  "$DISCORD_METRICS_WEBHOOK_URL" || echo "000")

if [[ "$HTTP_CODE" != "204" && "$HTTP_CODE" != "200" ]]; then
  echo "  Discord webhook returned HTTP $HTTP_CODE (vault note still saved at $VAULT_NOTE_PATH)" >&2
else
  echo "  Discord pinged (HTTP $HTTP_CODE)."
fi

echo ""
echo "Anniversary post complete for $FILM_TITLE ($MILESTONE years)."
echo "   Vault note: $VAULT_NOTE_PATH"
echo "   Images:     $DOWNLOAD_DIR/"
if [[ "$GEMINI_FAILED" == "true" ]]; then
  echo "   ⚠️ Gemini failed for at least one variant — captions degraded; gemini_failed: true in frontmatter."
fi
