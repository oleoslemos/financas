-- Refina classificação: categorias vazias no catálogo oferta não devem perder colchão.
-- Infere colchão pela descrição do item / nome do produto (COLCHÃO, PLATAFORMA, ou dimensões tipo 1,38M X 1,88M).

CREATE OR REPLACE FUNCTION public.bem_aviv_line_suggests_colchao(
  p_cat text,
  p_item_desc text,
  p_offer_name text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.bem_aviv_category_is_colchao(p_cat)
    OR upper(coalesce(p_item_desc, '') || ' ' || coalesce(p_offer_name, '')) LIKE '%COLCHÃO%'
    OR upper(coalesce(p_item_desc, '') || ' ' || coalesce(p_offer_name, '')) LIKE '%COLCHAO%'
    OR upper(coalesce(p_item_desc, '') || ' ' || coalesce(p_offer_name, '')) LIKE '%PLATAFORMA DE DESCANSO%'
    OR (
      upper(coalesce(p_item_desc, '') || ' ' || coalesce(p_offer_name, '')) ~ '[0-9]+[.,][0-9]+\s*[Mm]\s*[Xx]\s*[0-9]+[.,][0-9]+'
      AND upper(coalesce(p_item_desc, '') || ' ' || coalesce(p_offer_name, '')) NOT LIKE '%TRAVESSEIRO%'
      AND upper(coalesce(p_item_desc, '') || ' ' || coalesce(p_offer_name, '')) NOT LIKE '%TRAVESSEIROS%'
      AND upper(coalesce(p_item_desc, '') || ' ' || coalesce(p_offer_name, '')) NOT LIKE '%ALMOFADA%'
      AND upper(coalesce(p_item_desc, '') || ' ' || coalesce(p_offer_name, '')) NOT LIKE '%ENCOSTO%'
    );
$$;

CREATE OR REPLACE FUNCTION public.bem_aviv_compute_client_status_from_orders(p_client_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  has_col boolean := false;
  has_div boolean := false;
  rec record;
BEGIN
  FOR rec IN
    SELECT
      CASE
        WHEN i.product_id IS NOT NULL THEN p.category
        WHEN i.offer_product_id IS NOT NULL THEN op.category
        ELSE NULL
      END AS cat_raw,
      i.item_description,
      op.name AS offer_name
    FROM public.bem_aviv_sales_order_items i
    INNER JOIN public.bem_aviv_sales_orders o ON o.id = i.sales_order_id
    LEFT JOIN public.bem_aviv_products p ON p.id = i.product_id
    LEFT JOIN public.bem_aviv_offer_products op ON op.id = i.offer_product_id
    WHERE o.client_id = p_client_id
      AND upper(trim(coalesce(o.document_type, ''))) = 'PEDIDO'
      AND upper(trim(coalesce(o.status, ''))) <> 'CANCELADO'
  LOOP
    IF public.bem_aviv_line_suggests_colchao(rec.cat_raw, rec.item_description, rec.offer_name) THEN
      has_col := true;
    ELSE
      has_div := true;
    END IF;
  END LOOP;

  IF NOT has_col AND NOT has_div THEN
    RETURN 'PROSPECÇÃO';
  ELSIF has_col AND NOT has_div THEN
    RETURN 'CLIENTE - COLCHÃO';
  ELSIF has_div AND NOT has_col THEN
    RETURN 'CLIENTE - DIVERSOS';
  ELSE
    RETURN 'CLIENTE - COLCHÃO/DIVERSOS';
  END IF;
END;
$$;

UPDATE public.bem_aviv_clients c
SET client_status = public.bem_aviv_compute_client_status_from_orders(c.id);
