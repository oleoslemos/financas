-- Classificação de cliente por histórico de pedidos (colchão vs diversos).
-- Colchão: categoria PLATAFORMA DE DESCANSO ou nome contendo COLCHÃO/COLCHAO.

ALTER TABLE public.bem_aviv_clients
  DROP CONSTRAINT IF EXISTS bem_aviv_clients_client_status_allowed_chk;

CREATE OR REPLACE FUNCTION public.bem_aviv_category_is_colchao(cat text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(trim(coalesce(cat, ''))) = 'PLATAFORMA DE DESCANSO'
    OR upper(trim(coalesce(cat, ''))) LIKE '%COLCHÃO%'
    OR upper(trim(coalesce(cat, ''))) LIKE '%COLCHAO%';
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
      END AS cat_raw
    FROM public.bem_aviv_sales_order_items i
    INNER JOIN public.bem_aviv_sales_orders o ON o.id = i.sales_order_id
    LEFT JOIN public.bem_aviv_products p ON p.id = i.product_id
    LEFT JOIN public.bem_aviv_offer_products op ON op.id = i.offer_product_id
    WHERE o.client_id = p_client_id
      AND upper(trim(coalesce(o.document_type, ''))) = 'PEDIDO'
      AND upper(trim(coalesce(o.status, ''))) <> 'CANCELADO'
  LOOP
    IF rec.cat_raw IS NULL THEN
      has_div := true;
    ELSIF public.bem_aviv_category_is_colchao(rec.cat_raw) THEN
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

ALTER TABLE public.bem_aviv_clients
  ADD CONSTRAINT bem_aviv_clients_client_status_allowed_chk
  CHECK (
    client_status IN (
      'PROSPECÇÃO',
      'CLIENTE - COLCHÃO',
      'CLIENTE - DIVERSOS',
      'CLIENTE - COLCHÃO/DIVERSOS'
    )
  );

CREATE OR REPLACE FUNCTION public.tg_bem_aviv_refresh_client_status_from_orders()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  c1 uuid;
  c2 uuid;
  oid uuid;
BEGIN
  IF TG_TABLE_NAME = 'bem_aviv_sales_order_items' THEN
    oid := coalesce(NEW.sales_order_id, OLD.sales_order_id);
    SELECT o.client_id INTO c1 FROM public.bem_aviv_sales_orders o WHERE o.id = oid;
    IF TG_OP = 'UPDATE' AND OLD.sales_order_id IS DISTINCT FROM NEW.sales_order_id THEN
      SELECT o.client_id INTO c2 FROM public.bem_aviv_sales_orders o WHERE o.id = OLD.sales_order_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'bem_aviv_sales_orders' THEN
    IF TG_OP = 'DELETE' THEN
      c1 := OLD.client_id;
    ELSE
      c1 := NEW.client_id;
      IF TG_OP = 'UPDATE' AND OLD.client_id IS NOT NULL AND OLD.client_id IS DISTINCT FROM NEW.client_id THEN
        c2 := OLD.client_id;
      END IF;
    END IF;
  END IF;

  IF c1 IS NOT NULL THEN
    UPDATE public.bem_aviv_clients c
    SET client_status = public.bem_aviv_compute_client_status_from_orders(c1)
    WHERE c.id = c1;
  END IF;
  IF c2 IS NOT NULL THEN
    UPDATE public.bem_aviv_clients c
    SET client_status = public.bem_aviv_compute_client_status_from_orders(c2)
    WHERE c.id = c2;
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_bem_aviv_sales_order_items_refresh_client_status
  ON public.bem_aviv_sales_order_items;
CREATE TRIGGER trg_bem_aviv_sales_order_items_refresh_client_status
  AFTER INSERT OR UPDATE OR DELETE ON public.bem_aviv_sales_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_bem_aviv_refresh_client_status_from_orders();

DROP TRIGGER IF EXISTS trg_bem_aviv_sales_orders_refresh_client_status
  ON public.bem_aviv_sales_orders;
CREATE TRIGGER trg_bem_aviv_sales_orders_refresh_client_status
  AFTER INSERT OR UPDATE OR DELETE ON public.bem_aviv_sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_bem_aviv_refresh_client_status_from_orders();
