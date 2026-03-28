-- Setup pg_cron jobs for push notification infrastructure
-- Requires: pg_cron and pg_net extensions enabled, and vault secrets set up
--
-- Before running this migration, store secrets in Vault:
--   SELECT vault.create_secret('https://wliblwulvsrfgqcnbzeh.supabase.co', 'project_url');
--   SELECT vault.create_secret('<service-role-key>', 'service_role_key');

-- Cron 1: Check push receipts every 15 minutes
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
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Cron 2: Stale token cleanup — every Sunday at 03:00 UTC
-- Deletes push_tokens that haven't been refreshed in 90+ days (likely uninstalled apps)
SELECT cron.schedule(
  'cleanup-stale-push-tokens',
  '0 3 * * 0',
  $$
  DELETE FROM push_tokens
  WHERE last_used_at < now() - interval '90 days';
  $$
);
