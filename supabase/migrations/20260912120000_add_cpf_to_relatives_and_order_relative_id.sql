-- 1. Adicionar campo cpf na tabela bem_aviv_client_relatives
ALTER TABLE public.bem_aviv_client_relatives
  ADD COLUMN IF NOT EXISTS cpf text;

-- 2. Atualizar a trigger function de maiúsculas/limpeza de familiares para incluir cpf
CREATE OR REPLACE FUNCTION public.tg_uppercase_relatives_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.name := upper(coalesce(NEW.name, ''));
  NEW.relationship := upper(coalesce(NEW.relationship, ''));
  NEW.phone := regexp_replace(coalesce(NEW.phone, ''), '\D', '', 'g');
  NEW.cpf := regexp_replace(coalesce(NEW.cpf, ''), '\D', '', 'g');
  RETURN NEW;
END;
$$;

-- 3. Adicionar coluna client_relative_id na tabela bem_aviv_sales_orders
ALTER TABLE public.bem_aviv_sales_orders
  ADD COLUMN IF NOT EXISTS client_relative_id uuid REFERENCES public.bem_aviv_client_relatives(id) ON DELETE SET NULL;

-- 4. Adicionar coluna client_relative_id na tabela bem_aviv_quick_quotes
ALTER TABLE public.bem_aviv_quick_quotes
  ADD COLUMN IF NOT EXISTS client_relative_id uuid REFERENCES public.bem_aviv_client_relatives(id) ON DELETE SET NULL;

