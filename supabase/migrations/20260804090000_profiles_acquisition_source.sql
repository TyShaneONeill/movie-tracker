-- Acquisition attribution (board mandate, pre-Product Hunt launch).
--
-- Self-reported acquisition channel captured by the one-time first-run
-- "what brought you here?" prompt. Values written by the client:
--   producthunt | alternativeto | x | friend | search | other | skipped
-- 'skipped' means the user dismissed the prompt without answering; ANY
-- non-null value means the prompt must never be shown again (this is the
-- reinstall-surviving seen-flag, not just attribution data).
--
-- Nullable by design: existing rows stay NULL and are additionally excluded
-- from the prompt by a created_at cutoff gate in the client.
--
-- Deploy: staging first (supabase db push linked to scleidoemjpkbxrpyqyv),
-- verify, then prod. Do NOT apply via MCP.

alter table public.profiles
  add column if not exists acquisition_source text;

comment on column public.profiles.acquisition_source is
  'Self-reported acquisition channel from the one-time first-run prompt (producthunt|alternativeto|x|friend|search|other|skipped). NULL = never answered/prompted.';
