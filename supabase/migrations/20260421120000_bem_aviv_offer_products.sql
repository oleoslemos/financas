-- Produtos no modelo flexível (JSONB) + vínculo nos itens de pedido.

CREATE TABLE IF NOT EXISTS public.bem_aviv_offer_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  name text NOT NULL,
  category text,
  product_line text,
  product_type text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bem_aviv_offer_products_user_id_idx
  ON public.bem_aviv_offer_products (user_id);

CREATE INDEX IF NOT EXISTS bem_aviv_offer_products_user_name_idx
  ON public.bem_aviv_offer_products (user_id, name);

CREATE INDEX IF NOT EXISTS bem_aviv_offer_products_payload_gin_idx
  ON public.bem_aviv_offer_products USING gin (payload);

ALTER TABLE public.bem_aviv_offer_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bem_aviv_offer_products_all ON public.bem_aviv_offer_products;
CREATE POLICY bem_aviv_offer_products_all ON public.bem_aviv_offer_products
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

ALTER TABLE public.bem_aviv_sales_order_items
  ADD COLUMN IF NOT EXISTS offer_product_id uuid REFERENCES public.bem_aviv_offer_products (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variation_code text;

CREATE INDEX IF NOT EXISTS bem_aviv_sales_order_items_offer_product_idx
  ON public.bem_aviv_sales_order_items (offer_product_id);

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
  ELSIF TG_TABLE_NAME = 'bem_aviv_offer_products' THEN
    NEW.name := upper(coalesce(NEW.name, ''));
    NEW.category := upper(coalesce(NEW.category, ''));
    NEW.product_line := upper(coalesce(NEW.product_line, ''));
    NEW.product_type := upper(coalesce(NEW.product_type, ''));
  ELSIF TG_TABLE_NAME = 'bem_aviv_sales_order_items' THEN
    NEW.item_description := upper(coalesce(NEW.item_description, ''));
    NEW.variation_code := upper(coalesce(NEW.variation_code, ''));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_upper_bem_aviv_offer_products ON public.bem_aviv_offer_products;
CREATE TRIGGER trg_upper_bem_aviv_offer_products BEFORE INSERT OR UPDATE ON public.bem_aviv_offer_products
FOR EACH ROW EXECUTE FUNCTION public.tg_uppercase_text_fields();
