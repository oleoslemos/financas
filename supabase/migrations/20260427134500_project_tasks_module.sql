CREATE TABLE IF NOT EXISTS public.project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  project_client_id uuid REFERENCES public.project_clients(id) ON DELETE SET NULL,
  title text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE')),
  priority text NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_tasks_user_id_idx ON public.project_tasks (user_id);
CREATE INDEX IF NOT EXISTS project_tasks_status_idx ON public.project_tasks (status);
CREATE INDEX IF NOT EXISTS project_tasks_due_date_idx ON public.project_tasks (due_date);
CREATE INDEX IF NOT EXISTS project_tasks_project_client_id_idx ON public.project_tasks (project_client_id);

ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_tasks_all ON public.project_tasks;
CREATE POLICY project_tasks_all ON public.project_tasks
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION public.tg_project_tasks_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.title := upper(trim(coalesce(NEW.title, '')));
  NEW.details := upper(trim(coalesce(NEW.details, '')));
  NEW.status := upper(trim(coalesce(NEW.status, 'TODO')));
  NEW.priority := upper(trim(coalesce(NEW.priority, 'MEDIUM')));
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_tasks_before_write ON public.project_tasks;
CREATE TRIGGER trg_project_tasks_before_write
BEFORE INSERT OR UPDATE ON public.project_tasks
FOR EACH ROW
EXECUTE FUNCTION public.tg_project_tasks_before_write();
