-- Pedido criado a partir de orçamento: ao excluir o pedido, reabre o orçamento (status ABERTO).
-- O FK converted_order_id já zera com ON DELETE SET NULL; falta voltar o status de FECHADO.

CREATE OR REPLACE FUNCTION public.tg_bem_aviv_sales_orders_after_delete_reopen_quote()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF upper(coalesce(OLD.document_type, '')) = 'PEDIDO' AND OLD.source_quote_id IS NOT NULL THEN
    UPDATE public.bem_aviv_sales_orders
    SET status = 'ABERTO'
    WHERE id = OLD.source_quote_id
      AND upper(coalesce(document_type, '')) = 'ORCAMENTO';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_bem_aviv_sales_orders_after_delete_reopen_quote ON public.bem_aviv_sales_orders;
CREATE TRIGGER trg_bem_aviv_sales_orders_after_delete_reopen_quote
AFTER DELETE ON public.bem_aviv_sales_orders
FOR EACH ROW
EXECUTE FUNCTION public.tg_bem_aviv_sales_orders_after_delete_reopen_quote();
