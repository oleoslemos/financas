-- Remove constraint única legada (sem company_id) que bloqueia numeração multiempresa.
-- Nome truncado no Postgres: bem_aviv_sales_order_counters_user_id_document_type_period__key

ALTER TABLE public.bem_aviv_sales_order_counters
  DROP CONSTRAINT IF EXISTS bem_aviv_sales_order_counters_user_id_document_type_period__key;

ALTER TABLE public.bem_aviv_sales_order_counters
  DROP CONSTRAINT IF EXISTS bem_aviv_sales_order_counters_user_id_document_type_period_yyyymm_key;

ALTER TABLE public.bem_aviv_sales_order_counters
  DROP CONSTRAINT IF EXISTS bem_aviv_sales_order_counters_user_id_document_type_period_key;

DROP FUNCTION IF EXISTS public.bem_aviv_next_document_number(text, text, date);
