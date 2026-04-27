CREATE TABLE IF NOT EXISTS public.project_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  title text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  color text NOT NULL DEFAULT 'yellow' CHECK (color IN ('yellow', 'blue', 'green', 'pink')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_notes_user_id_idx ON public.project_notes (user_id);
CREATE INDEX IF NOT EXISTS project_notes_done_idx ON public.project_notes (done);
CREATE INDEX IF NOT EXISTS project_notes_created_at_idx ON public.project_notes (created_at DESC);

ALTER TABLE public.project_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_notes_all ON public.project_notes;
CREATE POLICY project_notes_all ON public.project_notes
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION public.tg_project_notes_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.title := trim(coalesce(NEW.title, ''));
  NEW.color := lower(coalesce(NEW.color, 'yellow'));
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_notes_before_write ON public.project_notes;
CREATE TRIGGER trg_project_notes_before_write
BEFORE INSERT OR UPDATE ON public.project_notes
FOR EACH ROW
EXECUTE FUNCTION public.tg_project_notes_before_write();
