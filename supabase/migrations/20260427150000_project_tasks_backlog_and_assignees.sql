CREATE TABLE IF NOT EXISTS public.project_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  name text NOT NULL,
  email text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_assignees_user_id_idx ON public.project_assignees (user_id);
CREATE INDEX IF NOT EXISTS project_assignees_active_idx ON public.project_assignees (active);

ALTER TABLE public.project_assignees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_assignees_all ON public.project_assignees;
CREATE POLICY project_assignees_all ON public.project_assignees
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION public.tg_project_assignees_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.name := upper(trim(coalesce(NEW.name, '')));
  NEW.email := lower(trim(coalesce(NEW.email, '')));
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_assignees_before_write ON public.project_assignees;
CREATE TRIGGER trg_project_assignees_before_write
BEFORE INSERT OR UPDATE ON public.project_assignees
FOR EACH ROW
EXECUTE FUNCTION public.tg_project_assignees_before_write();

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES public.project_assignees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS project_tasks_assignee_id_idx ON public.project_tasks (assignee_id);

ALTER TABLE public.project_tasks
  DROP CONSTRAINT IF EXISTS project_tasks_status_check;

ALTER TABLE public.project_tasks
  ADD CONSTRAINT project_tasks_status_check
  CHECK (status IN ('BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'));
