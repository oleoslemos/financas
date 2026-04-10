-- Plataformas (campos estruturados) + linhas na tabela de preço por produto.

ALTER TABLE public.bem_aviv_products
  ADD COLUMN IF NOT EXISTS product_line text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS dim_width_cm integer,
  ADD COLUMN IF NOT EXISTS dim_length_cm integer,
  ADD COLUMN IF NOT EXISTS dim_height_cm integer,
  ADD COLUMN IF NOT EXISTS price_table_id uuid REFERENCES public.bem_aviv_price_tables (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.bem_aviv_price_table_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  price_table_id uuid NOT NULL REFERENCES public.bem_aviv_price_tables (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.bem_aviv_products (id) ON DELETE CASCADE,
  line_description text NOT NULL,
  price numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id)
);

CREATE INDEX IF NOT EXISTS bem_aviv_price_table_items_user_id_idx ON public.bem_aviv_price_table_items (user_id);
CREATE INDEX IF NOT EXISTS bem_aviv_price_table_items_table_idx ON public.bem_aviv_price_table_items (price_table_id);

ALTER TABLE public.bem_aviv_price_table_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bem_aviv_price_table_items_all ON public.bem_aviv_price_table_items;
CREATE POLICY bem_aviv_price_table_items_all ON public.bem_aviv_price_table_items
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

DROP TRIGGER IF EXISTS trg_upper_bem_aviv_price_table_items ON public.bem_aviv_price_table_items;
CREATE TRIGGER trg_upper_bem_aviv_price_table_items BEFORE INSERT OR UPDATE ON public.bem_aviv_price_table_items
FOR EACH ROW EXECUTE FUNCTION public.tg_uppercase_text_fields();

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
  END IF;
  RETURN NEW;
END;
$$;
