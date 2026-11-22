-- ============================================================
-- Migration: Criação da tabela bemaviv_tabela_preco
-- Tabela dedicada e centralizada para gestão de preços.
-- Os campos serão refinados e expandidos no decorrer da codificação.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bemaviv_tabela_preco (
  id               TEXT PRIMARY KEY,
  nome             TEXT,
  name             TEXT,
  descricao        TEXT,
  reajuste_percent NUMERIC DEFAULT 0,
  valor_ponto      NUMERIC DEFAULT 0,
  items            JSONB DEFAULT '[]'::jsonb,
  ativa            BOOLEAN DEFAULT true,
  active           BOOLEAN DEFAULT true,
  is_default       BOOLEAN DEFAULT false,
  metadata         JSONB DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.bemaviv_tabela_preco ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso público para operações completas
DROP POLICY IF EXISTS "Permitir leitura total em bemaviv_tabela_preco" ON public.bemaviv_tabela_preco;
CREATE POLICY "Permitir leitura total em bemaviv_tabela_preco"
  ON public.bemaviv_tabela_preco
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Permitir insercao em bemaviv_tabela_preco" ON public.bemaviv_tabela_preco;
CREATE POLICY "Permitir insercao em bemaviv_tabela_preco"
  ON public.bemaviv_tabela_preco
  FOR INSERT
  TO public
  WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir atualizacao em bemaviv_tabela_preco" ON public.bemaviv_tabela_preco;
CREATE POLICY "Permitir atualizacao em bemaviv_tabela_preco"
  ON public.bemaviv_tabela_preco
  FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir exclusao em bemaviv_tabela_preco" ON public.bemaviv_tabela_preco;
CREATE POLICY "Permitir exclusao em bemaviv_tabela_preco"
  ON public.bemaviv_tabela_preco
  FOR DELETE
  TO public
  USING (true);

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_bemaviv_tabela_preco_is_default ON public.bemaviv_tabela_preco (is_default);
CREATE INDEX IF NOT EXISTS idx_bemaviv_tabela_preco_ativa ON public.bemaviv_tabela_preco (ativa);
