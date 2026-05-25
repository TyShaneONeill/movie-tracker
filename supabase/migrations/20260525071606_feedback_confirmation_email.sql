-- supabase/migrations/20260525071606_feedback_confirmation_email.sql
-- PRD-5 Sprint 3: send a confirmation email to the user after they submit a
-- feature request / general feedback row.
--
-- Adds:
--   1. confirmation_email_sent_at column on feature_requests (idempotency guard
--      — the Edge Function reads it and exits early if non-null, then stamps
--      it on success so webhook retries don't fan out duplicate emails).
--   2. AFTER INSERT trigger that POSTs the new row to the
--      feedback-confirmation-email Edge Function via pg_net. The pattern
--      matches the cron-driven push notification setup in archive
--      20260327000003_setup_push_cron_jobs.sql (same vault-stored
--      project_url + service_role_key secrets).
--
-- Requires (already in place from earlier migrations):
--   - pg_net extension
--   - vault secrets named 'project_url' and 'service_role_key'

-- ---------------------------------------------------------------------------
-- 1. Idempotency column
-- ---------------------------------------------------------------------------

ALTER TABLE public.feature_requests
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.feature_requests.confirmation_email_sent_at IS
  'Set by the feedback-confirmation-email Edge Function when the user has been notified. NULL means not yet sent. Used to make webhook retries idempotent.';

-- ---------------------------------------------------------------------------
-- 2. Trigger function — fire-and-forget HTTP POST to the Edge Function
-- ---------------------------------------------------------------------------
-- Notes:
--   * SECURITY DEFINER so it can read vault.decrypted_secrets regardless of
--     the calling role (RPC runs as the authenticated user).
--   * search_path is hardened to '' (the project's convention — see
--     submit_feature_request and other SECURITY DEFINER funcs in baseline).
--   * Any exception is swallowed: the user's submission must NOT fail because
--     the email queue is degraded. pg_net is async anyway, but we wrap the
--     whole thing in a BEGIN/EXCEPTION block to be safe.

CREATE OR REPLACE FUNCTION public.feature_requests_notify_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project_url TEXT;
  v_service_role_key TEXT;
BEGIN
  -- Pull the project URL + service-role key out of vault. If either secret is
  -- missing (e.g. local dev DB), no-op silently — the row insert still
  -- succeeds; the email just never gets sent.
  SELECT decrypted_secret INTO v_project_url
    FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key';

  IF v_project_url IS NULL OR v_service_role_key IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := v_project_url || '/functions/v1/feedback-confirmation-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_role_key
      ),
      -- Mirror Supabase's native Database Webhook payload shape so the
      -- Edge Function's WebhookPayload interface is reusable if we ever
      -- migrate this trigger to a dashboard-managed webhook.
      body := jsonb_build_object(
        'type', 'INSERT',
        'table', 'feature_requests',
        'schema', 'public',
        'record', to_jsonb(NEW),
        'old_record', NULL
      ),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    -- Don't let the email queue take the submission down.
    RAISE WARNING 'feature_requests_notify_email: pg_net post failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.feature_requests_notify_email() IS
  'PRD-5 Sprint 3: AFTER INSERT trigger function — POSTs the new feature_requests row to the feedback-confirmation-email Edge Function via pg_net. Exceptions are swallowed to keep submissions resilient.';

DROP TRIGGER IF EXISTS trg_feature_requests_notify_email ON public.feature_requests;

CREATE TRIGGER trg_feature_requests_notify_email
  AFTER INSERT ON public.feature_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.feature_requests_notify_email();
