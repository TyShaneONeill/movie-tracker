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
