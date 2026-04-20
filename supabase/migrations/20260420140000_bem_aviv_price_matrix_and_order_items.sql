-- BEM AVIV: catálogos de preço em matriz (eixos + células) + itens de pedido/orçamento.

-- ---------------------------------------------------------------------------
-- Catálogo (versão / tabela de vendas em grade)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bem_aviv_price_catalogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  name text NOT NULL,
  description text,
  valid_from date,
  valid_to date,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bem_aviv_price_catalogs_one_default_per_user_idx
  ON public.bem_aviv_price_catalogs (user_id)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS bem_aviv_price_catalogs_user_id_idx
  ON public.bem_aviv_price_catalogs (user_id);

ALTER TABLE public.bem_aviv_price_catalogs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bem_aviv_price_catalogs_all ON public.bem_aviv_price_catalogs;
CREATE POLICY bem_aviv_price_catalogs_all ON public.bem_aviv_price_catalogs
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Produto dentro do catálogo (bloco: BANHO, EDREDOM, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bem_aviv_catalog_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  price_catalog_id uuid NOT NULL REFERENCES public.bem_aviv_price_catalogs (id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.bem_aviv_products (id) ON DELETE SET NULL,
  name text NOT NULL,
  product_type text NOT NULL DEFAULT 'MATRIX_2D',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bem_aviv_catalog_products_user_id_idx
  ON public.bem_aviv_catalog_products (user_id);

CREATE INDEX IF NOT EXISTS bem_aviv_catalog_products_catalog_idx
  ON public.bem_aviv_catalog_products (price_catalog_id);

ALTER TABLE public.bem_aviv_catalog_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bem_aviv_catalog_products_all ON public.bem_aviv_catalog_products;
CREATE POLICY bem_aviv_catalog_products_all ON public.bem_aviv_catalog_products
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Eixos da grade (ROW / COL)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bem_aviv_catalog_axes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  catalog_product_id uuid NOT NULL REFERENCES public.bem_aviv_catalog_products (id) ON DELETE CASCADE,
  axis_key text NOT NULL,
  axis_label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (catalog_product_id, axis_key)
);

CREATE INDEX IF NOT EXISTS bem_aviv_catalog_axes_user_id_idx
  ON public.bem_aviv_catalog_axes (user_id);

CREATE INDEX IF NOT EXISTS bem_aviv_catalog_axes_product_idx
  ON public.bem_aviv_catalog_axes (catalog_product_id);

ALTER TABLE public.bem_aviv_catalog_axes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bem_aviv_catalog_axes_all ON public.bem_aviv_catalog_axes;
CREATE POLICY bem_aviv_catalog_axes_all ON public.bem_aviv_catalog_axes
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Valores dos eixos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bem_aviv_catalog_axis_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  axis_id uuid NOT NULL REFERENCES public.bem_aviv_catalog_axes (id) ON DELETE CASCADE,
  value_code text,
  value_label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (axis_id, value_label)
);

CREATE INDEX IF NOT EXISTS bem_aviv_catalog_axis_values_user_id_idx
  ON public.bem_aviv_catalog_axis_values (user_id);

CREATE INDEX IF NOT EXISTS bem_aviv_catalog_axis_values_axis_idx
  ON public.bem_aviv_catalog_axis_values (axis_id);

ALTER TABLE public.bem_aviv_catalog_axis_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bem_aviv_catalog_axis_values_all ON public.bem_aviv_catalog_axis_values;
CREATE POLICY bem_aviv_catalog_axis_values_all ON public.bem_aviv_catalog_axis_values
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Células de preço
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bem_aviv_catalog_price_cells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  catalog_product_id uuid NOT NULL REFERENCES public.bem_aviv_catalog_products (id) ON DELETE CASCADE,
  row_value_id uuid REFERENCES public.bem_aviv_catalog_axis_values (id) ON DELETE CASCADE,
  col_value_id uuid REFERENCES public.bem_aviv_catalog_axis_values (id) ON DELETE CASCADE,
  price numeric(14,2) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (catalog_product_id, row_value_id, col_value_id)
);

CREATE INDEX IF NOT EXISTS bem_aviv_catalog_price_cells_user_id_idx
  ON public.bem_aviv_catalog_price_cells (user_id);

CREATE INDEX IF NOT EXISTS bem_aviv_catalog_price_cells_product_idx
  ON public.bem_aviv_catalog_price_cells (catalog_product_id);

ALTER TABLE public.bem_aviv_catalog_price_cells ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bem_aviv_catalog_price_cells_all ON public.bem_aviv_catalog_price_cells;
CREATE POLICY bem_aviv_catalog_price_cells_all ON public.bem_aviv_catalog_price_cells
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Opcionais / adicionais (ex.: eletrônicos)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bem_aviv_catalog_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  catalog_product_id uuid NOT NULL REFERENCES public.bem_aviv_catalog_products (id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric(14,2) NOT NULL,
  is_per_item boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (catalog_product_id, name)
);

