DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lsh_calendar_events_user_id_source_external_id_key'
      AND conrelid = 'public.lsh_calendar_events'::regclass
  ) THEN
    ALTER TABLE public.lsh_calendar_events
      DROP CONSTRAINT lsh_calendar_events_user_id_source_external_id_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS lsh_calendar_events_user_source_calendar_external_uidx
  ON public.lsh_calendar_events (user_id, source, calendar_id, external_id);
