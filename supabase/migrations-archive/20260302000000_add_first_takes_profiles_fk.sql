-- Add FK from first_takes.user_id to profiles.id
-- This enables PostgREST embedded resource joins like:
--   .select('*, profiles(full_name, username, avatar_url)')
-- Without this FK, PostgREST returns PGRST200 error because it cannot
-- find a relationship path from first_takes to profiles.
--
-- The existing FK first_takes_user_id_fkey -> auth.users.id is kept for
-- referential integrity with the auth schema. This second FK to profiles
-- is what PostgREST uses for the join path.
ALTER TABLE public.first_takes
  ADD CONSTRAINT first_takes_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id);
