-- Multi-empresa (Bem Aviv / ComfortCare), RLS por empresa e catálogo compartilhado com papéis.

-- ---------------------------------------------------------------------------
-- Helpers JWT (Clerk → Supabase): inclua o e-mail no token de sessão no Clerk
-- (Session token → claims) para que auth_jwt_email_lower() funcione.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_jwt_email_lower()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(
    trim(lower(coalesce(
      auth.jwt()->>'email',
      auth.jwt()->>'primary_email_address',
      auth.jwt() #>> '{primary_email_address,email_address}'
    ))),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.is_catalog_full_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.auth_jwt_email_lower() = 'leoslemos@gmail.com';
$$;

-- ---------------------------------------------------------------------------
-- Empresas e membros (por e-mail; alinhar claims do Clerk)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  trade_name text NOT NULL,
  legal_name text,
  tax_id text,
  phone text,
  email_contact text,
  address_street text,
  address_city text,
  address_state text,
  zip_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS companies_slug_idx ON public.companies (slug);

CREATE TABLE IF NOT EXISTS public.company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS company_members_company_email_uidx
  ON public.company_members (company_id, (lower(trim(email))));

CREATE INDEX IF NOT EXISTS company_members_email_lower_idx
  ON public.company_members (lower(trim(email)));

CREATE OR REPLACE FUNCTION public.bem_aviv_user_company_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
AS $$
  SELECT cm.company_id
  FROM public.company_members cm
  WHERE lower(trim(cm.email)) = coalesce(public.auth_jwt_email_lower(), '');
$$;

CREATE OR REPLACE FUNCTION public.bem_aviv_user_in_company(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = p_company_id
      AND lower(trim(cm.email)) = coalesce(public.auth_jwt_email_lower(), '')
  );
$$;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS companies_select_member ON public.companies;
CREATE POLICY companies_select_member ON public.companies
  FOR SELECT
  USING (id IN (SELECT public.bem_aviv_user_company_ids()));

DROP POLICY IF EXISTS companies_update_member ON public.companies;
CREATE POLICY companies_update_member ON public.companies
  FOR UPDATE
  USING (id IN (SELECT public.bem_aviv_user_company_ids()))
  WITH CHECK (id IN (SELECT public.bem_aviv_user_company_ids()));

DROP POLICY IF EXISTS company_members_select_self ON public.company_members;
CREATE POLICY company_members_select_self ON public.company_members
  FOR SELECT
  USING (lower(trim(email)) = coalesce(public.auth_jwt_email_lower(), ''));

-- ---------------------------------------------------------------------------
-- IDs fixos (seed) — migração de dados legados para empresa 1
-- ---------------------------------------------------------------------------

INSERT INTO public.companies (
  id, slug, trade_name, legal_name, tax_id, phone, email_contact,
  address_street, address_city, address_state, zip_code
)
VALUES
  (
    '10000000-0000-4000-8000-000000000001',
    'bem-aviv',
    'Bem Aviv (EKO''7)',
    'Bem Aviv Comércio de Colchões Ltda (fictício)',
    '12.345.678/0001-90',
    '(48) 3333-0001',
    'contato@bemaviv.com.br',
    'Rua das Palmeiras, 100',
    'Florianópolis',
    'SC',
    '88000-000'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'comfortcare',
    'ComfortCare',
    'ComfortCare Floripa Serviços Ltda (fictício)',
    '98.765.432/0001-10',
    '(48) 3333-0002',
    'contato@comfortcare.com.br',
    'Av. Beira-Mar, 200',
    'Florianópolis',
    'SC',
    '88001-000'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.company_members (company_id, email)
SELECT v.company_id, v.email
FROM (
  VALUES
    ('10000000-0000-4000-8000-000000000001'::uuid, 'leoslemos@gmail.com'),
    ('10000000-0000-4000-8000-000000000001'::uuid, 'suelenjalves@gmail.com'),
    ('10000000-0000-4000-8000-000000000002'::uuid, 'leoslemos@gmail.com'),
    ('10000000-0000-4000-8000-000000000002'::uuid, 'comfortcarefloripa@gmail.com')
) AS v(company_id, email)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.company_members cm
  WHERE cm.company_id = v.company_id
    AND lower(trim(cm.email)) = lower(trim(v.email))
);

-- ---------------------------------------------------------------------------
-- company_id em dados comerciais por empresa
-- ---------------------------------------------------------------------------

ALTER TABLE public.bem_aviv_clients
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies (id);

UPDATE public.bem_aviv_clients
SET company_id = '10000000-0000-4000-8000-000000000001'
WHERE company_id IS NULL;

ALTER TABLE public.bem_aviv_clients
  ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE public.bem_aviv_sales_orders
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies (id);

UPDATE public.bem_aviv_sales_orders o
SET company_id = c.company_id
FROM public.bem_aviv_clients c
WHERE o.company_id IS NULL
  AND o.client_id = c.id;

UPDATE public.bem_aviv_sales_orders
SET company_id = '10000000-0000-4000-8000-000000000001'
WHERE company_id IS NULL;

ALTER TABLE public.bem_aviv_sales_orders
  ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE public.bem_aviv_client_followups
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies (id);

UPDATE public.bem_aviv_client_followups f
SET company_id = c.company_id
FROM public.bem_aviv_clients c
WHERE f.company_id IS NULL
  AND f.client_id = c.id;

UPDATE public.bem_aviv_client_followups
SET company_id = '10000000-0000-4000-8000-000000000001'
WHERE company_id IS NULL;

ALTER TABLE public.bem_aviv_client_followups
  ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE public.bem_aviv_sales_order_counters
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies (id);

UPDATE public.bem_aviv_sales_order_counters
SET company_id = '10000000-0000-4000-8000-000000000001'
WHERE company_id IS NULL;

ALTER TABLE public.bem_aviv_sales_order_counters
  ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE public.bem_aviv_sales_order_counters
  DROP CONSTRAINT IF EXISTS bem_aviv_sales_order_counters_user_id_document_type_period_yyyymm_key;

CREATE UNIQUE INDEX IF NOT EXISTS bem_aviv_sales_order_counters_user_company_period_uidx
  ON public.bem_aviv_sales_order_counters (user_id, company_id, document_type, period_yyyymm);

DROP INDEX IF EXISTS bem_aviv_sales_orders_document_number_idx;

CREATE UNIQUE INDEX IF NOT EXISTS bem_aviv_sales_orders_company_document_number_uidx
  ON public.bem_aviv_sales_orders (company_id, document_number);

-- ---------------------------------------------------------------------------
-- Numeração de pedidos/orçamentos por empresa
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bem_aviv_next_document_number(
  p_user_id text,
  p_company_id uuid,
  p_document_type text,
  p_order_date date
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_period text;
  v_prefix text;
  v_next integer;
BEGIN
  v_period := to_char(coalesce(p_order_date, current_date), 'YYYYMM');
  v_prefix := CASE
    WHEN upper(coalesce(p_document_type, 'PEDIDO')) = 'ORCAMENTO' THEN 'ORC'
    ELSE 'PED'
  END;

  INSERT INTO public.bem_aviv_sales_order_counters (user_id, company_id, document_type, period_yyyymm, last_value, updated_at)
  VALUES (p_user_id, p_company_id, upper(coalesce(p_document_type, 'PEDIDO')), v_period, 1, now())
  ON CONFLICT (user_id, company_id, document_type, period_yyyymm)
  DO UPDATE SET
    last_value = public.bem_aviv_sales_order_counters.last_value + 1,
    updated_at = now()
  RETURNING last_value INTO v_next;

  RETURN v_prefix || '-' || v_period || '-' || lpad(v_next::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_bem_aviv_sales_orders_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.document_type := upper(coalesce(NEW.document_type, 'PEDIDO'));

  IF NEW.client_id IS NOT NULL THEN
    SELECT c.company_id
    INTO NEW.company_id
    FROM public.bem_aviv_clients c
    WHERE c.id = NEW.client_id;
  END IF;

  IF NEW.document_number IS NULL OR btrim(NEW.document_number) = '' THEN
    NEW.document_number := public.bem_aviv_next_document_number(
      NEW.user_id,
      NEW.company_id,
      NEW.document_type,
      NEW.order_date
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_bem_aviv_followups_set_company()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.client_id IS NOT NULL THEN
    SELECT c.company_id
    INTO NEW.company_id
    FROM public.bem_aviv_clients c
    WHERE c.id = NEW.client_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bem_aviv_followups_set_company ON public.bem_aviv_client_followups;
CREATE TRIGGER trg_bem_aviv_followups_set_company
BEFORE INSERT OR UPDATE OF client_id ON public.bem_aviv_client_followups
FOR EACH ROW
EXECUTE FUNCTION public.tg_bem_aviv_followups_set_company();

-- ---------------------------------------------------------------------------
-- RLS — dados por empresa
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS bem_aviv_clients_all ON public.bem_aviv_clients;
CREATE POLICY bem_aviv_clients_select ON public.bem_aviv_clients
  FOR SELECT USING (public.bem_aviv_user_in_company(company_id));
CREATE POLICY bem_aviv_clients_insert ON public.bem_aviv_clients
  FOR INSERT WITH CHECK (public.bem_aviv_user_in_company(company_id));
CREATE POLICY bem_aviv_clients_update ON public.bem_aviv_clients
  FOR UPDATE
  USING (public.bem_aviv_user_in_company(company_id))
  WITH CHECK (public.bem_aviv_user_in_company(company_id));
CREATE POLICY bem_aviv_clients_delete ON public.bem_aviv_clients
  FOR DELETE USING (public.bem_aviv_user_in_company(company_id));

DROP POLICY IF EXISTS bem_aviv_sales_orders_all ON public.bem_aviv_sales_orders;
CREATE POLICY bem_aviv_sales_orders_select ON public.bem_aviv_sales_orders
  FOR SELECT USING (public.bem_aviv_user_in_company(company_id));
CREATE POLICY bem_aviv_sales_orders_insert ON public.bem_aviv_sales_orders
  FOR INSERT WITH CHECK (public.bem_aviv_user_in_company(company_id));
CREATE POLICY bem_aviv_sales_orders_update ON public.bem_aviv_sales_orders
  FOR UPDATE
  USING (public.bem_aviv_user_in_company(company_id))
  WITH CHECK (public.bem_aviv_user_in_company(company_id));
CREATE POLICY bem_aviv_sales_orders_delete ON public.bem_aviv_sales_orders
  FOR DELETE USING (public.bem_aviv_user_in_company(company_id));

DROP POLICY IF EXISTS bem_aviv_client_followups_all ON public.bem_aviv_client_followups;
CREATE POLICY bem_aviv_client_followups_select ON public.bem_aviv_client_followups
  FOR SELECT USING (public.bem_aviv_user_in_company(company_id));
CREATE POLICY bem_aviv_client_followups_insert ON public.bem_aviv_client_followups
  FOR INSERT WITH CHECK (public.bem_aviv_user_in_company(company_id));
CREATE POLICY bem_aviv_client_followups_update ON public.bem_aviv_client_followups
  FOR UPDATE
  USING (public.bem_aviv_user_in_company(company_id))
  WITH CHECK (public.bem_aviv_user_in_company(company_id));
CREATE POLICY bem_aviv_client_followups_delete ON public.bem_aviv_client_followups
  FOR DELETE USING (public.bem_aviv_user_in_company(company_id));

DROP POLICY IF EXISTS bem_aviv_sales_order_counters_all ON public.bem_aviv_sales_order_counters;
CREATE POLICY bem_aviv_sales_order_counters_select ON public.bem_aviv_sales_order_counters
  FOR SELECT USING (public.bem_aviv_user_in_company(company_id));
CREATE POLICY bem_aviv_sales_order_counters_insert ON public.bem_aviv_sales_order_counters
  FOR INSERT WITH CHECK (public.bem_aviv_user_in_company(company_id));
CREATE POLICY bem_aviv_sales_order_counters_update ON public.bem_aviv_sales_order_counters
  FOR UPDATE
  USING (public.bem_aviv_user_in_company(company_id))
  WITH CHECK (public.bem_aviv_user_in_company(company_id));
CREATE POLICY bem_aviv_sales_order_counters_delete ON public.bem_aviv_sales_order_counters
  FOR DELETE USING (public.bem_aviv_user_in_company(company_id));

DROP POLICY IF EXISTS bem_aviv_sales_order_items_all ON public.bem_aviv_sales_order_items;
CREATE POLICY bem_aviv_sales_order_items_select ON public.bem_aviv_sales_order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.bem_aviv_sales_orders o
      WHERE o.id = sales_order_id
        AND public.bem_aviv_user_in_company(o.company_id)
    )
  );
CREATE POLICY bem_aviv_sales_order_items_insert ON public.bem_aviv_sales_order_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.bem_aviv_sales_orders o
      WHERE o.id = sales_order_id
        AND public.bem_aviv_user_in_company(o.company_id)
    )
  );
