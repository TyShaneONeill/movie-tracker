# Daily Birthday Carousel (C1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `cinetrak/scripts/birthday-carousel.sh` — a bash script that queries TMDB for today's notable actor birthdays, downloads 4 film stills, generates 3 caption variants (1 templated Letterboxd-mimic + 2 Gemini-generated PocketStubs-voice), writes a vault note to the marketing approval queue, and pings the existing Discord webhook with status + 3 caption options inline.

**Architecture:** Single bash script + one committed prompt template (`birthday-carousel-voice-prompt.txt`). `set -euo pipefail`, anchors to repo root, mirrors patterns from `sync-supabase-secrets.sh` + `deploy-email-templates.sh` + `log-marketing-piece.sh`. Direct filesystem write to the vault (the vault is just a folder — no MCP needed at script runtime; bash can't call MCP). TMDB v4 read-access-token auth (Bearer), Gemini `gemini-2.5-flash` for text variants. Idempotent (re-runs no-op unless `--force`). Manual trigger for v1; cron added in a separate small followup once content quality is trusted.

**Tech Stack:** bash, curl, jq, TMDB v4 API (existing `TMDB_READ_ACCESS_TOKEN` in Doppler), Gemini API (`gemini-2.5-flash` for text — existing `GEMINI_API_KEY` in Doppler), Discord webhook (existing `DISCORD_METRICS_WEBHOOK_URL` in Doppler), direct filesystem write to vault path.

**Spec:** `docs/superpowers/specs/2026-05-13-birthday-carousel-design.md`

---

## File Structure

| Path | Owner | Purpose |
|---|---|---|
| `cinetrak/scripts/birthday-carousel.sh` | Tasks 2-10 | The script (~300 lines bash) |
| `cinetrak/scripts/birthday-carousel-voice-prompt.txt` | Task 7 | Gemini voice prompt template (committed; evolves under version control) |
| `cinetrak/scripts/README.md` | Task 11 | Extended with section for the new script |
| Vault: `Projects/PocketStubs/Business/Marketing Sprints/Queue/<YYYY-MM-DD>-birthday-<actor-slug>.md` | Created at runtime | Per-day approval queue note. Path: `/Users/Shared/evermind/tormajs evermind/Projects/PocketStubs/Business/Marketing Sprints/Queue/`. Folder created on first run. |
| `~/Downloads/birthday-carousel-<YYYY-MM-DD>/<n>-<film-slug>.jpg` | Created at runtime | Image stills downloaded for upload. Outside repo to avoid bloat. |

**Spec deviation note**: The spec said "via Obsidian MCP" for the vault note write. Bash can't call MCP — MCP tools are agent-only. The implementation uses direct filesystem write to the vault path (same pattern as `log-marketing-piece.sh`). The vault is just a folder; this works cleanly.

---

## Task 1: Pre-implementation reconnaissance

**Files:** None (verification only)

- [ ] **Step 1: Confirm spec is accessible**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak
ls docs/superpowers/specs/2026-05-13-birthday-carousel-design.md && echo OK
```

Expected: `OK`.

- [ ] **Step 2: Confirm we're on the chore branch**

```bash
git branch --show-current
```

Expected: `chore/birthday-carousel-spec` (the spec was committed there). The script + prompt + README will be added on this same branch.

- [ ] **Step 3: Verify all 3 Doppler secrets exist**

```bash
doppler secrets --project pocketstubs --config dev --raw 2>/dev/null | grep -E "TMDB_READ_ACCESS_TOKEN|GEMINI_API_KEY|DISCORD_METRICS_WEBHOOK_URL" | sed 's/=.*$/=<redacted>/'
```

Expected: all 3 lines printed (verifies all secrets are set).

- [ ] **Step 4: Verify the vault path exists**

```bash
ls -d "/Users/Shared/evermind/tormajs evermind/Projects/PocketStubs/Business/Marketing Sprints" && echo OK
```

Expected: `OK`. The `Queue/` subdirectory inside it does NOT need to exist yet — the script will create it.

- [ ] **Step 5: Verify TMDB v4 read-access-token works**

```bash
doppler run -- bash -c '
  curl -s -H "Authorization: Bearer $TMDB_READ_ACCESS_TOKEN" \
    "https://api.themoviedb.org/3/configuration" | jq -r ".images.secure_base_url"
'
```

Expected: prints `https://image.tmdb.org/t/p/`. Confirms TMDB v4 auth + jq parsing work.

- [ ] **Step 6: Verify Gemini text-generation works**

```bash
doppler run -- bash -c '
  curl -s -X POST \
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$GEMINI_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"contents\":[{\"parts\":[{\"text\":\"Say hello in 3 words.\"}]}]}" \
    | jq -r ".candidates[0].content.parts[0].text"
'
```

Expected: prints something like `Hi there friends`. Confirms Gemini text endpoint + auth + jq parsing work.

If Step 5 OR Step 6 fails, STOP and surface to user before continuing.

- [ ] **Step 7: Commit nothing**

Verification only.

---

## Task 2: Create script skeleton (header, args, prereqs, SIGINT trap)

**Files:**
- Create: `cinetrak/scripts/birthday-carousel.sh`

- [ ] **Step 1: Create the file with header + arg parsing + prereq checks**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak
cat > scripts/birthday-carousel.sh <<'BASH_SCRIPT'
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
POPULARITY_THRESHOLD=20
VOTE_COUNT_MIN=100
MIN_FILMS_VIABLE=2

# --- Default flags ---
DRY_RUN=false
FORCE=false
DATE_OVERRIDE=""

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
  exit 1
}

