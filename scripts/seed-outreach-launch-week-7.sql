-- Seed the launch-week outreach invites (campaign 'launch-week-7').
--
-- RUN THIS AT SEND TIME, against PRODUCTION, by Ty / the orchestrator — NOT part
-- of the migration set and NOT applied by CI. It inserts one row per invited
-- user; tokens are auto-generated. The RETURNING clause prints each invitee's
-- email + token so you can build the links:
--
--     https://pocketstubs.com/outreach.html?t=<token>
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ PII NOTE: the real invitee user_ids + emails are deliberately NOT         │
-- │ committed to the repo. They live in the vault outreach kit and were       │
-- │ delivered to the orchestrator out-of-band. Fill the VALUES block below    │
-- │ from that kit (all 7 user_ids were resolved from prod auth.users by       │
-- │ email, read-only, on 2026-07-20) before running.                          │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- Idempotent: ON CONFLICT does nothing if a row for this (campaign,user_id)
-- already exists, so re-running won't double-insert or churn tokens.

-- One invite per user per campaign — guards against a double-send minting two tokens.
CREATE UNIQUE INDEX IF NOT EXISTS outreach_invites_campaign_user_uniq
    ON public.outreach_invites (campaign, user_id);

INSERT INTO public.outreach_invites (user_id, email, campaign, tier, grant_months)
VALUES
    -- tier 1 · 3 months  (2 invitees)
    ('<USER_ID>', '<email>', 'launch-week-7', 1, 3),
    ('<USER_ID>', '<email>', 'launch-week-7', 1, 3),
    -- tier 2 · 2 months  (5 invitees)
    ('<USER_ID>', '<email>', 'launch-week-7', 2, 2),
    ('<USER_ID>', '<email>', 'launch-week-7', 2, 2),
    ('<USER_ID>', '<email>', 'launch-week-7', 2, 2),
    ('<USER_ID>', '<email>', 'launch-week-7', 2, 2),
    ('<USER_ID>', '<email>', 'launch-week-7', 2, 2)
ON CONFLICT (campaign, user_id) DO NOTHING
RETURNING email, tier, grant_months, token;
