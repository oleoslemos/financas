-- Frete no pedido/orçamento (entra no total final).

ALTER TABLE public.bem_aviv_sales_orders
  ADD COLUMN IF NOT EXISTS freight_amount numeric(14,2) NOT NULL DEFAULT 0;

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
    ), 0) - coalesce(o.discount_total, 0) + coalesce(o.freight_amount, 0)
  )
  WHERE o.id = v_order_id;

  RETURN coalesce(NEW, OLD);
END;
$$;
