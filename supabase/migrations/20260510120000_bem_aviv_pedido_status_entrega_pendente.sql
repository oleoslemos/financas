-- Pagamento confirma "ENTREGA PENDENTE"; entrega confirma "ENTREGUE".
-- Migra pedidos antigos que estavam como FINALIZADO (pagos, sem entrega explícita).

UPDATE public.bem_aviv_sales_orders
SET status = 'ENTREGA PENDENTE'
WHERE upper(coalesce(document_type, '')) = 'PEDIDO'
  AND upper(trim(coalesce(status, ''))) = 'FINALIZADO';
