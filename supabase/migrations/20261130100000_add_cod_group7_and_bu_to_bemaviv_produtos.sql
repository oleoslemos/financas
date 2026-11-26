-- Migration: Adicionar colunas cod_group7 e bu na tabela bemaviv_produtos (e fallback v2_produtos)
-- Permite controle de código Group7 e Unidade de Negócio (BU) no catálogo de produtos

DO $$
BEGIN
  -- 1. Tabela principal: bemaviv_produtos
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bemaviv_produtos') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bemaviv_produtos' AND column_name = 'cod_group7') THEN
      ALTER TABLE public.bemaviv_produtos ADD COLUMN cod_group7 TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bemaviv_produtos' AND column_name = 'bu') THEN
      ALTER TABLE public.bemaviv_produtos ADD COLUMN bu TEXT;
    END IF;
  END IF;

  -- 2. Tabela legada: v2_produtos (caso exista em algum ambiente ainda não renomeado)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'v2_produtos') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'v2_produtos' AND column_name = 'cod_group7') THEN
      ALTER TABLE public.v2_produtos ADD COLUMN cod_group7 TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'v2_produtos' AND column_name = 'bu') THEN
      ALTER TABLE public.v2_produtos ADD COLUMN bu TEXT;
    END IF;
  END IF;
END $$;

-- Índices opcionais para acelerar buscas por cod_group7 e bu
CREATE INDEX IF NOT EXISTS idx_bemaviv_produtos_cod_group7 ON public.bemaviv_produtos (cod_group7);
CREATE INDEX IF NOT EXISTS idx_bemaviv_produtos_bu ON public.bemaviv_produtos (bu);
