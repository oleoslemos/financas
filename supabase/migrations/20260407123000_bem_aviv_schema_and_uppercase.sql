-- BEM AVIV: estrutura inicial

CREATE TABLE IF NOT EXISTS public.bem_aviv_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  full_name text NOT NULL,
  cpf text NOT NULL,
  birth_date date,
  phone_1 text,
  phone_2 text,
  full_address text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bem_aviv_clients_user_id_idx ON public.bem_aviv_clients (user_id);

CREATE TABLE IF NOT EXISTS public.bem_aviv_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  category text NOT NULL,
  name text NOT NULL,
  description text,
  price numeric(14,2),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bem_aviv_products_user_id_idx ON public.bem_aviv_products (user_id);
CREATE INDEX IF NOT EXISTS bem_aviv_products_category_idx ON public.bem_aviv_products (category);

CREATE TABLE IF NOT EXISTS public.bem_aviv_sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  client_id uuid REFERENCES public.bem_aviv_clients (id) ON DELETE SET NULL,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'ABERTO',
  notes text,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bem_aviv_sales_orders_user_id_idx ON public.bem_aviv_sales_orders (user_id);

CREATE TABLE IF NOT EXISTS public.bem_aviv_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS bem_aviv_categories_user_id_idx ON public.bem_aviv_categories (user_id);

CREATE TABLE IF NOT EXISTS public.bem_aviv_price_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bem_aviv_price_tables_user_id_idx ON public.bem_aviv_price_tables (user_id);

ALTER TABLE public.bem_aviv_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bem_aviv_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bem_aviv_sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bem_aviv_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bem_aviv_price_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bem_aviv_clients_all ON public.bem_aviv_clients;
DROP POLICY IF EXISTS bem_aviv_products_all ON public.bem_aviv_products;
DROP POLICY IF EXISTS bem_aviv_sales_orders_all ON public.bem_aviv_sales_orders;
DROP POLICY IF EXISTS bem_aviv_categories_all ON public.bem_aviv_categories;
DROP POLICY IF EXISTS bem_aviv_price_tables_all ON public.bem_aviv_price_tables;

CREATE POLICY bem_aviv_clients_all ON public.bem_aviv_clients
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY bem_aviv_products_all ON public.bem_aviv_products
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY bem_aviv_sales_orders_all ON public.bem_aviv_sales_orders
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY bem_aviv_categories_all ON public.bem_aviv_categories
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY bem_aviv_price_tables_all ON public.bem_aviv_price_tables
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Uppercase em persistência para tabelas LSH + BEM AVIV.
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
    NEW.full_address := upper(coalesce(NEW.full_address, ''));
    NEW.email := upper(coalesce(NEW.email, ''));
  ELSIF TG_TABLE_NAME = 'bem_aviv_products' THEN
    NEW.category := upper(coalesce(NEW.category, ''));
    NEW.name := upper(coalesce(NEW.name, ''));
    NEW.description := upper(coalesce(NEW.description, ''));
  ELSIF TG_TABLE_NAME = 'bem_aviv_sales_orders' THEN
    NEW.status := upper(coalesce(NEW.status, ''));
    NEW.notes := upper(coalesce(NEW.notes, ''));
  ELSIF TG_TABLE_NAME = 'bem_aviv_categories' THEN
    NEW.name := upper(coalesce(NEW.name, ''));
  ELSIF TG_TABLE_NAME = 'bem_aviv_price_tables' THEN
    NEW.name := upper(coalesce(NEW.name, ''));
    NEW.description := upper(coalesce(NEW.description, ''));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_upper_bank_accounts ON public.bank_accounts;
CREATE TRIGGER trg_upper_bank_accounts BEFORE INSERT OR UPDATE ON public.bank_accounts
FOR EACH ROW EXECUTE FUNCTION public.tg_uppercase_text_fields();

DROP TRIGGER IF EXISTS trg_upper_categories ON public.categories;
CREATE TRIGGER trg_upper_categories BEFORE INSERT OR UPDATE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.tg_uppercase_text_fields();

DROP TRIGGER IF EXISTS trg_upper_payables_receivables ON public.payables_receivables;
CREATE TRIGGER trg_upper_payables_receivables BEFORE INSERT OR UPDATE ON public.payables_receivables
FOR EACH ROW EXECUTE FUNCTION public.tg_uppercase_text_fields();

DROP TRIGGER IF EXISTS trg_upper_credit_cards ON public.credit_cards;
CREATE TRIGGER trg_upper_credit_cards BEFORE INSERT OR UPDATE ON public.credit_cards
FOR EACH ROW EXECUTE FUNCTION public.tg_uppercase_text_fields();

DROP TRIGGER IF EXISTS trg_upper_credit_card_invoice_items ON public.credit_card_invoice_items;
CREATE TRIGGER trg_upper_credit_card_invoice_items BEFORE INSERT OR UPDATE ON public.credit_card_invoice_items
FOR EACH ROW EXECUTE FUNCTION public.tg_uppercase_text_fields();

DROP TRIGGER IF EXISTS trg_upper_bem_aviv_clients ON public.bem_aviv_clients;
CREATE TRIGGER trg_upper_bem_aviv_clients BEFORE INSERT OR UPDATE ON public.bem_aviv_clients
FOR EACH ROW EXECUTE FUNCTION public.tg_uppercase_text_fields();

DROP TRIGGER IF EXISTS trg_upper_bem_aviv_products ON public.bem_aviv_products;
CREATE TRIGGER trg_upper_bem_aviv_products BEFORE INSERT OR UPDATE ON public.bem_aviv_products
FOR EACH ROW EXECUTE FUNCTION public.tg_uppercase_text_fields();

DROP TRIGGER IF EXISTS trg_upper_bem_aviv_sales_orders ON public.bem_aviv_sales_orders;
CREATE TRIGGER trg_upper_bem_aviv_sales_orders BEFORE INSERT OR UPDATE ON public.bem_aviv_sales_orders
FOR EACH ROW EXECUTE FUNCTION public.tg_uppercase_text_fields();

DROP TRIGGER IF EXISTS trg_upper_bem_aviv_categories ON public.bem_aviv_categories;
CREATE TRIGGER trg_upper_bem_aviv_categories BEFORE INSERT OR UPDATE ON public.bem_aviv_categories
FOR EACH ROW EXECUTE FUNCTION public.tg_uppercase_text_fields();

DROP TRIGGER IF EXISTS trg_upper_bem_aviv_price_tables ON public.bem_aviv_price_tables;
CREATE TRIGGER trg_upper_bem_aviv_price_tables BEFORE INSERT OR UPDATE ON public.bem_aviv_price_tables
FOR EACH ROW EXECUTE FUNCTION public.tg_uppercase_text_fields();
