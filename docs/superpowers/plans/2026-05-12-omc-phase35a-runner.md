# OMC Phase 3.5a — One-Command Agent Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `cinetrak/scripts/agent-run.sh`, a bash script that collapses the 13-step Phase 3 runbook into one command (`./scripts/agent-run.sh <issue-N>`). The script handles all operational setup (worktree + npm install + Doppler config + tmux + OMC launch + brief paste) and ends inside the tmux session ready for the human to watch.

**Architecture:** Pure bash with `set -euo pipefail`. Anchors to cinetrak repo root via `dirname` of the script path. Verifies prereqs, validates the issue exists, enforces strict idempotency (fails if state exists with a printable recovery command), creates the worktree, provisions it (npm + Doppler + GITHUB_PAT verification), launches tmux detached, sends `doppler run -- omc` via `send-keys`, sleeps 5s for OMC to boot, pastes the autopilot brief via `tmux load-buffer + paste-buffer` (avoids `send-keys` escaping pain with backticks), then `exec tmux attach`. SIGINT trap prints cleanup recovery before exiting.

**Tech Stack:** bash, `tmux`, `gh` CLI, `doppler` (v3.76+ with `--no-interactive`), `git worktree`, `npm`, `omc` (or `claude` fallback).

**Spec:** `docs/superpowers/specs/2026-05-12-omc-phase35a-runner-design.md`

---

## File Structure

| Path | Owner | Purpose |
|---|---|---|
| `cinetrak/scripts/agent-run.sh` | Tasks 2-6 | The runner — single bash script |
| `cinetrak/scripts/README.md` | Task 8 | Usage doc (file does not exist yet — Task 1 confirmed) |
| Vault: `Projects/PocketStubs/Process/Phase 3.5a - Runner First Run.md` | Task 12 | First-run outcome only |
| Vault: `Projects/PocketStubs/Decisions/ADR - OMC for SDLC Orchestration.md` | Task 12 (update) | Phase 3.5a row + decomposition note |
| Vault: `Daily Notes/2026-05-12.md` (or current date) | Task 12 | Live log |
| Memory: `feedback_when_to_skip_ceremony.md` | Task 12 | When to use this script vs brainstorm flow |

---

## Task 1: Pre-implementation reconnaissance

**Files:** None (verification only)

