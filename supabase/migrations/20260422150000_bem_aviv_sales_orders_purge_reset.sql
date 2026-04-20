-- Limpeza total de pedidos/orçamentos + reset do sequencial.

DELETE FROM public.bem_aviv_sales_order_items;
DELETE FROM public.bem_aviv_sales_orders;
DELETE FROM public.bem_aviv_sales_order_counters;
