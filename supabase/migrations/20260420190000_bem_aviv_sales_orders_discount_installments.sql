-- Desconto global no pedido/orçamento + parcelas; total = soma(itens) - desconto.

ALTER TABLE public.bem_aviv_sales_orders
  ADD COLUMN IF NOT EXISTS discount_total numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS installments_count integer NOT NULL DEFAULT 1;

ALTER TABLE public.bem_aviv_sales_orders
  DROP CONSTRAINT IF EXISTS bem_aviv_sales_orders_installments_count_check;

ALTER TABLE public.bem_aviv_sales_orders
  ADD CONSTRAINT bem_aviv_sales_orders_installments_count_check
  CHECK (installments_count >= 1 AND installments_count <= 120);

CREATE OR REPLACE FUNCTION public.tg_bem_aviv_sales_order_items_recalc_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  v_order_id := coalesce(NEW.sales_order_id, OLD.sales_order_id);

  UPDATE public.bem_aviv_sales_orders o
  SET total_amount = greatest(
    0,
    coalesce((
      SELECT sum(i.total_price)
      FROM public.bem_aviv_sales_order_items i
      WHERE i.sales_order_id = o.id
    ), 0) - coalesce(o.discount_total, 0)
  )
  WHERE o.id = v_order_id;

  RETURN coalesce(NEW, OLD);
END;
$$;