- [ ] **Step 1: Verify the spec is accessible**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak
ls docs/superpowers/specs/2026-05-12-omc-phase35a-runner-design.md && echo OK
```

Expected: `OK`. Spec file exists.

- [ ] **Step 2: Confirm `scripts/` dir + naming convention**

```bash
ls scripts/
```

Expected: 7 existing scripts (`generate-movie-pages.js`, `inject-posthog-snippet.js`, `reset-project.js`, `sync-eas-secrets.sh`, `sync-supabase-secrets.sh`, `test-processor.js`, `test-ticket-scan.js`). Existing `.sh` scripts establish naming convention (kebab-case, `.sh` suffix). New script uses same convention: `agent-run.sh`.

- [ ] **Step 3: Confirm Doppler `--no-interactive` works**

```bash
doppler setup --help 2>&1 | grep "no-interactive"
```

Expected: `--no-interactive   do not prompt for information.`

- [ ] **Step 4: Verify we're on the correct chore branch**

```bash
git branch --show-current
```

Expected: `chore/omc-phase35a-spec` (the branch with the spec). The script + README will be added on this branch.

- [ ] **Step 5: Commit nothing**

Verification only.

---

## Task 2: Create script skeleton — header + arg parsing + SIGINT trap + prereq checks

**Files:**
- Create: `cinetrak/scripts/agent-run.sh`

- [ ] **Step 1: Create the file with the initial skeleton**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak
cat > scripts/agent-run.sh <<'BASH_SCRIPT'
#!/usr/bin/env bash
# OMC Phase 3.5a — One-command agent runner
# Usage: ./scripts/agent-run.sh <issue-number-or-url>
# Spec:  docs/superpowers/specs/2026-05-12-omc-phase35a-runner-design.md
# Plan:  docs/superpowers/plans/2026-05-12-omc-phase35a-runner.md

set -euo pipefail

# --- Anchor to cinetrak repo root regardless of caller's pwd ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

REPO_OWNER="TyShaneONeill"
REPO_NAME="movie-tracker"
REPO_FULL="$REPO_OWNER/$REPO_NAME"

usage() {
  cat <<USAGE
Usage: $(basename "$0") <issue-number-or-url>

Examples:
  $(basename "$0") 437
  $(basename "$0") https://github.com/$REPO_FULL/issues/437

Spins up an OMC autopilot agent in a tmux session, pointed at the given GitHub issue.
The script ends inside the tmux session, ready for you to watch the agent.

See scripts/README.md for full docs.
USAGE
  exit 1
}

# --- Step 1: parse args ---
[[ $# -eq 1 ]] || usage
case "$1" in
  -h|--help) usage ;;
esac

ARG="$1"
if [[ "$ARG" =~ ^https?://github\.com/.+/issues/([0-9]+)$ ]]; then
  ISSUE_NUM="${BASH_REMATCH[1]}"
elif [[ "$ARG" =~ ^[0-9]+$ ]]; then
  ISSUE_NUM="$ARG"
else
  echo "Error: Argument must be a positive integer issue number OR a GitHub issue URL." >&2
  usage
fi

WORKTREE_DIR=".worktrees/agent-issue-$ISSUE_NUM"
BRANCH="feature/agent-issue-$ISSUE_NUM"
TMUX_SESSION="agent-$ISSUE_NUM"

# --- SIGINT trap: print cleanup hint before exiting ---
cleanup_hint() {
  echo "" >&2
  echo "Interrupted. To clean up partial state and retry:" >&2
  echo "  git worktree remove --force $WORKTREE_DIR 2>/dev/null; git branch -D $BRANCH 2>/dev/null; tmux kill-session -t $TMUX_SESSION 2>/dev/null" >&2
  exit 130
}
trap cleanup_hint INT

# --- Step 2: prereq checks ---
check_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Error: '$1' not found on PATH. $2" >&2
    exit 1
  }
}
check_cmd tmux "Install with: brew install tmux"
check_cmd gh "Install with: brew install gh"
check_cmd doppler "Install with: brew install dopplerhq/cli/doppler"
if ! command -v omc >/dev/null 2>&1 && ! command -v claude >/dev/null 2>&1; then
  echo "Error: Neither 'omc' nor 'claude' found on PATH." >&2
  echo "  Install OMC with: npm i -g oh-my-claude-sisyphus@latest && omc setup" >&2
  exit 1
fi
gh auth status >/dev/null 2>&1 || {
  echo "Error: gh CLI not authenticated. Run: gh auth login" >&2
  exit 1
}

# --- (Tasks 3-6 add more steps below this line) ---

echo "Skeleton complete. Argument parsed: issue #$ISSUE_NUM. Prereqs satisfied."
BASH_SCRIPT
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/agent-run.sh
ls -la scripts/agent-run.sh
```

Expected: `-rwxr-xr-x` permissions visible.

- [ ] **Step 3: Smoke-test the skeleton — no args**

```bash
./scripts/agent-run.sh
```

Expected: prints usage + exits non-zero. Captured `$?` would be 1.

- [ ] **Step 4: Smoke-test — invalid arg**

```bash
./scripts/agent-run.sh foo-bar
```

Expected: prints `Error: Argument must be a positive integer...` + usage + exits non-zero.

- [ ] **Step 5: Smoke-test — valid arg, prereqs satisfied**

```bash
./scripts/agent-run.sh 437
```

Expected: parses arg, runs prereq checks, prints `Skeleton complete. Argument parsed: issue #437. Prereqs satisfied.`

If any prereq is missing, fix it before continuing to Task 3.

- [ ] **Step 6: Commit nothing yet**

Wait until Task 6 to commit the full script.

---

## Task 3: Add issue verification + strict idempotency check

**Files:**
- Modify: `cinetrak/scripts/agent-run.sh` (replace the placeholder line at end of skeleton)

- [ ] **Step 1: Replace the placeholder line with issue verification + idempotency**

Open `scripts/agent-run.sh`. Find the line:

```bash
echo "Skeleton complete. Argument parsed: issue #$ISSUE_NUM. Prereqs satisfied."
```

Replace it with:

