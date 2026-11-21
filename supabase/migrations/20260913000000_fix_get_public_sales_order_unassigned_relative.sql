-- Corrige o erro "RECORD 'RELATIVE_REC' IS NOT ASSIGNED YET" na função get_public_sales_order.
--
-- O problema ocorre porque quando `client_relative_id` é NULL, o bloco de SELECT INTO
-- `relative_rec` nunca é executado. O PostgreSQL não consegue acessar campos de um RECORD
-- não inicializado, lançando o erro acima.
--
-- A correção usa uma flag booleana `relative_found` para controlar se o registro
-- foi de fato carregado, evitando acesso a um RECORD não inicializado.

CREATE OR REPLACE FUNCTION public.get_public_sales_order(order_uuid uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  order_rec    record;
  client_rec   record;
  relative_rec record;
  company_rec  record;
  items_json   json;
  result       json;
  client_found   boolean := false;
  relative_found boolean := false;
  company_found  boolean := false;
BEGIN
  -- Buscar o pedido
  SELECT * INTO order_rec FROM public.bem_aviv_sales_orders WHERE id = order_uuid;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Buscar o cliente
  IF order_rec.client_id IS NOT NULL THEN
    SELECT
      id,
      full_name,
      cpf,
      phone_1,
      phone_2,
      email,
      address_street,
      address_number,
      address_complement,
      address_district,
      address_city,
      address_state,
      cep
    INTO client_rec
    FROM public.bem_aviv_clients
    WHERE id = order_rec.client_id;
    client_found := FOUND;
  END IF;

  -- Buscar o familiar (se vinculado)
  IF order_rec.client_relative_id IS NOT NULL THEN
    SELECT
      id,
      name,
      relationship,
      cpf,
      phone
    INTO relative_rec
    FROM public.bem_aviv_client_relatives
    WHERE id = order_rec.client_relative_id;
    relative_found := FOUND;
  END IF;

  -- Buscar a empresa
  IF order_rec.company_id IS NOT NULL THEN
    SELECT
      id,
      trade_name,
      legal_name,
      tax_id,
      phone,
      email_contact,
      address_street,
      address_city,
      address_state,
      zip_code
    INTO company_rec
    FROM public.companies
    WHERE id = order_rec.company_id;
    company_found := FOUND;
  END IF;

  -- Buscar os itens
  SELECT json_agg(t) INTO items_json
  FROM (
    SELECT id, item_description, quantity, unit_price, total_price, discount_amount
    FROM public.bem_aviv_sales_order_items
    WHERE sales_order_id = order_uuid
    ORDER BY created_at ASC
  ) t;

  -- Construir o JSON de retorno
  -- Usa as flags para evitar acesso a RECORDs não inicializados
  result := json_build_object(
    'order', json_build_object(
      'id',                   order_rec.id,
      'document_type',        order_rec.document_type,
      'document_number',      order_rec.document_number,
      'order_date',           order_rec.order_date,
      'status',               order_rec.status,
      'total_amount',         order_rec.total_amount,
      'notes',                order_rec.notes,
      'discount_total',       order_rec.discount_total,
      'installments_count',   order_rec.installments_count,
      'payment_option',       order_rec.payment_option,
      'payment_method',       order_rec.payment_method,
      'down_payment_amount',  order_rec.down_payment_amount,
      'down_payment_method',  order_rec.down_payment_method,
      'freight_amount',       order_rec.freight_amount,
      'other_expenses',       order_rec.other_expenses,
      'client_accepted_at',   order_rec.client_accepted_at,
      'client_signature',     order_rec.client_signature,
      'converted_order_id',   order_rec.converted_order_id,
      'client_relative_id',   order_rec.client_relative_id
    ),
    'client',   CASE WHEN client_found   THEN row_to_json(client_rec)   ELSE NULL END,
    'relative', CASE WHEN relative_found THEN row_to_json(relative_rec) ELSE NULL END,
    'company',  CASE WHEN company_found  THEN row_to_json(company_rec)  ELSE NULL END,
    'items',    coalesce(items_json, '[]'::json)
  );

  RETURN result;
END;
$$;
