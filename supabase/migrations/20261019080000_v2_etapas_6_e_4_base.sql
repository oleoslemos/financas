-- Migração para V2: Etapa 6 (Configurações, Papéis, Regras Comerciais, Auditoria) e Etapa 4 (Estoque com Físico, Reservado, Disponível e Mínimo)

-- 1. Tabela de Regras Comerciais
CREATE TABLE IF NOT EXISTS public.v2_regras_comerciais (
  id TEXT PRIMARY KEY DEFAULT 'global_config',
  margem_minima NUMERIC DEFAULT 20.0,
  validade_proposta_dias INTEGER DEFAULT 7,
  forma_pagamento_padrao TEXT DEFAULT 'Pix',
  reservar_estoque_aprovacao BOOLEAN DEFAULT TRUE,
  exigir_assinatura_cliente BOOLEAN DEFAULT FALSE,
  permitir_estoque_insuficiente BOOLEAN DEFAULT TRUE,
  gerar_contas_receber_ao_aprovar BOOLEAN DEFAULT TRUE,
  adiantamento_ja_baixado BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.v2_regras_comerciais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acesso total em v2_regras_comerciais" ON public.v2_regras_comerciais;
CREATE POLICY "Permitir acesso total em v2_regras_comerciais" ON public.v2_regras_comerciais FOR ALL TO public USING (true) WITH CHECK (true);

-- Inserir registro padrão se não existir
INSERT INTO public.v2_regras_comerciais (id, margem_minima, validade_proposta_dias, forma_pagamento_padrao, reservar_estoque_aprovacao, exigir_assinatura_cliente, permitir_estoque_insuficiente, gerar_contas_receber_ao_aprovar, adiantamento_ja_baixado)
VALUES ('global_config', 20.0, 7, 'Pix', TRUE, FALSE, TRUE, TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- 2. Tabela de Papéis e Permissões
CREATE TABLE IF NOT EXISTS public.v2_papeis_permissoes (
  id TEXT PRIMARY KEY, -- 'administrador', 'vendedor', 'financeiro', 'estoque'
  nome TEXT NOT NULL,
  descricao TEXT,
  modulos JSONB NOT NULL DEFAULT '{}'::jsonb,
  permissoes_especiais JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.v2_papeis_permissoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acesso total em v2_papeis_permissoes" ON public.v2_papeis_permissoes;
CREATE POLICY "Permitir acesso total em v2_papeis_permissoes" ON public.v2_papeis_permissoes FOR ALL TO public USING (true) WITH CHECK (true);

-- Adicionar coluna role na tabela v2_users se ainda não existir
ALTER TABLE public.v2_users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'vendedor';

-- 3. Tabela de Auditoria (histórico somente leitura)
CREATE TABLE IF NOT EXISTS public.v2_auditoria (
  id TEXT PRIMARY KEY,
  data_hora TIMESTAMPTZ DEFAULT now(),
  usuario_nome TEXT NOT NULL,
  area TEXT NOT NULL, -- 'Venda', 'Desconto', 'Estoque', 'Financeiro', 'Permissão', 'Sistema'
  objeto TEXT NOT NULL,
  o_que_mudou TEXT NOT NULL,
  detalhe JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.v2_auditoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acesso total em v2_auditoria" ON public.v2_auditoria;
CREATE POLICY "Permitir acesso total em v2_auditoria" ON public.v2_auditoria FOR ALL TO public USING (true) WITH CHECK (true);

-- 4. Melhorias na tabela v2_estoque_movimentacoes
ALTER TABLE public.v2_estoque_movimentacoes ADD COLUMN IF NOT EXISTS usuario_nome TEXT;
ALTER TABLE public.v2_estoque_movimentacoes ADD COLUMN IF NOT EXISTS motivo TEXT;
ALTER TABLE public.v2_estoque_movimentacoes ADD COLUMN IF NOT EXISTS observacao TEXT;
ALTER TABLE public.v2_estoque_movimentacoes ADD COLUMN IF NOT EXISTS detalhes JSONB DEFAULT '{}'::jsonb;

-- 5. Tabela de Estoque Mínimo e Configuração de Produtos
CREATE TABLE IF NOT EXISTS public.v2_estoque_minimos (
  produto_id TEXT PRIMARY KEY,
  estoque_minimo NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.v2_estoque_minimos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acesso total em v2_estoque_minimos" ON public.v2_estoque_minimos;
CREATE POLICY "Permitir acesso total em v2_estoque_minimos" ON public.v2_estoque_minimos FOR ALL TO public USING (true) WITH CHECK (true);