```bash
# --- Step 3: verify issue exists ---
echo "Verifying issue #$ISSUE_NUM exists..."
if ! gh issue view "$ISSUE_NUM" --repo "$REPO_FULL" --json title,body >/dev/null 2>&1; then
  echo "Error: Issue #$ISSUE_NUM not found in $REPO_FULL." >&2
  echo "  Verify with: gh issue view $ISSUE_NUM --repo $REPO_FULL" >&2
  exit 1
fi

# --- Step 4: strict idempotency check ---
WORKTREE_EXISTS=false
BRANCH_EXISTS=false
[[ -d "$WORKTREE_DIR" ]] && WORKTREE_EXISTS=true
git show-ref --verify --quiet "refs/heads/$BRANCH" && BRANCH_EXISTS=true || true
if [[ "$WORKTREE_EXISTS" == "true" || "$BRANCH_EXISTS" == "true" ]]; then
  echo "Error: State exists for issue #$ISSUE_NUM." >&2
  echo "  Worktree: $WORKTREE_DIR ($([[ "$WORKTREE_EXISTS" == "true" ]] && echo exists || echo missing))" >&2
  echo "  Branch:   $BRANCH ($([[ "$BRANCH_EXISTS" == "true" ]] && echo exists || echo missing))" >&2
  echo "" >&2
  echo "Recover with:" >&2
  echo "  git worktree remove --force $WORKTREE_DIR 2>/dev/null; git branch -D $BRANCH 2>/dev/null" >&2
  exit 1
fi
if tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
  echo "Error: tmux session '$TMUX_SESSION' already exists." >&2
  echo "  Recover with: tmux kill-session -t $TMUX_SESSION" >&2
  exit 1
fi

# --- (Tasks 4-6 add more steps below this line) ---

echo "Issue verified. Idempotency clean. Ready to provision."
```

- [ ] **Step 2: Test — non-existent issue**

```bash
./scripts/agent-run.sh 99999
```

Expected: prints `Error: Issue #99999 not found in TyShaneONeill/movie-tracker.` + exits non-zero.

