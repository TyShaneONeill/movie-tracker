-- supabase/migrations/20260607203757_reports_notify_discord.sql
-- Security P1.4: move the Discord moderation notification server-side.
--
-- The client (lib/report-service.ts) POSTed reports to
-- EXPO_PUBLIC_DISCORD_MODERATION_WEBHOOK, which inlined the webhook URL into
-- the public app/web bundle (extractable → spammable), and only fired on web
-- (native skipped it for CORS → native reports never reached moderators).
--
-- This AFTER INSERT trigger POSTs each new report to the notify-report Edge
-- Function via pg_net, which relays it to Discord using the server-side
-- DISCORD_MODERATION_WEBHOOK secret. Mirrors feature_requests_notify_email
-- (migration 20260525071606): same vault-stored project_url + service_role_key.
--
-- Requires (already in place): pg_net extension; vault secrets 'project_url'
-- and 'service_role_key' (service_role_key is the legacy JWT form — verified).

CREATE OR REPLACE FUNCTION public.reports_notify_discord()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project_url TEXT;
  v_service_role_key TEXT;
BEGIN
  SELECT decrypted_secret INTO v_project_url
    FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key';

  -- Missing secrets (e.g. local dev) → no-op; the report insert still succeeds.
  IF v_project_url IS NULL OR v_service_role_key IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := v_project_url || '/functions/v1/notify-report',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_role_key
      ),
      body := jsonb_build_object(
        'type', 'INSERT',
        'table', 'reports',
        'schema', 'public',
        'record', to_jsonb(NEW),
        'old_record', NULL
      ),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    -- A degraded moderation queue must never take a report submission down.
    RAISE WARNING 'reports_notify_discord: pg_net post failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.reports_notify_discord() IS
  'Security P1.4: AFTER INSERT trigger — POSTs new public.reports rows to the notify-report Edge Function via pg_net for server-side Discord moderation alerts. Replaces the client-side EXPO_PUBLIC_DISCORD_MODERATION_WEBHOOK in lib/report-service.ts and fixes native reports (old client only notified on web).';

DROP TRIGGER IF EXISTS trg_reports_notify_discord ON public.reports;

CREATE TRIGGER trg_reports_notify_discord
  AFTER INSERT ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION public.reports_notify_discord();
