-- Daily 14:00 UTC = 10am EDT / 7am PDT — morning for US users.
-- Reuses Vault secrets created in 20260327000003_setup_push_cron_jobs.sql.
--
-- Note: the send-release-reminders edge function is deployed in a later task.
-- If this cron fires before the function is deployed, pg_net will log a 404
-- but will not crash. This is intentional — migrations are sequential.

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
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