- [ ] **Step 3: Test — valid existing issue (use #437 if it still exists, or any open issue)**

```bash
./scripts/agent-run.sh 437
```

Expected: prints `Issue verified. Idempotency clean. Ready to provision.` (issue #437 was closed via PR but still exists in the repo).

- [ ] **Step 4: Test idempotency by creating a fake worktree first**

```bash
mkdir -p .worktrees/agent-issue-99998
./scripts/agent-run.sh 99998
```

Expected: idempotency check fires with the recovery command. Cleanup:

```bash
rm -rf .worktrees/agent-issue-99998
```

- [ ] **Step 5: Commit nothing yet**

---

## Task 4: Add worktree creation + npm install + Doppler setup + GITHUB_PAT verification

**Files:**
- Modify: `cinetrak/scripts/agent-run.sh` (replace the placeholder line at end)

- [ ] **Step 1: Replace the placeholder with provisioning logic**

Open `scripts/agent-run.sh`. Find:

```bash
echo "Issue verified. Idempotency clean. Ready to provision."
```

Replace with:

```bash
# --- Step 5: pull main ---
echo "Pulling main..."
git checkout main >/dev/null 2>&1
git pull --ff-only origin main

# --- Step 6: create worktree ---
echo "Creating worktree at $WORKTREE_DIR..."
git worktree add "$WORKTREE_DIR" -b "$BRANCH" main

# --- Step 7: provision worktree ---
cd "$WORKTREE_DIR"

echo "Running npm install (this takes 2-5 min)..."
npm install

echo "Setting up Doppler (project=pocketstubs, config=dev)..."
doppler setup --no-interactive --project pocketstubs --config dev

# --- Step 8: verify GITHUB_PAT injected ---
if ! doppler run -- bash -c '[ -n "$GITHUB_PAT" ]' 2>/dev/null; then
  echo "Error: GITHUB_PAT not injected by Doppler." >&2
  echo "  Add it: doppler secrets set GITHUB_PAT --project pocketstubs --config dev" >&2
  exit 1
fi
echo "GITHUB_PAT injected (verified)."

# --- (Tasks 5-6 add more steps below this line) ---

echo "Worktree provisioned. Ready to launch tmux + OMC."
```

- [ ] **Step 2: Test — full provisioning (will take ~5 min)**

⚠️ This actually creates a worktree + runs npm install. Pick a real issue number (use 437 — it's closed but exists, and the test can be cleaned up after).

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak
./scripts/agent-run.sh 437
```

Expected: pulls main, creates worktree, runs npm install (slow), runs doppler setup, verifies GITHUB_PAT, prints `Worktree provisioned. Ready to launch tmux + OMC.`

- [ ] **Step 3: Cleanup the test worktree**

```bash
git worktree remove --force .worktrees/agent-issue-437
git branch -D feature/agent-issue-437 2>/dev/null
```

⚠️ Confirm before destructive ops. This is a test cleanup — the worktree + branch were just created seconds ago, no real work to lose.

- [ ] **Step 4: Commit nothing yet**

---

## Task 5: Add brief building + tmux launch + brief paste + attach

**Files:**
- Modify: `cinetrak/scripts/agent-run.sh` (replace the placeholder at end)

- [ ] **Step 1: Replace the placeholder with tmux + brief logic**

Open `scripts/agent-run.sh`. Find:

```bash
echo "Worktree provisioned. Ready to launch tmux + OMC."
```

Replace with:

```bash
# --- Step 9: build the autopilot brief ---
ISSUE_URL="https://github.com/$REPO_FULL/issues/$ISSUE_NUM"
BRIEF=$(cat <<EOF
/autopilot Read GitHub issue #$ISSUE_NUM at $ISSUE_URL via the github MCP. The issue body is your verbatim brief. Ship a PR that fixes it. Use \`Closes #$ISSUE_NUM\` in the PR body so the issue auto-closes on merge. After the PR is open, use the github MCP to post a single linkback comment on issue #$ISSUE_NUM with the PR link and a one-line summary of what you shipped (separate from any other comments).

Universal constraints (apply to every run):
- Do NOT modify SQL migrations under supabase/migrations/.
- Do NOT change authentication, payments, RLS policies, or webhook handlers.
- If you must modify a Supabase edge function under supabase/functions/, flag it in the PR body with a top-of-body callout: ⚠️ MANUAL DEPLOY REQUIRED AFTER MERGE: doppler run -- supabase functions deploy <function-name>
- No new npm dependencies unless explicitly justified.

The issue body may add task-specific constraints (investigation gate, target file paths, test requirements). Honor both.
EOF
)

# --- Step 10: launch tmux session detached ---
WORKTREE_ABS="$(pwd)"
echo "Launching tmux session '$TMUX_SESSION'..."
tmux new-session -d -s "$TMUX_SESSION" -c "$WORKTREE_ABS"

# --- Step 11: send the OMC launch command ---
tmux send-keys -t "$TMUX_SESSION" "doppler run -- omc" Enter

# --- Step 12: wait for OMC to boot ---
echo "Waiting 5s for OMC to boot..."
sleep 5

# --- Step 13: send the brief via load-buffer + paste-buffer (avoids send-keys escaping) ---
BRIEF_TMP="$(mktemp -t agent-brief.XXXXXX)"
printf '%s' "$BRIEF" > "$BRIEF_TMP"
tmux load-buffer -t "$TMUX_SESSION" "$BRIEF_TMP"
tmux paste-buffer -t "$TMUX_SESSION"
tmux send-keys -t "$TMUX_SESSION" Enter
rm -f "$BRIEF_TMP"

# --- Step 14: clear the SIGINT trap (we're handing off to tmux) ---
trap - INT

# --- Step 15: attach to the session (replaces this script's process) ---
echo ""
echo "Attaching to tmux session '$TMUX_SESSION'."
echo "Watch for the agent to call mcp__github__get_issue within 90s."
echo "If you need to abort: Ctrl-B then 'd' to detach, then 'tmux kill-session -t $TMUX_SESSION'."
echo ""
exec tmux attach -t "$TMUX_SESSION"
```

- [ ] **Step 2: Smoke-test the script structure (without actually running OMC)**

⚠️ Don't run the full script yet — that would actually trigger an OMC autopilot run on issue #437 which is closed.

Instead, do a syntax check:

```bash
bash -n scripts/agent-run.sh && echo "syntax OK"
```

Expected: `syntax OK`. Catches any bash syntax errors without executing.

- [ ] **Step 3: Verify the brief content compiles correctly with substitution**

Add a temporary echo at the top of step 9 (DELETE BEFORE COMMITTING) just to verify substitution:

```bash
# Temporarily test the brief substitution
ISSUE_NUM=437
ISSUE_URL="https://github.com/TyShaneONeill/movie-tracker/issues/437"
BRIEF=$(cat <<EOF
/autopilot Read GitHub issue #$ISSUE_NUM at $ISSUE_URL via the github MCP. The issue body is your verbatim brief. Ship a PR that fixes it. Use \`Closes #$ISSUE_NUM\` in the PR body...
EOF
)
echo "$BRIEF" | head -3
```

Expected: prints the brief with #437 substituted in three places. Discard this test code; the actual script reads ISSUE_NUM from the parsed arg.

- [ ] **Step 4: Commit nothing yet**

Full integration test happens in Task 7 + Task 11 with a REAL issue picked at execution time.

---

## Task 6: Final polish — script header comment + chmod recheck

**Files:**
- Modify: `cinetrak/scripts/agent-run.sh` (verify final shape)

- [ ] **Step 1: Read the full script and verify it's complete**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak
wc -l scripts/agent-run.sh
head -10 scripts/agent-run.sh
tail -10 scripts/agent-run.sh
```

Expected: roughly 100-130 lines total. Header comment block at top. `exec tmux attach` at the bottom. No trailing placeholders.

- [ ] **Step 2: Verify executable bit is still set**

```bash
ls -la scripts/agent-run.sh
```

Expected: `-rwxr-xr-x`.

- [ ] **Step 3: Final syntax check**

```bash
bash -n scripts/agent-run.sh && echo "syntax OK"
```

Expected: `syntax OK`.

- [ ] **Step 4: Commit nothing yet**

Wait for Task 9 to commit script + README together.

---

## Task 7: Install-verify tests (3 scenarios) — already partially done in Tasks 2-4

**Files:** None (verification only)

This task formalizes the tests we ran during Tasks 2-4 + adds one more for completeness.

- [ ] **Step 1: Test — no args prints usage**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak
./scripts/agent-run.sh
echo "exit code: $?"
```

Expected: usage printed; exit code `1`.

- [ ] **Step 2: Test — invalid arg format**

```bash
./scripts/agent-run.sh not-a-number
echo "exit code: $?"
```

Expected: error + usage; exit code `1`.

- [ ] **Step 3: Test — non-existent issue number**

```bash
./scripts/agent-run.sh 99999
echo "exit code: $?"
```

Expected: `Error: Issue #99999 not found in TyShaneONeill/movie-tracker.`; exit code `1`.

- [ ] **Step 4: Test — URL form parses correctly**

⚠️ This test will go past the prereq checks and into provisioning. Use issue #437 which is closed-but-exists. Be ready to interrupt with Ctrl-C after the worktree is created (the cleanup hint will print the recovery command).

```bash
./scripts/agent-run.sh https://github.com/TyShaneONeill/movie-tracker/issues/437
# Watch the output. As soon as it says "Pulling main..." you can Ctrl-C.
# Then run the printed cleanup command.
```

Expected: parses URL → extracts `437` → progresses past prereqs → starts pulling main. Ctrl-C → cleanup hint prints with the exact recovery command. Run that command to restore clean state.

- [ ] **Step 5: Test — idempotency catches existing worktree**

```bash
mkdir -p .worktrees/agent-issue-99998
./scripts/agent-run.sh 99998
echo "exit code: $?"
rm -rf .worktrees/agent-issue-99998
```

Expected: error fires with cleanup recovery command; exit code `1`.

- [ ] **Step 6: Commit nothing**

Verification only.

---

## Task 8: Create scripts/README.md

**Files:**
- Create: `cinetrak/scripts/README.md`

- [ ] **Step 1: Write the README**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak
cat > scripts/README.md <<'README_END'
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
README_END
```

- [ ] **Step 2: Verify**

```bash
ls -la scripts/README.md
head -5 scripts/README.md
```

Expected: file exists, first line is `# scripts/`.

---

## Task 9: Commit script + README

**Files:**
- Add: `cinetrak/scripts/agent-run.sh`
- Add: `cinetrak/scripts/README.md`

- [ ] **Step 1: Stage both files**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak
git add scripts/agent-run.sh scripts/README.md
git status -s
```

Expected: both files listed as added (`A`).

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(scripts): add agent-run.sh — one-command OMC Autopilot runner (Phase 3.5a)

Replaces the manual 13-step OMC runbook from Phases 0+1, 2, and 3 with
a single command:

  ./scripts/agent-run.sh <issue-number-or-url>

Script handles: prereq checks, GitHub issue verification, strict
idempotency check (fails fast with printable cleanup command if state
exists), main pull, worktree creation, npm install, Doppler setup,
GITHUB_PAT injection verification, tmux session launch, OMC launch,
autopilot brief paste via load-buffer/paste-buffer (avoids send-keys
escaping), and tmux attach.

Brief template is minimal + universal forbidden zones (no migrations,
no auth/payments/RLS/webhooks, edge function manual-deploy callout,
no new deps). Task-specific constraints live in the issue body.

Removes per-task brainstorm/spec/plan ceremony for routine bug-fix
runs. Brainstorm flow stays for new capabilities.

Spec: docs/superpowers/specs/2026-05-12-omc-phase35a-runner-design.md
Plan: docs/superpowers/plans/2026-05-12-omc-phase35a-runner.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git log --oneline -3
```

Expected: shows the new commit on top of the spec commit.

---

## Task 10: Identify the first proof-of-value task

**Files:** None (decision)

The script needs a real GitHub issue to validate against. This task picks one.

- [ ] **Step 1: Survey candidate issues**

Three options based on this session's work:

1. **File a new issue for the email template branding** (P1 from today's investigation, Task #29 in this session — though user already manually fixed in dashboard, we could codify the template into `supabase/templates/`)
2. **File a new issue for the iOS dev logout bug** (P2 from today, Task #27)
3. **Use any open issue from the existing backlog** (would need to grep)

- [ ] **Step 2: Confirm the chosen task with the user before filing**

The first run of agent-run.sh validates the script's mechanics. Pick a task that's:
- Real (not synthetic)
- Scoped (one or two files)
- Test-friendly (has a clear pass/fail)
- NOT touching auth/payments/RLS/webhooks (per universal forbidden zones)

Confirm choice with user before proceeding.

- [ ] **Step 3: File the chosen issue (or use an existing one)**

If filing new:

```bash
gh issue create \
  --repo TyShaneONeill/movie-tracker \
  --title "<your title>" \
  --body-file ~/Downloads/<task-body>.md
```

Note the issue number `<N>`.

- [ ] **Step 4: Commit nothing**

The issue lives on GitHub.

---

## Task 11: First proof-of-value run

**Files:** None at this layer (the agent will modify code)

- [ ] **Step 1: Run the script**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak
./scripts/agent-run.sh <N>
```

Replace `<N>` with the issue number from Task 10.

Expected: script runs end-to-end. ~6 minutes (mostly npm install). Ends with you attached to tmux session `agent-<N>`, OMC running, autopilot brief just pasted.

- [ ] **Step 2: Watch first 90 seconds**

The agent should call `mcp__github__get_issue` (or similar) within ~90s. If the agent goes off-script (touches forbidden zones, edits unrelated files), Ctrl-B then `d` to detach + run cleanup.

- [ ] **Step 3: Walk away or watch passively**

Per the design — script's job is done. Human does standard review when PR opens.

- [ ] **Step 4: Capture timing metrics**

Note for the Process note (Task 12):
- Script invocation → "you're in tmux watching the agent" wall time
- Agent's first MCP call wall time after attach
- Total agent run time
- (Optional) OMC token cost from session report

- [ ] **Step 5: Standard PR review when agent finishes**

Same review pattern as Phases 0+1, 2, 3. The script doesn't change the review/merge step — that stays manual. Human reviews PR diff + CI + visual + merges.

- [ ] **Step 6: Manual cleanup post-merge**

Per design — auto-cleanup is out of scope for 3.5a. Manual cleanup:

```bash
git worktree remove --force .worktrees/agent-issue-<N>
git branch -D feature/agent-issue-<N> 2>/dev/null
tmux kill-session -t agent-<N> 2>/dev/null
```

⚠️ Confirm before destructive ops. Only run after PR has merged.

---

## Task 12: Vault docs

**Files:**
- Create via Obsidian MCP: `Projects/PocketStubs/Process/Phase 3.5a - Runner First Run.md`
- Update via Obsidian MCP: `Projects/PocketStubs/Decisions/ADR - OMC for SDLC Orchestration.md`
- Update via Obsidian MCP: `Daily Notes/2026-05-12.md` (or merge date)
- Possibly create: `~/.claude/projects/-Users-Shared-evermind-tormajs-evermind/memory/feedback_when_to_skip_ceremony.md`

⚠️ Use Obsidian MCP tools, NOT filesystem `Write`, for vault notes.

- [ ] **Step 1: Write the first-run Process note**

Use `mcp__obsidian__write_note` with path `Projects/PocketStubs/Process/Phase 3.5a - Runner First Run.md`. Substitute bracketed values:

```markdown
---
tags: [pocketstubs, process, omc, agent-orchestration, phase-3.5a, runner]
status: complete
priority: high
created: <YYYY-MM-DD of merge>
updated: <YYYY-MM-DD of merge>
---

# Phase 3.5a — Runner First Run

**Spec:** [[2026-05-12-omc-phase35a-runner-design]]
**Plan:** [[2026-05-12-omc-phase35a-runner]]
**ADR:** [[ADR - OMC for SDLC Orchestration]]
**Predecessor:** [[OMC Phase 2 - GitHub MCP First Run]] + [[OMC Phase 3 - Skills + Achievement Bug]]
**Issue used:** #<N> — <title>
**PR shipped:** #<PR#> — <PR title> — merged <timestamp>, squash commit `<sha>`

## Outcome
- ✅ / ⚠️ / ❌ <one-line summary>
- Script invocation → in-tmux: <X minutes>
- Agent first MCP call after attach: <X seconds>
- Total agent run time: <X minutes>
- OMC token cost: <$X.XX> (or "not captured")
- Files changed: <count>
- CI on first attempt: green / red

## What went well
- <list — emphasize ergonomics improvements vs manual runbook>

## What needed hand-holding
- <list — empty if script worked end-to-end>

## Script bugs found (if any)
- <list — file followups>

## Ergonomics assessment
- Time saved vs manual Phase 3 runbook: ~<X> minutes per run
- Steps eliminated from human's responsibility: <list>
- Friction remaining: <list — feeds Phase 3.5b/c/d scope>

## Decision impact
- **Subsequent routine runs use the script + skip ceremony.** This is the core deliverable working.
- New capabilities still go through brainstorm/spec/plan flow.
- Phase 3.5b (cron) is now unblocked — it would call this script on a schedule.

## Followups generated
- <list>
```

- [ ] **Step 2: Update the ADR phase table**

Use `mcp__obsidian__patch_note` to update the phase row:

- `path`: `Projects/PocketStubs/Decisions/ADR - OMC for SDLC Orchestration.md`
- `oldString`:
```
| **3.5 (NEW)** | L1-L2 autonomy: one-command runs, label-triggered cron, cost cap, skip per-task ceremony for routine work | Pending — see [[Phase 3.5 - L1-L2 Autonomy Brief]] |
```
- `newString`:
```
| **3.5a** | One-command agent runner (`scripts/agent-run.sh`); skip per-task brainstorm/spec/plan for routine runs | ✅ Complete (<merge-date>, [[Phase 3.5a - Runner First Run]]) |
| **3.5b** | Label-triggered cron / overnight unattended runs | Pending |
| **3.5c** | Cost capture + kill switch | Pending |
| **3.5d** | Resend webhook → Sentry/Slack alerting (signup-failure detection) | Pending |
```

- [ ] **Step 3: Append a Phase 3.5a findings section to the ADR**

Use `mcp__obsidian__patch_note`:

- `path`: same
- `oldString`:
```
### Findings discovered during Phase 3 (not predicted in advance)
```
- `newString`:
```
### Findings discovered during Phase 3.5a (not predicted in advance)
- <3-5 specific findings from the first run — script bugs, ergonomics surprises, anything>
- Time-saved per run vs manual Phase 3 runbook: ~<X> minutes
- Open question for Phase 3.5b/c/d: <what the first-run revealed about what's next>

### Findings discovered during Phase 3 (not predicted in advance)
```

- [ ] **Step 4: Update the ADR Status section**

Use `mcp__obsidian__patch_note`:

- `path`: same
- `oldString`:
```
**Accepted, in implementation.** Phases 0+1, 2, and 3 all complete and validated.
```
- `newString`:
```
**Accepted, in implementation.** Phases 0+1, 2, 3, and 3.5a all complete and validated. Routine bug-fix runs now skip the brainstorm/spec/plan ceremony via `scripts/agent-run.sh <issue-N>`. Brainstorm flow remains for new capabilities (3.5b cron, 3.5c cost cap, 3.5d alerting, Phase 4 observability, Phase 5 marketing).
```

- [ ] **Step 5: Append outcome to today's daily note**

Use `mcp__obsidian__patch_note` (or `mcp__obsidian__write_note` if the daily note for the merge date doesn't exist yet — create from `Templates/Daily Note.md`).

Append to the `## Shipped` section:

```markdown
- **PR #<PR#> (Phase 3.5a first run)** — `<PR title>` (Closes #<N>). Shipped end-to-end via `./scripts/agent-run.sh <N>` — first run of the new one-command runner. Per-task brainstorm/spec/plan ceremony skipped. Process note: [[Phase 3.5a - Runner First Run]]. ADR updated: [[ADR - OMC for SDLC Orchestration]].
```

- [ ] **Step 6: Create the ceremony-skipping memory**

Write to `~/.claude/projects/-Users-Shared-evermind-tormajs-evermind/memory/feedback_when_to_skip_ceremony.md`:

```markdown
---
name: When to use scripts/agent-run.sh vs the brainstorm flow
description: Phase 3.5a established a lighter pipeline for routine bug-fix runs. Use the script when a real GitHub issue with a clear brief exists; use the brainstorm/spec/plan flow only for new capabilities or architectural changes.
type: feedback
---

After Phase 3.5a (2026-05-12), routine OMC autopilot runs use `cinetrak/scripts/agent-run.sh <issue-N>` and **skip the brainstorm → spec → plan ceremony entirely**.

**Use the script when:**
- A real GitHub issue exists with a clear brief in its body (the issue body IS the agent's brief)
- The task is a routine bug fix or small feature
- No novel architectural concerns
- No load-bearing infrastructure changes

**Keep the brainstorm flow when:**
- Adding new capabilities (new MCPs, new skills, new orchestration patterns)
- Architectural changes
- Anything risky / novel / cross-cutting
- Anything that would benefit from a written design + plan that future you can reference

**How to apply:** if a task fits the "use the script" criteria, file the issue and run the script. Don't write a spec. Don't write a plan. Don't generate a Process note for it. The PR description + git log + issue thread are sufficient documentation. If the task DOESN'T fit, run brainstorming-skill → writing-plans-skill as before.

This rule is the deliberate output of Phase 3.5a — the user explicitly asked "when do we stop confirming specs and high-level dictation?" and this is the answer for routine work.
```

Then add the index entry to `MEMORY.md`:

```bash
# Add a one-line entry under ## Feedback (next to other feedback entries)
```

Edit `/Users/tyshaneoneill/.claude/projects/-Users-Shared-evermind-tormajs-evermind/memory/MEMORY.md`. Insert under `## Feedback`:

```
- [feedback_when_to_skip_ceremony.md](feedback_when_to_skip_ceremony.md) — After Phase 3.5a, routine bug-fix runs use `scripts/agent-run.sh <issue-N>` and skip the brainstorm/spec/plan ceremony. Brainstorm flow stays for new capabilities only.
```

- [ ] **Step 7: Update project state memory if Phase 3.5a changes durable project state**

Read `/Users/tyshaneoneill/.claude/projects/-Users-Shared-evermind-tormajs-evermind/memory/project_pocketstubs_state.md`. Update the Agent Orchestration section's phase status line:

Replace:
```
- Phased adoption sequence: (0+1) ✅ Foundation, (2) ✅ github-mcp-server (issue → PR loop validated), (3) ✅ skill curation (4 softaworks skills cherry-picked into project-scope, validated via achievement bug fix), (3.5) L1-L2 autonomy (next), (4) observability decision (deferred to serve 3.5), (5) Marketing system on Ayrshare.
```

With:
```
- Phased adoption sequence: (0+1) ✅ Foundation, (2) ✅ github-mcp-server, (3) ✅ skill curation, (3.5a) ✅ One-command runner (`scripts/agent-run.sh`; routine runs skip brainstorm/spec/plan ceremony), (3.5b) cron / overnight, (3.5c) cost cap, (3.5d) alerting, (4) observability, (5) Marketing system on Ayrshare.
```

- [ ] **Step 8: Commit nothing in cinetrak**

Vault + memory only.

---

## Self-review checklist (already performed)

- ✅ **Spec coverage:** Every spec section maps to a task.
  - Goal/success criterion → Task 11 (first proof-of-value run timing target ≤ 6 min)
  - Stack additions → Task 9 (commit) + Task 8 (README)
  - Workflow steps 1-16 → Tasks 2-5 (script implementation) + Task 11 (real run)
  - Brief template verbatim → Task 5 Step 1
  - Verification gates → Task 7 (3 install-verify scenarios)
  - Failure modes → handled in Tasks 2-5 inline (each step has explicit error messages with cleanup commands)
  - Documentation outputs → Tasks 8 (README) + 12 (vault docs + memory)
  - Out-of-scope items → not in any task (correctly absent)
- ✅ **Placeholder scan:** Intentional placeholders only (`<N>`, `<PR#>`, `<sha>`, `<merge-date>` — don't exist until run produces them; `<your title>` in Task 10 Step 3 — depends on chosen task).
- ✅ **Type/name consistency:**
  - Script path: `scripts/agent-run.sh` consistent across Tasks 2-9
  - Branch name pattern: `feature/agent-issue-<N>` consistent
  - Worktree path pattern: `.worktrees/agent-issue-<N>` consistent
  - Tmux session pattern: `agent-<N>` consistent
  - Repo full name: `TyShaneONeill/movie-tracker` consistent
  - Cleanup command shape consistent across SIGINT trap, idempotency check error, README docs
- ✅ **Honest unknowns:**
  - Task 10 first-task selection is genuinely user's choice
  - Task 11 metrics can't be predicted; captured at run time
  - Vault note placeholders fill in post-run
