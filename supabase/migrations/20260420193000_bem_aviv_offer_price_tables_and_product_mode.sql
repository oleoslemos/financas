-- BEM AVIV (catálogo): modo de produto (único/grade) + nova estrutura de tabela de preço.

ALTER TABLE public.bem_aviv_offer_products
  ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'UNICO',
  ADD COLUMN IF NOT EXISTS price_table_id uuid;

ALTER TABLE public.bem_aviv_offer_products
  DROP CONSTRAINT IF EXISTS bem_aviv_offer_products_pricing_mode_check;

ALTER TABLE public.bem_aviv_offer_products
  ADD CONSTRAINT bem_aviv_offer_products_pricing_mode_check
  CHECK (pricing_mode IN ('UNICO', 'GRADE'));

CREATE TABLE IF NOT EXISTS public.bem_aviv_offer_price_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bem_aviv_offer_price_tables_one_default_per_user_idx
  ON public.bem_aviv_offer_price_tables (user_id)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS bem_aviv_offer_price_tables_user_id_idx
  ON public.bem_aviv_offer_price_tables (user_id);

ALTER TABLE public.bem_aviv_offer_products
  DROP CONSTRAINT IF EXISTS bem_aviv_offer_products_price_table_id_fkey;

ALTER TABLE public.bem_aviv_offer_products
  ADD CONSTRAINT bem_aviv_offer_products_price_table_id_fkey
  FOREIGN KEY (price_table_id)
  REFERENCES public.bem_aviv_offer_price_tables (id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bem_aviv_offer_products_price_table_idx
  ON public.bem_aviv_offer_products (price_table_id);

CREATE TABLE IF NOT EXISTS public.bem_aviv_offer_price_table_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  price_table_id uuid NOT NULL REFERENCES public.bem_aviv_offer_price_tables (id) ON DELETE CASCADE,
  offer_product_id uuid NOT NULL REFERENCES public.bem_aviv_offer_products (id) ON DELETE CASCADE,
  variation_code text NOT NULL,
  line_description text NOT NULL,
  price numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (price_table_id, offer_product_id, variation_code)
);

CREATE INDEX IF NOT EXISTS bem_aviv_offer_price_table_items_table_idx
  ON public.bem_aviv_offer_price_table_items (price_table_id);

CREATE INDEX IF NOT EXISTS bem_aviv_offer_price_table_items_product_idx
  ON public.bem_aviv_offer_price_table_items (offer_product_id);

ALTER TABLE public.bem_aviv_offer_price_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bem_aviv_offer_price_table_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bem_aviv_offer_price_tables_all ON public.bem_aviv_offer_price_tables;
CREATE POLICY bem_aviv_offer_price_tables_all ON public.bem_aviv_offer_price_tables
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS bem_aviv_offer_price_table_items_all ON public.bem_aviv_offer_price_table_items;
CREATE POLICY bem_aviv_offer_price_table_items_all ON public.bem_aviv_offer_price_table_items
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
