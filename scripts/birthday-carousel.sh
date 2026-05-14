#!/usr/bin/env bash
# C1 — Daily Birthday Carousel
# Queries TMDB for today's notable actor birthdays, downloads 4 film stills,
# generates 3 IG caption variants (1 templated + 2 Gemini), writes to vault
# approval queue, pings Discord.
#
# Usage:
#   ./scripts/birthday-carousel.sh                    # today
#   ./scripts/birthday-carousel.sh --date 2026-05-13  # specific date (testing)
#   ./scripts/birthday-carousel.sh --dry-run          # don't write/post; just print
#   ./scripts/birthday-carousel.sh --force            # overwrite existing vault note
#   ./scripts/birthday-carousel.sh --help
#
# Spec: docs/superpowers/specs/2026-05-13-birthday-carousel-design.md
# Plan: docs/superpowers/plans/2026-05-13-birthday-carousel.md

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
# TMDB popularity decays between releases — even A-list actors drop to 5-10 between
# release cycles. Threshold of 20 (per spec) was empirically too high — Pattinson at
# ~7 today would have been filtered. Lowered to 5 based on first real-run data.
# Override via env: BIRTHDAY_POPULARITY_THRESHOLD=10 ./scripts/birthday-carousel.sh
POPULARITY_THRESHOLD=${BIRTHDAY_POPULARITY_THRESHOLD:-5}
VOTE_COUNT_MIN=100
MIN_FILMS_VIABLE=2

# --- Default flags ---
DRY_RUN=false
FORCE=false
DATE_OVERRIDE=""
GEMINI_FAILED=false
# Temp file used as a signal flag — bash subshells (command substitution) can't
# mutate parent-shell variables, so call_gemini() touches this file on fallback.
GEMINI_FAILED_FLAG="$(mktemp -t bday-gemini-failed.XXXXXX)"