CREATE INDEX IF NOT EXISTS bem_aviv_catalog_addons_user_id_idx
  ON public.bem_aviv_catalog_addons (user_id);

CREATE INDEX IF NOT EXISTS bem_aviv_catalog_addons_product_idx
  ON public.bem_aviv_catalog_addons (catalog_product_id);

ALTER TABLE public.bem_aviv_catalog_addons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bem_aviv_catalog_addons_all ON public.bem_aviv_catalog_addons;
CREATE POLICY bem_aviv_catalog_addons_all ON public.bem_aviv_catalog_addons
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Itens de pedido / orçamento
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bem_aviv_sales_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  sales_order_id uuid NOT NULL REFERENCES public.bem_aviv_sales_orders (id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.bem_aviv_products (id) ON DELETE SET NULL,
  catalog_price_cell_id uuid REFERENCES public.bem_aviv_catalog_price_cells (id) ON DELETE SET NULL,
  item_description text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL,
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  total_price numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bem_aviv_sales_order_items_user_id_idx
  ON public.bem_aviv_sales_order_items (user_id);

CREATE INDEX IF NOT EXISTS bem_aviv_sales_order_items_order_idx
  ON public.bem_aviv_sales_order_items (sales_order_id);

CREATE INDEX IF NOT EXISTS bem_aviv_sales_order_items_product_idx
  ON public.bem_aviv_sales_order_items (product_id);

ALTER TABLE public.bem_aviv_sales_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bem_aviv_sales_order_items_all ON public.bem_aviv_sales_order_items;
CREATE POLICY bem_aviv_sales_order_items_all ON public.bem_aviv_sales_order_items
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Recalcular total do pedido quando itens mudam
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_bem_aviv_sales_order_items_recalc_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  v_order_id := coalesce(NEW.sales_order_id, OLD.sales_order_id);

  UPDATE public.bem_aviv_sales_orders o
  SET total_amount = coalesce((
    SELECT sum(i.total_price)
    FROM public.bem_aviv_sales_order_items i
    WHERE i.sales_order_id = o.id
  ), 0)
  WHERE o.id = v_order_id;

  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_bem_aviv_sales_order_items_recalc_total ON public.bem_aviv_sales_order_items;
CREATE TRIGGER trg_bem_aviv_sales_order_items_recalc_total
AFTER INSERT OR UPDATE OR DELETE ON public.bem_aviv_sales_order_items
FOR EACH ROW
EXECUTE FUNCTION public.tg_bem_aviv_sales_order_items_recalc_total();

-- ---------------------------------------------------------------------------
-- Uppercase em textos novos (mesmo padrão BEM AVIV)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_uppercase_text_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'bank_accounts' THEN
    NEW.name := upper(coalesce(NEW.name, ''));
    NEW.bank_name := upper(NEW.bank_name);
    NEW.agency := upper(NEW.agency);
    NEW.account_number := upper(NEW.account_number);
  ELSIF TG_TABLE_NAME = 'categories' THEN
    NEW.name := upper(coalesce(NEW.name, ''));
  ELSIF TG_TABLE_NAME = 'payables_receivables' THEN
    NEW.description := upper(coalesce(NEW.description, ''));
  ELSIF TG_TABLE_NAME = 'credit_cards' THEN
    NEW.name := upper(coalesce(NEW.name, ''));
    NEW.brand := upper(NEW.brand);
  ELSIF TG_TABLE_NAME = 'credit_card_invoice_items' THEN
    NEW.description := upper(coalesce(NEW.description, ''));
  ELSIF TG_TABLE_NAME = 'bem_aviv_clients' THEN
    NEW.full_name := upper(coalesce(NEW.full_name, ''));
    NEW.cpf := regexp_replace(coalesce(NEW.cpf, ''), '\D', '', 'g');
    NEW.phone_1 := regexp_replace(coalesce(NEW.phone_1, ''), '\D', '', 'g');
    NEW.phone_2 := regexp_replace(coalesce(NEW.phone_2, ''), '\D', '', 'g');
    NEW.cep := regexp_replace(coalesce(NEW.cep, ''), '\D', '', 'g');
    NEW.address_street := upper(coalesce(NEW.address_street, ''));
    NEW.address_number := upper(coalesce(NEW.address_number, ''));
    NEW.address_complement := upper(coalesce(NEW.address_complement, ''));
    NEW.address_district := upper(coalesce(NEW.address_district, ''));
    NEW.address_city := upper(coalesce(NEW.address_city, ''));
    NEW.address_state := upper(coalesce(NEW.address_state, ''));
    NEW.full_address := upper(coalesce(NEW.full_address, ''));
    NEW.email := upper(coalesce(NEW.email, ''));
    NEW.client_status := upper(coalesce(NEW.client_status, 'CLIENTE'));
  ELSIF TG_TABLE_NAME = 'bem_aviv_products' THEN
    NEW.category := upper(coalesce(NEW.category, ''));
    NEW.name := upper(coalesce(NEW.name, ''));
    NEW.description := upper(coalesce(NEW.description, ''));
    NEW.product_line := upper(coalesce(NEW.product_line, ''));
    NEW.model := upper(coalesce(NEW.model, ''));
  ELSIF TG_TABLE_NAME = 'bem_aviv_sales_orders' THEN
    NEW.status := upper(coalesce(NEW.status, ''));
    NEW.notes := upper(coalesce(NEW.notes, ''));
  ELSIF TG_TABLE_NAME = 'bem_aviv_categories' THEN
    NEW.name := upper(coalesce(NEW.name, ''));
  ELSIF TG_TABLE_NAME = 'bem_aviv_price_tables' THEN
    NEW.name := upper(coalesce(NEW.name, ''));
    NEW.description := upper(coalesce(NEW.description, ''));
  ELSIF TG_TABLE_NAME = 'bem_aviv_price_table_items' THEN
    NEW.line_description := upper(coalesce(NEW.line_description, ''));
  ELSIF TG_TABLE_NAME = 'bem_aviv_price_catalogs' THEN
    NEW.name := upper(coalesce(NEW.name, ''));
    NEW.description := upper(coalesce(NEW.description, ''));
  ELSIF TG_TABLE_NAME = 'bem_aviv_catalog_products' THEN
    NEW.name := upper(coalesce(NEW.name, ''));
    NEW.product_type := upper(coalesce(NEW.product_type, ''));
  ELSIF TG_TABLE_NAME = 'bem_aviv_catalog_axes' THEN
    NEW.axis_key := upper(coalesce(NEW.axis_key, ''));
    NEW.axis_label := upper(coalesce(NEW.axis_label, ''));
  ELSIF TG_TABLE_NAME = 'bem_aviv_catalog_axis_values' THEN
    NEW.value_code := upper(coalesce(NEW.value_code, ''));
    NEW.value_label := upper(coalesce(NEW.value_label, ''));
  ELSIF TG_TABLE_NAME = 'bem_aviv_catalog_addons' THEN
    NEW.name := upper(coalesce(NEW.name, ''));
  ELSIF TG_TABLE_NAME = 'bem_aviv_sales_order_items' THEN
    NEW.item_description := upper(coalesce(NEW.item_description, ''));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_upper_bem_aviv_price_catalogs ON public.bem_aviv_price_catalogs;
CREATE TRIGGER trg_upper_bem_aviv_price_catalogs BEFORE INSERT OR UPDATE ON public.bem_aviv_price_catalogs
FOR EACH ROW EXECUTE FUNCTION public.tg_uppercase_text_fields();

DROP TRIGGER IF EXISTS trg_upper_bem_aviv_catalog_products ON public.bem_aviv_catalog_products;
CREATE TRIGGER trg_upper_bem_aviv_catalog_products BEFORE INSERT OR UPDATE ON public.bem_aviv_catalog_products
FOR EACH ROW EXECUTE FUNCTION public.tg_uppercase_text_fields();

DROP TRIGGER IF EXISTS trg_upper_bem_aviv_catalog_axes ON public.bem_aviv_catalog_axes;
CREATE TRIGGER trg_upper_bem_aviv_catalog_axes BEFORE INSERT OR UPDATE ON public.bem_aviv_catalog_axes
FOR EACH ROW EXECUTE FUNCTION public.tg_uppercase_text_fields();

DROP TRIGGER IF EXISTS trg_upper_bem_aviv_catalog_axis_values ON public.bem_aviv_catalog_axis_values;
CREATE TRIGGER trg_upper_bem_aviv_catalog_axis_values BEFORE INSERT OR UPDATE ON public.bem_aviv_catalog_axis_values
FOR EACH ROW EXECUTE FUNCTION public.tg_uppercase_text_fields();

DROP TRIGGER IF EXISTS trg_upper_bem_aviv_catalog_addons ON public.bem_aviv_catalog_addons;
CREATE TRIGGER trg_upper_bem_aviv_catalog_addons BEFORE INSERT OR UPDATE ON public.bem_aviv_catalog_addons
FOR EACH ROW EXECUTE FUNCTION public.tg_uppercase_text_fields();

DROP TRIGGER IF EXISTS trg_upper_bem_aviv_sales_order_items ON public.bem_aviv_sales_order_items;
CREATE TRIGGER trg_upper_bem_aviv_sales_order_items BEFORE INSERT OR UPDATE ON public.bem_aviv_sales_order_items
FOR EACH ROW EXECUTE FUNCTION public.tg_uppercase_text_fields();
