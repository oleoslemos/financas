ALTER TABLE public.lsh_tasks
  ADD COLUMN IF NOT EXISTS bem_aviv_client_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lsh_tasks_bem_aviv_client_id_fkey'
  ) THEN
    ALTER TABLE public.lsh_tasks
      ADD CONSTRAINT lsh_tasks_bem_aviv_client_id_fkey
      FOREIGN KEY (bem_aviv_client_id)
      REFERENCES public.bem_aviv_clients(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS lsh_tasks_bem_aviv_client_id_idx ON public.lsh_tasks (bem_aviv_client_id);
