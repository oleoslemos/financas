-- Espelho opcional no Google Tasks sem alterar source (sistema = fonte de verdade).
ALTER TABLE public.lsh_tasks
  ADD COLUMN IF NOT EXISTS google_sync_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_external_id text,
  ADD COLUMN IF NOT EXISTS lark_sync_enabled boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS lsh_tasks_google_external_id_uidx
  ON public.lsh_tasks (google_external_id)
  WHERE google_external_id IS NOT NULL;
