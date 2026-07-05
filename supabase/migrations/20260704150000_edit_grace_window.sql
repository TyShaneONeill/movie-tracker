-- PS-12 anti-abuse: edit grace window.
--
-- Prevents the "bait-and-switch" edit — a post earns likes/comments on version
-- A, then the author swaps the content to version B and the endorsement carries
-- over to something the audience never saw. Policy (Ty's call): a CONTENT edit
-- is allowed ONLY within a short window after posting AND only before any
-- engagement arrives. After that the content is locked; the user deletes and
-- reposts to change it.
--
-- Enforced in the DB (not just the client) so a raw API call can't bypass it.
-- Metadata-only edits (visibility, moderation, counters, edited_at/updated_at)
-- are always allowed — the trigger only guards changes to CONTENT columns.

CREATE OR REPLACE FUNCTION public.enforce_edit_grace_window()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  grace CONSTANT interval := interval '15 minutes';
  content_changed boolean := false;
  locked boolean;
BEGIN
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

  IF content_changed AND locked THEN
    RAISE EXCEPTION 'edit_window_closed'
      USING ERRCODE = 'check_violation',
            MESSAGE = 'This post can no longer be edited — the edit window has closed or it already has activity. Delete and repost to change it.',
            HINT = 'edit_window_closed';
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
