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
