-- Exclusão solicitada manualmente de orçamentos específicos.
-- Mantém escopo estrito por tipo ORCAMENTO + document_number.

DELETE FROM public.bem_aviv_sales_orders
WHERE document_type = 'ORCAMENTO'
  AND document_number IN ('ORC-202507-0001', 'ORC-202605-0003');
