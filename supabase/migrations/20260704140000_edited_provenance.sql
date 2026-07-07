-- ============================================================================
-- PS-12: Edit provenance for social posts (reviews, first takes, comments)
-- ============================================================================
--
-- Adds a dedicated `edited_at` column to reviews, first_takes, and
-- review_comments so the UI can render an "Edited {date}" stamp WITHOUT
-- relying on `updated_at`.
--
-- WHY a dedicated column: `updated_at` moves on ANY write — visibility-only
-- changes, like/comment-count denormalization, and trigger side-effects — so
-- `updated_at > created_at` is NOT a trustworthy "the author changed the
-- content" signal. `edited_at` is set by the service/edge layer ONLY when an
-- actual content field (text/rating/emoji/spoiler) changes, and stays NULL for
-- posts that were never content-edited.
--
-- Also makes review_comments editable by their author (they previously had no
-- UPDATE policy because comments were create/delete-only) and backfills the
-- missing `updated_at` column on that table.
-- ============================================================================

-- --- reviews -----------------------------------------------------------------
-- `reviews` already has created_at + updated_at and an author-only UPDATE
-- policy ("Users can update own reviews", USING + WITH CHECK on auth.uid()).
-- We only need the new provenance column.
ALTER TABLE "public"."reviews"
  ADD COLUMN IF NOT EXISTS "edited_at" timestamptz;

COMMENT ON COLUMN "public"."reviews"."edited_at" IS
  'Set only when the author edits post content (title/text/rating/spoiler). NULL = never content-edited. Do not use updated_at for this.';

-- --- first_takes -------------------------------------------------------------
-- `first_takes` already has created_at + updated_at and an author-only UPDATE
-- policy ("Users can update own first takes", USING on auth.uid() which
-- Postgres also applies as the implicit WITH CHECK).
ALTER TABLE "public"."first_takes"
  ADD COLUMN IF NOT EXISTS "edited_at" timestamptz;

COMMENT ON COLUMN "public"."first_takes"."edited_at" IS
  'Set only when the author edits post content (quote/rating/emoji/spoiler). NULL = never content-edited. Do not use updated_at for this.';

-- --- review_comments ---------------------------------------------------------
-- Comments were create/delete-only, so this table lacks BOTH updated_at and
-- edited_at, and has no UPDATE RLS policy. Add all three.
ALTER TABLE "public"."review_comments"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamptz DEFAULT "now"();

ALTER TABLE "public"."review_comments"
  ADD COLUMN IF NOT EXISTS "edited_at" timestamptz;

COMMENT ON COLUMN "public"."review_comments"."edited_at" IS
  'Set only when the author edits the comment body. NULL = never edited. Do not use updated_at for this.';

-- Author-only UPDATE policy. Owner column on review_comments is `user_id`.
-- Both USING (row visibility for the UPDATE) and WITH CHECK (validity of the
-- new row) are pinned to the author. USING alone would act as the implicit
-- WITH CHECK, but we state both explicitly for clarity and to guarantee an
-- author can never reassign a comment to another user_id.
--
-- `is_hidden = false` (both clauses): a moderation-hidden comment cannot be
-- edited via the direct PostgREST path, and an author cannot flip is_hidden.
-- Without this, the RLS UPDATE grant would let a client bypass the
-- update-comment edge fn's is_hidden + rate-limit checks (security finding #3).
-- Moderation itself runs as service_role and bypasses RLS, so it is unaffected.
DROP POLICY IF EXISTS "review_comments_update_own" ON "public"."review_comments";
CREATE POLICY "review_comments_update_own"
  ON "public"."review_comments"
  FOR UPDATE
  TO "authenticated"
  USING ("auth"."uid"() = "user_id" AND COALESCE("is_hidden", false) = false)
  WITH CHECK ("auth"."uid"() = "user_id" AND COALESCE("is_hidden", false) = false);
