-- Migration: create or replace view v2_pedidos_venda
-- This view joins sales orders with client full name.
CREATE OR REPLACE VIEW public.v2_pedidos_venda AS
SELECT
  so.id,
  so.client_id,
  c.full_name      AS client_name,   -- nome completo do cliente
  so.order_date,
  so.document_type,
  so.document_number,
  so.status,
  so.total_amount,
  so.expected_arrival_date
FROM bem_aviv_sales_orders so
JOIN bem_aviv_clients c ON so.client_id = c.id;
