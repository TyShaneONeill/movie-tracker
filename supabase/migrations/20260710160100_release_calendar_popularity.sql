-- release_calendar.popularity — TMDB popularity score for within-day ordering.
--
-- The client groups releases by day and, before this, ordered only by
-- release_date, so which of a day's releases surfaced first was arbitrary.
-- Both writers now populate popularity (warm from the discover payload, enrich
-- from /movie/{id}); the client orders release_date ASC, popularity DESC NULLS
-- LAST so the most relevant release leads each day.
--
-- No index: the table is ~1k rows and ordering happens per-day within an
-- already date-bounded query — a scan is cheaper than maintaining an index.
ALTER TABLE public.release_calendar
  ADD COLUMN IF NOT EXISTS popularity numeric;
