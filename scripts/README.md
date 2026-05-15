# scripts/

Repo automation scripts. Mix of bash and Node depending on what fits the task.

## agent-run.sh

One-command runner for OMC Autopilot on a GitHub issue. Replaces the manual 13-step runbook from earlier OMC adoption phases (0+1 through 3).

### Usage

```bash
./scripts/agent-run.sh <issue-number-or-url>
```

Examples:

```bash
./scripts/agent-run.sh 437
./scripts/agent-run.sh https://github.com/TyShaneONeill/movie-tracker/issues/437
```

### One-time prereqs (before first run)

- `gh auth login` — authenticate the GitHub CLI
- `doppler login` — authenticate Doppler against your account
- `omc setup` — bootstrap OMC's slash commands into `~/.claude/`
- `GITHUB_PAT` set in Doppler `pocketstubs/dev` (verified at runtime by the script; if missing, the script tells you the `doppler secrets set` command to run)

### What it does

1. Verifies prereqs (`tmux`, `gh`, `doppler`, `omc`)
2. Verifies the GitHub issue exists
3. Enforces strict idempotency — fails fast if a worktree, branch, or tmux session already exists for this issue
4. Pulls `main`, creates `.worktrees/agent-issue-<N>/` on `feature/agent-issue-<N>`
5. Runs `npm install` and `doppler setup --no-interactive --project pocketstubs --config dev`
6. Verifies `GITHUB_PAT` is injected from Doppler
7. Launches tmux session `agent-<N>`, runs `doppler run -- omc` inside
8. Pastes the autopilot meta-brief pointing at the issue
9. Attaches you to the tmux session

Total time: ≤ 6 minutes (most of which is `npm install`).

### When to use this vs the brainstorm flow

- **Use this script** for routine bug fixes and small features where the issue body has a clear brief. No spec/plan ceremony needed.
- **Use the brainstorm flow** (`docs/superpowers/specs/`) for new capabilities, architectural changes, or anything novel/risky.

### Recovery

If the script fails or you Ctrl-C, run the cleanup command from the error message. Generic shape:

```bash
git worktree remove --force .worktrees/agent-issue-<N> 2>/dev/null
git branch -D feature/agent-issue-<N> 2>/dev/null
tmux kill-session -t agent-<N> 2>/dev/null
```

### Fallback for `/autopilot`

If `/autopilot` doesn't autocomplete in the CC session (rare), detach (`Ctrl-B` then `d`), re-attach with `tmux attach -t agent-<N>`, scroll back to find the brief, and re-paste it with `autopilot:` (natural-language prefix) instead of `/autopilot`.

### Spec & plan

- Spec: `docs/superpowers/specs/2026-05-12-omc-phase35a-runner-design.md`
- Plan: `docs/superpowers/plans/2026-05-12-omc-phase35a-runner.md`

---

## generate-banners.sh

Reads the Banner Design Spec from the Evermind vault and produces six Imagen-optimized prompts (one per platform). In `--dry-run` mode (default), prints prompts and a cost estimate without spending a cent. In `--generate` mode, calls the Gemini Imagen API to produce actual PNG files.

### Usage

```bash
./scripts/generate-banners.sh              # dry-run (default) — print prompts + cost
./scripts/generate-banners.sh --dry-run    # explicit dry-run
./scripts/generate-banners.sh --generate   # call Gemini API (~$0.24 for 6 images)
./scripts/generate-banners.sh --help       # show usage
```

Via Doppler (recommended):

```bash
doppler run -- ./scripts/generate-banners.sh --generate
```

### Output

`assets/marketing/banners/<platform>-banner.png` for all 6 platforms:

| File | Platform | Size |
|---|---|---|
| `instagram-story-banner.png` | Instagram story highlight | 1080×1920 |
| `tiktok-banner.png`          | TikTok profile cover     | 1080×1920 |
| `twitter-banner.png`         | Twitter/X header         | 1500×500  |
| `reddit-banner.png`          | Reddit subreddit banner  | 4028×256  |
| `youtube-banner.png`         | YouTube channel art      | 2560×1440 |
| `discord-banner.png`         | Discord server banner    | 1920×1080 |

