-- Auditoria de follow-ups: identifica usuário que registrou o contato.

ALTER TABLE public.bem_aviv_client_followups
  ADD COLUMN IF NOT EXISTS created_by_user_id text,
  ADD COLUMN IF NOT EXISTS created_by_name text;

CREATE INDEX IF NOT EXISTS bem_aviv_client_followups_created_by_user_id_idx
  ON public.bem_aviv_client_followups (created_by_user_id);
