CREATE TABLE IF NOT EXISTS public.google_user_sync_credentials (
  user_id text PRIMARY KEY,
  refresh_token text NOT NULL,
  tasklist_id text NOT NULL DEFAULT '@default',
  calendar_id text NOT NULL DEFAULT 'primary',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_user_sync_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS google_user_sync_credentials_all ON public.google_user_sync_credentials;
CREATE POLICY google_user_sync_credentials_all ON public.google_user_sync_credentials
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION public.tg_google_user_sync_credentials_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.tasklist_id := coalesce(nullif(trim(NEW.tasklist_id), ''), '@default');
  NEW.calendar_id := coalesce(nullif(trim(NEW.calendar_id), ''), 'primary');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_google_user_sync_credentials_before_write ON public.google_user_sync_credentials;
CREATE TRIGGER trg_google_user_sync_credentials_before_write
BEFORE INSERT OR UPDATE ON public.google_user_sync_credentials
FOR EACH ROW
EXECUTE FUNCTION public.tg_google_user_sync_credentials_before_write();
