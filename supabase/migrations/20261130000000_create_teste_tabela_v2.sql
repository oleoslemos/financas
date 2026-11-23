-- Migration: create teste_tabela_v2
-- Executar via supabase db push ou supabase migration up
CREATE TABLE IF NOT EXISTS public.teste_tabela_v2 (
    id            TEXT PRIMARY KEY,
    sku           TEXT NOT NULL,
    nome          TEXT,
    linha_produto TEXT,
    valor_fabrica NUMERIC,
    valor_venda   NUMERIC,
    versao        TEXT DEFAULT 'REV06/2026',
    ativa         BOOLEAN DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Índices auxiliares
CREATE INDEX IF NOT EXISTS idx_teste_tabela_v2_sku ON public.teste_tabela_v2 (sku);
CREATE INDEX IF NOT EXISTS idx_teste_tabela_v2_ativa ON public.teste_tabela_v2 (ativa);
