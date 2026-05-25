-- supabase/migrations/20260524234228_create_feature_requests.sql
-- PRD-5: In-app Feedback & Feature Request Channel.
--
-- Adds:
--   1. feature_requests table (per PRD schema, ON DELETE SET NULL is intentional
--      — submissions are retained for roadmap continuity after account deletion,
--      just anonymised).
--   2. RLS: authenticated users can SELECT their own rows; service_role (admin
--      dashboard, out of scope for this PR) can SELECT / UPDATE all rows.
--      Direct INSERT is denied — the only insert path is the
--      submit_feature_request RPC, so the 24h rate limit is mandatory.
--   3. submit_feature_request RPC: rate-limits to 5 submissions / user / 24h
--      and returns the inserted row.
--   4. feedback-screenshots storage bucket (private, signed URLs only) with
--      per-user folder policies.
--
-- No DELETE policy is added — cascade handled by the FK SET NULL and
-- account-deletion logic.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

CREATE TABLE public.feature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('feature_request', 'feedback')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  screenshot_url TEXT,
  app_version TEXT,
  platform TEXT,           -- 'ios' | 'android' | 'web'
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'triaged', 'planned', 'shipped', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feature_requests_user ON public.feature_requests(user_id);
CREATE INDEX idx_feature_requests_status ON public.feature_requests(status);

COMMENT ON TABLE public.feature_requests IS
  'PRD-5 user-submitted feature requests and feedback. Inserts are gated by submit_feature_request() RPC (rate-limit enforced).';

-- ---------------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;

-- Users see their own rows (powers the "My submissions" view).
CREATE POLICY "Users can read own feature requests"
  ON public.feature_requests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role (admin dashboard, future) can read everything.
CREATE POLICY "Service role can read all feature requests"
  ON public.feature_requests
  FOR SELECT
  TO service_role
  USING (true);

-- Service role can update status / triage notes from the future admin dashboard.
CREATE POLICY "Service role can update feature requests"
  ON public.feature_requests
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- No INSERT or DELETE policies for client roles. Inserts must go through the
-- submit_feature_request() RPC (SECURITY DEFINER) so the 24h rate limit
-- cannot be bypassed.

-- ---------------------------------------------------------------------------
-- 3. Rate-limit RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_feature_request(
  p_type TEXT,
  p_title TEXT,
  p_description TEXT,
  p_screenshot_url TEXT,
  p_app_version TEXT,
  p_platform TEXT
)
RETURNS public.feature_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_recent_count INTEGER;
  v_row public.feature_requests;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to submit feedback.'
      USING ERRCODE = '42501';
  END IF;

  -- Validate type early so the CHECK constraint error doesn't surface as a
  -- generic 23514 to clients.
  IF p_type NOT IN ('feature_request', 'feedback') THEN
    RAISE EXCEPTION 'Invalid submission type.'
      USING ERRCODE = '22023';
  END IF;

  IF p_title IS NULL OR length(btrim(p_title)) = 0 THEN
    RAISE EXCEPTION 'Title is required.' USING ERRCODE = '22023';
  END IF;

  IF p_description IS NULL OR length(btrim(p_description)) = 0 THEN
    RAISE EXCEPTION 'Description is required.' USING ERRCODE = '22023';
  END IF;

  IF length(p_title) > 100 THEN
    RAISE EXCEPTION 'Title must be 100 characters or fewer.' USING ERRCODE = '22023';
  END IF;

  IF length(p_description) > 1000 THEN
    RAISE EXCEPTION 'Description must be 1000 characters or fewer.' USING ERRCODE = '22023';
  END IF;

  -- Rate limit: 5 submissions per user per 24 hours.
  SELECT COUNT(*)
    INTO v_recent_count
    FROM public.feature_requests
   WHERE user_id = v_user_id
     AND created_at > NOW() - INTERVAL '24 hours';

  IF v_recent_count >= 5 THEN
    RAISE EXCEPTION 'You''ve reached the limit of 5 submissions in 24 hours. Please try again tomorrow.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.feature_requests (
    user_id,
    type,
    title,
    description,
    screenshot_url,
    app_version,
    platform
  )
  VALUES (
    v_user_id,
    p_type,
    p_title,
    p_description,
    NULLIF(p_screenshot_url, ''),
    NULLIF(p_app_version, ''),
    NULLIF(p_platform, '')
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_feature_request(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_feature_request(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_feature_request(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.submit_feature_request(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'PRD-5: insert a feature_request as the calling user, enforcing the 5-per-24h rate limit. Only insert path — client RLS denies direct INSERT.';

-- ---------------------------------------------------------------------------
-- 4. Storage bucket: feedback-screenshots
-- ---------------------------------------------------------------------------
-- Private bucket (signed URLs only). File-size limit matches ticket-photos
-- (5 MB). Per-user folder layout: feedback-screenshots/{user_id}/{uuid}.{ext}.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'feedback-screenshots',
  'feedback-screenshots',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Users can upload to their own folder.
CREATE POLICY "Users can upload their own feedback screenshots"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'feedback-screenshots'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can read their own screenshots (so the app can resurface them in
-- "My submissions" via signed URLs).
CREATE POLICY "Users can read their own feedback screenshots"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'feedback-screenshots'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Service role can read all feedback screenshots (admin triage).
CREATE POLICY "Service role can read all feedback screenshots"
ON storage.objects FOR SELECT
TO service_role
USING (bucket_id = 'feedback-screenshots');

-- Users can delete their own screenshots (e.g. if upload succeeds but RPC
-- fails and the client wants to clean up). No DELETE for service_role
-- exposed via this migration — admin cleanup goes through service-role key.
CREATE POLICY "Users can delete their own feedback screenshots"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'feedback-screenshots'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
