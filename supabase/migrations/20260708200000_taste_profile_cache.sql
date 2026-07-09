-- Taste Profile deep-dive (stats "Going deeper", vault PS-22 screen 3/4) —
-- the AI-summary cache table.
--
-- Director/studio aggregates require per-movie TMDB credits lookups (not
-- stored locally), so unlike Rating Personality/Blind Spots this deep-dive
-- has a real cost to recompute — the edge function `generate-taste-summary`
-- does the TMDB fan-out + OpenAI call and upserts the result here. Decade and
-- comfort-genre stats are cheap and computed client-side straight from
-- `user_movies` (see lib/taste-profile.ts) — this table only caches the parts
-- that need the network round-trip.
--
-- HARDENING POSTURE (mirrors 20260707150000_streak_spine_tables.sql): RLS
-- enabled with a SELECT-own policy only. No client-facing INSERT/UPDATE
-- policy — the only writer is the edge function via the service-role client,
-- which bypasses RLS entirely. Table-level write grants are also revoked from
-- anon/authenticated as defense in depth.

CREATE TABLE IF NOT EXISTS "public"."taste_profile_cache" (
    "user_id" "uuid" NOT NULL,
    "summary" "text" NOT NULL,
    "aggregates" "jsonb" NOT NULL,
    "logs_count_at_generation" integer NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "taste_profile_cache_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "taste_profile_cache_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    CONSTRAINT "taste_profile_cache_logs_count_check" CHECK (("logs_count_at_generation" >= 0))
);

ALTER TABLE "public"."taste_profile_cache" OWNER TO "postgres";
ALTER TABLE "public"."taste_profile_cache" ENABLE ROW LEVEL SECURITY;

-- SELECT own row only. No write policy → client writes are denied by RLS;
-- the generate-taste-summary edge function (service role) is the only writer.
CREATE POLICY "taste_profile_cache_select_own" ON "public"."taste_profile_cache"
    FOR SELECT USING (("auth"."uid"() = "user_id"));

REVOKE ALL ON TABLE "public"."taste_profile_cache" FROM "anon", "authenticated";
GRANT SELECT ON TABLE "public"."taste_profile_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."taste_profile_cache" TO "service_role";

COMMENT ON TABLE "public"."taste_profile_cache" IS 'Cached AI taste-profile read (top directors/studio + summary) per user. Written only by the generate-taste-summary edge function. PS-22 screen 3/4.';
