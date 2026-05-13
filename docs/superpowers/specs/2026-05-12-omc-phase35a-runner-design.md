# OMC Phase 3.5a — One-Command Agent Runner

**Date:** 2026-05-12
**Phase:** 3.5a of OMC adoption sequence (Phase 3 in flight via PR #439 salvage; Phases 0+1, 2 complete)
**Status:** Spec — pending implementation plan

---

## Context

After Phase 3 shipped (skills cherry-picked into project-scope; achievement-bug PR #438 closed without merge after manual prod testing showed the bug wasn't reproducible), Tyshane explicitly asked: *"when do we stop confirming specs and high-level dictation?"*

The brainstorm → spec → plan ceremony has been necessary for building **load-bearing infrastructure** (Phases 0+1 OMC install, Phase 2 github-mcp wiring, Phase 3 skills curation). For *routine* work — fixing a bug from an existing GitHub issue — the ceremony is overkill. Phase 3.5a explicitly scopes the missing piece: **a one-command runner that collapses the 13-step Phase 3 runbook into a single shell invocation**, removing the per-task ceremony for routine bug-fix runs.

### The full adoption sequence

| Phase | Goal | Status |
|---|---|---|
| 0+1 | OMC installed; first Autopilot agent ships a real PR end-to-end | ✅ Complete (2026-05-11) |
| 2 | github-mcp-server wired; agent reads issue and ships PR with linkback | ✅ Complete (2026-05-11) |
| 3 | Skill curation (4 softaworks skills, project-scoped) | ✅ Skills shipped via salvage PR #439 (2026-05-12); achievement-bug fix PR #438 closed without merge after prod testing showed not reproducible |
| **3.5a (this spec)** | One-command runner: `./scripts/agent-run.sh <issue-N>` | Pending implementation plan |
| 3.5b | Label-triggered cron (overnight unattended runs) | Deferred — depends on 3.5a |
| 3.5c | Cost capture + kill switch | Deferred — cross-cutting |
| 3.5d | Resend webhook → Sentry/Slack alerting (signup-failure detection from today's email investigation) | Deferred — independent runtime |
| 4 | Observability decision (PostHog vs `mission-control`, now serves 3.5c needs) | Deferred until 3.5c lands |
| 5 | Marketing system (Ayrshare, separate runtime) | Deferred |

### Scope decomposition (per brainstorming-skill rules)

The original Phase 3.5 brief stub bundled four independent subsystems (runner, cron, cost cap, alerting). Per the "don't bundle subsystems" rule, this spec covers **3.5a only** — the runner. The other 3.5x phases get their own brainstorm cycles after 3.5a ships and we have lived data on what's needed.

---

## Goal & success criterion

Replace the 13-step Phase 3 runbook with one command:

```
./scripts/agent-run.sh <issue-N>
```

The script handles all operational setup (worktree creation + npm install + Doppler config + tmux session + OMC launch + brief paste) and ends inside the tmux session, ready for the human to watch the agent.

**Success =** all of:

1. The script runs end-to-end on a real existing GitHub issue and lands the human inside a tmux session with the agent running, in ≤ 6 minutes from invocation (most of which is `npm install`).
2. The agent's first MCP call (`mcp__github__get_issue`) lands within 90 seconds of the brief being pasted.
3. The agent ships a PR with the same quality gates as Phase 3 manual runs (CI green, MCP read+write paths used, `Closes #N` linkback comment posted).
4. The PR ships **without any per-task brainstorm/spec/plan documentation written by the human** — the script IS the lighter pipeline for routine work.
5. Future runs of the script require only: file an issue → run script → review PR. Zero ceremony for routine work.

---

## Stack

### Added in this phase

- `cinetrak/scripts/agent-run.sh` — bash, executable, committed
- `cinetrak/scripts/README.md` — short usage block (create or update if exists)

The script body uses `set -euo pipefail` strictly. Errors include a one-line recovery command in the message.

### Reused from existing stack

- OMC + Claude Code + tmux (Phase 0+1)
- Doppler `pocketstubs/dev` config with `GITHUB_PAT` (Phase 2 unlock)
- `github` MCP via `${GITHUB_PAT}` env substitution in `cinetrak/.mcp.json` (Phase 2)
- `gh` CLI for issue-existence verification + interactive use during review
- Existing CI on `main` (lint + tsc + jest)
- Phase 3's 4 project-scoped skills (`react-useeffect`, `react-dev`, `qa-test-planner`, `naming-analyzer`) once PR #439 merges

### Explicitly NOT in this phase

- Cron / scheduler — Phase 3.5b
- Cost capture / kill switch — Phase 3.5c (script does NOT enforce token-cost limits; agent runs unbounded for now)
- Resend webhook → alerting — Phase 3.5d
- Auto-cleanup post-merge (worktree removal stays manual after PR merge — same as Phases 0-3)
- Multi-issue parallel runs (one tmux session per issue; script fails idempotency check if you try to run two for the same issue)
- Pre-flight grep automation (issues are filed by human; pre-flight grep happens *before* filing, not inside the script)
- Auto-merge for trusted PRs — Phase 3.5+ candidate
- TypeScript-based runner (deferred indefinitely; bash is sufficient)
- Per-task brainstorm/spec/plan ceremony for routine runs — **this IS the point**: the script makes ceremony optional. Brainstorm flow stays for new capabilities.
- Anything touching auth, payments, RLS, webhooks — never autopilot, separate process forever
- Marketing system (Phase 5)

---

## Workflow (script's runtime flow)

| # | Step | Failure → recovery |
|---|---|---|
| 1 | Parse args: positional issue number OR URL → extract number | Invalid format → exit with usage message |
| 2 | Anchor to cinetrak repo: `cd "$(dirname "$0")/.."` | Script lives in `scripts/`, repo root is one level up |
| 3 | Prereq checks: `tmux -V`, `gh auth status`, `doppler --version`, `omc --version` (or fallback `claude --version`) | Any missing → exit with install hint per tool |
| 4 | Verify issue exists: `gh issue view <N> --repo TyShaneONeill/movie-tracker --json title,body` | Issue not found → exit |
| 5 | **Strict idempotency check**: fail if `.worktrees/agent-issue-<N>/` OR branch `feature/agent-issue-<N>` exists | Exit with exact recovery: `git worktree remove --force .worktrees/agent-issue-<N> && git branch -D feature/agent-issue-<N>` |
| 6 | Pull main: `git checkout main && git pull --ff-only origin main` | Network/conflict → exit |
| 7 | Create worktree: `git worktree add .worktrees/agent-issue-<N> -b feature/agent-issue-<N> main` | Exit on git error |
| 8 | `cd .worktrees/agent-issue-<N> && npm install` | Exit on npm error |
| 9 | Doppler setup: prefer non-interactive flag if available (`doppler setup --no-interactive --project pocketstubs --config dev`); fall back to writing `.doppler.yaml` directly with `setup: { project: pocketstubs, config: dev }` | Exit on doppler error |
| 10 | Verify GITHUB_PAT injected: `doppler run -- bash -c '[ -n "$GITHUB_PAT" ]'` | Exit if missing |
| 11 | Build the autopilot brief: substitute `<N>` into the heredoc template (Section 4 of this spec) | — |
| 12 | Launch tmux session detached: `tmux new-session -d -s agent-<N> -c <worktree-path>` | Exit if session name collision (shouldn't happen; idempotency check at step 5 catches the worktree case) |
| 13 | Send the OMC launch command: `tmux send-keys -t agent-<N> "doppler run -- omc" Enter` | — |
| 14 | **Sleep 5 sec** for OMC to boot | — |
| 15 | Send the autopilot brief into the CC session. Implementation will likely use `tmux load-buffer` + `tmux paste-buffer` for clean multi-line handling (avoids `send-keys` escaping pain with backticks in `Closes #N`). Fall back to `send-keys` if `paste-buffer` doesn't deliver cleanly. | — |
| 16 | Attach to the tmux session: `exec tmux attach -t agent-<N>` (script process is replaced; you land inside) | — |

**Human responsibility starts at step 16** (you're attached): watch first 90s for investigation gate (if applicable per the issue body), monitor for abort triggers, review PR when opened.

---

## The autopilot brief template (heredoc inside the script)

Per Q4 = B (minimal + universal forbidden zones). Substitute `<N>`:

```
/autopilot Read GitHub issue #<N> at https://github.com/TyShaneONeill/movie-tracker/issues/<N> via the github MCP. The issue body is your verbatim brief. Ship a PR that fixes it. Use `Closes #<N>` in the PR body so the issue auto-closes on merge. After the PR is open, use the github MCP to post a single linkback comment on issue #<N> with the PR link and a one-line summary of what you shipped (separate from any other comments).

Universal constraints (apply to every run):
- Do NOT modify SQL migrations under supabase/migrations/.
- Do NOT change authentication, payments, RLS policies, or webhook handlers.
- If you must modify a Supabase edge function under supabase/functions/, flag it in the PR body with a top-of-body callout: ⚠️ MANUAL DEPLOY REQUIRED AFTER MERGE: doppler run -- supabase functions deploy <function-name>
- No new npm dependencies unless explicitly justified.

The issue body may add task-specific constraints (investigation gate, target file paths, test requirements). Honor both.
```

If `/autopilot` doesn't autocomplete in the CC session, the brief content can be pasted with `autopilot:` natural-language prefix as a fallback (this is documented in `scripts/README.md`, not handled in the script).

---

## Usage

```bash
# Most common: positional issue number
./scripts/agent-run.sh 437

# Alternative: paste from GitHub UI
./scripts/agent-run.sh https://github.com/TyShaneONeill/movie-tracker/issues/437

# Show usage
./scripts/agent-run.sh
./scripts/agent-run.sh --help
```

---

## Verification gates

| Gate | When | Owner |
|---|---|---|
| `./scripts/agent-run.sh` (no args) prints usage; exit code != 0 | Install verify | Human |
| `./scripts/agent-run.sh 99999` (non-existent issue) exits with clear error | Install verify | Human |
| `./scripts/agent-run.sh <existing-N>` with the worktree already present exits with the exact cleanup recovery command | Install verify | Human |
| First real run: tmux session opens, OMC launches, brief lands intact in CC session, agent posts `mcp__github__get_issue` call within 90s | First proof-of-value | Human (attached to tmux) |
| Run completes end-to-end: agent ships PR with same quality gates as Phase 3 manual runs (CI green, linkback comment, `Closes #N`) | Sufficient signal | Human |
| Time from script invocation → "you're in tmux watching the agent" ≤ 6 minutes | Ergonomics target | Human (mental clock) |
| Subsequent routine runs ship without any vault Process note (no per-task ceremony) | "Removed the ceremony" verification | Human |

---

## Failure modes & recovery

| Failure | Detection | Recovery |
|---|---|---|
| Script bails mid-run (npm install fails, etc.) | `set -euo pipefail` exits with clear error | Follow recovery command in error message → re-run |
| `tmux send-keys` mangles brief (backtick / quote escaping) | First run: brief looks wrong in CC session | Implementation should use `tmux load-buffer` + `paste-buffer` to avoid escaping; fall back to `send-keys` only if buffer-based path is broken |
| OMC takes >5 sec to boot, brief lands in shell instead of CC | First run | Increase sleep value; longer-term upgrade to ready-detection (Approach 3) in a future iteration |
| `doppler setup --no-interactive` flag not supported by user's Doppler version | Step 9 hangs or errors | Fall back to writing `.doppler.yaml` directly |
| Worktree from prior run exists | Step 5 strict check fires | Run printed cleanup, re-run |
| `gh issue view` fails (auth / network) | Step 4 | Check `gh auth status`, re-auth, re-run |
| User invokes script from a directory outside cinetrak | Step 2 (`cd "$(dirname "$0")/.."`) anchors to cinetrak regardless | No issue — script handles |
| Concurrent agent sessions for same issue | Step 5 catches via worktree; step 12 also fails on tmux session name collision | Backup safety; should be unreachable |
| User Ctrl-C's during script execution | Bash exits | Partial state may exist (worktree created but not provisioned). Recovery: run cleanup, re-run. Plan should add a bash trap that prints the cleanup command on signal. |
| Brief sent but agent doesn't trigger on `/autopilot` | First run | Brief content includes natural-language fallback (`autopilot: ...`) documented in `scripts/README.md`; user can manually re-paste with that prefix |
| First proof-of-value run fails for any reason | First-run validation | Document in vault Process note; iterate on script; re-run |

---

## Documentation outputs

- **First-run outcome only**: `Projects/PocketStubs/Process/Phase 3.5a - Runner First Run.md` (vault) — what happened on the first real use, ergonomics assessment, any script bugs found. **Subsequent runs do NOT get Process notes** — that defeats the "remove the ceremony" point.
- **ADR update**: append Phase 3.5a outcome to `Projects/PocketStubs/Decisions/ADR - OMC for SDLC Orchestration.md`. Mark phase complete. Note the new operational pattern: "after Phase 3.5a, routine bug-fix runs use `./scripts/agent-run.sh <N>` and skip the brainstorm/spec/plan ceremony."
- **Daily note**: live updates the day Phase 3.5a ships.
- **`cinetrak/scripts/README.md`**: create or update with usage block (3-line invocation + 1 paragraph on when to use this vs the heavier brainstorm flow + the natural-language `autopilot:` fallback).
- **Memory update**: new `feedback_when_to_skip_ceremony.md` — clarifies when a task uses the script (routine bug fix from a filed issue) vs the brainstorm flow (new capability, architectural change, novel risk).
- **NOT in vault**: the script itself is its own documentation in the repo; no need to vault-mirror it.

---

## Out of scope

(Same as "Stack → Explicitly NOT in this phase" — repeated for visibility.)

- Cron / scheduler — Phase 3.5b
- Cost capture / kill switch — Phase 3.5c
- Resend webhook → alerting — Phase 3.5d
- Auto-cleanup post-merge
- Multi-issue parallel runs
- Pre-flight grep automation
- Auto-merge for trusted PRs
- TypeScript-based runner
- Per-task brainstorm/spec/plan for routine runs (this is the point)
- Anything touching auth, payments, RLS, webhooks — never autopilot, separate process forever
- Marketing system (Phase 5)

---

## Decision log

| Decision | Choice | Why |
|---|---|---|
| Script location + language | bash, `cinetrak/scripts/agent-run.sh`, committed | Project-bound, reviewable in PRs, bash matches the shell-orchestration nature of the work |
| Where script stops | After brief pasted, agent running (Q1=B) | Direct answer to "stop confirming specs and high-level dictation"; investigation-gate stays human-watched in the first 90s |
| Argument shape | Positional issue # with URL fallback (Q3=A) | Matches `gh issue view 437` mental model; URL fallback for paste-from-browser convenience |
| Idempotency posture | Strict (Q3=C1) | Cleanest contract; printable recovery command; avoids interactive prompts that break fire-and-forget UX |
| Brief template guardrails | Minimal + universal forbidden zones (Q4=B) | Forbidden zones (no migrations, no auth/RLS/payments/webhooks) are TRUE for every task; investigation gate stays task-specific in issue body |
| Implementation approach | Inline brief + 5s fixed sleep + tmux paste-buffer (Approach 1, paste-buffer over send-keys for escaping safety) | YAGNI; smallest thing that works; upgradable to ready-detection later if needed |
| Tmux behavior at end | Auto-attach via `exec tmux attach` | Script ends inside the session; zero manual `tmux attach` step |
| Doppler setup | Non-interactive flag preferred; fall back to writing `.doppler.yaml` directly | Avoids interactive prompts in fire-and-forget UX |
| Routine-task ceremony | Skip brainstorm/spec/plan for issue-driven runs | The script IS the lighter pipeline. New capabilities still go through brainstorm. |
| First proof-of-value task | A real existing GitHub issue (TBD when running the plan — likely a small UI bug or the deferred email-template-codification task) | Same pattern as Phases 0+1, 2, 3 — real backlog item, real value |
| Decomposition of original Phase 3.5 | Split into 3.5a (runner), 3.5b (cron), 3.5c (cost cap), 3.5d (alerting) — this spec covers 3.5a only | Per brainstorming-skill rule: don't bundle independent subsystems |

---

## Acceptance criteria for this spec

The implementation plan (next, via writing-plans) must:

1. Create `cinetrak/scripts/agent-run.sh` with `set -euo pipefail`, executable bit (`chmod +x`), `cd "$(dirname "$0")/.."` to anchor to cinetrak repo root regardless of caller's pwd
2. Cover all 16 workflow steps with explicit error messages + recovery commands
3. Include the verbatim heredoc brief template (Section 4 of this spec)
4. Specify the `tmux load-buffer` + `paste-buffer` approach for the multi-line brief; fall back to `send-keys` only if buffer-based path is broken
5. Specify Doppler non-interactive setup (verify which flag works on the user's Doppler version; document the fallback `.doppler.yaml` write)
6. Cover `cinetrak/scripts/README.md` creation/update with a usage block
7. Cover the script's own test plan: 3 install-verify scenarios (no args, fake issue #, existing-state) + the first proof-of-value run
8. Identify the first proof-of-value task at plan-execution time (a real GitHub issue picked at run time — likely a small UI bug, or codifying the email template into a `supabase/templates/` dir per today's findings)
9. Cover a bash trap on SIGINT that prints the cleanup command before exiting
10. Cover the vault docs: first-run Process note, ADR phase update, daily note, scripts/README.md, memory entry for ceremony-skipping
