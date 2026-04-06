-- Discord daily metrics digest — every day at 12:00 UTC (8am ET)
-- Calls the post-daily-metrics edge function which queries PostHog and posts
-- a formatted embed to the Discord #metrics channel.
--
-- Prerequisites:
--   vault secrets 'project_url' and 'service_role_key' must already exist
--   (set up in 20260327000003_setup_push_cron_jobs.sql)
--
-- Supabase secrets required before deploying:
--   supabase secrets set POSTHOG_PERSONAL_API_KEY=phx_xxxx --project-ref wliblwulvsrfgqcnbzeh
--   supabase secrets set POSTHOG_PROJECT_ID=12345 --project-ref wliblwulvsrfgqcnbzeh
--   supabase secrets set DISCORD_METRICS_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy --project-ref wliblwulvsrfgqcnbzeh

SELECT cron.schedule(
  'post-daily-metrics',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url := (
      SELECT decrypted_secret FROM vault.decrypted_secrets
      WHERE name = 'project_url'
    ) || '/functions/v1/post-daily-metrics',
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
