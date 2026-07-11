-- release_calendar data-hygiene cleanup
--
-- RCA (2026-07-10): release_calendar has two writers with asymmetric hygiene.
-- warm-release-calendar (daily cron) date-windows every row and reconciles
-- null titles within its forward window. enrich-release-calendar (fired per
-- addMovie) had NO date filter and NO TMDB metadata fallback, so it emitted a
-- row per historical release event (dates back to 1973, re-releases) and, on a
-- movies-cache miss, inserted null title/poster rows. Out-of-window null rows
-- are unreachable by warm's reconciliation → permanent junk. Prod at audit:
-- 1,079 rows, 324 null poster, 206 null title, dates spanning 1973→2027.
--
-- This migration removes the accumulated junk. The enrich fix (window filter +
-- metadata fallback + never-insert-null-title guard) in the same PR prevents
-- recurrence, so after this both writers guarantee titled, in-window rows.
--
-- Accepted trade-off: deleting pre-current-month rows forecloses a future
-- "recently released" view. That view is not built today; we fix the data
-- source rather than retain junk on the chance it becomes useful.

-- Drop everything before the current month — enrich's unfiltered historical
-- backfill is the only source of these, and the client orders/paginates by
-- upcoming date, so they are unreachable junk.
DELETE FROM public.release_calendar
WHERE release_date < date_trunc('month', now())::date;

-- Drop title-less rows. The client already hides these (null-title filter in
-- release-calendar-service), and post-PR both writers guarantee a title before
-- insert — so any remaining null-title row is pure junk with no path to repair.
DELETE FROM public.release_calendar
WHERE title IS NULL;
