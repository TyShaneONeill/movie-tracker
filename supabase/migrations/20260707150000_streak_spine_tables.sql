-- PS-15 PR 3 — punch-card streak spine, part 1/3: the data tables.
--
-- Two derived-state tables backing the profile punch card:
--   * user_activity_days — one row per (user, local calendar day) on which the
--     user did any qualifying action. first_action drives the diary framing
--     ("Day 12 — you rated Heat"); action_count is a cheap per-day tally.
--   * user_streaks — one row per user; the rolled-up streak state the card and
--     the at-risk push read directly (no per-read recompute over activity_days).
--
-- HARDENING POSTURE (mirrors the 2026-07-03 anon-definer lockdown and the
-- day2/recap candidate RPCs): RLS is ENABLED with a SELECT-own policy only.
-- There is deliberately NO client-facing INSERT/UPDATE/DELETE policy — every
-- write happens inside record_user_activity() / reconcile_user_streaks(),
-- which run SECURITY DEFINER (owner postgres) and therefore bypass RLS. On top
-- of the missing write policy we also REVOKE the table-level write grants from
-- anon/authenticated as defense in depth, so a future stray permissive policy
-- can't silently open a direct write path. Local-day math lives entirely in
-- the RPCs via profiles.timezone — never CURRENT_DATE-as-user-day.
--
-- Applied staging-first at deploy; no data backfill (streaks start the day the
-- feature goes live, per the ADR — no retroactive streak reconstruction).

-- ── user_activity_days ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."user_activity_days" (
    "user_id" "uuid" NOT NULL,
    "local_date" "date" NOT NULL,
    "first_action" "text" NOT NULL,
    "action_count" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_activity_days_pkey" PRIMARY KEY ("user_id", "local_date"),
    CONSTRAINT "user_activity_days_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    CONSTRAINT "user_activity_days_action_count_check" CHECK (("action_count" >= 1))
);

ALTER TABLE "public"."user_activity_days" OWNER TO "postgres";
ALTER TABLE "public"."user_activity_days" ENABLE ROW LEVEL SECURITY;

-- SELECT own rows only. No write policy → client writes are denied by RLS;
-- record_user_activity() (SECURITY DEFINER) is the only writer.
CREATE POLICY "user_activity_days_select_own" ON "public"."user_activity_days"
    FOR SELECT USING (("auth"."uid"() = "user_id"));

REVOKE ALL ON TABLE "public"."user_activity_days" FROM "anon", "authenticated";
GRANT SELECT ON TABLE "public"."user_activity_days" TO "authenticated";
GRANT ALL ON TABLE "public"."user_activity_days" TO "service_role";

-- ── user_streaks ─────────────────────────────────────────────────────────────
-- rain_checks: banked "skip a day for free" credits, hard-capped 0..2 (cap
-- enforced in the RPC AND as a CHECK here — belt and braces).
-- rain_checks_used: monotonic audit counter of how many rain checks have ever
-- been consumed to bridge a gap (for honest "you used a rain check" surfacing).
-- last_earn_date: the local day a rain check was last EARNED, so an earn fires
-- at most once per calendar day regardless of how many earn-actions occur.
CREATE TABLE IF NOT EXISTS "public"."user_streaks" (
    "user_id" "uuid" NOT NULL,
    "current_streak" integer DEFAULT 0 NOT NULL,
    "longest_streak" integer DEFAULT 0 NOT NULL,
    "last_activity_date" "date",
    "rain_checks" integer DEFAULT 0 NOT NULL,
    "rain_checks_used" integer DEFAULT 0 NOT NULL,
    "last_earn_date" "date",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_streaks_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "user_streaks_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    CONSTRAINT "user_streaks_rain_checks_check" CHECK (("rain_checks" >= 0 AND "rain_checks" <= 2)),
    CONSTRAINT "user_streaks_current_streak_check" CHECK (("current_streak" >= 0)),
    CONSTRAINT "user_streaks_longest_streak_check" CHECK (("longest_streak" >= 0))
);

ALTER TABLE "public"."user_streaks" OWNER TO "postgres";
ALTER TABLE "public"."user_streaks" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_streaks_select_own" ON "public"."user_streaks"
    FOR SELECT USING (("auth"."uid"() = "user_id"));

REVOKE ALL ON TABLE "public"."user_streaks" FROM "anon", "authenticated";
GRANT SELECT ON TABLE "public"."user_streaks" TO "authenticated";
GRANT ALL ON TABLE "public"."user_streaks" TO "service_role";

COMMENT ON TABLE "public"."user_activity_days" IS 'One row per (user, local calendar day) with a qualifying action. Written only by record_user_activity(). PS-15 PR 3.';
COMMENT ON TABLE "public"."user_streaks" IS 'Rolled-up per-user streak state (current/longest streak, banked rain checks). Written only by record_user_activity()/reconcile_user_streaks(). PS-15 PR 3.';
