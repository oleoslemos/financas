-- Outras despesas no pedido/orçamento (acréscimos além do frete; evita tratar como "desconto negativo").

ALTER TABLE public.bem_aviv_sales_orders
  ADD COLUMN IF NOT EXISTS other_expenses numeric(14, 2);

COMMENT ON COLUMN public.bem_aviv_sales_orders.other_expenses IS 'Outras despesas somadas ao total (ex.: taxas, extras); não é desconto.';
