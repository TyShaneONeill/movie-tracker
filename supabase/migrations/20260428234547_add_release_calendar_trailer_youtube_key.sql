-- Add trailer_youtube_key column for SP4-C trailer thumbnails feature.
-- Populated by warm-release-calendar (daily batch) + enrich-release-calendar
-- (per-watchlist-add) over time. NULL is treated as "no trailer" on the client
-- (Play Trailer button conditional on this field being non-null).

ALTER TABLE public.release_calendar
ADD COLUMN trailer_youtube_key TEXT;
