-- 20231112000100_add_send_push_cron.sql
-- ------------------------------------------------------------
-- Schedule the send-push Edge Function to run daily at the
-- configured notification times (08:00 and 18:00 Brazil time).
-- NOTE: Adjust the UTC times if your project observes daylight
-- saving changes. Brazil Sao Paulo is UTC‑3 (standard) and UTC‑2
-- (DST). The example below uses UTC‑3 (08:00 BRT = 11:00 UTC).
-- ------------------------------------------------------------

-- Enable the extensions required for cron jobs and HTTP calls.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Helper: replace placeholders with your real values.
--   {{SUPABASE_URL}}   – your Supabase project URL (e.g. https://abc123.supabase.co)
--   {{SERVICE_ROLE_KEY}} – the service_role key (keep secret!).

-- Morning job – 08:00 Brazil time (11:00 UTC).
select cron.schedule(
  'send-push-morning',
  '0 11 * * *',
  $$
  select net.http_post(
    url := '{{SUPABASE_URL}}/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer {{SERVICE_ROLE_KEY}}'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Evening job – 18:00 Brazil time (21:00 UTC).
select cron.schedule(
  'send-push-evening',
  '0 21 * * *',
  $$
  select net.http_post(
    url := '{{SUPABASE_URL}}/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer {{SERVICE_ROLE_KEY}}'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Optional: verify that the jobs were created.
-- select * from cron.job where jobname in ('send-push-morning','send-push-evening');
