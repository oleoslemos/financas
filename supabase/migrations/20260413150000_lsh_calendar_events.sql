CREATE TABLE IF NOT EXISTS public.lsh_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  source text NOT NULL DEFAULT 'GOOGLE_CALENDAR',
  calendar_id text NOT NULL,
  external_id text NOT NULL,
  summary text NOT NULL,
  details text,
  location text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  is_all_day boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'confirmed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, external_id)
);

CREATE INDEX IF NOT EXISTS lsh_calendar_events_user_id_idx ON public.lsh_calendar_events (user_id);
CREATE INDEX IF NOT EXISTS lsh_calendar_events_start_at_idx ON public.lsh_calendar_events (start_at);

ALTER TABLE public.lsh_calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lsh_calendar_events_all ON public.lsh_calendar_events;
CREATE POLICY lsh_calendar_events_all ON public.lsh_calendar_events
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION public.tg_lsh_calendar_events_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.summary := upper(coalesce(NEW.summary, ''));
  NEW.details := upper(coalesce(NEW.details, ''));
  NEW.location := upper(coalesce(NEW.location, ''));
  NEW.status := lower(coalesce(NEW.status, 'confirmed'));
  NEW.source := upper(coalesce(NEW.source, 'GOOGLE_CALENDAR'));
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lsh_calendar_events_before_write ON public.lsh_calendar_events;
CREATE TRIGGER trg_lsh_calendar_events_before_write
BEFORE INSERT OR UPDATE ON public.lsh_calendar_events
FOR EACH ROW
EXECUTE FUNCTION public.tg_lsh_calendar_events_before_write();
