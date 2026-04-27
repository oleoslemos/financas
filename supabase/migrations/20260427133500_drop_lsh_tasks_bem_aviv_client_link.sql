DROP INDEX IF EXISTS public.lsh_tasks_bem_aviv_client_id_idx;

ALTER TABLE public.lsh_tasks
  DROP CONSTRAINT IF EXISTS lsh_tasks_bem_aviv_client_id_fkey;

ALTER TABLE public.lsh_tasks
  DROP COLUMN IF EXISTS bem_aviv_client_id;
