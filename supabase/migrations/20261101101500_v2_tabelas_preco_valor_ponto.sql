-- Migration to add valor_ponto column on v2_tabelas_preco
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'v2_tabelas_preco'
      AND column_name = 'valor_ponto'
  ) THEN
    ALTER TABLE public.v2_tabelas_preco ADD COLUMN valor_ponto numeric DEFAULT 0;
  END IF;
END $$;
