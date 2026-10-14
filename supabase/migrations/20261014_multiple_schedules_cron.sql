-- ═══════════════════════════════════════════════════════════════
-- Migration: schedule_times em push_notification_preferences
-- Permite que cada usuário configure múltiplos horários de alertas
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.push_notification_preferences
  ADD COLUMN IF NOT EXISTS schedule_times jsonb NOT NULL DEFAULT '["08:00", "18:00"]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_notified_slot text;

-- Atualizar registros existentes para conter seus horários configurados
UPDATE public.push_notification_preferences
SET schedule_times = jsonb_build_array(
  to_char(morning_hour, 'FM00') || ':' || to_char(morning_minute, 'FM00'),
  to_char(evening_hour, 'FM00') || ':' || to_char(evening_minute, 'FM00')
)
WHERE schedule_times IS NULL OR jsonb_array_length(schedule_times) = 0;

-- Tabela de histórico de disparos para evitar notificações repetidas no mesmo slot/dia
CREATE TABLE IF NOT EXISTS public.push_notification_dispatch_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  slot_time text NOT NULL,
  dispatch_date date NOT NULL,
  sent_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slot_time, dispatch_date)
);

CREATE INDEX IF NOT EXISTS idx_push_dispatch_logs_user_date
  ON public.push_notification_dispatch_logs (user_id, dispatch_date);

-- Função para invocar a Edge Function via pg_net
CREATE OR REPLACE FUNCTION public.cron_trigger_push_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url text := 'https://jhttqeayoxjqwxioxgki.supabase.co/functions/v1/send-push';
  v_service_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpodHRxZWF5b3hqcXd4aW94Z2tpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzk3NjA0MCwiZXhwIjoyMDg5NTUyMDQwfQ.BUAs7JT6K2lltoSw6NGp74gv1wHxNXg46c2u_WzjlIo';
BEGIN
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object('cron', true, 'triggered_at', now() AT TIME ZONE 'America/Sao_Paulo')
  );
END;
$$;

-- Agendamento com pg_cron: roda a cada 5 minutos
-- Exemplo: 08:00, 08:05, 08:10... até 23:55
DO $$
BEGIN
  -- Remove job anterior se existir
  PERFORM cron.unschedule('push-notifications-check');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'push-notifications-check',
  '*/5 * * * *',
  'SELECT public.cron_trigger_push_notifications();'
);
