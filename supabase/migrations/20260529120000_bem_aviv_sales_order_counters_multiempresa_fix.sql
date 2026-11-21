-- Corrige numeração de pedidos/orçamentos por empresa (multiempresa).
-- Produção ainda com UNIQUE (user_id, document_type, period_yyyymm) gerava
-- duplicate key ao inserir contador com company_id diferente.

ALTER TABLE public.bem_aviv_sales_order_counters
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies (id);

UPDATE public.bem_aviv_sales_order_counters c
SET company_id = sub.company_id
FROM (
  SELECT DISTINCT ON (c2.id)
    c2.id AS counter_id,
    o.company_id
  FROM public.bem_aviv_sales_order_counters c2
  INNER JOIN public.bem_aviv_sales_orders o
    ON o.user_id = c2.user_id
    AND upper(coalesce(o.document_type, 'PEDIDO')) = c2.document_type
    AND to_char(o.order_date, 'YYYYMM') = c2.period_yyyymm
  WHERE c2.company_id IS NULL
    AND o.company_id IS NOT NULL
  ORDER BY c2.id, o.created_at DESC
) sub
WHERE c.id = sub.counter_id
  AND c.company_id IS NULL;

UPDATE public.bem_aviv_sales_order_counters
SET company_id = '10000000-0000-4000-8000-000000000001'
WHERE company_id IS NULL;

ALTER TABLE public.bem_aviv_sales_order_counters
  ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE public.bem_aviv_sales_order_counters
  DROP CONSTRAINT IF EXISTS bem_aviv_sales_order_counters_user_id_document_type_period_yyyymm_key;

ALTER TABLE public.bem_aviv_sales_order_counters
  DROP CONSTRAINT IF EXISTS bem_aviv_sales_order_counters_user_id_document_type_period_key;

DROP INDEX IF EXISTS bem_aviv_sales_order_counters_user_company_period_uidx;

-- Mescla contadores duplicados (legado sem empresa + novos por empresa).
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, company_id, document_type, period_yyyymm
      ORDER BY last_value DESC, updated_at DESC NULLS LAST, id
    ) AS rn,
    max(last_value) OVER (
      PARTITION BY user_id, company_id, document_type, period_yyyymm
    ) AS merged_last_value
  FROM public.bem_aviv_sales_order_counters
)
UPDATE public.bem_aviv_sales_order_counters c
SET last_value = r.merged_last_value
FROM ranked r
WHERE c.id = r.id
  AND r.rn = 1;

DELETE FROM public.bem_aviv_sales_order_counters c
USING (
  SELECT id
  FROM (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY user_id, company_id, document_type, period_yyyymm
        ORDER BY last_value DESC, updated_at DESC NULLS LAST, id
      ) AS rn
    FROM public.bem_aviv_sales_order_counters
  ) x
  WHERE x.rn > 1
) dup
WHERE c.id = dup.id;

CREATE UNIQUE INDEX IF NOT EXISTS bem_aviv_sales_order_counters_user_company_period_uidx
  ON public.bem_aviv_sales_order_counters (user_id, company_id, document_type, period_yyyymm);

CREATE OR REPLACE FUNCTION public.bem_aviv_next_document_number(
  p_user_id text,
  p_company_id uuid,
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
  v_doc_type text;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id é obrigatório para gerar número do documento';
  END IF;

  v_period := to_char(coalesce(p_order_date, current_date), 'YYYYMM');
  v_doc_type := upper(coalesce(p_document_type, 'PEDIDO'));
  v_prefix := CASE
    WHEN v_doc_type = 'ORCAMENTO' THEN 'ORC'
    ELSE 'PED'
  END;

  PERFORM pg_advisory_xact_lock(
    hashtext(p_user_id || ':' || p_company_id::text || ':' || v_doc_type || ':' || v_period)
  );

  INSERT INTO public.bem_aviv_sales_order_counters (user_id, company_id, document_type, period_yyyymm, last_value, updated_at)
  VALUES (p_user_id, p_company_id, v_doc_type, v_period, 1, now())
  ON CONFLICT (user_id, company_id, document_type, period_yyyymm)
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

  IF NEW.company_id IS NULL AND NEW.client_id IS NOT NULL THEN
    SELECT c.company_id
    INTO NEW.company_id
    FROM public.bem_aviv_clients c
    WHERE c.id = NEW.client_id;
  END IF;

  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'company_id é obrigatório para numeração do pedido';
  END IF;

  IF NEW.document_number IS NULL OR btrim(NEW.document_number) = '' THEN
    NEW.document_number := public.bem_aviv_next_document_number(
      NEW.user_id,
      NEW.company_id,
      NEW.document_type,
      NEW.order_date
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Sincroniza contadores com documentos já existentes por empresa.
INSERT INTO public.bem_aviv_sales_order_counters (user_id, company_id, document_type, period_yyyymm, last_value, updated_at)
SELECT
  so.user_id,
  so.company_id,
  upper(coalesce(so.document_type, 'PEDIDO')),
  to_char(so.order_date, 'YYYYMM') AS period_yyyymm,
  max(
    CASE
      WHEN so.document_number ~ '^(PED|ORC)-[0-9]{6}-[0-9]{4}$'
      THEN right(so.document_number, 4)::integer
      ELSE 0
    END
  ) AS last_value,
  now()
FROM public.bem_aviv_sales_orders so
WHERE so.company_id IS NOT NULL
GROUP BY so.user_id, so.company_id, upper(coalesce(so.document_type, 'PEDIDO')), to_char(so.order_date, 'YYYYMM')
ON CONFLICT (user_id, company_id, document_type, period_yyyymm)
DO UPDATE SET
  last_value = GREATEST(public.bem_aviv_sales_order_counters.last_value, EXCLUDED.last_value),
  updated_at = now();
