-- Trilha completa de auditoria para follow-ups.

ALTER TABLE public.bem_aviv_client_followups
  ADD COLUMN IF NOT EXISTS updated_by_user_id text,
  ADD COLUMN IF NOT EXISTS updated_by_name text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id text,
  ADD COLUMN IF NOT EXISTS deleted_by_name text;

CREATE INDEX IF NOT EXISTS bem_aviv_client_followups_deleted_at_idx
  ON public.bem_aviv_client_followups (deleted_at);
