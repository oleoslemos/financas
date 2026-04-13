CREATE TABLE IF NOT EXISTS public.lsh_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  title text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE')),
  priority text NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
  due_date date,
  source text NOT NULL DEFAULT 'LOCAL' CHECK (source IN ('LOCAL', 'GOOGLE_TASKS', 'LARK_TASK')),
  external_id text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lsh_tasks_user_id_idx ON public.lsh_tasks (user_id);
CREATE INDEX IF NOT EXISTS lsh_tasks_status_idx ON public.lsh_tasks (status);
CREATE INDEX IF NOT EXISTS lsh_tasks_due_date_idx ON public.lsh_tasks (due_date);
CREATE UNIQUE INDEX IF NOT EXISTS lsh_tasks_external_unique_idx ON public.lsh_tasks (source, external_id) WHERE external_id IS NOT NULL;

ALTER TABLE public.lsh_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lsh_tasks_all ON public.lsh_tasks;
CREATE POLICY lsh_tasks_all ON public.lsh_tasks
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION public.tg_lsh_tasks_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.title := upper(coalesce(NEW.title, ''));
  NEW.details := upper(coalesce(NEW.details, ''));
  NEW.status := upper(coalesce(NEW.status, 'TODO'));
  NEW.priority := upper(coalesce(NEW.priority, 'MEDIUM'));
  NEW.source := upper(coalesce(NEW.source, 'LOCAL'));
  NEW.updated_at := now();
  IF NEW.status = 'DONE' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  ELSIF NEW.status <> 'DONE' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lsh_tasks_before_write ON public.lsh_tasks;
CREATE TRIGGER trg_lsh_tasks_before_write
BEFORE INSERT OR UPDATE ON public.lsh_tasks
FOR EACH ROW
EXECUTE FUNCTION public.tg_lsh_tasks_before_write();
