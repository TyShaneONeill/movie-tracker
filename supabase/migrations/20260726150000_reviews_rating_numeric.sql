-- Migrate reviews.rating from integer to numeric(3,1) so ink ratings (a TV
-- Time imported stub rating, stored as a reviews row) can match First Take
-- granularity. Today the deck slider is pinned to step=1 because PostgREST
-- rejects fractional values on an INTEGER column via json_populate_record
-- (silently dropped every fractional ink — #722, patched in #725 by
-- rounding at the write boundary AND forcing step=1 so displayed == stored).
-- This migration lifts the column constraint; the client-side step change
-- and Math.round() removal ship in the same PR.
--
-- Widening conversion: existing integer values (e.g. 8) become numeric
-- equivalents (8.0) via the USING cast. No data loss, no rows rejected —
-- every existing value already satisfies the tighter 1..10 bound.
ALTER TABLE "public"."reviews"
  ALTER COLUMN "rating" TYPE numeric(3,1) USING ("rating"::numeric(3,1));

-- Mirror first_takes_rating_check's numeric-cast form (first_takes.rating is
-- already numeric(3,1) with this exact bound).
ALTER TABLE "public"."reviews" DROP CONSTRAINT "reviews_rating_check";
ALTER TABLE "public"."reviews"
  ADD CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= (1)::numeric) AND ("rating" <= (10)::numeric)));

-- NOTE: get_journey_for_movie, get_journey_with_movie, and get_movie_journeys
-- (20260525063629_remote_schema.sql:586,630,672) were flagged as at-risk
-- because their RETURNS TABLE declares "rating" integer. Verified NOT
-- affected: their bodies select um.rating from public.user_movies, which has
-- no rating column at all (nor notes/watch_provider/theater_name/
-- cinema_location/first_viewing — see lib/database.types.ts's user_movies
-- Row type). These three functions predate a user_movies redesign, have zero
-- call sites in the app (grepped lib/app/components/hooks), and would already
-- error with "column um.rating does not exist" if ever invoked. They do not
-- reference public.reviews and are unaffected by this migration either way.
-- Left untouched — out of scope for a reviews.rating change, and touching
-- unrelated dead DEFINER functions is not a safety-first move on a prod
-- migration. Flagging for a separate cleanup ticket.
