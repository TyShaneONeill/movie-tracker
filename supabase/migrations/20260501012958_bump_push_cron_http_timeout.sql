-- Bump pg_net.http_post timeout for the two push-related crons.
--
-- Both crons (check-push-receipts and send-release-reminders) shipped with
-- no explicit `timeout_milliseconds`, falling back to pg_net's 5000ms default.
-- Supabase Edge Function cold starts routinely take 5-11 seconds — a sample
-- of recent check-push-receipts execution times: 3.5s, 4.1s, 5.6s, 6.4s,
-- 7.7s, 9.6s, 11.0s. Half of fires exceed 5s, so pg_net abandons the
-- connection before the function returns. The function still completes
-- server-side (Supabase runtime logs all 200s), but pg_net records a null
-- response and we lose all observability into success/failure.
--
-- Bump the timeout to 30s — comfortably above the worst observed cold-start
-- duration with margin to spare. Replace the existing job definitions in
-- place via unschedule + re-schedule (cron.alter_job's `command` setter
-- isn't universally available across pg_cron versions).

SELECT cron.unschedule('check-push-receipts');
SELECT cron.unschedule('send-release-reminders');

SELECT cron.schedule(
  'check-push-receipts',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := (
      SELECT decrypted_secret FROM vault.decrypted_secrets
      WHERE name = 'project_url'
    ) || '/functions/v1/check-push-receipts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'send-release-reminders',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url := (
      SELECT decrypted_secret FROM vault.decrypted_secrets
      WHERE name = 'project_url'
    ) || '/functions/v1/send-release-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id;
  $$
);
