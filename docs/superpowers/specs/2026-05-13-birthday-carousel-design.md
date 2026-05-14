# Daily Actor Birthday Carousel — Design

**Date:** 2026-05-13
**Phase:** Marketing automation **C1** — first content-automation pattern (mimics Letterboxd's daily birthday carousels)
**Status:** Spec — pending implementation plan

---

## Context

After today's marketing pivot (away from "ship banners + W18 sprint manually" toward "automate Letterboxd-style content patterns"), C1 is the first concrete content-generation automation. Mimics Letterboxd's recurring "happy birthday \[actor\] 👋 / Stills from: \[films\]" Instagram carousel format — proven to drive engagement on cinephile audiences (Letterboxd's Pattinson birthday post hit 32.1k likes).

This is **content automation**, not infrastructure. Aesthetic of banners + visual identity work explicitly deferred — energy will emerge from execution, not upfront design.

### Marketing decomposition reference

| ID | Pattern | Status |
|---|---|---|
| **C1 (this spec)** | Daily actor birthday carousel — TMDB-driven, posted to IG (manually for v1) | Pending implementation |
| C2 | Film anniversary post ("X years ago today") | Deferred — same pattern as C1 once shipped |
| C3 | Trailer drop monitor + repost | Deferred |
| C4 | Awards/festival reactive posts | Deferred (mostly manual anyway) |

C1 ships first because:
1. **Daily cadence** — gives the marketing pipeline real recurring data
2. **Concrete + visible mimicry** of a proven Letterboxd post the user explicitly screenshotted as "the energy"
3. **TMDB-native** — cinetrak already uses TMDB heavily; existing patterns transfer
4. **Self-contained** — no Buffer paid tier needed; vault-approval queue is sufficient for v1
5. **Compounds** — once C1 works, C2 (anniversaries) is ~80% the same code path

---

## Goal & success criterion

Build `cinetrak/scripts/birthday-carousel.sh` — a bash script that, when run, queries TMDB for today's notable actor birthdays, picks one above a popularity threshold, downloads 4 film stills (TMDB backdrops from their highest-rated films), generates 3 Instagram caption variants (1 templated Letterboxd-mimic + 2 Gemini-generated PocketStubs-voice), writes a vault note to `Projects/PocketStubs/Business/Marketing Sprints/Queue/<YYYY-MM-DD>-birthday-<actor-slug>.md`, and pings the existing Discord webhook with the 3 caption options inline.

**Success =** all of:

1. Running `./scripts/birthday-carousel.sh` on a day with notable birthdays produces:
    - 4 downloaded JPG film stills in `~/Downloads/birthday-carousel-<YYYY-MM-DD>/`
    - 1 vault note with frontmatter (status, actor metadata, films, 3 caption variants)
    - 1 Discord message containing status + actor name + age + 3 caption options + vault link
2. Running on a day with no notable birthdays produces a `⏭ No notable birthday today` Discord ping and no vault note.
3. The script handles errors (TMDB down, Gemini down, image fetch fails) without corrupting partial state.
4. Tyshane can review the vault note in Obsidian, pick a caption, drag images into IG, post manually, and flip `status: pending` → `status: published` in the vault note.
5. The architecture supports future ii (Buffer auto-post) and iii (Graph API auto-post) by reading the same vault note frontmatter — no rewrite required.

---

## Stack

### Added in this phase

- `cinetrak/scripts/birthday-carousel.sh` — bash, executable, committed
- `cinetrak/scripts/birthday-carousel-voice-prompt.txt` — Gemini prompt template (committable; evolves under version control)
- New vault folder: `Projects/PocketStubs/Business/Marketing Sprints/Queue/` — created on first run if not present (via Obsidian MCP write)
- `scripts/README.md` extended with section for the new script

### Reused from existing stack

- `TMDB_API_KEY` + `TMDB_READ_ACCESS_TOKEN` from Doppler — already wired (cinetrak uses TMDB extensively)
- `GEMINI_API_KEY` from Doppler — already wired (used by bug-report analysis + ticket scanner edge functions, banner-generation script)
- `DISCORD_METRICS_WEBHOOK_URL` from Doppler — already wired (cron-fired daily metrics post here)
- Bash + `curl` + `jq` patterns from `scripts/sync-supabase-secrets.sh`, `deploy-email-templates.sh`, `agent-run.sh`, `generate-banners.sh`
- Vault MCP (`mcp__obsidian__write_note`) — already wired in CC sessions

### Explicitly NOT in this phase

- **Cron / scheduler** — manual trigger for v1. Cron is a separate small followup once we trust the output.
- **Buffer API integration** (ii) — paid tier; defer until manual approval workflow proves the content quality.
- **IG Graph API integration** (iii) — Meta's Graph API is rough; defer.
- **Visual identity sprint** — deferred (user's explicit pivot — copy proven patterns first, lock energy later)
- **Banner generation / regeneration** — defer (PR #451 script merged but outputs trashed; banners can be Midjourney + crop manually OR Fiverr-commissioned later)
- **C2 anniversaries / C3 trailer monitor / C4 awards reactive** — separate sub-phases later
- **News-risk classifier** (was MA1.5 from earlier decomposition) — for now Tyshane catches "wish happy birthday to a cancelled actor" risk via the approval queue
- **Skip-tracking deny-list** — script doesn't read previous skips in v1; you can re-skip if same person comes up
- **Multi-actor days** — picks ONE most-popular actor per day; doesn't generate multiple carousels even if 2 notable people share a birthday
- **AI-trained voice agent** ("eventually train an agent to know what to say and when") — explicit longer-term goal but not v1
- **Auto-publish (any path)** — vault `status: published` is a manual flip; script never posts on its own
- **Anything touching auth, payments, RLS, webhooks, edge functions, SQL migrations** — never (universal forbidden zones)

---

## Workflow (script's runtime flow)

| # | Step | Failure → recovery |
|---|---|---|
| 1 | Anchor to cinetrak repo root via `cd "$(dirname "${BASH_SOURCE[0]}")/.."` | — |
| 2 | Parse args: `--help` prints usage; `--dry-run` skips Discord ping + vault write but still prints what would happen; `--date <YYYY-MM-DD>` overrides "today" (for testing past days) | Invalid args → exit 1 with usage |
| 3 | Prereq checks: `curl`, `jq`, `doppler` on PATH | Missing → exit 1 with install hint |
| 4 | Verify `TMDB_READ_ACCESS_TOKEN`, `GEMINI_API_KEY`, `DISCORD_METRICS_WEBHOOK_URL` are env-injected (Doppler-managed) | Any missing → exit 1 with `doppler secrets set` hint |
| 5 | Compute today's MM-DD (or use `--date` override) | — |
| 6 | Query TMDB person-discover endpoint for actors with birthdays matching MM-DD, filtered to `known_for_department=Acting` AND `popularity > 20` | TMDB error → Discord ping `⚠️ TMDB error`, exit 1 |
| 7 | If 0 results: send Discord ping `⏭ No notable birthday today (popularity > 20 threshold). No carousel generated.`; exit 0 cleanly | — |
| 8 | Pick the most-popular actor from the result set | — |
| 9 | Fetch actor's filmography via TMDB person-credits endpoint | TMDB error → Discord ping `⚠️ filmography fetch error`, exit 1 |
| 10 | Filter films: `vote_count > 100`, sort by `vote_average DESC`, take top 4 | If <4 films qualify → use all that qualify (carousel can be 2-4 images); if 0 → Discord ping `⚠️ <actor> has no qualifying films`, exit 1 |
| 11 | For each film, fetch a TMDB backdrop URL (use the highest-resolution backdrop available); download to `~/Downloads/birthday-carousel-<YYYY-MM-DD>/<n>-<film-slug>.jpg` | Image download fail (404, etc.) → log warning, continue with fewer images. If <2 images succeed → exit 1 with Discord ping. |
| 12 | Generate the templated Letterboxd-mimic caption (Variant A) — pure string interpolation, no API call | — |
| 13 | Generate Variants B + C via Gemini API: load `scripts/birthday-carousel-voice-prompt.txt`, substitute `{{ACTOR}}`, `{{FILMS}}`, `{{VARIANT_INSTRUCTION}}`, call `gemini-2.5-flash` (text generation; cheap), parse response | Gemini error → fall back to templated variants for B and C (with clear notes in the vault note that Gemini failed); don't block the run |
| 14 | Write vault note via Obsidian MCP at `Projects/PocketStubs/Business/Marketing Sprints/Queue/<YYYY-MM-DD>-birthday-<actor-slug>.md` (see Section 4 for exact shape) | MCP error → log error, save note locally to `/tmp/birthday-carousel-<DATE>.md`, ping Discord with the local path |
| 15 | Send Discord webhook ping with status + actor + 3 captions inline + vault link (see Section 5 for exact shape) | Discord webhook fail → log error to stderr, exit 0 anyway (vault note exists, user can find it manually) |
| 16 | Print summary to stdout: actor, age, image paths, caption variants count | — |

`set -euo pipefail` + early prereq checks ensure no partial state corruption mid-run.

---

## The vault note shape (verbatim)

Path: `Projects/PocketStubs/Business/Marketing Sprints/Queue/<YYYY-MM-DD>-birthday-<actor-slug>.md`

```markdown
---
status: pending  # pending | published | skipped
date: 2026-05-13
actor:
  name: Robert Pattinson
  tmdb_id: 5723
  birth_year: 1986
  age_today: 40
  popularity: 47.2
films:
  - title: The Lighthouse
    year: 2019
    image_path: ~/Downloads/birthday-carousel-2026-05-13/1-the-lighthouse.jpg
  - title: Good Time
    year: 2017
    image_path: ~/Downloads/birthday-carousel-2026-05-13/2-good-time.jpg
  - title: Tenet
    year: 2020
    image_path: ~/Downloads/birthday-carousel-2026-05-13/3-tenet.jpg
  - title: The Batman
    year: 2022
    image_path: ~/Downloads/birthday-carousel-2026-05-13/4-the-batman.jpg
captions:
  - variant: letterboxd-mimic
    source: template
    text: |
      happy birthday robert pattinson 👋

      Stills from:
      The Lighthouse (2019)
      Good Time (2017)
      Tenet (2020)
      The Batman (2022)

      #RobertPattinson #HappyBirthday
  - variant: cinephile-take
    source: gemini
    text: |
      Robert Pattinson turns 40 today. The post-Twilight career
      is one of the most deliberate course-corrections in modern
      Hollywood — Good Time, The Lighthouse, Tenet, The Batman.
      Every project chosen for the work, not the algorithm.

      #RobertPattinson #HappyBirthday
  - variant: pocketstubs-listicle
    source: gemini
    text: |
      Four Robert Pattinson performances that justified the
      post-Twilight pivot. Track them all in PocketStubs.

      → Good Time (2017)
      → The Lighthouse (2019)
      → Tenet (2020)
      → The Batman (2022)

      #RobertPattinson #HappyBirthday
---

# Birthday carousel — 2026-05-13 — Robert Pattinson (40)

Drag images from `~/Downloads/birthday-carousel-2026-05-13/` into IG (in order). Pick one of the 3 captions above + add your twist.

**Approve**: flip `status: pending` → `status: published`.
**Skip**: flip `status: pending` → `status: skipped`.
```

---

## The Discord ping shape (verbatim, ~1100 chars max)

Sent via `DISCORD_METRICS_WEBHOOK_URL` as a Discord webhook message (POST to the webhook URL with `{"content": "..."}` body).

### Success case (carousel ready):

```
📬 Birthday carousel ready: Robert Pattinson (40)
Vault: obsidian://open?vault=evermind&file=Projects/PocketStubs/Business/Marketing%20Sprints/Queue/2026-05-13-birthday-robert-pattinson

**Option 1 (Letterboxd mimic):**
happy birthday robert pattinson 👋
Stills from: The Lighthouse, Good Time, Tenet, The Batman
#RobertPattinson #HappyBirthday

**Option 2 (cinephile take):**
Robert Pattinson turns 40 today. The post-Twilight career is one of the most deliberate course-corrections in modern Hollywood — Good Time, The Lighthouse, Tenet, The Batman.

**Option 3 (PocketStubs listicle):**
Four Robert Pattinson performances that justified the post-Twilight pivot. Track them all in PocketStubs. → Good Time, The Lighthouse, Tenet, The Batman.

Pick + twist. Images in ~/Downloads/birthday-carousel-2026-05-13/
```

### Empty case (no notable birthday):

```
⏭ No notable birthday today (popularity > 20 threshold). No carousel generated.
```

### Error case:

```
⚠️ Birthday carousel ERRORED: <one-line reason>. See logs in /tmp/birthday-carousel-<DATE>.log.
```

If Discord message would exceed 2000 chars (Discord's hard limit), captions get truncated to first 2 lines + `...` and the full text remains in the vault note.

---

## Brand voice prompt for Gemini (variants B + C)

Stored at `cinetrak/scripts/birthday-carousel-voice-prompt.txt`. Committed to the repo so the prompt evolves under version control.

Skeleton:

```text
Generate a single Instagram caption for PocketStubs (a movie tracking app) celebrating {{ACTOR}}'s birthday today.

Brand voice rules:
- COMPANY voice. NEVER solo-founder, NEVER "I built", NEVER build-in-public framing.
- Cinephile-authority register. Specific over generic — name films, formats, performances.
- No banned vocabulary: "content", "properties", "IPs", "empower", "leverage", "unlock", "synergy".
- Maximum 1 emoji from this set only: 🎬 🎟 🍿 🎞. No other emoji.
- No solo-dev language ("solo founder", "indie maker", "vibe coding").
- Output the caption text only — no preamble, no explanation, no markdown wrapping.

Films available to mention (use 4 or fewer):
{{FILMS}}

Variant-specific instruction:
{{VARIANT_INSTRUCTION}}

End the caption with these hashtags on their own line:
#{{ACTOR_HASHTAG}} #HappyBirthday
```

### Variant-specific instructions (passed as `{{VARIANT_INSTRUCTION}}`):

- **B (cinephile-take)**: `Cinephile-authority hot take. State a defensible thesis about the actor's career arc or specific filmography choice in 1-2 sentences. Reference 2-4 films by name. No CTA. Confident, not casual.`
- **C (pocketstubs-listicle)**: `PocketStubs-style listicle. Open with "Four [actor] performances that..." or "The [actor] films that..." framing. List the films as a soft enumeration. End with one short CTA: "Track them all in PocketStubs." or similar. No emoji except the hashtag block.`

---

## Verification gates

| Gate | When | Owner |
|---|---|---|
| `./scripts/birthday-carousel.sh --help` exits 0 with usage | Install verify | Human |
| `./scripts/birthday-carousel.sh --dry-run --date 2026-05-13` produces correct output without writing vault note or pinging Discord | Install verify | Human |
| First real run on a known birthday day: vault note created with all 3 captions, images downloaded, Discord ping sent within 30s | First proof-of-value | Human |
| Variant A (templated) is bit-for-bit Letterboxd format | Format compliance | Human (PR diff inspection) |
| Variants B + C (Gemini) honor brand voice rules (no banned vocab, ≤1 emoji from allowed set, no founder/solo language) | Brand compliance | Human (read the actual outputs) |
| Empty-day case: `--date <known-empty-day>` produces `⏭` Discord ping + no vault note + exit 0 | Edge case | Human |
| TMDB-error case (e.g., bogus token) produces `⚠️` Discord ping + clear log + exit 1 | Edge case | Human (force by temporarily munging env var) |
| Re-running on the same day idempotency: second run does NOT re-create vault note OR re-download images OR re-send Discord ping unless `--force` flag set | Idempotency | Human (run twice; verify) |

---

## Failure modes & recovery

| Failure | Detection | Recovery |
|---|---|---|
| TMDB API down or returns error | Step 6 / 9 / 11 — non-2xx response | Discord ping with `⚠️` + clear error message; exit 1; user re-runs later |
| TMDB returns 0 birthdays today | Step 7 | Send `⏭` ping; exit 0 cleanly; no vault note created |
| TMDB returns 0 films matching `vote_count > 100` filter | Step 10 | Try fallback: lower threshold to `vote_count > 50`. If still 0, send `⚠️` ping naming the actor + exit 1. (Rare — would only happen for actor with no theatrical/popular films.) |
| Image download fails for 1 of 4 stills | Step 11 | Log warning to stderr, proceed with remaining 3 images. Vault note `films` array reflects only successful downloads. |
| Image downloads fail for ≥3 of 4 stills | Step 11 | `⚠️` ping, exit 1 (carousel not viable with <2 images) |
| Gemini API down or returns error | Step 13 | Fall back to templated versions of B and C (rotating placeholder framings); add note in vault frontmatter `gemini_failed: true` so user knows captions are degraded. Don't block the run. |
| Obsidian MCP not available (e.g., not running) | Step 14 | Save vault note to `/tmp/birthday-carousel-<DATE>.md`, ping Discord with the local path. User copies into vault manually. |
| Discord webhook returns non-2xx | Step 15 | Log error to stderr; vault note still exists; exit 0 (vault note is the source of truth). |
| User Ctrl-C's mid-run | Anywhere | `set -euo pipefail` + cleanup trap removes any partial files in `~/Downloads/birthday-carousel-<DATE>/`; vault note write is atomic via Obsidian MCP (no partial writes). |
| Re-run on same day produces duplicate vault note / re-pings Discord | Re-run check | v1: explicit guard at Step 14 — if vault note already exists for this date, exit 0 with `ℹ️ Already generated for <date>. Use --force to regenerate.`. Same guard for Discord ping. |
| User repeatedly skips an actor over multiple years | Skip-tracking deferred | v1: no automated skip-tracking. User just re-skips. Future feature: maintain `~/.cache/birthday-deny-list-tmdb-ids.txt`. |

---

## Documentation outputs

- `cinetrak/scripts/README.md` extended with section for `birthday-carousel.sh` (usage, prereqs, --dry-run, --date, expected outputs)
- Vault: `Projects/PocketStubs/Business/Marketing Sprints/Queue/` folder gets created on first run; lives there as ongoing data
- **NO Process note** — per [[feedback_when_to_skip_ceremony]], routine content automation doesn't get per-task ceremony. ONE first-run Process note `Projects/PocketStubs/Process/C1 - Birthday Carousel First Run.md` after the first real run, capturing initial findings; subsequent runs don't add ceremony.
- ADR update: append "Marketing Automation" phase tracking to either an existing ADR OR create a new `ADR - Marketing Content Automation.md` listing C1-C4 status.
- Memory updates if warranted: feedback memory if Gemini voice-prompt patterns reveal something durable.

---

## Out of scope

(Repeated from Stack section for visibility.)

- Cron / scheduler — separate small followup
- Buffer API integration (ii path) — needs paid tier
- IG Graph API integration (iii path) — defer
- Visual identity sprint
- Banner generation / regeneration
- C2 / C3 / C4 — separate sub-phases
- News-risk classifier (was MA1.5)
- Skip-tracking deny-list
- Multi-actor days (one carousel max per day)
- AI-trained voice agent
- Auto-publish (any path)
- Universal forbidden zones (auth, payments, RLS, webhooks, edge functions, SQL migrations)

---

## Decision log

| Decision | Choice | Why |
|---|---|---|
| First content-automation pattern | C1 (birthday carousel) | User showed Letterboxd's birthday post as "the energy"; daily cadence, TMDB-native, self-contained |
| Posting strategy v1 | i — manual approval queue | Smallest blast radius; ships fastest; ii/iii are upgrade paths from same data shape |
| Approval queue location | Vault note (per day) + Discord ping notification | User lives in vault daily; existing webhook = no new infra; vault frontmatter = future-publisher contract |
| Actor selection strategy | iv — popularity-first, learn from rejections | YAGNI on whitelist; approval queue IS the curation feedback; data-driven evolution |
| Caption generation | ii — 1 templated + 2 Gemini | Templated A = always-safe baseline; Gemini B+C = real variation; cost negligible |
| Trigger | Manual for v1 | Cron is a small followup; v1 ships without scheduler infra |
| Architecture | Bash + curl + jq | Matches existing cinetrak/scripts/ pattern; no new runtime |
| Image source | TMDB backdrops, top 4 films by `vote_average` (vote_count > 100) | TMDB is already wired; backdrops are usable for IG carousels (landscape; user can crop in posting step) |
| Caption count | 3 variants | User explicitly asked for 3 options |
| Voice rule enforcement | Brand voice prompt committed at `scripts/birthday-carousel-voice-prompt.txt` | Evolves under version control; reviewable; changes have a paper trail |
| Discord status messages | 3 shapes (ready / no-birthday / errored) | Matches user's "return with the status" ask |
| Idempotency | Re-runs no-op unless `--force` | Prevents accidental duplicate work + wasted Gemini calls |
| Image storage | `~/Downloads/birthday-carousel-<DATE>/` | Easy drag-from-Finder UX; outside repo to avoid bloating cinetrak with image artifacts |
| `--date` override | Yes, for testing | Lets us validate against known-good past days without waiting |

---

## Acceptance criteria for this spec

The implementation plan (next, via writing-plans) must:

1. Cover bash script creation with `set -euo pipefail`, anchor to repo root, executable bit
2. Cover all 16 workflow steps with explicit error messages + recovery commands
3. Include the verbatim vault-note frontmatter shape + the verbatim Discord ping shapes
4. Include the verbatim brand voice prompt + variant-specific instructions
5. Cover the script's test plan: --help, --dry-run, --date with known-good past day, --date with known-empty day, error injection, idempotency
6. Cover `cinetrak/scripts/birthday-carousel-voice-prompt.txt` creation
7. Cover scripts/README.md update
8. Cover the first proof-of-value run (whatever today's actor is) + first-run Process note
9. Cover the ADR update for marketing automation phase tracking
10. Identify deferred followups (cron scheduler, skip-tracking, ii/iii publishers, multi-actor days, etc.) as separate small issues filed at PR-merge time