### Doppler prereqs

`GEMINI_API_KEY` — already stored in Doppler `pocketstubs/dev`. If missing:

```bash
doppler secrets set GEMINI_API_KEY --project pocketstubs --config dev
```

### When to use

- When preparing the W18 (or any sprint) platform launch — generate banner candidates before uploading to each platform.
- Re-run after brand updates to refresh all 6 banners from the same prompt system.

### API notes

Uses Imagen 3 (`imagen-3.0-generate-002`) — the GA model as of May 2026. Imagen 4 is in preview; swap the `MODEL` variable at the top of the script when it reaches GA. See:
`https://ai.google.dev/gemini-api/docs/imagen`

---

## shorten-marketing-link.sh

Shortens a long UTM-tagged URL via the Dub.sh API. Prints the short URL to stdout (pipe-friendly — one line, no decoration).

### Usage

```bash
./scripts/shorten-marketing-link.sh <long-url>
./scripts/shorten-marketing-link.sh --help
```

Examples:

```bash
# Basic usage
doppler run -- ./scripts/shorten-marketing-link.sh \
  "https://pocketstubs.com/?utm_source=twitter&utm_medium=social&utm_campaign=w19"

# Capture into a variable for use in other commands
SHORT=$(doppler run -- ./scripts/shorten-marketing-link.sh "$LONG_URL")
echo "Share this: $SHORT"
```

### Doppler prereqs

`DUB_API_TOKEN` — **not yet in Doppler** (you must add it). Steps:

1. Sign up at `https://dub.sh`
2. Generate a token at `https://app.dub.co/settings/tokens`
3. Add to Doppler:

```bash
doppler secrets set DUB_API_TOKEN --project pocketstubs --config dev
```

### When to use

- Every time you ship a post with a tracked link — shorten the UTM URL before pasting into the post.
- Pipe the output directly into `log-marketing-piece.sh` notes or a spreadsheet.
- Dub.sh deduplicates identical URLs, so re-running with the same URL is safe.

---

## log-marketing-piece.sh

Appends a row to the Marketing Log in the Evermind vault under the correct ISO-week section. Uses direct filesystem append (no MCP dependency) so it works reliably from the terminal without a Claude session.

### Usage

```bash
./scripts/log-marketing-piece.sh \
  --date 2026-05-13 \
  --platform twitter \
  --format pillar \
  --pillar "arrival" \
  --utm-content arrival-positioning \
  [--reach N] [--engagement N] [--clicks N] [--signups N] [--notes "text"]

./scripts/log-marketing-piece.sh --help
```

Full example:

```bash
./scripts/log-marketing-piece.sh \
  --date 2026-05-13 \
  --platform twitter \
  --format pillar \
  --pillar arrival \
  --utm-content arrival-positioning \
  --reach 0 \
  --engagement 0 \
  --notes "First pillar post — arrival positioning"
```

### Flag reference

| Flag | Required | Description |
|---|---|---|
| `--date YYYY-MM-DD` | Yes | Date the post went live |
| `--platform <name>` | Yes | `instagram`, `tiktok`, `twitter`, `reddit`, `youtube`, `discord`, `linkedin`, `hn` |
| `--format <name>` | Yes | `pillar`, `thread`, `reel`, `short`, `story`, `comment`, `post` |
| `--pillar <label>` | Yes | Short content theme label |
| `--utm-content <value>` | Yes | The `utm_content=` value used on the link |
| `--reach <n>` | No | Impressions / views (fill in 24-48 hrs post-publish) |
| `--engagement <n>` | No | Likes + comments + shares |
| `--clicks <n>` | No | Link clicks from Dub.sh / PostHog |
| `--signups <n>` | No | Attributable signups via UTM |
| `--notes <text>` | No | Anything unusual |

### Doppler prereqs

None — this script writes directly to the vault filesystem. No API calls.

### When to use

- Immediately after publishing any piece of marketing content — log it while the context is fresh.
- Come back 24-48 hours later and add reach/engagement/clicks numbers (edit the file directly or re-read and update).
- The ISO week is computed automatically from `--date` — no need to look up the week number.

### Important: week sections must exist first

