-- Entrega parcial: quantidade já entregue por item do pedido.

ALTER TABLE public.bem_aviv_sales_order_items
  ADD COLUMN IF NOT EXISTS quantity_delivered integer NOT NULL DEFAULT 0;

ALTER TABLE public.bem_aviv_sales_order_items
  DROP CONSTRAINT IF EXISTS bem_aviv_sales_order_items_quantity_delivered_chk;

ALTER TABLE public.bem_aviv_sales_order_items
  ADD CONSTRAINT bem_aviv_sales_order_items_quantity_delivered_chk
  CHECK (quantity_delivered >= 0 AND quantity_delivered <= quantity);

COMMENT ON COLUMN public.bem_aviv_sales_order_items.quantity_delivered IS
  'Quantidade já entregue ao cliente (entrega parcial ou total).';

-- Pedidos já marcados como ENTREGUE: considerar itens totalmente entregues.
UPDATE public.bem_aviv_sales_order_items i
SET quantity_delivered = i.quantity
FROM public.bem_aviv_sales_orders o
WHERE o.id = i.sales_order_id
  AND upper(coalesce(o.document_type, '')) = 'PEDIDO'
  AND upper(trim(coalesce(o.status, ''))) IN ('ENTREGUE', 'FINALIZADO')
  AND i.quantity_delivered = 0;
