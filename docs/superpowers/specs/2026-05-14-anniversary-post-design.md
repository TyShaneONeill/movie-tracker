# Film Anniversary Post — Design (C2)

**Date:** 2026-05-14
**Phase:** Marketing automation **C2** — second content-automation pattern (forks C1's reusable backbone)
**Status:** Spec — pending implementation via `scripts/agent-run.sh <issue-N>`
**Predecessor:** [C1 — Daily Birthday Carousel](2026-05-13-birthday-carousel-design.md) — shipped in PR #452

---

## Context

C1 (daily birthday carousel) shipped as the first content-automation pattern. C2 is the second: **"X years ago today" film anniversary posts** — Letterboxd-style nostalgia post for film milestones (10/20/25/50 years since release, etc.).

~80% of C1's code path is reusable: TMDB query → image download → caption generation (1 templated + 2 Gemini variants in PocketStubs voice) → vault note in `Marketing Sprints/Queue/` → Discord ping with caption options. C2 forks C1's voice-prompt template and script structure, not duplicates them.

### Marketing decomposition reference

| ID | Pattern | Status |
|---|---|---|
| C1 | Daily actor birthday carousel | **Shipped PR #452** |
| **C2 (this spec)** | Film anniversary post ("X years ago today") | Pending implementation |
| C3 | Trailer drop monitor + repost | Deferred — separate sub-phase later |
| C4 | Awards/festival reactive posts | Deferred (mostly manual anyway) |

### Why C2 ships next

1. **Daily cadence proven** — C1 daily run validates the pipeline shape; C2 reuses it
2. **Cultural format mimicry** — anniversary posts are Letterboxd's #2 highest-engagement format after birthdays
3. **Cheaper than C1** — vote_count-based film filter (14 API calls/run) vs C1's ~500 person-lookup calls
4. **Compounds again** — C3 (trailer monitor) reuses the same caption + vault + Discord pipeline

---

## Goal & success criterion

Build `cinetrak/scripts/anniversary-post.sh` — a bash script that, when run, queries TMDB for films released exactly N years ago today (N ∈ milestone set), picks the highest-vote_count qualifying film, downloads 1 poster + 3 backdrops, generates 3 IG caption variants (1 templated + 2 Gemini PocketStubs-voice), writes a vault note to `Projects/PocketStubs/Business/Marketing Sprints/Queue/<YYYY-MM-DD>-anniversary-<film-slug>.md`, and pings the existing Discord webhook with status + 3 caption options inline + Obsidian link.

**Success =** all of:

1. Running `./scripts/anniversary-post.sh` on a day with a qualifying anniversary produces:
   - 1 poster JPG + up to 3 backdrop JPGs in `~/Downloads/anniversary-post-<YYYY-MM-DD>/`
   - 1 vault note with frontmatter (status, film metadata, milestone, 3 caption variants)
   - 1 Discord message containing status + film + milestone + 3 caption options + vault link
2. Running on a day with no qualifying anniversary produces a `⏭ No notable anniversary today` Discord ping and no vault note
3. Re-running on the same day no-ops idempotently unless `--force` (mirrors C1)
4. Script handles errors (TMDB down, Gemini down, image fetch fails) without corrupting partial state
5. **Year math is verifiable**: every Gemini-generated caption either contains the literal `{{MILESTONE_YEARS}}` string OR falls back to templated — no hallucinated years
6. Tyshane can review the vault note, pick a caption, drag images into IG, post, and flip `status: pending` → `status: published`
7. Architecture supports same future ii (Buffer auto-post) / iii (Graph API auto-post) upgrade paths as C1 — reads the same vault note frontmatter contract

---

## Stack

### Added in this phase

- `cinetrak/scripts/anniversary-post.sh` — bash, executable, committed (~350 LOC, forks C1 backbone)
- `cinetrak/scripts/anniversary-post-voice-prompt.txt` — Gemini prompt template (committed; evolves under version control)
- `cinetrak/scripts/README.md` extended with section for the new script (same template as C1)

### Reused from existing stack (do NOT duplicate — verify exists, then re-use)

- `TMDB_READ_ACCESS_TOKEN` from Doppler — already wired
- `GEMINI_API_KEY` from Doppler — already wired
- `DISCORD_METRICS_WEBHOOK_URL` from Doppler — already wired
- `VAULT_QUEUE_DIR="/Users/Shared/evermind/tormajs evermind/Projects/PocketStubs/Business/Marketing Sprints/Queue"` — same path as C1
- Bash patterns from `scripts/birthday-carousel.sh`:
  - `yaml_quote()` helper (single-quote YAML strings; escapes `'` → `''` per YAML spec) — **copy verbatim, don't reinvent**
  - `shopt -s nullglob` early idempotency check pattern — **copy verbatim**
  - `GEMINI_FAILED_FLAG` temp-file subshell signaling pattern — **copy verbatim**
  - `THRESHOLD=${ENV_OVERRIDE:-default}` env override pattern
  - `cd "$(dirname "${BASH_SOURCE[0]}")/.."` repo-root anchoring
  - `indent_for_yaml()` 6-space indenter for caption frontmatter literal blocks
  - Pre-compute yaml_quote BEFORE heredoc (heredocs don't expand functions)
  - `call_gemini()` Python3-based template substitution (awk can't handle multiline vars on macOS bash 3.x)
  - SIGINT trap with cleanup hint
  - `curl -sS --connect-timeout 10 --max-time 30` timeout discipline
- macOS bash 3.x compatibility — no `${var^^}`, no `declare -A`

### Explicitly NOT in this phase (deferred)

- **Cron / scheduler** — manual trigger for v1; cron added once C2 quality is trusted
- **Buffer API integration** (ii) — paid tier; defer
- **IG Graph API integration** (iii) — Meta's Graph API is rough; defer
- **Skip-tracking deny-list** — re-skips allowed for v1 (same as C1)
- **Multi-anniversary days** — pick ONE film per day, even if 3 milestones land on same date
- **News-risk classifier** — Tyshane catches "wish happy anniversary to a cancelled film" risk via approval queue
- **Foreign-language film handling** — uses TMDB English title via `language=en-US`; subtitles deferred
- **Auto-publish (any path)** — vault `status: published` is a manual flip
- **Universal forbidden zones** — never touch: SQL migrations, auth, payments, RLS, webhooks, edge functions, no new npm dependencies

---

## Milestone set

```bash
MILESTONE_YEARS=(10 15 20 25 30 40 50 60 70 75 80 90 100)
```

**Rationale:**
- **10, 15, 20, 25** — modern nostalgia sweet spot
- **30, 40, 50** — generational anniversaries (films viewers' parents grew up with)
- **60, 70, 75, 80, 90, 100** — classic cinema heritage anniversaries
- **Skipped:** 5 (too soon to be nostalgic), 35/45/55/65/85/95 (off-beat, not culturally resonant)

`ANNIVERSARY_MILESTONES` env var can override the array as a space-separated string. Default to the array above. Example: `ANNIVERSARY_MILESTONES="25 50 75 100" ./scripts/anniversary-post.sh` for major-only mode.

---

## Workflow (script's runtime flow)

| # | Step | Failure → recovery |
|---|---|---|
| 1 | Anchor to cinetrak repo root via `cd "$(dirname "${BASH_SOURCE[0]}")/.."` | — |
| 2 | Parse args: `--help`, `--dry-run`, `--force`, `--date <YYYY-MM-DD>` override | Invalid → exit 1 with usage |
| 3 | Prereq checks: `curl`, `jq`, `doppler`, `python3` on PATH | Missing → exit 1 with install hint |
| 4 | Verify `TMDB_READ_ACCESS_TOKEN`, `GEMINI_API_KEY`, `DISCORD_METRICS_WEBHOOK_URL` env-injected | Missing → exit 1 with `doppler secrets set` hint |
| 5 | Compute `TARGET_DATE` (today or `--date` override) and `TARGET_YEAR` / `TARGET_MM_DD` | — |
| 6 | **Early idempotency check** via `shopt -s nullglob` for `$VAULT_QUEUE_DIR/$TARGET_DATE-anniversary-*.md` — exit 0 if exists and not `--force` | — |
| 7 | For each milestone year `Y` in `MILESTONE_YEARS`: compute `RELEASE_DATE = TARGET_YEAR - Y`-`TARGET_MM_DD`. Query TMDB `/discover/movie?primary_release_date.gte=$RELEASE_DATE&primary_release_date.lte=$RELEASE_DATE&language=en-US&sort_by=vote_count.desc` | TMDB error on any milestone → log warning, continue; if ALL fail → `⚠️` ping + exit 1 |
| 8 | Accumulate all candidates across milestone years with `milestone_years` annotation. Filter: `vote_count > $VOTE_COUNT_MIN`. | — |
| 9 | If 0 candidates: send Discord `⏭ No notable anniversary today` ping; exit 0 cleanly | — |
| 10 | Sort accumulated candidates by `vote_count DESC`, pick top 1 | — |
| 11 | Fetch `/movie/{id}/images?language=en-US,en,null` (the comma-list pulls language-tagged + untagged images) | TMDB error → `⚠️` ping + exit 1 |
| 12 | Select images: 1 highest-vote_average poster (prefer `iso_639_1=en` or null), 3 highest-vote_average backdrops (prefer `iso_639_1=null` for text-free) | If <1 poster → fallback to first backdrop as poster; if <2 total images → `⚠️` ping + exit 1 |
| 13 | Download images to `~/Downloads/anniversary-post-$TARGET_DATE/`: `1-poster-<slug>.jpg`, `2-still-<slug>.jpg`, etc. | Individual fail → log warning, continue; if <2 total succeed → `⚠️` ping + exit 1 |
| 14 | Generate Variant A (templated Letterboxd-mimic) — pure string interpolation | — |
| 15 | Generate Variants B + C via Gemini. **Year-math validation**: after each Gemini response, regex-scan for 4-digit years; if any year appears that is NOT in `[RELEASE_YEAR, TARGET_YEAR]`, mark Gemini failed and fall back to templated. Also require `{{MILESTONE_YEARS}}` literal string present. | Gemini error OR validation failure → fall back to templated; set `gemini_failed: true` in frontmatter |
| 16 | Write vault note via direct filesystem write (NOT MCP — bash can't call MCP at runtime) to `$VAULT_QUEUE_DIR/$TARGET_DATE-anniversary-$FILM_SLUG.md` | Write fail → exit 1 with error message |
| 17 | Send Discord webhook ping with status + film + milestone + 3 captions inline + Obsidian URI | Discord fail → log to stderr; vault note is source of truth; exit 0 |
| 18 | Print summary to stdout: film, milestone, image paths, caption variants count | — |

`set -euo pipefail` + early prereq checks + SIGINT cleanup trap ensure no partial state corruption mid-run.

---

## The vault note shape (verbatim)

Path: `Projects/PocketStubs/Business/Marketing Sprints/Queue/<YYYY-MM-DD>-anniversary-<film-slug>.md`

```markdown
---
status: pending  # pending | published | skipped
date: '2026-07-03'
type: anniversary
film:
  title: 'Independence Day'
  tmdb_id: 602
  release_date: '1996-07-03'
  release_year: 1996
  vote_count: 8842
  vote_average: 6.9
milestone_years: 30
target_year: 2026
images:
  - role: poster
    path: '~/Downloads/anniversary-post-2026-07-03/1-poster-independence-day.jpg'
  - role: backdrop
    path: '~/Downloads/anniversary-post-2026-07-03/2-still-independence-day.jpg'
  - role: backdrop
    path: '~/Downloads/anniversary-post-2026-07-03/3-still-independence-day.jpg'
  - role: backdrop
    path: '~/Downloads/anniversary-post-2026-07-03/4-still-independence-day.jpg'
captions:
  - variant: letterboxd-mimic
    source: template
    text: |
      30 years ago today: Independence Day (1996)

      Released July 3, 1996.

      #IndependenceDay #FilmAnniversary
  - variant: cinephile-take
    source: gemini
    text: |
      30 years on, Independence Day is the disaster-movie template every
      blockbuster summer still tries to clear — practical effects, four
      ensembles, a 145-minute runtime nobody now would greenlight.

      #IndependenceDay #FilmAnniversary
  - variant: pocketstubs-listicle
    source: gemini
    text: |
      Independence Day turns 30 today. Track every rewatch in PocketStubs.

      #IndependenceDay #FilmAnniversary
---

# Anniversary post — 2026-07-03 — Independence Day (30 years)

Drag images from `~/Downloads/anniversary-post-2026-07-03/` into IG (poster first, then stills in order). Pick one of the 3 captions above + add your twist.

**Approve**: flip `status: pending` → `status: published`.
**Skip**: flip `status: pending` → `status: skipped`.
```

**Note:** `milestone_years` is the exact integer milestone matched. `release_year` and `target_year` are both included so future tooling (or readers) can sanity-check year math without re-deriving.

---

## The Discord ping shape (verbatim)

### Success case:

```
🎞 Anniversary ready: Independence Day (30 years)
Vault: obsidian://open?vault=evermind&file=Projects/PocketStubs/Business/Marketing%20Sprints/Queue/2026-07-03-anniversary-independence-day

**Option 1 (Letterboxd mimic):**
30 years ago today: Independence Day (1996)
Released July 3, 1996.
#IndependenceDay #FilmAnniversary

**Option 2 (cinephile take):**
30 years on, Independence Day is the disaster-movie template every blockbuster summer still tries to clear...

**Option 3 (PocketStubs listicle):**
Independence Day turns 30 today. Track every rewatch in PocketStubs.

Pick + twist. Images in ~/Downloads/anniversary-post-2026-07-03/
```

### Empty case:

```
⏭ No notable anniversary today (vote_count > 500 across all milestones: 10/15/20/25/30/40/50/60/70/75/80/90/100). No post generated.
```

### Error case:

```
⚠️ Anniversary post ERRORED: <one-line reason>. Date: <DATE>.
```

Discord 2000-char hard limit honored via per-caption truncation to 400 chars (same as C1), then final-message length safety truncate to 1900.

---

## Brand voice prompt for Gemini (variants B + C)

Stored at `cinetrak/scripts/anniversary-post-voice-prompt.txt`. Forks C1's voice prompt — same brand rules, anniversary-specific variant instructions, year-math constraint.

Skeleton:

```text
Generate a single Instagram caption for PocketStubs (a movie tracking app) celebrating the {{MILESTONE_YEARS}}-year anniversary of the film "{{FILM_TITLE}}" (released {{RELEASE_DATE}}, {{RELEASE_YEAR}}).

Today is {{TARGET_DATE}} ({{TARGET_YEAR}}). The film is exactly {{MILESTONE_YEARS}} years old today.

CRITICAL: The caption MUST include the literal string "{{MILESTONE_YEARS}} years" somewhere — do NOT round it, do NOT change it to "{{MILESTONE_YEARS}}th anniversary", do NOT substitute a different number. The only acceptable years in the caption are {{RELEASE_YEAR}} and {{TARGET_YEAR}}. Do NOT invent any other dates.

Brand voice rules:
- COMPANY voice. NEVER solo-founder. NEVER "I built". NEVER build-in-public framing.
- Cinephile-authority register. Specific over generic — reference the film's specific era, format, performances, or cultural moment.
- No banned vocabulary: "content", "properties", "IPs", "empower", "leverage", "unlock", "synergy".
- Maximum 1 emoji from this set only: 🎬 🎟 🍿 🎞. No other emoji.
- No solo-dev language ("solo founder", "indie maker", "vibe coding").
- Output the caption text only — no preamble, no explanation, no markdown wrapping, no JSON wrapping.

Variant-specific instruction:
{{VARIANT_INSTRUCTION}}

End the caption with these hashtags on their own line:
#{{FILM_HASHTAG}} #FilmAnniversary
```

### Variant-specific instructions:

- **B (cinephile-take)**: `Cinephile-authority hot take. State a defensible thesis about what the film means {{MILESTONE_YEARS}} years on — its influence, its rewatchability, its critical re-evaluation, or how it has aged. 1-2 sentences. No CTA. Confident, not casual.`
- **C (pocketstubs-listicle)**: `Short PocketStubs-style nostalgia framing. Open by stating the film's age ("[Film] turns {{MILESTONE_YEARS}} today.") then a single short CTA: "Track every viewing in PocketStubs." or "Add it to your stubs.". No emoji except the hashtag block. Maximum 3 lines.`

---

## Year-math hallucination guard (defensive)

Gemini will sometimes hallucinate anniversary years ("on its 40th anniversary" for a 46-year-old film) or invent unrelated dates. This script defends against both:

1. **Pre-validation** — every Gemini call passes pre-computed `{{MILESTONE_YEARS}}`, `{{RELEASE_YEAR}}`, `{{TARGET_YEAR}}` as literal string substitutions. Gemini never has to do year math.

2. **Post-validation** — after each Gemini response:
   - **Required-string check:** scan for the literal substring `"{{MILESTONE_YEARS}} years"` (e.g., `"46 years"`). If absent → reject, fall back to Variant A.
   - **Year-whitelist scan:** regex `\b(19|20)\d{2}\b` over output. Set of all matched years must be a subset of `{RELEASE_YEAR, TARGET_YEAR}`. If any other year appears → reject, fall back to Variant A.

3. **Frontmatter signal** — if either B or C falls back, write `gemini_failed: true` in vault note frontmatter so future automation and the human reviewer both know captions are degraded.

Implementation lives in a `validate_gemini_year_math()` helper called after the existing C1-pattern `call_gemini()` returns text. Keep it inline — don't add a separate file.

---

## Verification gates

| Gate | When | Owner |
|---|---|---|
| `./scripts/anniversary-post.sh --help` exits 0 with usage | Install verify | Human |
| `./scripts/anniversary-post.sh --dry-run --date 2026-05-21` produces output without writing vault note or pinging Discord | Install verify | Human |
| First real run on known-good day: vault note + images + Discord ping within 30s | First proof-of-value | Human |
| Variant A is bit-for-bit anniversary template (contains "X years ago today: <film> (<year>)") | Format compliance | Human (diff inspection) |
| Variants B + C honor brand voice rules AND year-math constraint | Brand compliance | Human (read outputs) |
| Year-math guard: temporarily munge prompt to inject wrong year → script falls back to Variant A AND writes `gemini_failed: true` | Defensive | Human (manual injection test) |
| Empty-day case: `--date` with no qualifying milestones → `⏭` ping + no vault note + exit 0 | Edge case | Human |
| TMDB error case (bogus token) → `⚠️` ping + clear log + exit 1 | Edge case | Human (munge env var) |
| Re-running same day → no-op exit 0; `--force` regenerates | Idempotency | Human |

### First-run verification strategy

TMDB's `/discover/movie` filters on `primary_release_date` (one specific worldwide-earliest release date per film). Many days will be empty — that's expected behavior, not a bug. Empty-day handling (the `⏭` ping path) IS a verification gate, not a failure.

The implementer should:
1. Iterate `--date` across the next 14 days from today to find at least ONE real-result day AND at least ONE verified-empty day
2. Confirmed candidate anniversaries to try first (pick the one closest to actual run-date for proof-of-value):
   - **2026-07-03** (30yr) — Independence Day (1996) — likely hits
   - **2026-05-21** (30yr) — 1996-05-21 releases — possible
   - **2026-09-23** (30yr) — 1996-09-23 releases — possible
3. Document both the real-result date AND the empty-day date in the PR description as paired evidence

**Empty days are not failures.** The script is correct to report no anniversary on most days. Don't lower thresholds to force a hit on every day — that defeats the cultural-footprint filter.

---

## Failure modes & recovery

| Failure | Detection | Recovery |
|---|---|---|
| TMDB API down or returns error on a single milestone year | Step 7 — non-2xx | Log warning, continue with remaining milestones |
| TMDB API down or returns error on ALL milestone years | Step 7 — all failed | `⚠️` ping + exit 1 |
| Zero qualifying films across all milestones | Step 9 | `⏭` ping; exit 0 cleanly; no vault note |
| Film has no images at all (rare for vote_count > 500) | Step 11/12 | `⚠️` ping naming the film; exit 1 |
| Poster fetch fails but backdrops succeed | Step 12 | Use first backdrop as poster; log warning |
| Image download fails for 1 of 4 | Step 13 | Log warning, proceed with remaining images |
| Image downloads fail for ≥3 of 4 | Step 13 | `⚠️` ping; exit 1 |
| Gemini API down | Step 15 | Fall back templated B and C; set `gemini_failed: true` |
| Gemini returns text that fails year-math validation | Step 15 | Fall back to templated; set `gemini_failed: true` |
| User Ctrl-C mid-run | Anywhere | SIGINT trap prints cleanup hint; `set -euo pipefail` ensures no half-written vault note |
| Re-run on same day | Step 6 | Early `shopt -s nullglob` check → exit 0 unless `--force` |
| Foreign-language film selected, English title unavailable | Step 7/11 | TMDB `/discover/movie?language=en-US` returns English-localized titles; if blank, fall back to original_title |

---

## Spec deviations from C1 to note

| C1 pattern | C2 deviation | Why |
|---|---|---|
| ~500 TMDB person-lookup calls per run | ~14 TMDB discover calls per run | Anniversary search is keyed on exact-date filter — discover is the native fit |
| 4 backdrops from 4 different films | 1 poster + 3 backdrops from same film | C2 is single-film focused; poster is the anniversary icon |
| `popularity > threshold` filter | `vote_count > threshold` filter | Anniversaries need cultural footprint; vote_count doesn't decay |
| No Gemini post-validation | Year-math hallucination guard | Anniversaries are number-heavy; hallucination risk is concrete |
| Voice prompt has actor-only context | Voice prompt has film + milestone + dates | Forks C1's prompt, anniversary-specific instructions |
| `BIRTHDAY_POPULARITY_THRESHOLD` env override | `ANNIVERSARY_VOTE_COUNT_MIN` + `ANNIVERSARY_MILESTONES` env overrides | Same pattern, different tunable knobs |

---

## Documentation outputs

- `cinetrak/scripts/README.md` extended with `anniversary-post.sh` section (mirror C1's section structure)
- Vault: `Projects/PocketStubs/Business/Marketing Sprints/Queue/` (already exists from C1)
- **NO Process note for this implementation per skip-ceremony pattern.** ONE consolidated `Projects/PocketStubs/Process/C2 - Anniversary Post First Run.md` written by hand after first real-run, capturing observed quality + any new feedback memories
- No new ADR — anniversary automation is a continuation of the C1 ADR / marketing automation phase tracking

---

## Out of scope

(Repeated for visibility.)

- Cron / scheduler
- Buffer API integration (ii)
- IG Graph API integration (iii)
- Visual identity sprint
- C3 trailer monitor / C4 awards reactive
- News-risk classifier
- Skip-tracking deny-list
- Multi-anniversary days (one post max per day)
- Foreign-language subtitle handling
- AI-trained voice agent
- Auto-publish (any path)
- Universal forbidden zones: auth, payments, RLS, webhooks, edge functions, SQL migrations, new npm dependencies

---

## Decision log

| Decision | Choice | Why |
|---|---|---|
| Second content-automation pattern | C2 anniversary post | Letterboxd's #2 highest-engagement format; ~80% code reuse from C1; cheaper API path |
| Milestone set | 10/15/20/25/30/40/50/60/70/75/80/90/100 | Modern nostalgia + generational + classic heritage; skip 5 (too soon) and off-beats (35/45/55...) |
| Daily output | One film max per day | Matches C1 cadence; idempotency contract |
| Film selection | `vote_count DESC`, threshold > 500 | Cultural footprint over current trendiness; vote_count doesn't decay |
| TMDB query path | `/discover/movie` with exact `primary_release_date.gte=lte` | One call per milestone year (~14 total) vs C1's ~500 person calls |
| Image strategy | 1 poster + 3 backdrops, same film | Single-film post; poster as anniversary icon, stills for texture |
| Caption variants | 3 (1 templated + 2 Gemini) | Matches C1 pattern; user already validated |
| Year-math guard | Pre-substitute + post-regex validate + fall-back-and-flag | Number-heavy posts have concrete hallucination risk |
| Voice prompt file | New `anniversary-post-voice-prompt.txt`, FORK of C1's | Single source of truth per content type; evolves independently |
| Idempotency | `shopt -s nullglob` early check, `--force` to override | C1 pattern verbatim |
| Image storage | `~/Downloads/anniversary-post-<DATE>/` | C1 pattern (drag-from-Finder UX) |
| `--date` override | Yes | Testing against known-good past anniversaries |

---

## Acceptance criteria

The implementation must:

1. Bash script with `set -euo pipefail`, anchor to repo root, executable bit set
2. Cover all 18 workflow steps with explicit error messages + Discord-ping recovery shapes
3. Include the verbatim vault-note frontmatter shape
4. Include the verbatim Discord ping shapes (success / empty / error)
5. Include the verbatim brand voice prompt + 2 variant-specific instructions
6. Implement the year-math hallucination guard with both required-string and year-whitelist checks
7. Test plan covers: `--help`, `--dry-run`, `--date <known-good>`, `--date <known-empty>`, error injection, year-math guard injection, idempotency
8. `cinetrak/scripts/anniversary-post-voice-prompt.txt` exists and is committed
9. `cinetrak/scripts/README.md` extended
10. **Pre-flight grep MANDATORY** before writing the script: confirm `yaml_quote`, `shopt -s nullglob`, `GEMINI_FAILED_FLAG`, `call_gemini`, `indent_for_yaml` patterns exist in `scripts/birthday-carousel.sh` and re-use them verbatim instead of reinventing
11. First proof-of-value run iterates `--date` across the next 7-14 days to find a real-result day; that date is documented in the PR description as the verification evidence
12. PR body uses `Closes #<issue-N>` for auto-close
13. Universal forbidden zones: none touched

Deferred followups filed as separate small issues at PR-merge time (mirror the C1 followup pattern that produced #453-458).