The script appends to an existing week section. If the week section doesn't exist in the Marketing Log, exit 1 tells you exactly what to add. Week sections follow the format:

```markdown
## Week of YYYY-MM-DD (WNN)

| Date | Platform | Format | Topic / Pillar | UTM content | Reach | Engagement | Clicks | Signups | Notes |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | |

**Week summary:**
-

---
```

---

## birthday-carousel.sh

Daily Letterboxd-style actor birthday carousel generator. **First content-automation pattern (C1) per the marketing automation roadmap.** Mimics Letterboxd's recurring "happy birthday \[actor\] 👋 / Stills from: \[films\]" Instagram post format — proven to drive cinephile-audience engagement (Letterboxd's Pattinson birthday post hit 32.1k likes).

### Usage

```bash
doppler run -- ./scripts/birthday-carousel.sh                    # today
doppler run -- ./scripts/birthday-carousel.sh --date 2026-05-13  # specific date (testing)
doppler run -- ./scripts/birthday-carousel.sh --dry-run          # don't write/post; just print
doppler run -- ./scripts/birthday-carousel.sh --force            # overwrite existing vault note
doppler run -- ./scripts/birthday-carousel.sh --help
```

### One-time prereqs (before first run)

- `TMDB_READ_ACCESS_TOKEN` set in Doppler `pocketstubs/dev` (already wired — used elsewhere by cinetrak)
- `GEMINI_API_KEY` set in Doppler (already wired — used by bug-report analyzer + ticket scanner + banner generator)
- `DISCORD_METRICS_WEBHOOK_URL` set in Doppler (already wired — daily metrics post here)
- The vault `Marketing Sprints/Queue/` folder is created on first run if it doesn't exist

### What it does

1. Queries TMDB for actors with today's MM-DD birthday + popularity > 5 (paginates 25 pages of `/person/popular` = top 500)
2. Picks the most-popular qualifying actor (sorted by TMDB popularity, first birthday match wins)
3. Fetches their filmography; takes top 4 films by `vote_average` (with `vote_count > 100`, fallback to `> 50`)
4. Downloads the films' backdrop images to `~/Downloads/birthday-carousel-<DATE>/`
5. Generates 3 caption variants:
   - **A (templated, always-safe)**: direct Letterboxd-mimic format
   - **B (Gemini, cinephile-take)**: hot take about the actor's career arc
   - **C (Gemini, PocketStubs-listicle)**: "track them all in PocketStubs" CTA framing
6. Writes vault note to `Projects/PocketStubs/Business/Marketing Sprints/Queue/<DATE>-birthday-<slug>.md` with `status: pending`
7. Pings the Discord metrics channel with status + actor + 3 captions inline + Obsidian link

**Idempotent**: re-runs no-op immediately (before any API calls) unless `--force`.

### Status messages (Discord)

