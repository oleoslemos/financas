-- ---------------------------------------------------------------------------
-- Tabela para guardar orçamentos rápidos da Calculadora de Orçamento
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bem_aviv_quick_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  client_name text NOT NULL,
  client_birth_date date,
  items jsonb NOT NULL, -- [{ productId, productName, price, hasElectronics }]
  downpayment numeric(14,2) NOT NULL DEFAULT 0,
  installments_qty integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bem_aviv_quick_quotes_user_id_idx ON public.bem_aviv_quick_quotes (user_id);

ALTER TABLE public.bem_aviv_quick_quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bem_aviv_quick_quotes_all ON public.bem_aviv_quick_quotes;
CREATE POLICY bem_aviv_quick_quotes_all ON public.bem_aviv_quick_quotes
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
