-- Outreach feedback funnel — invite/grant ledger (vault "outreach feedback funnel", 2026-07-20).
--
-- Backs the tokenized outreach form: each launch-week email carries a unique
-- ?t=<token> link → public/outreach.html → the `outreach-form` edge function.
-- One row per invited user. The row is the single source of truth for the whole
-- funnel: link-click, questionnaire completion, and the PocketStubs+ promotional
-- grant start/finish — every stage timestamped here so the funnel is fully
-- trackable end-to-end.
--
-- SECURITY POSTURE (mirrors taste_profile_cache / email_leads hardening):
-- RLS enabled with NO client-facing policies at all. The token is the only
-- credential — it is delivered by email and never exposed to the anon/authenticated
-- roles. The `outreach-form` edge function runs `--no-verify-jwt` (auth = the
-- token) and reads/writes exclusively through the service-role client, which
-- bypasses RLS. Table grants are revoked from anon/authenticated/PUBLIC as
-- defense in depth (per the standing rule: defaults grant anon — revoke all three),
-- so even a leaked anon key cannot enumerate invites, read answers/emails, or
-- forge a grant.

CREATE TABLE IF NOT EXISTS "public"."outreach_invites" (
    "id" "uuid" NOT NULL DEFAULT "gen_random_uuid"(),
    "user_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "campaign" "text" NOT NULL,
    "tier" smallint NOT NULL,
    "token" "uuid" NOT NULL DEFAULT "gen_random_uuid"(),
    "grant_months" smallint NOT NULL,
    "created_at" timestamp with time zone NOT NULL DEFAULT "now"(),
    "clicked_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "answers" "jsonb",
    "followup_ok" boolean,
    "grant_started_at" timestamp with time zone,
    "grant_expires_at" timestamp with time zone,
    "grant_error" "text",
    CONSTRAINT "outreach_invites_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "outreach_invites_token_key" UNIQUE ("token"),
    CONSTRAINT "outreach_invites_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    CONSTRAINT "outreach_invites_grant_months_check" CHECK (("grant_months" IN (2, 3))),
    CONSTRAINT "outreach_invites_tier_check" CHECK (("tier" >= 1))
);

ALTER TABLE "public"."outreach_invites" OWNER TO "postgres";
ALTER TABLE "public"."outreach_invites" ENABLE ROW LEVEL SECURITY;

-- No policies are defined on purpose. With RLS enabled and zero policies, every
-- anon/authenticated request is denied; only the service-role client (edge fn)
-- can touch the table.

-- Campaign roll-up reads ("how did launch-week-7 do?") go through the service role.
CREATE INDEX IF NOT EXISTS "outreach_invites_campaign_idx"
    ON "public"."outreach_invites" ("campaign");

REVOKE ALL ON TABLE "public"."outreach_invites" FROM "anon", "authenticated", PUBLIC;
GRANT ALL ON TABLE "public"."outreach_invites" TO "service_role";

COMMENT ON TABLE "public"."outreach_invites" IS 'Outreach feedback funnel ledger: one row per invited user. Tokenized email link → questionnaire → conditional PocketStubs+ promotional grant, fully timestamped (clicked/completed/grant start+expiry). RLS on, no client policies; only the outreach-form edge function (service role) reads/writes. Token is the sole credential, email-delivered only.';