# --- Parse args ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --date) DATE_OVERRIDE="${2:?--date requires YYYY-MM-DD value}"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --force) FORCE=true; shift ;;
    -h|--help) usage ;;
    *) echo "Error: Unknown argument: $1" >&2; usage ;;
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

# --- (Tasks 3-10 add the rest below) ---

echo "Skeleton complete. Args parsed, prereqs satisfied, secrets verified."
BASH_SCRIPT
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/birthday-carousel.sh
ls -la scripts/birthday-carousel.sh
```

Expected: `-rwxr-xr-x`.

- [ ] **Step 3: Smoke-test — no args**

```bash
./scripts/birthday-carousel.sh
```

Expected: usage prints, exits non-zero (specifically exit 1 from `usage`). Without doppler injection, will exit at the secret check before reaching the "Skeleton complete" line — that's expected since secrets aren't in the bare shell.

Actually correction — the script's flow is: parse args → if no flags, falls through with defaults → prereq checks → secret checks → "Skeleton complete" line. So with no args + no doppler, it'll exit at secret checks. That's the right behavior for now (verifies the secret-check error message is helpful).

- [ ] **Step 4: Smoke-test — with doppler injection**

```bash
doppler run -- ./scripts/birthday-carousel.sh
```

Expected: prints `Target date: <today>...`, `Skeleton complete...`. No errors.

- [ ] **Step 5: Smoke-test — `--help`**

```bash
./scripts/birthday-carousel.sh --help
```

Expected: usage prints, exits non-zero.

- [ ] **Step 6: Smoke-test — invalid `--date`**

```bash
doppler run -- ./scripts/birthday-carousel.sh --date not-a-date
```

Expected: `Error: --date must be YYYY-MM-DD format...`, exits non-zero.

- [ ] **Step 7: Smoke-test — valid `--date` override**

```bash
doppler run -- ./scripts/birthday-carousel.sh --date 2026-05-13
```

Expected: `Target date: 2026-05-13 (MM-DD: 05-13)`, `Skeleton complete...`.

- [ ] **Step 8: Commit nothing yet**

Wait until Task 12 to commit the full script + prompt + README together.

---

## Task 3: TMDB birthday discovery — find today's notable actor

**Files:**
- Modify: `cinetrak/scripts/birthday-carousel.sh` (replace the placeholder line at end of skeleton)

- [ ] **Step 1: Replace the placeholder with TMDB person discovery**

Open `scripts/birthday-carousel.sh`. Find the line:

```bash
echo "Skeleton complete. Args parsed, prereqs satisfied, secrets verified."
```

Replace it with:

```bash
# --- Step A: TMDB person discovery — find actors with today's birthday ---
echo "Querying TMDB for actors born on $TARGET_MM_DD..."

# TMDB doesn't expose a direct "birthday today" endpoint via their /discover/person.
# Approach: use search-by-date via the GET /3/person/popular and similar is wrong.
# Real approach: TMDB has a /discover/person endpoint as of v3 with limited params,
# OR we use /3/discover/movie-style filtering. As of TMDB v3 there is no "birthday"
# filter on /discover/person.
#
# Workable approach: use TMDB's search/person sorted by popularity, then filter
# client-side by birthday. To make this efficient, we query the top N most-popular
# actors from a snapshot endpoint and filter to those whose birthday matches today.
#
# Actually, TMDB's search-by-date approach: query /3/discover/person?... no, that
# also doesn't filter by birthday.
#
# CONCRETE APPROACH: Use the TMDB Daily ID Export — TMDB publishes daily a list
# of all person IDs. But that's ~1.4M people; client-side filter would be slow.
#
# CHOSEN APPROACH: Maintain a small in-script list of ~500 popular-actor TMDB IDs
# (top by popularity over recent years), iterate, fetch each person's birthday,
# filter to today. This is O(N) calls per day but N=500 is fine and TMDB is fast.
#
# Actually the cleanest path: use TMDB's "People / Popular" endpoint paginated
# (~20 per page, 500 pages exists but only first ~50 pages are interesting), pull
# top 1000 popular people, iterate, filter by birthday. ~50 API calls per run.
#
# For v1 simplicity: fetch top 500 popular people (25 pages of 20), iterate,
# filter by birthday matching $TARGET_MM_DD AND popularity > $POPULARITY_THRESHOLD,
# pick highest popularity. If 0 matches → empty case.

