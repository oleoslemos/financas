-- Corrigir a função de trigger para a tabela bem_aviv_sales_orders
CREATE OR REPLACE FUNCTION public.tg_prevent_edit_on_accepted_order()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Bloquear exclusão de pedidos aceitos
  IF OLD.client_accepted_at IS NOT NULL AND TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Não é permitido excluir um documento que já foi aceito pelo cliente.';
  END IF;

  -- Bloquear alteração de condições comerciais se já aceito
  IF OLD.client_accepted_at IS NOT NULL AND TG_OP = 'UPDATE' THEN
    IF NEW.total_amount IS DISTINCT FROM OLD.total_amount OR
       NEW.discount_total IS DISTINCT FROM OLD.discount_total OR
       NEW.installments_count IS DISTINCT FROM OLD.installments_count OR
       NEW.payment_option IS DISTINCT FROM OLD.payment_option OR
       NEW.payment_method IS DISTINCT FROM OLD.payment_method OR
       NEW.down_payment_amount IS DISTINCT FROM OLD.down_payment_amount OR
       NEW.client_accepted_at IS DISTINCT FROM OLD.client_accepted_at OR
       NEW.client_signature IS DISTINCT FROM OLD.client_signature
    THEN
      RAISE EXCEPTION 'Este documento já foi aceito pelo cliente e suas condições comerciais não podem ser alteradas.';
    END IF;
  END IF;

  -- Retornar OLD em operações DELETE
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Corrigir a função de trigger para a tabela bem_aviv_sales_order_items
CREATE OR REPLACE FUNCTION public.tg_prevent_edit_on_accepted_order_items()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  is_accepted boolean;
BEGIN
  -- Verificar se o pedido pai está aceito
  SELECT (client_accepted_at IS NOT NULL) INTO is_accepted
  FROM public.bem_aviv_sales_orders
  WHERE id = coalesce(OLD.sales_order_id, NEW.sales_order_id);

  IF is_accepted THEN
    RAISE EXCEPTION 'Não é permitido alterar os itens de um documento que já foi aceito pelo cliente.';
  END IF;

  -- Retornar OLD em operações DELETE
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