usage() {
  cat <<USAGE
Usage: $(basename "$0") [--date YYYY-MM-DD] [--dry-run] [--force] [--help]

  --date YYYY-MM-DD   Use a specific date instead of today (for testing)
  --dry-run           Print what would happen; don't write vault note or ping Discord
  --force             Overwrite existing vault note for the date
  --help              Show this message

Generates a daily Letterboxd-style birthday carousel:
- Queries TMDB for actors with the date's MM-DD birthday + popularity > $POPULARITY_THRESHOLD
- Picks the most-popular result
- Downloads 4 film stills to ~/Downloads/birthday-carousel-<DATE>/
- Drafts 3 caption variants (Letterboxd-mimic + 2 Gemini-generated PocketStubs voice)
- Writes vault note to "$VAULT_QUEUE_DIR/<DATE>-birthday-<slug>.md"
- Pings Discord webhook with status + actor + 3 captions inline

Spec: docs/superpowers/specs/2026-05-13-birthday-carousel-design.md
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
TARGET_MM_DD="$(date -j -f "%Y-%m-%d" "$TARGET_DATE" "+%m-%d")"

# --- SIGINT trap: cleanup partial download dir ---
DOWNLOAD_DIR="$HOME/Downloads/birthday-carousel-$TARGET_DATE"
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

echo "Target date: $TARGET_DATE (MM-DD: $TARGET_MM_DD)"
echo "Dry-run: $DRY_RUN | Force: $FORCE"
echo ""

# --- Early idempotency check (before any API calls) ---
# We don't know the actor slug yet, so check for any existing note for this date.
# Use glob to find any existing note matching the date prefix.
EXISTING_NOTE=$(ls "$VAULT_QUEUE_DIR/$TARGET_DATE-birthday-"*.md 2>/dev/null | head -1 || true)
if [[ -n "$EXISTING_NOTE" && "$FORCE" != "true" ]]; then
  echo "Vault note already exists for $TARGET_DATE: $EXISTING_NOTE"
  echo "   Use --force to regenerate."
  exit 0
fi

# --- Step A: TMDB person discovery — find actors with today's birthday ---
echo "Querying TMDB for actors born on $TARGET_MM_DD..."

# TMDB doesn't expose a direct "birthday today" endpoint.
# Approach: paginate /person/popular (top 500 = 25 pages x 20), then iterate
# each candidate's /person/{id} to check birthday MM-DD against $TARGET_MM_DD.
# Sort by popularity DESC so we hit the most-popular match first and break early.

CANDIDATES_JSON="$(mktemp -t bday-cand.XXXXXX.json)"
TEMP_FILES=("$CANDIDATES_JSON" "$GEMINI_FAILED_FLAG")
trap '[[ ${#TEMP_FILES[@]} -gt 0 ]] && rm -f "${TEMP_FILES[@]}"' EXIT

# Fetch top 500 popular actors (25 pages x 20 = 500)
PAGES_TO_FETCH=25
echo "  Fetching top $((PAGES_TO_FETCH * 20)) popular actors from TMDB..."

# Accumulate all results into a single JSON array
ALL_RESULTS="[]"
for page in $(seq 1 "$PAGES_TO_FETCH"); do
  PAGE_RESP="$(mktemp -t bday-page.XXXXXX.json)"
  TEMP_FILES+=("$PAGE_RESP")

  HTTP_CODE=$(curl -sS -o "$PAGE_RESP" -w "%{http_code}" \
    -H "Authorization: Bearer $TMDB_READ_ACCESS_TOKEN" \
    -H "Accept: application/json" \
    "$TMDB_BASE/person/popular?language=en-US&page=$page" || echo "000")

  if [[ "$HTTP_CODE" != "200" ]]; then
    echo "Error: TMDB person/popular page $page returned HTTP $HTTP_CODE." >&2
    cat "$PAGE_RESP" >&2
    exit 1
  fi

  # Append this page's results to the accumulator
  ALL_RESULTS=$(jq -s '.[0] + .[1].results' \
    <(echo "$ALL_RESULTS") "$PAGE_RESP")
done

echo "$ALL_RESULTS" > "$CANDIDATES_JSON"
TOTAL_FETCHED=$(jq 'length' "$CANDIDATES_JSON")
echo "  Fetched $TOTAL_FETCHED candidates."

# Filter to known_for_department=Acting + popularity > threshold
FILTERED_JSON="$(mktemp -t bday-filt.XXXXXX.json)"
TEMP_FILES+=("$FILTERED_JSON")
jq --argjson threshold "$POPULARITY_THRESHOLD" '
  map(select(.known_for_department == "Acting" and .popularity > $threshold))
' "$CANDIDATES_JSON" > "$FILTERED_JSON"

FILTERED_COUNT=$(jq 'length' "$FILTERED_JSON")
echo "  $FILTERED_COUNT candidates pass popularity > $POPULARITY_THRESHOLD threshold."

# Sort filtered list by popularity DESC and iterate to find birthday match
echo "  Iterating to find birthday matches for $TARGET_MM_DD..."

MATCH_PERSON_ID=""
MATCH_NAME=""
MATCH_POPULARITY=""

# Sort filtered list by popularity DESC, get IDs in order
PERSON_IDS=$(jq -r 'sort_by(-.popularity) | .[].id' "$FILTERED_JSON")

CHECKED=0
for pid in $PERSON_IDS; do
  CHECKED=$((CHECKED + 1))

  PERSON_RESP="$(mktemp -t bday-person.XXXXXX.json)"
  TEMP_FILES+=("$PERSON_RESP")

  HTTP_CODE=$(curl -sS -o "$PERSON_RESP" -w "%{http_code}" \
    -H "Authorization: Bearer $TMDB_READ_ACCESS_TOKEN" \
    -H "Accept: application/json" \
    "$TMDB_BASE/person/$pid?language=en-US" || echo "000")

  if [[ "$HTTP_CODE" != "200" ]]; then
    # Skip this person on error; don't fail the whole run for one bad ID
    continue
  fi

  BIRTHDAY=$(jq -r '.birthday // empty' "$PERSON_RESP")
  if [[ -z "$BIRTHDAY" ]]; then
    continue  # No birthday data; skip
  fi

  # Extract MM-DD from YYYY-MM-DD
  PERSON_MM_DD="${BIRTHDAY:5:5}"

  if [[ "$PERSON_MM_DD" == "$TARGET_MM_DD" ]]; then
    MATCH_PERSON_ID="$pid"
    MATCH_NAME=$(jq -r '.name' "$PERSON_RESP")
    MATCH_POPULARITY=$(jq -r '.popularity' "$PERSON_RESP")
    MATCH_BIRTH_YEAR="${BIRTHDAY:0:4}"
    MATCH_BIRTHDAY="$BIRTHDAY"
    echo "  MATCH (after $CHECKED checks): $MATCH_NAME (TMDB id=$MATCH_PERSON_ID, popularity=$MATCH_POPULARITY, born $BIRTHDAY)"
    break
  fi
done

if [[ -z "$MATCH_PERSON_ID" ]]; then
  echo "  No actor with birthday on $TARGET_MM_DD passes popularity threshold."
  echo ""
  echo "Sending Discord ping (empty case)..."
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [DRY RUN] Would send: No notable birthday today (popularity > $POPULARITY_THRESHOLD threshold). No carousel generated."
  else
    EMPTY_MSG="⏭ No notable birthday today (popularity > $POPULARITY_THRESHOLD threshold). No carousel generated. Date: $TARGET_DATE"
    curl -sS -X POST -H "Content-Type: application/json" \
      -d "$(jq -n --arg c "$EMPTY_MSG" '{content: $c}')" \
      "$DISCORD_METRICS_WEBHOOK_URL" >/dev/null
    echo "  Discord pinged."
  fi
  exit 0
fi

# Compute age today (or the target year if --date used)
TARGET_YEAR=$(date -j -f "%Y-%m-%d" "$TARGET_DATE" "+%Y")
MATCH_AGE=$((TARGET_YEAR - MATCH_BIRTH_YEAR))

# Compute slug from name (lowercase, spaces to hyphens, strip non-alphanumeric)
MATCH_SLUG=$(echo "$MATCH_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g; s/--*/-/g; s/^-//; s/-$//')

echo "  Selected: $MATCH_NAME ($MATCH_AGE) — slug: $MATCH_SLUG"
echo ""

# --- Step B: Fetch filmography + select top 4 films ---
echo "Fetching filmography for $MATCH_NAME (TMDB id=$MATCH_PERSON_ID)..."

CREDITS_RESP="$(mktemp -t bday-credits.XXXXXX.json)"
TEMP_FILES+=("$CREDITS_RESP")

HTTP_CODE=$(curl -sS -o "$CREDITS_RESP" -w "%{http_code}" \
  -H "Authorization: Bearer $TMDB_READ_ACCESS_TOKEN" \
  -H "Accept: application/json" \
  "$TMDB_BASE/person/$MATCH_PERSON_ID/movie_credits?language=en-US" || echo "000")

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "Error: TMDB filmography fetch returned HTTP $HTTP_CODE." >&2
  ERROR_MSG="⚠️ Birthday carousel ERRORED: TMDB filmography fetch failed for $MATCH_NAME (HTTP $HTTP_CODE). Date: $TARGET_DATE"
  if [[ "$DRY_RUN" != "true" ]]; then
    curl -sS -X POST -H "Content-Type: application/json" \
      -d "$(jq -n --arg c "$ERROR_MSG" '{content: $c}')" \
      "$DISCORD_METRICS_WEBHOOK_URL" >/dev/null
  fi
  exit 1
fi

# Filter cast films: vote_count > $VOTE_COUNT_MIN, sort by vote_average DESC, top 4
FILTERED_FILMS_JSON="$(mktemp -t bday-films.XXXXXX.json)"
TEMP_FILES+=("$FILTERED_FILMS_JSON")

jq --argjson min "$VOTE_COUNT_MIN" '
  .cast
  | map(select(.vote_count > $min and .release_date != null and .release_date != ""))
  | sort_by(-.vote_average)
  | .[0:4]
' "$CREDITS_RESP" > "$FILTERED_FILMS_JSON"

FILMS_COUNT=$(jq 'length' "$FILTERED_FILMS_JSON")
echo "  $FILMS_COUNT qualifying films found (vote_count > $VOTE_COUNT_MIN, sorted by vote_average DESC)."

if [[ "$FILMS_COUNT" -lt "$MIN_FILMS_VIABLE" ]]; then
  # Try fallback: lower vote_count threshold to 50
  echo "  Fewer than $MIN_FILMS_VIABLE films at threshold; retrying with vote_count > 50..."
  jq '
    .cast
    | map(select(.vote_count > 50 and .release_date != null and .release_date != ""))
    | sort_by(-.vote_average)
    | .[0:4]
  ' "$CREDITS_RESP" > "$FILTERED_FILMS_JSON"
  FILMS_COUNT=$(jq 'length' "$FILTERED_FILMS_JSON")
  echo "  After fallback: $FILMS_COUNT films."
fi

if [[ "$FILMS_COUNT" -lt "$MIN_FILMS_VIABLE" ]]; then
  echo "Error: $MATCH_NAME has fewer than $MIN_FILMS_VIABLE qualifying films. Cannot generate carousel." >&2
  ERROR_MSG="⚠️ Birthday carousel ERRORED: $MATCH_NAME has only $FILMS_COUNT qualifying films (need at least $MIN_FILMS_VIABLE). Date: $TARGET_DATE"
  if [[ "$DRY_RUN" != "true" ]]; then
    curl -sS -X POST -H "Content-Type: application/json" \
      -d "$(jq -n --arg c "$ERROR_MSG" '{content: $c}')" \
      "$DISCORD_METRICS_WEBHOOK_URL" >/dev/null
  fi
  exit 1
fi

# Print selected films
echo "  Selected films:"
jq -r '.[] | "    - \(.title) (\(.release_date[0:4])) — vote_average=\(.vote_average), vote_count=\(.vote_count), backdrop=\(.backdrop_path // "NONE")"' "$FILTERED_FILMS_JSON"

echo ""

# --- Step C: Download film backdrops to ~/Downloads/ ---
echo "Downloading backdrops to $DOWNLOAD_DIR..."
mkdir -p "$DOWNLOAD_DIR"

# Use TMDB's "original" backdrop size for highest quality
IMG_SIZE="original"

DOWNLOADED_COUNT=0
DOWNLOADED_FILMS_JSON="[]"

INDEX=1
while IFS= read -r film_row; do
  TITLE=$(echo "$film_row" | jq -r '.title')
  YEAR=$(echo "$film_row" | jq -r '.release_date[0:4]')
  BACKDROP_PATH=$(echo "$film_row" | jq -r '.backdrop_path // empty')

  if [[ -z "$BACKDROP_PATH" ]]; then
    echo "  Skipping '$TITLE' — no backdrop available."
    INDEX=$((INDEX + 1))
    continue
  fi

  # Slugify title for filename
  TITLE_SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g; s/--*/-/g; s/^-//; s/-$//')
  IMG_PATH="$DOWNLOAD_DIR/$INDEX-$TITLE_SLUG.jpg"

  IMG_URL="$TMDB_IMG_BASE/$IMG_SIZE$BACKDROP_PATH"
  echo "  [$INDEX] Downloading: $TITLE -> $IMG_PATH"

  HTTP_CODE=$(curl -sS -o "$IMG_PATH" -w "%{http_code}" "$IMG_URL" || echo "000")

  if [[ "$HTTP_CODE" != "200" ]]; then
    echo "    HTTP $HTTP_CODE — removing partial file"
    rm -f "$IMG_PATH"
    INDEX=$((INDEX + 1))
    continue
  fi

  DOWNLOADED_COUNT=$((DOWNLOADED_COUNT + 1))
  DOWNLOADED_FILMS_JSON=$(echo "$DOWNLOADED_FILMS_JSON" | jq \
    --arg t "$TITLE" --arg y "$YEAR" --arg p "$IMG_PATH" \
    '. + [{title: $t, year: $y, image_path: $p}]')

  INDEX=$((INDEX + 1))
done < <(jq -c '.[]' "$FILTERED_FILMS_JSON")

echo "  Downloaded $DOWNLOADED_COUNT/$FILMS_COUNT images."

if [[ "$DOWNLOADED_COUNT" -lt "$MIN_FILMS_VIABLE" ]]; then
  echo "Error: Only $DOWNLOADED_COUNT images downloaded; need at least $MIN_FILMS_VIABLE. Carousel not viable." >&2
  ERROR_MSG="⚠️ Birthday carousel ERRORED: Only $DOWNLOADED_COUNT images downloaded for $MATCH_NAME (need at least $MIN_FILMS_VIABLE). Date: $TARGET_DATE"
  if [[ "$DRY_RUN" != "true" ]]; then
    curl -sS -X POST -H "Content-Type: application/json" \
      -d "$(jq -n --arg c "$ERROR_MSG" '{content: $c}')" \
      "$DISCORD_METRICS_WEBHOOK_URL" >/dev/null
  fi
  exit 1
fi

echo ""

# --- Step D: Generate Variant A — templated Letterboxd-mimic caption ---
echo "Generating Variant A (templated Letterboxd-mimic)..."

# Build "Stills from:" film list
STILLS_LIST=""
while IFS= read -r film; do
  TITLE=$(echo "$film" | jq -r '.title')
  YEAR=$(echo "$film" | jq -r '.year')
  STILLS_LIST+="$TITLE ($YEAR)"$'\n'
done < <(echo "$DOWNLOADED_FILMS_JSON" | jq -c '.[]')

# Build hashtag from name (CamelCase, no spaces)
ACTOR_HASHTAG=$(echo "$MATCH_NAME" | sed 's/ //g')

# Lowercase name for the greeting (Letterboxd does lowercase)
LOWER_NAME=$(echo "$MATCH_NAME" | tr '[:upper:]' '[:lower:]')

VARIANT_A=$(printf 'happy birthday %s 👋\n\nStills from:\n%s\n#%s #HappyBirthday' \
  "$LOWER_NAME" "${STILLS_LIST%$'\n'}" "$ACTOR_HASHTAG")

echo "  Variant A:"
echo "$VARIANT_A" | sed 's/^/    /'
echo ""

# --- Step E: Generate Variants B + C via Gemini ---
echo "Generating Variants B + C via Gemini..."

VOICE_PROMPT_TEMPLATE="$REPO_ROOT/scripts/birthday-carousel-voice-prompt.txt"
if [[ ! -f "$VOICE_PROMPT_TEMPLATE" ]]; then
  echo "Error: Voice prompt template not found at $VOICE_PROMPT_TEMPLATE" >&2
  exit 1
fi

# Build {{FILMS}} block as a newline-separated list
FILMS_BLOCK=""
while IFS= read -r film; do
  TITLE=$(echo "$film" | jq -r '.title')
  YEAR=$(echo "$film" | jq -r '.year')
  FILMS_BLOCK+="- $TITLE ($YEAR)"$'\n'
done < <(echo "$DOWNLOADED_FILMS_JSON" | jq -c '.[]')
FILMS_BLOCK="${FILMS_BLOCK%$'\n'}"  # trim trailing newline

# Variant-specific instructions
INSTRUCTION_B="Cinephile-authority hot take. State a defensible thesis about the actor's career arc or specific filmography choice in 1-2 sentences. Reference 2-4 films by name. No CTA. Confident, not casual."
INSTRUCTION_C="PocketStubs-style listicle. Open with \"Four [actor] performances that...\" or \"The [actor] films that...\" framing. List the films as a soft enumeration. End with one short CTA: \"Track them all in PocketStubs.\" or similar. No emoji except the hashtag block."

# Function to call Gemini with substituted prompt
call_gemini() {
  local instruction="$1"
  local label="$2"

  # Substitute all placeholders including multiline FILMS via Python3
  # (awk -v can't handle newlines in variables on macOS bash 3.x)
  local rendered_prompt
  rendered_prompt=$(python3 - "$VOICE_PROMPT_TEMPLATE" "$MATCH_NAME" "$ACTOR_HASHTAG" "$FILMS_BLOCK" "$instruction" <<'PYEOF'
import sys, pathlib
tpl_path, actor, hashtag, films, instr = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
text = pathlib.Path(tpl_path).read_text()
text = text.replace("{{ACTOR}}", actor)
text = text.replace("{{ACTOR_HASHTAG}}", hashtag)
text = text.replace("{{FILMS}}", films)
text = text.replace("{{VARIANT_INSTRUCTION}}", instr)
print(text, end="")
PYEOF
)

  # Call Gemini
  local resp_file
  resp_file=$(mktemp -t bday-gemini.XXXXXX.json)
  TEMP_FILES+=("$resp_file")

  local req_body
  req_body=$(jq -n --arg p "$rendered_prompt" \
    '{contents: [{parts: [{text: $p}]}]}')

  local http_code
  http_code=$(curl -sS -o "$resp_file" -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d "$req_body" \
    "${GEMINI_BASE}?key=${GEMINI_API_KEY}" || echo "000")

  if [[ "$http_code" != "200" ]]; then
    echo "  Gemini failed for $label (HTTP $http_code). Falling back to templated." >&2
    echo "failed" > "$GEMINI_FAILED_FLAG"  # signal to parent shell (subshell can't mutate parent vars)
    echo "$VARIANT_A"  # Fallback: reuse Variant A
    return 0
  fi

  local text
  text=$(jq -r '.candidates[0].content.parts[0].text // empty' "$resp_file")

  if [[ -z "$text" ]]; then
    echo "  Gemini returned empty for $label. Falling back to templated." >&2
    echo "failed" > "$GEMINI_FAILED_FLAG"  # signal to parent shell (subshell can't mutate parent vars)
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

# --- Step F: Write vault note (with idempotency check) ---
VAULT_NOTE_PATH="$VAULT_QUEUE_DIR/$TARGET_DATE-birthday-$MATCH_SLUG.md"

# Idempotency: if note exists and --force not set, exit 0 cleanly
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

# Ensure queue directory exists
mkdir -p "$VAULT_QUEUE_DIR"

echo "Writing vault note: $VAULT_NOTE_PATH"

# Build films YAML block
FILMS_YAML=""
while IFS= read -r film; do
  TITLE=$(echo "$film" | jq -r '.title')
  YEAR=$(echo "$film" | jq -r '.year')
  IMG_PATH=$(echo "$film" | jq -r '.image_path')
  FILMS_YAML+="  - title: $TITLE"$'\n'
  FILMS_YAML+="    year: $YEAR"$'\n'
  FILMS_YAML+="    image_path: $IMG_PATH"$'\n'
done < <(echo "$DOWNLOADED_FILMS_JSON" | jq -c '.[]')

# Indent each caption variant by 6 spaces for YAML literal-block compatibility
indent_for_yaml() {
  echo "$1" | sed 's/^/      /'
}

VARIANT_A_INDENTED=$(indent_for_yaml "$VARIANT_A")
VARIANT_B_INDENTED=$(indent_for_yaml "$VARIANT_B")
VARIANT_C_INDENTED=$(indent_for_yaml "$VARIANT_C")

# Build optional gemini_failed frontmatter line (only present when captions degraded).
# Read from flag file — call_gemini() runs in a subshell (command substitution) so it
# can't mutate GEMINI_FAILED directly; it writes to GEMINI_FAILED_FLAG instead.
GEMINI_FAILED_LINE=""
if [[ -s "$GEMINI_FAILED_FLAG" ]]; then
  GEMINI_FAILED=true
  GEMINI_FAILED_LINE="gemini_failed: true"$'\n'
fi

cat > "$VAULT_NOTE_PATH" <<NOTE
---
status: pending
${GEMINI_FAILED_LINE}date: $TARGET_DATE
actor:
  name: $MATCH_NAME
  tmdb_id: $MATCH_PERSON_ID
  birth_year: $MATCH_BIRTH_YEAR
  age_today: $MATCH_AGE
  popularity: $MATCH_POPULARITY
films:
${FILMS_YAML%$'\n'}
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

# Birthday carousel — $TARGET_DATE — $MATCH_NAME ($MATCH_AGE)

Drag images from \`$DOWNLOAD_DIR/\` into IG (in order). Pick one of the 3 captions above + add your twist.

**Approve**: flip \`status: pending\` -> \`status: published\`.
**Skip**: flip \`status: pending\` -> \`status: skipped\`.
NOTE

echo "  Vault note written."

# --- Step G: Send Discord webhook ping (success case) ---
echo "Sending Discord ping..."

# Build vault Obsidian URI (URL-encode spaces as %20)
VAULT_URI_PATH=$(echo "Projects/PocketStubs/Business/Marketing Sprints/Queue/$TARGET_DATE-birthday-$MATCH_SLUG" | sed 's/ /%20/g')
OBSIDIAN_URI="obsidian://open?vault=evermind&file=$VAULT_URI_PATH"

# Truncate caption variants for Discord (2000 char hard limit on the whole message)
truncate_for_discord() {
  local text="$1"
  local max_chars=400  # leave room for framing
  if [[ ${#text} -gt $max_chars ]]; then
    echo "${text:0:$max_chars}..."
  else
    echo "$text"
  fi
}

VARIANT_A_DISCORD=$(truncate_for_discord "$VARIANT_A")
VARIANT_B_DISCORD=$(truncate_for_discord "$VARIANT_B")
VARIANT_C_DISCORD=$(truncate_for_discord "$VARIANT_C")

DISCORD_MSG=$(printf '📬 Birthday carousel ready: %s (%s)\nVault: %s\n\n**Option 1 (Letterboxd mimic):**\n%s\n\n**Option 2 (cinephile take):**\n%s\n\n**Option 3 (PocketStubs listicle):**\n%s\n\nPick + twist. Images in %s/' \
  "$MATCH_NAME" "$MATCH_AGE" "$OBSIDIAN_URI" \
  "$VARIANT_A_DISCORD" "$VARIANT_B_DISCORD" "$VARIANT_C_DISCORD" \
  "$DOWNLOAD_DIR")

# Final length safety
if [[ ${#DISCORD_MSG} -gt 1900 ]]; then
  DISCORD_MSG="${DISCORD_MSG:0:1900}...[truncated; full content in vault]"
fi

DISCORD_PAYLOAD=$(jq -n --arg c "$DISCORD_MSG" '{content: $c}')

HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d "$DISCORD_PAYLOAD" \
  "$DISCORD_METRICS_WEBHOOK_URL" || echo "000")

if [[ "$HTTP_CODE" != "204" && "$HTTP_CODE" != "200" ]]; then
  echo "  Discord webhook returned HTTP $HTTP_CODE (vault note still saved at $VAULT_NOTE_PATH)" >&2
  # Don't fail — vault note is the source of truth
else
  echo "  Discord pinged (HTTP $HTTP_CODE)."
fi

echo ""
echo "Birthday carousel complete for $MATCH_NAME ($MATCH_AGE)."
echo "   Vault note: $VAULT_NOTE_PATH"
echo "   Images:     $DOWNLOAD_DIR/"
