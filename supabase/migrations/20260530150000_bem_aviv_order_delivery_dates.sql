-- Previsão de chegada e histórico de entregas (parcial e total).

ALTER TABLE public.bem_aviv_sales_orders
  ADD COLUMN IF NOT EXISTS expected_arrival_date date,
  ADD COLUMN IF NOT EXISTS delivered_at date;

COMMENT ON COLUMN public.bem_aviv_sales_orders.expected_arrival_date IS
  'Previsão de chegada da próxima remessa ou da entrega pendente.';
COMMENT ON COLUMN public.bem_aviv_sales_orders.delivered_at IS
  'Data da entrega total confirmada (quando status = ENTREGUE).';

CREATE TABLE IF NOT EXISTS public.bem_aviv_sales_order_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES public.bem_aviv_sales_orders (id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  user_id text NOT NULL,
  kind text NOT NULL,
  expected_arrival_date date NOT NULL,
  delivered_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bem_aviv_sales_order_deliveries_kind_chk
    CHECK (kind IN ('PARCIAL', 'TOTAL'))
);

CREATE INDEX IF NOT EXISTS bem_aviv_sales_order_deliveries_order_idx
  ON public.bem_aviv_sales_order_deliveries (sales_order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.bem_aviv_sales_order_delivery_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES public.bem_aviv_sales_order_deliveries (id) ON DELETE CASCADE,
  sales_order_item_id uuid NOT NULL REFERENCES public.bem_aviv_sales_order_items (id) ON DELETE CASCADE,
  quantity integer NOT NULL,
  CONSTRAINT bem_aviv_sales_order_delivery_lines_qty_chk CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS bem_aviv_sales_order_delivery_lines_delivery_idx
  ON public.bem_aviv_sales_order_delivery_lines (delivery_id);

ALTER TABLE public.bem_aviv_sales_order_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bem_aviv_sales_order_delivery_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY bem_aviv_sales_order_deliveries_select ON public.bem_aviv_sales_order_deliveries
  FOR SELECT USING (public.bem_aviv_user_in_company(company_id));
CREATE POLICY bem_aviv_sales_order_deliveries_insert ON public.bem_aviv_sales_order_deliveries
  FOR INSERT WITH CHECK (public.bem_aviv_user_in_company(company_id));
CREATE POLICY bem_aviv_sales_order_deliveries_update ON public.bem_aviv_sales_order_deliveries
  FOR UPDATE
  USING (public.bem_aviv_user_in_company(company_id))
  WITH CHECK (public.bem_aviv_user_in_company(company_id));
CREATE POLICY bem_aviv_sales_order_deliveries_delete ON public.bem_aviv_sales_order_deliveries
  FOR DELETE USING (public.bem_aviv_user_in_company(company_id));

CREATE POLICY bem_aviv_sales_order_delivery_lines_select ON public.bem_aviv_sales_order_delivery_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.bem_aviv_sales_order_deliveries d
      WHERE d.id = delivery_id
        AND public.bem_aviv_user_in_company(d.company_id)
    )
  );
CREATE POLICY bem_aviv_sales_order_delivery_lines_insert ON public.bem_aviv_sales_order_delivery_lines
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.bem_aviv_sales_order_deliveries d
      WHERE d.id = delivery_id
        AND public.bem_aviv_user_in_company(d.company_id)
    )
  );
CREATE POLICY bem_aviv_sales_order_delivery_lines_update ON public.bem_aviv_sales_order_delivery_lines
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.bem_aviv_sales_order_deliveries d
      WHERE d.id = delivery_id
        AND public.bem_aviv_user_in_company(d.company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.bem_aviv_sales_order_deliveries d
      WHERE d.id = delivery_id
        AND public.bem_aviv_user_in_company(d.company_id)
    )
  );
CREATE POLICY bem_aviv_sales_order_delivery_lines_delete ON public.bem_aviv_sales_order_delivery_lines
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM public.bem_aviv_sales_order_deliveries d
      WHERE d.id = delivery_id
        AND public.bem_aviv_user_in_company(d.company_id)
    )
  );
