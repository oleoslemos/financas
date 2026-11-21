-- BEM AVIV: tabela padrão + suporte a múltiplas versões de preço por produto.

ALTER TABLE public.bem_aviv_price_tables
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- Garante no máximo uma tabela padrão por usuário.
CREATE UNIQUE INDEX IF NOT EXISTS bem_aviv_price_tables_one_default_per_user_idx
  ON public.bem_aviv_price_tables (user_id)
  WHERE is_default;

-- Permite o mesmo produto em tabelas diferentes.
ALTER TABLE public.bem_aviv_price_table_items
  DROP CONSTRAINT IF EXISTS bem_aviv_price_table_items_product_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bem_aviv_price_table_items_price_table_product_key'
  ) THEN
    ALTER TABLE public.bem_aviv_price_table_items
      ADD CONSTRAINT bem_aviv_price_table_items_price_table_product_key
      UNIQUE (price_table_id, product_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS bem_aviv_price_table_items_product_idx
  ON public.bem_aviv_price_table_items (product_id);