CREATE POLICY bem_aviv_sales_order_items_update ON public.bem_aviv_sales_order_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.bem_aviv_sales_orders o
      WHERE o.id = sales_order_id
        AND public.bem_aviv_user_in_company(o.company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.bem_aviv_sales_orders o
      WHERE o.id = sales_order_id
        AND public.bem_aviv_user_in_company(o.company_id)
    )
  );
CREATE POLICY bem_aviv_sales_order_items_delete ON public.bem_aviv_sales_order_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM public.bem_aviv_sales_orders o
      WHERE o.id = sales_order_id
        AND public.bem_aviv_user_in_company(o.company_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Catálogo compartilhado: leitura para autenticados; escrita conforme papel
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tg_bem_aviv_products_guard_catalog()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_catalog_full_admin() THEN
      RAISE EXCEPTION 'Apenas o administrador do catálogo pode incluir produtos.';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF public.is_catalog_full_admin() THEN
      RETURN NEW;
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.category IS DISTINCT FROM OLD.category
      OR NEW.name IS DISTINCT FROM OLD.name
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.product_line IS DISTINCT FROM OLD.product_line
      OR NEW.model IS DISTINCT FROM OLD.model
      OR NEW.dim_width_cm IS DISTINCT FROM OLD.dim_width_cm
      OR NEW.dim_length_cm IS DISTINCT FROM OLD.dim_length_cm
      OR NEW.dim_height_cm IS DISTINCT FROM OLD.dim_height_cm
      OR NEW.price_table_id IS DISTINCT FROM OLD.price_table_id
    THEN
      RAISE EXCEPTION 'Alteração permitida apenas no preço de venda (campo price).';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF NOT public.is_catalog_full_admin() THEN
      RAISE EXCEPTION 'Apenas o administrador do catálogo pode excluir produtos.';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bem_aviv_products_guard_catalog ON public.bem_aviv_products;
CREATE TRIGGER trg_bem_aviv_products_guard_catalog
BEFORE INSERT OR UPDATE OR DELETE ON public.bem_aviv_products
FOR EACH ROW
EXECUTE FUNCTION public.tg_bem_aviv_products_guard_catalog();

CREATE OR REPLACE FUNCTION public.tg_bem_aviv_price_table_items_guard_price()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_catalog_full_admin() THEN
      RAISE EXCEPTION 'Apenas o administrador do catálogo pode incluir itens de tabela de preço.';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF public.is_catalog_full_admin() THEN
      RETURN NEW;
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.price_table_id IS DISTINCT FROM OLD.price_table_id
      OR NEW.product_id IS DISTINCT FROM OLD.product_id
      OR NEW.line_description IS DISTINCT FROM OLD.line_description
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Alteração permitida apenas no preço (campo price).';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF NOT public.is_catalog_full_admin() THEN
      RAISE EXCEPTION 'Apenas o administrador do catálogo pode excluir itens de tabela de preço.';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bem_aviv_price_table_items_guard_price ON public.bem_aviv_price_table_items;
CREATE TRIGGER trg_bem_aviv_price_table_items_guard_price
BEFORE INSERT OR UPDATE OR DELETE ON public.bem_aviv_price_table_items
FOR EACH ROW
EXECUTE FUNCTION public.tg_bem_aviv_price_table_items_guard_price();

CREATE OR REPLACE FUNCTION public.tg_bem_aviv_offer_price_table_items_guard_price()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_catalog_full_admin() THEN
      RAISE EXCEPTION 'Apenas o administrador do catálogo pode incluir preços de oferta.';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF public.is_catalog_full_admin() THEN
      RETURN NEW;
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.price_table_id IS DISTINCT FROM OLD.price_table_id
      OR NEW.offer_product_id IS DISTINCT FROM OLD.offer_product_id
      OR NEW.variation_code IS DISTINCT FROM OLD.variation_code
      OR NEW.line_description IS DISTINCT FROM OLD.line_description
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Alteração permitida apenas no preço (campo price).';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF NOT public.is_catalog_full_admin() THEN
      RAISE EXCEPTION 'Apenas o administrador do catálogo pode excluir preços de oferta.';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bem_aviv_offer_price_table_items_guard_price ON public.bem_aviv_offer_price_table_items;
CREATE TRIGGER trg_bem_aviv_offer_price_table_items_guard_price
BEFORE INSERT OR UPDATE OR DELETE ON public.bem_aviv_offer_price_table_items
FOR EACH ROW
EXECUTE FUNCTION public.tg_bem_aviv_offer_price_table_items_guard_price();

CREATE OR REPLACE FUNCTION public.tg_bem_aviv_catalog_price_cells_guard_price()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_catalog_full_admin() THEN
      RAISE EXCEPTION 'Apenas o administrador do catálogo pode incluir células de preço.';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF public.is_catalog_full_admin() THEN
      RETURN NEW;
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.catalog_product_id IS DISTINCT FROM OLD.catalog_product_id
      OR NEW.row_value_id IS DISTINCT FROM OLD.row_value_id
      OR NEW.col_value_id IS DISTINCT FROM OLD.col_value_id
      OR NEW.active IS DISTINCT FROM OLD.active
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Alteração permitida apenas no preço (campo price).';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF NOT public.is_catalog_full_admin() THEN
      RAISE EXCEPTION 'Apenas o administrador do catálogo pode excluir células de preço.';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bem_aviv_catalog_price_cells_guard_price ON public.bem_aviv_catalog_price_cells;
CREATE TRIGGER trg_bem_aviv_catalog_price_cells_guard_price
BEFORE INSERT OR UPDATE OR DELETE ON public.bem_aviv_catalog_price_cells
FOR EACH ROW
EXECUTE FUNCTION public.tg_bem_aviv_catalog_price_cells_guard_price();

CREATE OR REPLACE FUNCTION public.tg_bem_aviv_catalog_addons_guard_price()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_catalog_full_admin() THEN
      RAISE EXCEPTION 'Apenas o administrador do catálogo pode incluir adicionais.';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF public.is_catalog_full_admin() THEN
      RETURN NEW;
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.catalog_product_id IS DISTINCT FROM OLD.catalog_product_id
      OR NEW.name IS DISTINCT FROM OLD.name
      OR NEW.is_per_item IS DISTINCT FROM OLD.is_per_item
      OR NEW.active IS DISTINCT FROM OLD.active
      OR NEW.sort_order IS DISTINCT FROM OLD.sort_order
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Alteração permitida apenas no preço (campo price).';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF NOT public.is_catalog_full_admin() THEN
      RAISE EXCEPTION 'Apenas o administrador do catálogo pode excluir adicionais.';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bem_aviv_catalog_addons_guard_price ON public.bem_aviv_catalog_addons;
CREATE TRIGGER trg_bem_aviv_catalog_addons_guard_price
BEFORE INSERT OR UPDATE OR DELETE ON public.bem_aviv_catalog_addons
FOR EACH ROW
EXECUTE FUNCTION public.tg_bem_aviv_catalog_addons_guard_price();

-- Políticas catálogo (RLS + triggers acima)
DROP POLICY IF EXISTS bem_aviv_products_all ON public.bem_aviv_products;
CREATE POLICY bem_aviv_products_select ON public.bem_aviv_products FOR SELECT TO authenticated USING (true);
CREATE POLICY bem_aviv_products_write ON public.bem_aviv_products FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS bem_aviv_categories_all ON public.bem_aviv_categories;
CREATE POLICY bem_aviv_categories_select ON public.bem_aviv_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY bem_aviv_categories_insert ON public.bem_aviv_categories FOR INSERT TO authenticated
  WITH CHECK (public.is_catalog_full_admin());
CREATE POLICY bem_aviv_categories_update ON public.bem_aviv_categories FOR UPDATE TO authenticated
  USING (public.is_catalog_full_admin())
  WITH CHECK (public.is_catalog_full_admin());
CREATE POLICY bem_aviv_categories_delete ON public.bem_aviv_categories FOR DELETE TO authenticated
  USING (public.is_catalog_full_admin());

DROP POLICY IF EXISTS bem_aviv_price_tables_all ON public.bem_aviv_price_tables;
CREATE POLICY bem_aviv_price_tables_select ON public.bem_aviv_price_tables FOR SELECT TO authenticated USING (true);
CREATE POLICY bem_aviv_price_tables_insert ON public.bem_aviv_price_tables FOR INSERT TO authenticated
  WITH CHECK (public.is_catalog_full_admin());
CREATE POLICY bem_aviv_price_tables_update ON public.bem_aviv_price_tables FOR UPDATE TO authenticated
  USING (public.is_catalog_full_admin())
  WITH CHECK (public.is_catalog_full_admin());
CREATE POLICY bem_aviv_price_tables_delete ON public.bem_aviv_price_tables FOR DELETE TO authenticated
  USING (public.is_catalog_full_admin());

DROP POLICY IF EXISTS bem_aviv_price_table_items_all ON public.bem_aviv_price_table_items;
CREATE POLICY bem_aviv_price_table_items_select ON public.bem_aviv_price_table_items FOR SELECT TO authenticated USING (true);
CREATE POLICY bem_aviv_price_table_items_write ON public.bem_aviv_price_table_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS bem_aviv_offer_price_tables_all ON public.bem_aviv_offer_price_tables;
CREATE POLICY bem_aviv_offer_price_tables_select ON public.bem_aviv_offer_price_tables FOR SELECT TO authenticated USING (true);
CREATE POLICY bem_aviv_offer_price_tables_insert ON public.bem_aviv_offer_price_tables FOR INSERT TO authenticated
  WITH CHECK (public.is_catalog_full_admin());
CREATE POLICY bem_aviv_offer_price_tables_update ON public.bem_aviv_offer_price_tables FOR UPDATE TO authenticated
  USING (public.is_catalog_full_admin())
  WITH CHECK (public.is_catalog_full_admin());
CREATE POLICY bem_aviv_offer_price_tables_delete ON public.bem_aviv_offer_price_tables FOR DELETE TO authenticated
  USING (public.is_catalog_full_admin());

DROP POLICY IF EXISTS bem_aviv_offer_price_table_items_all ON public.bem_aviv_offer_price_table_items;
CREATE POLICY bem_aviv_offer_price_table_items_select ON public.bem_aviv_offer_price_table_items FOR SELECT TO authenticated USING (true);
CREATE POLICY bem_aviv_offer_price_table_items_write ON public.bem_aviv_offer_price_table_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS bem_aviv_offer_products_all ON public.bem_aviv_offer_products;
CREATE POLICY bem_aviv_offer_products_select ON public.bem_aviv_offer_products FOR SELECT TO authenticated USING (true);
CREATE POLICY bem_aviv_offer_products_insert ON public.bem_aviv_offer_products FOR INSERT TO authenticated
  WITH CHECK (public.is_catalog_full_admin());
CREATE POLICY bem_aviv_offer_products_update ON public.bem_aviv_offer_products FOR UPDATE TO authenticated
  USING (public.is_catalog_full_admin())
  WITH CHECK (public.is_catalog_full_admin());
CREATE POLICY bem_aviv_offer_products_delete ON public.bem_aviv_offer_products FOR DELETE TO authenticated
  USING (public.is_catalog_full_admin());

DROP POLICY IF EXISTS bem_aviv_price_catalogs_all ON public.bem_aviv_price_catalogs;
CREATE POLICY bem_aviv_price_catalogs_select ON public.bem_aviv_price_catalogs FOR SELECT TO authenticated USING (true);
CREATE POLICY bem_aviv_price_catalogs_insert ON public.bem_aviv_price_catalogs FOR INSERT TO authenticated
  WITH CHECK (public.is_catalog_full_admin());
CREATE POLICY bem_aviv_price_catalogs_update ON public.bem_aviv_price_catalogs FOR UPDATE TO authenticated
  USING (public.is_catalog_full_admin())
  WITH CHECK (public.is_catalog_full_admin());
CREATE POLICY bem_aviv_price_catalogs_delete ON public.bem_aviv_price_catalogs FOR DELETE TO authenticated
  USING (public.is_catalog_full_admin());

DROP POLICY IF EXISTS bem_aviv_catalog_products_all ON public.bem_aviv_catalog_products;
CREATE POLICY bem_aviv_catalog_products_select ON public.bem_aviv_catalog_products FOR SELECT TO authenticated USING (true);
CREATE POLICY bem_aviv_catalog_products_insert ON public.bem_aviv_catalog_products FOR INSERT TO authenticated
  WITH CHECK (public.is_catalog_full_admin());
CREATE POLICY bem_aviv_catalog_products_update ON public.bem_aviv_catalog_products FOR UPDATE TO authenticated
  USING (public.is_catalog_full_admin())
  WITH CHECK (public.is_catalog_full_admin());
CREATE POLICY bem_aviv_catalog_products_delete ON public.bem_aviv_catalog_products FOR DELETE TO authenticated
  USING (public.is_catalog_full_admin());

DROP POLICY IF EXISTS bem_aviv_catalog_axes_all ON public.bem_aviv_catalog_axes;
CREATE POLICY bem_aviv_catalog_axes_select ON public.bem_aviv_catalog_axes FOR SELECT TO authenticated USING (true);
CREATE POLICY bem_aviv_catalog_axes_insert ON public.bem_aviv_catalog_axes FOR INSERT TO authenticated
  WITH CHECK (public.is_catalog_full_admin());
CREATE POLICY bem_aviv_catalog_axes_update ON public.bem_aviv_catalog_axes FOR UPDATE TO authenticated
  USING (public.is_catalog_full_admin())
  WITH CHECK (public.is_catalog_full_admin());
CREATE POLICY bem_aviv_catalog_axes_delete ON public.bem_aviv_catalog_axes FOR DELETE TO authenticated
  USING (public.is_catalog_full_admin());

DROP POLICY IF EXISTS bem_aviv_catalog_axis_values_all ON public.bem_aviv_catalog_axis_values;
CREATE POLICY bem_aviv_catalog_axis_values_select ON public.bem_aviv_catalog_axis_values FOR SELECT TO authenticated USING (true);
CREATE POLICY bem_aviv_catalog_axis_values_insert ON public.bem_aviv_catalog_axis_values FOR INSERT TO authenticated
  WITH CHECK (public.is_catalog_full_admin());
CREATE POLICY bem_aviv_catalog_axis_values_update ON public.bem_aviv_catalog_axis_values FOR UPDATE TO authenticated
  USING (public.is_catalog_full_admin())
  WITH CHECK (public.is_catalog_full_admin());
CREATE POLICY bem_aviv_catalog_axis_values_delete ON public.bem_aviv_catalog_axis_values FOR DELETE TO authenticated
  USING (public.is_catalog_full_admin());

DROP POLICY IF EXISTS bem_aviv_catalog_price_cells_all ON public.bem_aviv_catalog_price_cells;
CREATE POLICY bem_aviv_catalog_price_cells_select ON public.bem_aviv_catalog_price_cells FOR SELECT TO authenticated USING (true);
CREATE POLICY bem_aviv_catalog_price_cells_write ON public.bem_aviv_catalog_price_cells FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS bem_aviv_catalog_addons_all ON public.bem_aviv_catalog_addons;
CREATE POLICY bem_aviv_catalog_addons_select ON public.bem_aviv_catalog_addons FOR SELECT TO authenticated USING (true);
CREATE POLICY bem_aviv_catalog_addons_write ON public.bem_aviv_catalog_addons FOR ALL TO authenticated USING (true) WITH CHECK (true);
