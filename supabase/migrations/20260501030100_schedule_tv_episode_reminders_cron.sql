-- Daily 14:00 UTC = 10am EDT / 7am PDT — morning for US users.
-- Reuses Vault secrets created in 20260327000003_setup_push_cron_jobs.sql.
-- Mirrors 20260429050539_schedule_release_reminders_cron.sql; both jobs run
-- in parallel as separate edge functions, no shared state.
--
-- timeout_milliseconds = 30000 per PR #414 fix (Edge Function cold starts can
-- take 5-11s; default pg_net timeout of 5000ms silently truncates the response).

SELECT cron.schedule(
  'send-tv-episode-reminders',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url := (
      SELECT decrypted_secret FROM vault.decrypted_secrets
      WHERE name = 'project_url'
    ) || '/functions/v1/send-tv-episode-reminders',
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
