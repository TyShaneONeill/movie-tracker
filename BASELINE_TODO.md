# BASELINE_TODO — manual steps for the human owner

> **Delete this file before merging the PR.** It exists so reviewers can see
> the remaining work that requires interactive Supabase CLI access (DB
> password, linked project) that an agent cannot perform.

## Steps

1. **Generate the baseline migration from prod**

   ```bash
   supabase db pull --linked
   ```

   This will create `supabase/migrations/<timestamp>_remote_schema.sql` (or
   similar). Rename it to `<timestamp>_baseline.sql` so its purpose is
   obvious:

   ```bash
   mv supabase/migrations/<timestamp>_remote_schema.sql \
      supabase/migrations/<timestamp>_baseline.sql
   ```

2. **Inspect what got generated**

   ```bash
   supabase migration list
   supabase migration list --linked
   ```

   Confirm:
   - Local: exactly one migration (the new baseline).
   - Linked: the full list of currently-applied timestamps (will still
     include the 56 historical ones from `supabase_migrations.schema_migrations`).

3. **Repair the tracking table so prod thinks only the baseline is applied**

   For every timestamp in the linked list that is **not** the new baseline,
   mark it reverted:

   ```bash
   supabase migration repair --status reverted <timestamp>
   ```

   (Script this with a shell loop — there are ~56 of them. See the file list
   in `supabase/migrations-archive/` for the full set of timestamps.)

   Then mark the baseline applied:

   ```bash
   supabase migration repair --status applied <baseline-timestamp>
   ```

4. **Verify `supabase db reset` runs clean end-to-end**

   ```bash
   supabase db reset
   ```

   This is the canary that the whole cleanup worked: it builds the shadow DB
   from zero by replaying every migration in `supabase/migrations/`. With
   only the baseline present, this should succeed in one shot.

5. **Commit the baseline + delete this TODO file**

   ```bash
   git add supabase/migrations/<timestamp>_baseline.sql
   git rm BASELINE_TODO.md
   git commit -m "chore(db): add prod schema baseline migration"
   git push
   ```

6. **Mark the PR ready for review, get approval, merge.**

## Why an agent can't do this

- `supabase db pull --linked` requires the linked-project DB password and is
  interactive.
- `supabase migration repair` mutates the remote tracking table — too risky
  to delegate.
- `supabase db reset` requires a local Supabase stack to be running.
