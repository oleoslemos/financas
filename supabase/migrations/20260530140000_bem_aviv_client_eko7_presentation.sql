-- Marca clientes que receberam apresentação do projeto EKO7 (repique comercial).

ALTER TABLE public.bem_aviv_clients
  ADD COLUMN IF NOT EXISTS eko7_presentation_at timestamptz;

COMMENT ON COLUMN public.bem_aviv_clients.eko7_presentation_at IS
  'Data/hora em que o cliente recebeu apresentação do projeto EKO7. NULL = ainda não apresentado.';

CREATE INDEX IF NOT EXISTS idx_bem_aviv_clients_eko7_presentation_at
  ON public.bem_aviv_clients (company_id, eko7_presentation_at)
  WHERE eko7_presentation_at IS NOT NULL;
