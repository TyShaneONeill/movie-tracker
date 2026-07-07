-- PS-15 PR 0: add IANA timezone column to profiles, populated client-side from
-- Intl.DateTimeFormat().resolvedOptions().timeZone (see hooks/use-profile-timezone-sync.ts).
-- Nullable, no default, no backfill — existing rows stay NULL until the client
-- next syncs.
--
-- No new RLS policy: the existing "Users can update their own profile" UPDATE
-- policy (USING (auth.uid() = id), no column list) already covers this column.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS timezone text;

COMMENT ON COLUMN public.profiles.timezone IS 'IANA timezone (e.g. America/New_York), synced from the device on auth''d app start. Nullable — absent until first client sync.';
