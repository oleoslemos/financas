-- ============================================================
-- Migration: Tabela de Preços Compartilhada e Global (Multi-Empresa)
-- A tabela de preços é ÚNICA e CENTRALIZADA: todas as empresas
-- cadastradas no sistema consomem diretamente a mesma tabela de preços,
-- sem divisão ou filtro por empresa_id.
-- ============================================================

-- 1. Se a coluna empresa_id foi criada anteriormente, removemos para manter a tabela 100% global
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'v2_tabelas_preco'
      AND column_name  = 'empresa_id'
  ) THEN
    ALTER TABLE public.v2_tabelas_preco DROP COLUMN empresa_id CASCADE;
  END IF;
END $$;

-- 2. Garantir que a tabela v2_tabelas_preco existe com todas as colunas necessárias
CREATE TABLE IF NOT EXISTS public.v2_tabelas_preco (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  reajuste_percent NUMERIC DEFAULT 0,
  valor_ponto NUMERIC DEFAULT 0,
  items JSONB DEFAULT '[]'::jsonb,
  active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Habilitar RLS e garantir acesso irrestrito para leitura/consumo por todas as empresas
ALTER TABLE public.v2_tabelas_preco ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura publica global de tabelas de preco" ON public.v2_tabelas_preco;
CREATE POLICY "Permitir leitura publica global de tabelas de preco"
  ON public.v2_tabelas_preco
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Permitir gravacao em tabelas de preco" ON public.v2_tabelas_preco;
CREATE POLICY "Permitir gravacao em tabelas de preco"
  ON public.v2_tabelas_preco
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
