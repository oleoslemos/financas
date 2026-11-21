-- BEM AVIV: suporte a ORÇAMENTO/PEDIDO com numeração mensal sequencial.

ALTER TABLE public.bem_aviv_sales_orders
  ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'PEDIDO',
  ADD COLUMN IF NOT EXISTS document_number text,
  ADD COLUMN IF NOT EXISTS source_quote_id uuid REFERENCES public.bem_aviv_sales_orders (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_order_id uuid REFERENCES public.bem_aviv_sales_orders (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.bem_aviv_sales_order_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  document_type text NOT NULL,
  period_yyyymm text NOT NULL,
  last_value integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, document_type, period_yyyymm)
);

CREATE INDEX IF NOT EXISTS bem_aviv_sales_order_counters_user_id_idx
  ON public.bem_aviv_sales_order_counters (user_id);

ALTER TABLE public.bem_aviv_sales_order_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bem_aviv_sales_order_counters_all ON public.bem_aviv_sales_order_counters;
CREATE POLICY bem_aviv_sales_order_counters_all ON public.bem_aviv_sales_order_counters
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION public.bem_aviv_next_document_number(
  p_user_id text,
  p_document_type text,
  p_order_date date
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_period text;
  v_prefix text;
  v_next integer;
BEGIN
  v_period := to_char(coalesce(p_order_date, current_date), 'YYYYMM');
  v_prefix := CASE
    WHEN upper(coalesce(p_document_type, 'PEDIDO')) = 'ORCAMENTO' THEN 'ORC'
    ELSE 'PED'
  END;

  INSERT INTO public.bem_aviv_sales_order_counters (user_id, document_type, period_yyyymm, last_value, updated_at)
  VALUES (p_user_id, upper(coalesce(p_document_type, 'PEDIDO')), v_period, 1, now())
  ON CONFLICT (user_id, document_type, period_yyyymm)
  DO UPDATE SET
    last_value = public.bem_aviv_sales_order_counters.last_value + 1,
    updated_at = now()
  RETURNING last_value INTO v_next;

  RETURN v_prefix || '-' || v_period || '-' || lpad(v_next::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_bem_aviv_sales_orders_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.document_type := upper(coalesce(NEW.document_type, 'PEDIDO'));

  IF NEW.document_number IS NULL OR btrim(NEW.document_number) = '' THEN
    NEW.document_number := public.bem_aviv_next_document_number(NEW.user_id, NEW.document_type, NEW.order_date);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bem_aviv_sales_orders_number ON public.bem_aviv_sales_orders;
CREATE TRIGGER trg_bem_aviv_sales_orders_number
BEFORE INSERT ON public.bem_aviv_sales_orders
FOR EACH ROW
EXECUTE FUNCTION public.tg_bem_aviv_sales_orders_number();

CREATE UNIQUE INDEX IF NOT EXISTS bem_aviv_sales_orders_document_number_idx
  ON public.bem_aviv_sales_orders (user_id, document_number);

CREATE UNIQUE INDEX IF NOT EXISTS bem_aviv_sales_orders_source_quote_unique_idx
  ON public.bem_aviv_sales_orders (source_quote_id)
  WHERE source_quote_id IS NOT NULL
    AND document_type = 'PEDIDO';

WITH ranked AS (
  SELECT
    id,
    user_id,
    to_char(order_date, 'YYYYMM') AS period_yyyymm,
    row_number() OVER (
      PARTITION BY user_id, to_char(order_date, 'YYYYMM')
      ORDER BY order_date, created_at, id
    ) AS seq
  FROM public.bem_aviv_sales_orders
)
UPDATE public.bem_aviv_sales_orders so
SET
  document_type = upper(coalesce(so.document_type, 'PEDIDO')),
  document_number = 'PED-' || r.period_yyyymm || '-' || lpad(r.seq::text, 4, '0')
FROM ranked r
WHERE so.id = r.id
  AND (so.document_number IS NULL OR btrim(so.document_number) = '');

INSERT INTO public.bem_aviv_sales_order_counters (user_id, document_type, period_yyyymm, last_value, updated_at)
SELECT
  so.user_id,
  'PEDIDO',
  to_char(so.order_date, 'YYYYMM') AS period_yyyymm,
  max(
    CASE
      WHEN so.document_number ~ '^PED-[0-9]{6}-[0-9]{4}$'
      THEN right(so.document_number, 4)::integer
      ELSE 0
    END
  ) AS last_value,
  now()
FROM public.bem_aviv_sales_orders so
GROUP BY so.user_id, to_char(so.order_date, 'YYYYMM')
ON CONFLICT (user_id, document_type, period_yyyymm)
DO UPDATE SET
  last_value = GREATEST(public.bem_aviv_sales_order_counters.last_value, EXCLUDED.last_value),
  updated_at = now();