-- 5. Atualizar a função get_public_sales_order para retornar client_relative_id e o registro de familiar
CREATE OR REPLACE FUNCTION public.get_public_sales_order(order_uuid uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  order_rec record;
  client_rec record;
  relative_rec record;
  company_rec record;
  items_json json;
  result json;
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
  result := json_build_object(
    'order', json_build_object(
      'id', order_rec.id,
      'document_type', order_rec.document_type,
      'document_number', order_rec.document_number,
      'order_date', order_rec.order_date,
      'status', order_rec.status,
      'total_amount', order_rec.total_amount,
      'notes', order_rec.notes,
      'discount_total', order_rec.discount_total,
      'installments_count', order_rec.installments_count,
      'payment_option', order_rec.payment_option,
      'payment_method', order_rec.payment_method,
      'down_payment_amount', order_rec.down_payment_amount,
      'down_payment_method', order_rec.down_payment_method,
      'freight_amount', order_rec.freight_amount,
      'other_expenses', order_rec.other_expenses,
      'client_accepted_at', order_rec.client_accepted_at,
      'client_signature', order_rec.client_signature,
      'converted_order_id', order_rec.converted_order_id,
      'client_relative_id', order_rec.client_relative_id
    ),
    'client', CASE WHEN client_rec.id IS NOT NULL THEN row_to_json(client_rec) ELSE NULL END,
    'relative', CASE WHEN relative_rec.id IS NOT NULL THEN row_to_json(relative_rec) ELSE NULL END,
    'company', CASE WHEN company_rec.id IS NOT NULL THEN row_to_json(company_rec) ELSE NULL END,
    'items', coalesce(items_json, '[]'::json)
  );

  RETURN result;
END;
$$;

-- 6. Atualizar accept_public_sales_order para preservar client_relative_id ao converter orçamento em pedido
CREATE OR REPLACE FUNCTION public.accept_public_sales_order(order_uuid uuid, signature_text text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  order_rec record;
  new_order_id uuid;
  new_order_doc_number text;
  item_rec record;
  offer_rec record;
  kit_line jsonb;
  comp_rec record;
  comp_var jsonb;
  comp_price numeric;
  comp_dim text;
  comp_qty integer;
  comp_desc text;
BEGIN
  -- Buscar o documento original
  SELECT * INTO order_rec FROM public.bem_aviv_sales_orders WHERE id = order_uuid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento não encontrado.';
  END IF;

  -- Verificar se já foi aceito
  IF order_rec.client_accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Este documento já foi aceito e não pode ser alterado.';
  END IF;

  -- Atualizar o documento original com o aceite do cliente
  UPDATE public.bem_aviv_sales_orders
  SET 
    client_accepted_at = now(),
    client_signature = signature_text
  WHERE id = order_uuid;

  -- Se for ORCAMENTO, gerar o PEDIDO automaticamente
  IF order_rec.document_type = 'ORCAMENTO' THEN
    -- Criar o novo registro de PEDIDO
    INSERT INTO public.bem_aviv_sales_orders (
      user_id,
      company_id,
      client_id,
      client_relative_id,
      order_date,
      document_type,
      status,
      total_amount,
      discount_total,
      installments_count,
      notes,
      source_quote_id,
      payment_option,
      payment_method,
      down_payment_amount,
      down_payment_method,
      freight_amount,
      other_expenses,
      client_accepted_at,
      client_signature
    ) VALUES (
      order_rec.user_id,
      order_rec.company_id,
      order_rec.client_id,
      order_rec.client_relative_id,
      CURRENT_DATE,
      'PEDIDO',
      'ABERTO',
      order_rec.total_amount,
      order_rec.discount_total,
      order_rec.installments_count,
      coalesce(order_rec.notes || ' | ', '') || 'GERADO VIA ACEITE ONLINE DE ' || coalesce(order_rec.document_number, 'ORÇAMENTO'),
      order_rec.id,
      order_rec.payment_option,
      order_rec.payment_method,
      order_rec.down_payment_amount,
      order_rec.down_payment_method,
      order_rec.freight_amount,
      order_rec.other_expenses,
      now(), -- já nasce aceito
      signature_text
    ) RETURNING id, document_number INTO new_order_id, new_order_doc_number;

    -- Copiar e expandir itens
    FOR item_rec IN SELECT * FROM public.bem_aviv_sales_order_items WHERE sales_order_id = order_uuid LOOP
      SELECT * INTO offer_rec FROM public.bem_aviv_offer_products WHERE id = item_rec.offer_product_id;
      
      IF offer_rec.id IS NULL OR coalesce(offer_rec.pricing_mode, '') != 'KIT' THEN
        -- Copia direta
        INSERT INTO public.bem_aviv_sales_order_items (
          user_id, sales_order_id, product_id, catalog_price_cell_id, offer_product_id, variation_code, 
          item_description, quantity, unit_price, discount_amount, total_price
        ) VALUES (
          item_rec.user_id, new_order_id, item_rec.product_id, item_rec.catalog_price_cell_id, item_rec.offer_product_id, item_rec.variation_code,
          item_rec.item_description, item_rec.quantity, item_rec.unit_price, coalesce(item_rec.discount_amount, 0), item_rec.total_price
        );
      ELSE
        -- KIT: expandir componentes
        FOR kit_line IN SELECT * FROM jsonb_array_elements(coalesce(offer_rec.payload->'kit_lines', '[]'::jsonb)) LOOP
          SELECT * INTO comp_rec FROM public.bem_aviv_offer_products WHERE id = (kit_line->>'offer_product_id')::uuid;
          IF comp_rec.id IS NOT NULL THEN
            comp_price := 0;
            comp_dim := '';
            FOR comp_var IN SELECT * FROM jsonb_array_elements(coalesce(comp_rec.payload->'variations', '[]'::jsonb)) LOOP
              IF comp_var->>'code' = kit_line->>'variation_code' THEN
                comp_price := (comp_var->>'price')::numeric;
                comp_dim := comp_var->>'dimensions';
              END IF;
            END LOOP;
            
            comp_qty := coalesce(item_rec.quantity, 1) * coalesce((kit_line->>'quantity')::integer, 1);
            comp_desc := comp_rec.name || ' [' || (kit_line->>'variation_code') || ']';
            IF comp_dim != '' AND comp_dim IS NOT NULL THEN
              comp_desc := comp_desc || ' — ' || comp_dim;
            END IF;
            comp_desc := comp_desc || ' — PARTE DO KIT «' || offer_rec.name || '»';
            
            INSERT INTO public.bem_aviv_sales_order_items (
              user_id, sales_order_id, product_id, catalog_price_cell_id, offer_product_id, variation_code, 
              item_description, quantity, unit_price, discount_amount, total_price
            ) VALUES (
              item_rec.user_id, new_order_id, NULL, NULL, comp_rec.id, kit_line->>'variation_code',
              comp_desc, comp_qty, comp_price, 0, comp_qty * comp_price
            );
          END IF;
        END LOOP;
      END IF;
    END LOOP;

    -- Atualizar o orçamento com o status fechado e apontando para o novo pedido
    UPDATE public.bem_aviv_sales_orders
    SET 
      status = 'FECHADO',
      converted_order_id = new_order_id
    WHERE id = order_uuid;

    RETURN json_build_object(
      'success', true,
      'converted', true,
      'new_order_id', new_order_id,
      'new_order_doc_number', new_order_doc_number
    );
  ELSE
    -- Se já for um PEDIDO, apenas retorna sucesso
    RETURN json_build_object(
      'success', true,
      'converted', false,
      'new_order_id', NULL,
      'new_order_doc_number', NULL
    );
  END IF;
END;
$$;
