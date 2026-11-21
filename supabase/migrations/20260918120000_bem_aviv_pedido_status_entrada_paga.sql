-- Adiciona o status ENTRADA_PAGA aos pedidos de venda.
-- O status ENTRADA_PAGA é utilizado quando a entrada do pedido é baixada (confirmada),
-- mantendo o valor restante (total - entrada) no card "Aguardando Pagamento".

COMMENT ON COLUMN public.bem_aviv_sales_orders.status IS 'Status do documento: ABERTO, ENTRADA_PAGA, ENTREGA PENDENTE, ENTREGA PARCIAL, ENTREGUE, CANCELADO, FECHADO';
