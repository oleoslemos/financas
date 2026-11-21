CREATE TABLE IF NOT EXISTS public.project_task_worklogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  task_id uuid NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  description text NOT NULL,
  duration_hhmm text NOT NULL CHECK (duration_hhmm ~ '^[0-9]{2}:[0-5][0-9]$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_task_worklogs_user_id_idx ON public.project_task_worklogs (user_id);
CREATE INDEX IF NOT EXISTS project_task_worklogs_task_id_idx ON public.project_task_worklogs (task_id);
CREATE INDEX IF NOT EXISTS project_task_worklogs_created_at_idx ON public.project_task_worklogs (created_at DESC);

ALTER TABLE public.project_task_worklogs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_task_worklogs_all ON public.project_task_worklogs;
CREATE POLICY project_task_worklogs_all ON public.project_task_worklogs
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION public.tg_project_task_worklogs_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.description := upper(trim(coalesce(NEW.description, '')));
  NEW.duration_hhmm := trim(coalesce(NEW.duration_hhmm, '00:00'));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_task_worklogs_before_write ON public.project_task_worklogs;
CREATE TRIGGER trg_project_task_worklogs_before_write
BEFORE INSERT OR UPDATE ON public.project_task_worklogs
FOR EACH ROW
EXECUTE FUNCTION public.tg_project_task_worklogs_before_write();
