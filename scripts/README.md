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