| Status | When |
|---|---|
| `📬 Birthday carousel ready: <actor> (<age>)` | Success — vault note + 3 captions ready |
| `No notable birthday today (popularity > 5 threshold).` | No qualifying actor for today |
| `Birthday carousel ERRORED: <reason>.` | TMDB / image / Gemini failure |

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
- IG Graph API auto-post (Meta API is rough)
- Skip-tracking deny-list (auto-deny actors you've explicitly skipped)
- Multi-actor days (currently picks 1 max per day)

---

## anniversary-post.sh

Daily Letterboxd-style film anniversary post generator. **Second content-automation pattern (C2) per the marketing automation roadmap.** Posts "X years ago today: \<Film> (\<Year>)" nostalgia content for films hitting a milestone anniversary (10/15/20/25/30/40/50/60/70/75/80/90/100 years). Forks ~80% of C1's backbone — same vault note + Discord ping pipeline.

### Usage

```bash
doppler run -- ./scripts/anniversary-post.sh                    # today
doppler run -- ./scripts/anniversary-post.sh --date 2026-06-25  # specific date (testing)
doppler run -- ./scripts/anniversary-post.sh --dry-run          # don't write/post; just print
doppler run -- ./scripts/anniversary-post.sh --force            # overwrite existing vault note
doppler run -- ./scripts/anniversary-post.sh --help
```

### Env overrides

| Var | Default | Effect |
|---|---|---|
| `ANNIVERSARY_VOTE_COUNT_MIN` | `500` | Minimum `vote_count` for a film to qualify. Lower = more matches per day. |
| `ANNIVERSARY_MILESTONES` | `"10 15 20 25 30 40 50 60 70 75 80 90 100"` | Space-separated milestone years. Override e.g. `"25 50 75 100"` for major-only mode. |

### One-time prereqs (before first run)

- `TMDB_READ_ACCESS_TOKEN` set in Doppler `pocketstubs/dev` (already wired)
- `GEMINI_API_KEY` set in Doppler (already wired)
- `DISCORD_METRICS_WEBHOOK_URL` set in Doppler (already wired)
- The vault `Marketing Sprints/Queue/` folder exists (created by C1 already)

### What it does

1. Iterates the milestone year set; for each `Y`, queries TMDB `/discover/movie?primary_release_date.gte=lte=(TARGET_YEAR - Y)-MM-DD&language=en-US&sort_by=vote_count.desc`
2. Accumulates all candidates across milestone years, filters by `vote_count > $VOTE_COUNT_MIN`, sorts by `vote_count DESC`, picks top 1
3. Fetches `/movie/{id}/images?include_image_language=en,null`; selects 1 poster (highest `vote_average`) + 3 backdrops (text-free preferred via `iso_639_1 == null`)
4. Downloads 4 images to `~/Downloads/anniversary-post-<DATE>/` (`1-poster-*.jpg`, `2-still-*.jpg`, ...)
5. Generates 3 caption variants:
   - **A (templated, always-safe)**: `X years ago today: Film (Year)\n\nReleased Month D, Year.\n\n#Film #FilmAnniversary`
   - **B (Gemini, cinephile-take)**: hot take about the film's meaning N years on
   - **C (Gemini, PocketStubs-listicle)**: "Film turns N today. Track every viewing in PocketStubs." framing
6. **Year-math hallucination guard**: after each Gemini call, validates the caption contains the literal string `"<milestone> years"` and that every 4-digit year in the output is in `{RELEASE_YEAR, TARGET_YEAR}`. Either check failing → fall back to templated Variant A and write `gemini_failed: true` in frontmatter.
7. Writes vault note to `Projects/PocketStubs/Business/Marketing Sprints/Queue/<DATE>-anniversary-<film-slug>.md` with `status: pending`
8. Pings the Discord metrics channel with status + film + 3 captions inline + Obsidian link

**Idempotent**: re-runs no-op immediately (before any API calls) unless `--force`.

**Empty days**: TMDB's `primary_release_date` filter is strict — many days have no qualifying anniversary. The script pings `⏭ No notable anniversary today` and exits cleanly. This is correct behavior, not a bug.

### Status messages (Discord)

| Status | When |
|---|---|
| `🎞 Anniversary ready: <film> (<N> years)` | Success — vault note + 3 captions ready |
| `⏭ No notable anniversary today (vote_count > N across all milestones: ...)` | No qualifying film on this date |
| `⚠️ Anniversary post ERRORED: <reason>` | TMDB / image / vault-write failure |

### Approval workflow

1. Open the vault note in Obsidian (link in Discord ping)
2. Pick one of the 3 captions, add your twist
3. Drag images from `~/Downloads/anniversary-post-<DATE>/` into IG (poster first, then stills)
4. Post manually
5. Edit vault note frontmatter: `status: pending` → `status: published`

### Spec

- Spec: `docs/superpowers/specs/2026-05-14-anniversary-post-design.md`
- Predecessor (reusable backbone): `birthday-carousel.sh` + `docs/superpowers/specs/2026-05-13-birthday-carousel-design.md`

### Future expansion (out of scope for v1)

- Cron / overnight scheduling
- Buffer API auto-post (paid tier required)
- IG Graph API auto-post (Meta API is rough)
- Skip-tracking deny-list (auto-deny films you've explicitly skipped)
- Multi-anniversary days (currently picks 1 max per day even if multiple milestones land)
- Shared bash lib for `yaml_quote` + `indent_for_yaml` + `call_gemini` once a third pattern (C3) proves the reuse
