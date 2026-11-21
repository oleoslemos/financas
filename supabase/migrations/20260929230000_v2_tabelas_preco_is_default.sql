-- Migration to ensure is_default column on v2_tabelas_preco
CREATE TABLE IF NOT EXISTS public.v2_tabelas_preco (
  id text PRIMARY KEY,
  name text NOT NULL,
  reajuste_percent numeric DEFAULT 0,
  items jsonb DEFAULT '[]'::jsonb,
  active boolean DEFAULT true,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'v2_tabelas_preco'
      AND column_name = 'is_default'
  ) THEN
    ALTER TABLE public.v2_tabelas_preco ADD COLUMN is_default boolean DEFAULT false;
  END IF;
END $$;
