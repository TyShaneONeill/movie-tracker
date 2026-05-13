# Email Templates

PocketStubs-branded auth email templates. The repo is the source of truth; the
Supabase dashboard mirrors these files via `scripts/deploy-email-templates.sh`.

## What's here

| File | Used for | Mailer fields |
|---|---|---|
| `confirmation.html` | New-signup confirmation | `mailer_subjects_confirmation`, `mailer_templates_confirmation_content` |
| `reset_password.html` | Password reset (recovery) | `mailer_subjects_recovery`, `mailer_templates_recovery_content` |

Each template begins with an HTML comment of the form:

```html
<!--
SUBJECT: Welcome to PocketStubs! Confirm your email 🎬
-->
```

The deploy script parses that line and pushes it as the mailer subject alongside
the full file as the body. Supabase strips HTML comments before rendering.

## Editing a template

1. Edit the `.html` file directly. Preview in a browser (just open the file).
2. If you change the subject line, update the `SUBJECT:` comment at the top —
   that's what the deploy script reads.
3. Open a PR. Templates are not auto-deployed; you must run the deploy script
   after merge.

## Deploying

Templates push via the [Supabase Management API][docs]. The script lives at
`scripts/deploy-email-templates.sh` and follows the same Doppler pattern as
`scripts/sync-supabase-secrets.sh`.

### Drift check (default — no writes)

```bash
doppler run -- ./scripts/deploy-email-templates.sh
```

Prints the templates it would push, their parsed subject lines, and body byte
counts. Use this to confirm what's about to change before applying.

### Apply

```bash
doppler run -- ./scripts/deploy-email-templates.sh --apply
```

Prompts for `yes` confirmation (matching `sync-supabase-secrets.sh`'s prod gate),
then PATCHes `https://api.supabase.com/v1/projects/{ref}/config/auth` with both
templates in a single call.

### Help

```bash
./scripts/deploy-email-templates.sh --help
```

## Prereqs

- `SUPABASE_MANAGEMENT_TOKEN` in Doppler (the `pocketstubs` project, `dev` or
  `prd` config). Create the token at
  [supabase.com/dashboard/account/tokens][token]. Personal access tokens are
  account-level and inherit your project access — no granular scopes today.
- `curl` and `jq` on PATH (both ship with macOS / standard Linux distros).

If the token is missing the script exits with the exact `doppler secrets set`
command to add it.

## Smoke tests

```bash
# 1. No token → expect MISSING TOKEN error with doppler-set instructions
unset SUPABASE_MANAGEMENT_TOKEN
./scripts/deploy-email-templates.sh

# 2. Placeholder token + dry-run → expect preview (no API call)
SUPABASE_MANAGEMENT_TOKEN=placeholder ./scripts/deploy-email-templates.sh

# 3. Help text
./scripts/deploy-email-templates.sh --help
```

## Drift origin (2026-05-12)

The Supabase dashboard had stale CineTrak-branded content even though
`confirmation.html` had been PocketStubs-branded in the repo since PR #46
(2026-02-05). Templates were being edited in the dashboard by hand, then again
in the repo, without a sync step. This script closes that gap.

[docs]: https://supabase.com/docs/reference/api/v1-update-auth-service-config
[token]: https://supabase.com/dashboard/account/tokens
