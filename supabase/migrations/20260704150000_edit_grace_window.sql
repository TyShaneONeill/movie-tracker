-- PS-12 anti-abuse: edit grace window + tamper-proof provenance.
--
-- Prevents the "bait-and-switch" edit — a post earns likes/comments on version
-- A, then the author swaps the content to version B and the endorsement carries
-- over. Policy (Ty's call): a CONTENT edit is allowed ONLY within 15 minutes of
-- posting AND only before any engagement. After that the content is locked; the
-- user deletes and reposts to change it. Metadata edits (visibility, rewatch)
-- are always allowed.
--
-- This is a hard DB control (not just client UI). It also:
--  * STAMPS `edited_at` server-side on a genuine content edit (client can't
--    omit it to hide the "Edited" badge — security review finding #2);
--  * PINS the lock-input columns (created_at / like_count / comment_count)
--    against client tampering, closing the two-step bypass where a user resets
--    those columns to look "fresh & unliked" then edits (finding #1). The
--    count denormalization runs as SECURITY DEFINER (owner `postgres`), so it
--    is exempt via the current_user check; PostgREST clients run as
--    `authenticated`/`anon` and are blocked.
--  * EXEMPTS privileged writers (service_role / definer jobs) from the content
--    lock so moderation redactions and backfills remain possible (finding #4).

CREATE OR REPLACE FUNCTION public.enforce_edit_grace_window()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  grace CONSTANT interval := interval '15 minutes';
  -- SECURITY DEFINER count-denorm + service_role are "privileged"; PostgREST
  -- clients are 'authenticated' / 'anon'.
  is_client boolean := current_user IN ('authenticated', 'anon');
  content_changed boolean := false;
  counts_or_created_changed boolean;
  locked boolean := false;
BEGIN
  -- 1) Lock-input columns are server-maintained: clients may never change them.
  --    (Blocks the reset-then-edit bypass. Privileged denorm/jobs are exempt.)
  IF is_client THEN
    IF TG_TABLE_NAME = 'review_comments' THEN
      counts_or_created_changed :=
        NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.like_count IS DISTINCT FROM OLD.like_count;
    ELSE
      counts_or_created_changed :=
        NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.like_count IS DISTINCT FROM OLD.like_count
        OR NEW.comment_count IS DISTINCT FROM OLD.comment_count;
    END IF;

    IF counts_or_created_changed THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'created_at, like_count and comment_count are server-maintained and cannot be edited.',
        HINT = 'immutable_columns';
    END IF;
  END IF;

  -- 2) Detect a genuine CONTENT change + whether the post is locked.
  IF TG_TABLE_NAME = 'reviews' THEN
    content_changed := (NEW.title, NEW.review_text, NEW.rating, NEW.is_spoiler)
                 IS DISTINCT FROM (OLD.title, OLD.review_text, OLD.rating, OLD.is_spoiler);
    locked := OLD.created_at IS NULL
           OR (now() - OLD.created_at) > grace
           OR COALESCE(OLD.like_count, 0) > 0
           OR COALESCE(OLD.comment_count, 0) > 0;

  ELSIF TG_TABLE_NAME = 'first_takes' THEN
    content_changed := (NEW.quote_text, NEW.rating, NEW.reaction_emoji, NEW.is_spoiler)
                 IS DISTINCT FROM (OLD.quote_text, OLD.rating, OLD.reaction_emoji, OLD.is_spoiler);
    locked := OLD.created_at IS NULL
           OR (now() - OLD.created_at) > grace
           OR COALESCE(OLD.like_count, 0) > 0
           OR COALESCE(OLD.comment_count, 0) > 0;

  ELSIF TG_TABLE_NAME = 'review_comments' THEN
    content_changed := NEW.body IS DISTINCT FROM OLD.body;
    locked := OLD.created_at IS NULL
           OR (now() - OLD.created_at) > grace
           OR COALESCE(OLD.like_count, 0) > 0;
  END IF;

  -- 3) Enforce + stamp — only for client-driven content edits. Privileged
  --    writers (moderation/backfill) may rewrite content and set edited_at
  --    themselves (the comment edge fn does exactly that).
  IF content_changed AND is_client THEN
    IF locked THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'This post can no longer be edited — the edit window has closed or it already has activity. Delete and repost to change it.',
        HINT = 'edit_window_closed';
    END IF;
    -- Tamper-proof provenance: the client cannot suppress this.
    NEW.edited_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_edit_grace_window ON public.reviews;
CREATE TRIGGER trg_edit_grace_window
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.enforce_edit_grace_window();

DROP TRIGGER IF EXISTS trg_edit_grace_window ON public.first_takes;
CREATE TRIGGER trg_edit_grace_window
  BEFORE UPDATE ON public.first_takes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_edit_grace_window();

DROP TRIGGER IF EXISTS trg_edit_grace_window ON public.review_comments;
CREATE TRIGGER trg_edit_grace_window
  BEFORE UPDATE ON public.review_comments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_edit_grace_window();
