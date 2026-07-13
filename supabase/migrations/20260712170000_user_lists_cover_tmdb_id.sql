-- Lists v2 (design contract 01.2): "set the marquee".
-- Adds the TMDB id of the title whose BACKDROP is used as a custom list's hero.
-- NULL = use the smart default (most popular title with a backdrop).
--
-- Additive + nullable, so the flagged client works with the column ABSENT
-- (pre-migration reads fall back to the smart default via `select('*')`) — the
-- v2 bundle can merge + OTA before this migration is applied.
--
-- No RLS change needed: the existing owner UPDATE policy on user_lists already
-- covers this column, and it is not a privileged/denylisted field.

ALTER TABLE public.user_lists
  ADD COLUMN IF NOT EXISTS cover_tmdb_id integer;

COMMENT ON COLUMN public.user_lists.cover_tmdb_id IS
  'Lists v2 marquee: TMDB id of the title whose backdrop is the list hero. NULL = smart default. Owner-writable under the existing user_lists UPDATE policy.';
