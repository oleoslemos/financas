CREATE TABLE IF NOT EXISTS public.project_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  name text NOT NULL,
  project_code text,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_clients_user_id_idx ON public.project_clients (user_id);
CREATE INDEX IF NOT EXISTS project_clients_active_idx ON public.project_clients (active);
CREATE INDEX IF NOT EXISTS project_clients_name_idx ON public.project_clients (name);

ALTER TABLE public.project_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_clients_all ON public.project_clients;
CREATE POLICY project_clients_all ON public.project_clients
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION public.tg_project_clients_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.name := upper(trim(coalesce(NEW.name, '')));
  NEW.project_code := upper(trim(coalesce(NEW.project_code, '')));
  NEW.notes := trim(coalesce(NEW.notes, ''));
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_clients_before_write ON public.project_clients;
CREATE TRIGGER trg_project_clients_before_write
BEFORE INSERT OR UPDATE ON public.project_clients
FOR EACH ROW
EXECUTE FUNCTION public.tg_project_clients_before_write();

ALTER TABLE public.lsh_tasks
  ADD COLUMN IF NOT EXISTS project_client_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lsh_tasks_project_client_id_fkey'
  ) THEN
    ALTER TABLE public.lsh_tasks
      ADD CONSTRAINT lsh_tasks_project_client_id_fkey
      FOREIGN KEY (project_client_id)
      REFERENCES public.project_clients(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS lsh_tasks_project_client_id_idx ON public.lsh_tasks (project_client_id);