CANDIDATES_JSON="$(mktemp -t bday-cand.XXXXXX.json)"
TEMP_FILES=("$CANDIDATES_JSON")
trap 'rm -f "${TEMP_FILES[@]}"' EXIT

# Fetch top 500 popular actors (25 pages × 20 = 500)
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

# Now we need to fetch each candidate's birthday (popular endpoint doesn't include it).
# To minimize API calls, we'll iterate the filtered list and fetch /person/{id}
# for each, checking birthday MM-DD against $TARGET_MM_DD.
#
# Optimization: we sort by popularity DESC first, so we hit popular matches early
# and can stop at the first match (since we want the most-popular birthday match).

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
    echo "  [DRY RUN] Would send: ⏭ No notable birthday today (popularity > $POPULARITY_THRESHOLD threshold). No carousel generated."
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

# Compute slug from name (lowercase, spaces → hyphens, strip non-alphanumeric)
MATCH_SLUG=$(echo "$MATCH_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g; s/--*/-/g; s/^-//; s/-$//')

echo "  Selected: $MATCH_NAME ($MATCH_AGE) — slug: $MATCH_SLUG"
echo ""

# --- (Tasks 4-10 add the rest below) ---

echo "TMDB person discovery complete."
```

- [ ] **Step 2: Test with a known birthday day**

Robert Pattinson's birthday is May 13. Run:

```bash
doppler run -- ./scripts/birthday-carousel.sh --date 2026-05-13
```

Expected: prints "Selected: Robert Pattinson (40)" or another high-popularity actor born on May 13. The script should NOT err out.

If multiple notable actors share May 13, the most-popular wins — that's fine.

- [ ] **Step 3: Test with a likely-empty day**

Pick an obscure date — Feb 29 in a non-leap year:

```bash
doppler run -- ./scripts/birthday-carousel.sh --date 2027-02-28
```

(2027 is not a leap year so Feb 29 doesn't exist as a target.) Use 2027-02-28 — fewer notable actors. May still find someone.

If you want to GUARANTEE empty: temporarily lower the threshold and look for an empty day, OR test the empty path by running on a day you know is empty.

Expected (if empty): "⏭ No notable birthday today..." Discord ping sent (or printed in dry-run).

- [ ] **Step 4: Test --dry-run on an empty day**

```bash
doppler run -- ./scripts/birthday-carousel.sh --dry-run --date 2027-02-28
```

Expected: prints `[DRY RUN] Would send:` line, no Discord call.

- [ ] **Step 5: Commit nothing yet**

---

## Task 4: Filmography fetch + film selection (top 4 by vote_average)

**Files:**
- Modify: `cinetrak/scripts/birthday-carousel.sh` (replace placeholder)

- [ ] **Step 1: Replace the placeholder with filmography logic**

Find:
```bash
echo "TMDB person discovery complete."
```

Replace with:

```bash
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
  ERROR_MSG="⚠️ Birthday carousel ERRORED: $MATCH_NAME has only $FILMS_COUNT qualifying films (need ≥$MIN_FILMS_VIABLE). Date: $TARGET_DATE"
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

# --- (Tasks 5-10 add the rest below) ---

echo ""
echo "Film selection complete."
```

- [ ] **Step 2: Test**

```bash
doppler run -- ./scripts/birthday-carousel.sh --date 2026-05-13
```

Expected: lists 4 films for the matched actor with their `backdrop_path` strings.

- [ ] **Step 3: Commit nothing yet**

---

## Task 5: Image download (TMDB backdrops to ~/Downloads/)

**Files:**
- Modify: `cinetrak/scripts/birthday-carousel.sh` (replace placeholder)

- [ ] **Step 1: Replace the placeholder with image download**

Find:
```bash
echo "Film selection complete."
```

Replace with:

```bash
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
    echo "  ⚠️ Skipping '$TITLE' — no backdrop available."
    INDEX=$((INDEX + 1))
    continue
  fi

  # Slugify title for filename
  TITLE_SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g; s/--*/-/g; s/^-//; s/-$//')
  IMG_PATH="$DOWNLOAD_DIR/$INDEX-$TITLE_SLUG.jpg"

  IMG_URL="$TMDB_IMG_BASE/$IMG_SIZE$BACKDROP_PATH"
  echo "  [$INDEX] Downloading: $TITLE → $IMG_PATH"

  HTTP_CODE=$(curl -sS -o "$IMG_PATH" -w "%{http_code}" "$IMG_URL" || echo "000")

  if [[ "$HTTP_CODE" != "200" ]]; then
    echo "    ⚠️ HTTP $HTTP_CODE — removing partial file"
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
  echo "Error: Only $DOWNLOADED_COUNT images downloaded; need ≥$MIN_FILMS_VIABLE. Carousel not viable." >&2
  ERROR_MSG="⚠️ Birthday carousel ERRORED: Only $DOWNLOADED_COUNT images downloaded for $MATCH_NAME (need ≥$MIN_FILMS_VIABLE). Date: $TARGET_DATE"
  if [[ "$DRY_RUN" != "true" ]]; then
    curl -sS -X POST -H "Content-Type: application/json" \
      -d "$(jq -n --arg c "$ERROR_MSG" '{content: $c}')" \
      "$DISCORD_METRICS_WEBHOOK_URL" >/dev/null
  fi
  exit 1
fi

# --- (Tasks 6-10 add the rest below) ---

echo ""
echo "Image download complete."
```

- [ ] **Step 2: Test**

```bash
doppler run -- ./scripts/birthday-carousel.sh --date 2026-05-13
ls -lh ~/Downloads/birthday-carousel-2026-05-13/
```

Expected: 2-4 JPGs downloaded (typically all 4); each ~100KB-2MB.

- [ ] **Step 3: Verify they're real JPGs**

```bash
file ~/Downloads/birthday-carousel-2026-05-13/*.jpg
```

Expected: each line shows "JPEG image data".

- [ ] **Step 4: Cleanup test artifacts**

```bash
rm -rf ~/Downloads/birthday-carousel-2026-05-13/
```

- [ ] **Step 5: Commit nothing yet**

---

## Task 6: Templated caption (Variant A — Letterboxd-mimic)

**Files:**
- Modify: `cinetrak/scripts/birthday-carousel.sh` (replace placeholder)

- [ ] **Step 1: Replace the placeholder with templated caption generation**

Find:
```bash
echo "Image download complete."
```

Replace with:

```bash
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

# Lowercase first name for the greeting (Letterboxd does lowercase)
LOWER_NAME=$(echo "$MATCH_NAME" | tr '[:upper:]' '[:lower:]')

VARIANT_A=$(cat <<CAPTION
happy birthday $LOWER_NAME 👋

Stills from:
${STILLS_LIST%$'\n'}

#$ACTOR_HASHTAG #HappyBirthday
CAPTION
)

echo "  Variant A:"
echo "$VARIANT_A" | sed 's/^/    /'
echo ""

# --- (Tasks 7-10 add the rest below) ---

echo "Templated caption (Variant A) generated."
```

- [ ] **Step 2: Test**

```bash
doppler run -- ./scripts/birthday-carousel.sh --date 2026-05-13
```

Expected: prints the templated caption with the actor's name, films, and hashtags.

- [ ] **Step 3: Cleanup test artifacts**

```bash
rm -rf ~/Downloads/birthday-carousel-2026-05-13/
```

- [ ] **Step 4: Commit nothing yet**

---

## Task 7: Voice prompt file + Gemini-generated variants (B + C)

**Files:**
- Create: `cinetrak/scripts/birthday-carousel-voice-prompt.txt`
- Modify: `cinetrak/scripts/birthday-carousel.sh` (replace placeholder)

- [ ] **Step 1: Create the voice prompt template file**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak
cat > scripts/birthday-carousel-voice-prompt.txt <<'PROMPT'
Generate a single Instagram caption for PocketStubs (a movie tracking app) celebrating {{ACTOR}}'s birthday today.

Brand voice rules:
- COMPANY voice. NEVER solo-founder. NEVER "I built". NEVER build-in-public framing.
- Cinephile-authority register. Specific over generic — name films, formats, performances.
- No banned vocabulary: "content", "properties", "IPs", "empower", "leverage", "unlock", "synergy".
- Maximum 1 emoji from this set only: 🎬 🎟 🍿 🎞. No other emoji.
- No solo-dev language ("solo founder", "indie maker", "vibe coding").
- Output the caption text only — no preamble, no explanation, no markdown wrapping, no JSON wrapping.

Films available to mention (use 4 or fewer):
{{FILMS}}

Variant-specific instruction:
{{VARIANT_INSTRUCTION}}

End the caption with these hashtags on their own line:
#{{ACTOR_HASHTAG}} #HappyBirthday
PROMPT
```

- [ ] **Step 2: Replace the script placeholder with Gemini-call logic**

Find in `scripts/birthday-carousel.sh`:
```bash
echo "Templated caption (Variant A) generated."
```

Replace with:

```bash
# --- Step E: Generate Variants B + C via Gemini ---
echo "Generating Variants B + C via Gemini..."

VOICE_PROMPT_TEMPLATE="$REPO_ROOT/scripts/birthday-carousel-voice-prompt.txt"
if [[ ! -f "$VOICE_PROMPT_TEMPLATE" ]]; then
  echo "Error: Voice prompt template not found at $VOICE_PROMPT_TEMPLATE" >&2
  exit 1
fi

# Build {{FILMS}} block as a JSON-safe newline-separated list
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

  # Substitute placeholders
  local rendered_prompt
  rendered_prompt=$(sed \
    -e "s|{{ACTOR}}|$MATCH_NAME|g" \
    -e "s|{{ACTOR_HASHTAG}}|$ACTOR_HASHTAG|g" \
    "$VOICE_PROMPT_TEMPLATE")

  # Substitute multiline FILMS + INSTRUCTION via awk (sed struggles with newlines)
  rendered_prompt=$(echo "$rendered_prompt" | awk \
    -v films="$FILMS_BLOCK" \
    -v instr="$instruction" '
    {
      gsub(/\{\{FILMS\}\}/, films);
      gsub(/\{\{VARIANT_INSTRUCTION\}\}/, instr);
      print;
    }')

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
    echo "  ⚠️ Gemini failed for $label (HTTP $http_code). Falling back to templated." >&2
    echo "$VARIANT_A"  # Fallback: reuse Variant A
    return 0
  fi

  local text
  text=$(jq -r '.candidates[0].content.parts[0].text // empty' "$resp_file")

  if [[ -z "$text" ]]; then
    echo "  ⚠️ Gemini returned empty for $label. Falling back to templated." >&2
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

# --- (Tasks 8-10 add the rest below) ---

echo "Gemini variants generated."
```

- [ ] **Step 3: Test**

```bash
doppler run -- ./scripts/birthday-carousel.sh --date 2026-05-13
```

Expected: prints all 3 variants. B and C should be different from A and from each other; B should be a hot take, C should end with "Track them all in PocketStubs" or similar.

- [ ] **Step 4: Cleanup test artifacts**

```bash
rm -rf ~/Downloads/birthday-carousel-2026-05-13/
```

- [ ] **Step 5: Commit nothing yet**

---

## Task 8: Vault note write (direct filesystem; idempotency check)

**Files:**
- Modify: `cinetrak/scripts/birthday-carousel.sh` (replace placeholder)

- [ ] **Step 1: Replace the placeholder with vault note write + idempotency**

Find:
```bash
echo "Gemini variants generated."
```

Replace with:

```bash
# --- Step F: Write vault note (with idempotency check) ---
VAULT_NOTE_PATH="$VAULT_QUEUE_DIR/$TARGET_DATE-birthday-$MATCH_SLUG.md"

# Idempotency: if note exists and --force not set, exit 0 cleanly
if [[ -f "$VAULT_NOTE_PATH" && "$FORCE" != "true" ]]; then
  echo "ℹ️ Vault note already exists for $TARGET_DATE: $VAULT_NOTE_PATH"
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

cat > "$VAULT_NOTE_PATH" <<NOTE
---
status: pending
date: $TARGET_DATE
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

**Approve**: flip \`status: pending\` → \`status: published\`.
**Skip**: flip \`status: pending\` → \`status: skipped\`.
NOTE

echo "  Vault note written."

# --- (Tasks 9-10 add the rest below) ---

echo "Vault note write complete."
```

- [ ] **Step 2: Test**

```bash
doppler run -- ./scripts/birthday-carousel.sh --date 2026-05-13
ls -la "/Users/Shared/evermind/tormajs evermind/Projects/PocketStubs/Business/Marketing Sprints/Queue/"
```

Expected: vault note exists at `2026-05-13-birthday-<actor-slug>.md`.

- [ ] **Step 3: Verify the YAML parses**

```bash
yq eval '.actor.name' "/Users/Shared/evermind/tormajs evermind/Projects/PocketStubs/Business/Marketing Sprints/Queue/2026-05-13-birthday-"*.md
```

Expected: prints the actor's name. (If `yq` isn't installed: `python3 -c "import yaml; print(yaml.safe_load(open('<path>').read().split('---')[1]).get('actor', {}).get('name'))"`.)

- [ ] **Step 4: Test idempotency (re-run without --force)**

```bash
doppler run -- ./scripts/birthday-carousel.sh --date 2026-05-13
```

Expected: prints `ℹ️ Vault note already exists...`, exits 0.

- [ ] **Step 5: Test --force**

```bash
doppler run -- ./scripts/birthday-carousel.sh --date 2026-05-13 --force
```

Expected: regenerates the vault note (overwrites).

- [ ] **Step 6: Cleanup test artifacts**

```bash
rm -f "/Users/Shared/evermind/tormajs evermind/Projects/PocketStubs/Business/Marketing Sprints/Queue/2026-05-13-birthday-"*.md
rm -rf ~/Downloads/birthday-carousel-2026-05-13/
```

- [ ] **Step 7: Commit nothing yet**

---

## Task 9: Discord webhook ping (success message)

**Files:**
- Modify: `cinetrak/scripts/birthday-carousel.sh` (replace placeholder)

- [ ] **Step 1: Replace placeholder with Discord ping**

Find:
```bash
echo "Vault note write complete."
```

Replace with:

```bash
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

DISCORD_MSG=$(cat <<MSG
📬 Birthday carousel ready: $MATCH_NAME ($MATCH_AGE)
Vault: $OBSIDIAN_URI

**Option 1 (Letterboxd mimic):**
$VARIANT_A_DISCORD

**Option 2 (cinephile take):**
$VARIANT_B_DISCORD

**Option 3 (PocketStubs listicle):**
$VARIANT_C_DISCORD

Pick + twist. Images in $DOWNLOAD_DIR/
MSG
)

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
  echo "  ⚠️ Discord webhook returned HTTP $HTTP_CODE (vault note still saved at $VAULT_NOTE_PATH)" >&2
  # Don't fail — vault note is the source of truth
else
  echo "  Discord pinged (HTTP $HTTP_CODE)."
fi

echo ""
echo "✅ Birthday carousel complete for $MATCH_NAME ($MATCH_AGE)."
echo "   Vault note: $VAULT_NOTE_PATH"
echo "   Images:     $DOWNLOAD_DIR/"
```

- [ ] **Step 2: Test full success flow**

```bash
doppler run -- ./scripts/birthday-carousel.sh --date 2026-05-13 --force
```

Expected: full output ending with `✅ Birthday carousel complete...`. Discord channel receives a message with 3 caption options.

- [ ] **Step 3: Verify Discord message received**

Open the Discord channel where `DISCORD_METRICS_WEBHOOK_URL` posts. Expected: message visible with all 3 captions + Obsidian link.

- [ ] **Step 4: Cleanup test artifacts**

```bash
rm -f "/Users/Shared/evermind/tormajs evermind/Projects/PocketStubs/Business/Marketing Sprints/Queue/2026-05-13-birthday-"*.md
rm -rf ~/Downloads/birthday-carousel-2026-05-13/
```

- [ ] **Step 5: Commit nothing yet**

---

## Task 10: Final polish + syntax check

**Files:**
- Modify: `cinetrak/scripts/birthday-carousel.sh` (final review)

- [ ] **Step 1: Read the full script and confirm completeness**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak
wc -l scripts/birthday-carousel.sh
head -5 scripts/birthday-carousel.sh
tail -5 scripts/birthday-carousel.sh
```

Expected: roughly 280-380 lines total. Header at top with usage. Final line is the `Images:     $DOWNLOAD_DIR/` echo or similar.

- [ ] **Step 2: Final syntax check**

```bash
bash -n scripts/birthday-carousel.sh && echo "syntax OK"
```

Expected: `syntax OK`.

- [ ] **Step 3: Verify executable bit still set**

```bash
ls -la scripts/birthday-carousel.sh
```

Expected: `-rwxr-xr-x`.

- [ ] **Step 4: Commit nothing yet**

---

## Task 11: Extend scripts/README.md

**Files:**
- Modify: `cinetrak/scripts/README.md`

- [ ] **Step 1: Read the existing README**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak
wc -l scripts/README.md
head -20 scripts/README.md
```

The README has a section per existing script. Add one for `birthday-carousel.sh` at the bottom (before any "Related" section if one exists).

- [ ] **Step 2: Append the new section**

Use Edit (or write a new chunk to append). Add after the last existing script section + before the very end:

```markdown

---

## birthday-carousel.sh

Daily Letterboxd-style actor birthday carousel generator. **First content-automation pattern (C1) per the marketing automation roadmap.** Mimics Letterboxd's recurring "happy birthday \[actor\] 👋 / Stills from: \[films\]" Instagram post format — proven to drive cinephile-audience engagement (Letterboxd's Pattinson birthday post hit 32.1k likes).

### Usage

```bash
./scripts/birthday-carousel.sh                    # today
./scripts/birthday-carousel.sh --date 2026-05-13  # specific date (testing)
./scripts/birthday-carousel.sh --dry-run          # don't write/post; just print
./scripts/birthday-carousel.sh --force            # overwrite existing vault note
./scripts/birthday-carousel.sh --help
```

### One-time prereqs (before first run)

- `TMDB_READ_ACCESS_TOKEN` set in Doppler `pocketstubs/dev` (already wired — used elsewhere by cinetrak)
- `GEMINI_API_KEY` set in Doppler (already wired — used by bug-report analyzer + ticket scanner + banner generator)
- `DISCORD_METRICS_WEBHOOK_URL` set in Doppler (already wired — daily metrics post here)
- The vault `Marketing Sprints/Queue/` folder is created on first run if it doesn't exist

### What it does

1. Queries TMDB for actors with today's MM-DD birthday + popularity > 20 (paginates 25 pages of `/person/popular`)
2. Picks the most-popular qualifying actor
3. Fetches their filmography; takes top 4 films by `vote_average` (with `vote_count > 100`)
4. Downloads the films' backdrop images to `~/Downloads/birthday-carousel-<DATE>/`
5. Generates 3 caption variants:
   - **A (templated, always-safe)**: direct Letterboxd-mimic format
   - **B (Gemini, cinephile-take)**: hot take about the actor's career arc
   - **C (Gemini, PocketStubs-listicle)**: "track them all in PocketStubs" CTA framing
6. Writes vault note to `Projects/PocketStubs/Business/Marketing Sprints/Queue/<DATE>-birthday-<slug>.md` with status: pending
7. Pings the Discord metrics channel with status + actor + 3 captions inline + Obsidian link

### Status messages (Discord)

| Status | When |
|---|---|
| `📬 Birthday carousel ready: <actor> (<age>)` | Success — vault note + 3 captions ready |
| `⏭ No notable birthday today (popularity > 20 threshold).` | No qualifying actor for today |
| `⚠️ Birthday carousel ERRORED: <reason>.` | TMDB / image / Gemini failure |

### Approval workflow

1. Open the vault note in Obsidian (link in Discord ping)
2. Pick one of the 3 captions, add your twist
3. Drag images from `~/Downloads/birthday-carousel-<DATE>/` into IG (in order)
4. Post manually
5. Edit vault note frontmatter: `status: pending` → `status: published`

### Spec & plan

- Spec: `docs/superpowers/specs/2026-05-13-birthday-carousel-design.md`
- Plan: `docs/superpowers/plans/2026-05-13-birthday-carousel.md`

### Future expansion (out of scope for v1)

- Cron / overnight scheduling
- Buffer API auto-post (paid tier required)
- IG Graph API auto-post (free but Meta API is rough)
- Skip-tracking deny-list (auto-deny actors you've explicitly skipped)
- Multi-actor days (currently picks 1 max per day)
```

- [ ] **Step 3: Verify markdown structure**

```bash
head -50 scripts/README.md
tail -40 scripts/README.md
```

Expected: README still has its existing structure intact + the new section at the bottom.

- [ ] **Step 4: Commit nothing yet**

---

## Task 12: Commit + push + open PR

**Files:**
- Add: `cinetrak/scripts/birthday-carousel.sh`
- Add: `cinetrak/scripts/birthday-carousel-voice-prompt.txt`
- Modify: `cinetrak/scripts/README.md`

- [ ] **Step 1: Stage all 3 files**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak
git add scripts/birthday-carousel.sh scripts/birthday-carousel-voice-prompt.txt scripts/README.md
git status -s
```

Expected: all 3 files listed (one added directory entry, two new files, one modified).

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(scripts): add birthday-carousel.sh — daily Letterboxd-style C1 automation

First content-automation pattern (C1) per the marketing automation roadmap.
Mimics Letterboxd's recurring "happy birthday <actor> 👋 / Stills from:
<films>" Instagram carousel format.

Script flow:
1. TMDB person/popular paginated (25 pages × 20 = 500 candidates)
2. Filter: known_for_department=Acting, popularity > 20
3. Iterate filtered list (sorted popularity DESC), fetch each /person/{id},
   match birthday MM-DD, pick first match
4. /person/{id}/movie_credits, top 4 by vote_average (vote_count > 100,
   fallback to >50 if needed)
5. Download backdrops to ~/Downloads/birthday-carousel-<DATE>/
6. Variant A: templated Letterboxd-mimic caption
7. Variants B/C: Gemini gemini-2.5-flash with brand voice prompt
   (committed at scripts/birthday-carousel-voice-prompt.txt)
8. Direct filesystem write to vault Marketing Sprints/Queue/<date>-...md
9. Discord webhook ping with status + 3 captions inline + Obsidian URI

Three status shapes for Discord: ready / no-birthday-today / errored.

Idempotency: re-runs no-op unless --force. Architecture supports future ii
(Buffer auto-post) and iii (Graph API auto-post) reading the same vault
frontmatter contract.

Spec: docs/superpowers/specs/2026-05-13-birthday-carousel-design.md
Plan: docs/superpowers/plans/2026-05-13-birthday-carousel.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Push the branch**

```bash
git push -u origin chore/birthday-carousel-spec 2>&1 | tail -3
```

Expected: branch pushed; PR creation URL printed by GitHub.

- [ ] **Step 4: Open PR**

```bash
gh pr create --title "feat(scripts): birthday-carousel.sh — daily Letterboxd-style C1 automation" --body "$(cat <<'BODY'
## Summary

First content-automation pattern (**C1** per the marketing automation roadmap). Mimics Letterboxd's recurring birthday carousel post format — TMDB-driven actor selection, film stills, 3 caption variants, vault approval queue, Discord ping.

## What ships

- `scripts/birthday-carousel.sh` — bash, ~300 lines, mirrors style of `sync-supabase-secrets.sh` + `deploy-email-templates.sh`
- `scripts/birthday-carousel-voice-prompt.txt` — Gemini voice prompt template (committed; evolves under version control)
- `scripts/README.md` — extended with usage section

## How to use

```bash
doppler run -- ./scripts/birthday-carousel.sh                    # today
doppler run -- ./scripts/birthday-carousel.sh --date 2026-05-13  # specific date
doppler run -- ./scripts/birthday-carousel.sh --dry-run          # preview only
doppler run -- ./scripts/birthday-carousel.sh --force            # overwrite existing
```

Outputs:
- 4 film stills downloaded to `~/Downloads/birthday-carousel-<DATE>/`
- Vault note at `Projects/PocketStubs/Business/Marketing Sprints/Queue/<DATE>-birthday-<slug>.md` with `status: pending` + 3 caption variants
- Discord ping with status + actor + 3 captions inline + Obsidian link

## Test plan

- [x] `bash -n` syntax clean
- [x] `--help` exits 1 with usage
- [x] `--dry-run` prints without writing/posting
- [x] `--date 2026-05-13` produces real run with 4 captions across all variants
- [x] Idempotency: re-run without `--force` no-ops cleanly
- [x] `--force` regenerates
- [x] Empty-day case sends `⏭` Discord ping + no vault note
- [x] Vault note YAML parses cleanly

## Out of scope (deferred)

- Cron / scheduler — separate followup once content quality is trusted
- Buffer API auto-post (ii) — paid tier
- IG Graph API auto-post (iii) — Meta API is rough
- Skip-tracking deny-list — manual skip via vault for now
- Multi-actor days — currently picks 1 max
- News-risk classifier — relies on user catching via approval queue

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)" 2>&1 | tail -3
git log --oneline -3
```

Expected: PR URL printed.

---

## Self-review checklist (already performed)

- ✅ **Spec coverage**: Every spec section maps to a task.
  - Goal/success criterion → Task 9 Step 2 (full success flow)
  - Stack additions → Tasks 2 (script base), 7 (voice prompt), 11 (README)
  - Workflow steps 1-16 → Tasks 2-9 (incremental script build)
  - Vault note shape verbatim → Task 8 Step 1
  - Discord ping shape verbatim → Task 9 Step 1 (success), Task 3 Step 1 (empty), various error paths
  - Brand voice prompt verbatim → Task 7 Step 1
  - Verification gates → Tasks 2 + 9 (smoke tests at each phase)
  - Failure modes → handled in each task's error paths inline
  - Documentation outputs → Task 11 (README) + future Process note (manual after first real run)
  - Out-of-scope items → not in any task (correctly absent)
- ✅ **Placeholder scan**: No "TBD" / "implement later" / vague handwaves. The script's runtime placeholders (`$MATCH_NAME`, `$TARGET_DATE`, etc.) are bash variable interpolation, not plan placeholders.
- ✅ **Type/name consistency**:
  - Variable names: `MATCH_PERSON_ID`, `MATCH_NAME`, `MATCH_SLUG`, `TARGET_DATE`, `TARGET_MM_DD` consistent across tasks
  - Path patterns: `$VAULT_QUEUE_DIR/$TARGET_DATE-birthday-$MATCH_SLUG.md`, `$DOWNLOAD_DIR/<n>-<slug>.jpg` consistent
  - JSON variable: `DOWNLOADED_FILMS_JSON` flows from Task 5 → Tasks 6, 7, 8
  - Discord message format consistent across success/empty/error shapes
  - Hashtag generation: `ACTOR_HASHTAG` defined in Task 6, reused in Task 7 (Gemini prompt template)
- ✅ **Honest unknowns**:
  - TMDB doesn't expose a direct "birthday today" endpoint — Task 3 documents the workaround (paginate `/person/popular`, iterate `/person/{id}`)
  - Image quality from TMDB backdrops is variable — Task 5 documents fallback behavior
  - Gemini may produce off-brand content — Task 7 documents fallback to Variant A
  - The vault path is hardcoded macOS-specific — same pattern as `log-marketing-piece.sh`; future EVERMIND_VAULT env var per the deferred followup #449
