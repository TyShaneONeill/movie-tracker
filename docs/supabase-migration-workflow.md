# Supabase Migration Workflow

_Last updated: 2026-05-25 (post-baseline cleanup)_

## Why this exists

Between roughly **April 12 – May 1, 2026**, the team's de-facto convention was
to apply Supabase schema changes via the `mcp__plugin_supabase_supabase__apply_migration`
MCP tool. That tool writes to the remote database **and** the
`supabase_migrations.schema_migrations` tracking table, but it does **not**
create a local `.sql` file in `supabase/migrations/`.

The result was a partial, drifted migration history:

- `supabase/migrations/` only contained a subset of the schema changes that had
  actually been applied to prod.
- The earliest tracked migration referenced tables (e.g. `first_takes`) that
  had no `CREATE TABLE` statement anywhere in the migration folder.
- `supabase db reset` could never run end-to-end locally — the shadow DB
  couldn't be built from the file history.
- `supabase db diff --linked` failed for the same reason.

This was not maliciously bad — it was a convention that was explicitly
documented in plan docs (see
`docs/superpowers/plans/2026-04-20-widget-phase-4c-episode-catalog.md`'s
"no local migration file — CineTrak convention" line) — but it left the
repo unable to reconstruct prod schema from source.

The follow-up to **PR #480** baselined the schema and reset the convention.
See `supabase/migrations-archive/` for the previous (incomplete) history.

## The convention going forward

**All schema changes MUST be authored as committed `.sql` files in
`supabase/migrations/` before they are pushed to any remote database.**

### Authoring a new migration

```bash
# 1. Generate a new timestamped file
supabase migration new <descriptive_name>

# 2. Edit the file at supabase/migrations/<timestamp>_<descriptive_name>.sql

# 3. Apply locally to verify it works against the baseline
supabase migration up           # apply to local Supabase
# OR
supabase db reset               # rebuild local DB from zero (baseline + all migrations)

# 4. Commit and open a PR
git add supabase/migrations/<timestamp>_<descriptive_name>.sql
git commit -m "feat(db): add <thing>"
```

### Code-review requirement

Every schema change goes through code review like any other code. A reviewer
should be able to read the `.sql` file and understand what changed. Squashed
or hand-edited migrations after merge are fine, but the file must exist in
the repo before the change hits prod.

### Pushing to remote

```bash
# Apply the newly committed migration(s) to the linked project
supabase db push
```

If you have permission to push directly, do so after the PR merges. If the
push fails because the tracking table drifts again, run
`supabase migration list --linked` and use
`supabase migration repair --status applied|reverted <timestamp>` to fix it.

## Explicitly banned

`mcp__plugin_supabase_supabase__apply_migration` (and any other tool that
applies SQL to the remote database without a corresponding committed file)
**must not be used for schema changes in normal workflows.**

The tool *may* be used for:

- Ad-hoc, read-only diagnostics (e.g. inspecting a row count, running
  `EXPLAIN`).
- One-off emergency hotfixes — but if used this way, the change **must** be
  immediately back-filled into a real `.sql` migration file in the same PR
  that records the incident.

Any future use of the tool for un-tracked schema changes should be treated
as a defect.

## The archive

`supabase/migrations-archive/` contains the previous, incomplete migration
history. It is preserved for git blame and historical context only.
**Supabase tooling does not look at this folder** — it's not a migration
path, just a snapshot of the old files.

If you ever need to understand "when did we add column X" or "what RLS policy
did we have on table Y in March 2026," start there.

## The baseline

`supabase/migrations/<timestamp>_baseline.sql` (generated via
`supabase db pull --linked`) represents the full production schema as of
**2026-05-25**. All future migrations build on top of it.

If the baseline ever drifts again (it shouldn't, if we hold the line on the
convention above), the recovery procedure is the same as the one that
produced it:

1. `supabase db pull --linked` to capture the new prod schema.
2. Move the existing baseline + any drift-bridging migrations into
   `supabase/migrations-archive/`.
3. Repair the tracking table so it lists only the new baseline as applied.
4. Verify `supabase db reset` runs clean.
