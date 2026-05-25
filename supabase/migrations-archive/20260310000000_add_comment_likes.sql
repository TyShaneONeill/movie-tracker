-- Migration: Add comment-level likes and "liked by author" support
-- Date: 2026-03-10

-- 1. Add columns to review_comments
ALTER TABLE review_comments
  ADD COLUMN like_count integer NOT NULL DEFAULT 0,
  ADD COLUMN liked_by_author boolean NOT NULL DEFAULT false;

-- 2. Create comment_likes table
CREATE TABLE comment_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_id uuid NOT NULL REFERENCES review_comments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, comment_id)
);

-- 3. Indexes
CREATE INDEX idx_comment_likes_comment_id ON comment_likes(comment_id);
CREATE INDEX idx_comment_likes_user_id ON comment_likes(user_id);

-- 4. Trigger function to maintain like_count and liked_by_author
CREATE OR REPLACE FUNCTION update_comment_like_count()
RETURNS trigger AS $$
DECLARE
  v_comment_id uuid;
  v_review_id uuid;
  v_first_take_id uuid;
  v_author_id uuid;
BEGIN
  -- Get the comment_id from NEW (insert) or OLD (delete)
  IF TG_OP = 'INSERT' THEN
    v_comment_id := NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_comment_id := OLD.comment_id;
  END IF;

  -- Get the review_id and first_take_id from the comment
  SELECT review_id, first_take_id
    INTO v_review_id, v_first_take_id
    FROM review_comments
   WHERE id = v_comment_id;

  -- Determine the author of the review/first_take
  IF v_review_id IS NOT NULL THEN
    SELECT user_id INTO v_author_id
      FROM reviews
     WHERE id = v_review_id;
  ELSIF v_first_take_id IS NOT NULL THEN
    SELECT user_id INTO v_author_id
      FROM first_takes
     WHERE id = v_first_take_id;
  END IF;

  -- Update like_count and liked_by_author on the comment
  UPDATE review_comments
     SET like_count = (
           SELECT count(*)
             FROM comment_likes
            WHERE comment_id = v_comment_id
         ),
         liked_by_author = (
           CASE
             WHEN v_author_id IS NOT NULL THEN
               EXISTS(
                 SELECT 1
                   FROM comment_likes
                  WHERE comment_id = v_comment_id
                    AND user_id = v_author_id
               )
             ELSE false
           END
         )
   WHERE id = v_comment_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
CREATE TRIGGER trg_comment_likes_count
AFTER INSERT OR DELETE ON comment_likes
FOR EACH ROW EXECUTE FUNCTION update_comment_like_count();

-- 5. RLS Policies
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;

-- Anyone can read comment likes
CREATE POLICY "comment_likes_select" ON comment_likes
  FOR SELECT USING (true);

-- Authenticated users can insert their own likes
CREATE POLICY "comment_likes_insert" ON comment_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can delete their own likes
CREATE POLICY "comment_likes_delete" ON comment_likes
  FOR DELETE USING (auth.uid() = user_id);

-- 6. Grant service role full access (for edge functions)
GRANT ALL ON comment_likes TO service_role;
