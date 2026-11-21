-- Migration: 20261111150000_v2_melhorias_e_regras_orcamento.sql
-- Melhorias estruturais da V2 e suporte ao Módulo Orçamento Mobile

BEGIN;

-- 1. Garantir unicidade da tabela de preço padrão ativa (B4)
CREATE UNIQUE INDEX IF NOT EXISTS v2_tabelas_preco_one_default_uq
  ON public.v2_tabelas_preco (is_default)
  WHERE is_default;

-- 2. Parâmetros de desconto comercial em v2_regras_comerciais (B2)
ALTER TABLE public.v2_regras_comerciais
  ADD COLUMN IF NOT EXISTS desconto_5x_percentual NUMERIC DEFAULT 5.0,
  ADD COLUMN IF NOT EXISTS desconto_vista_percentual NUMERIC DEFAULT 10.0;

-- Atualizar registro padrão global_config com os novos percentuais caso estejam nulos
UPDATE public.v2_regras_comerciais
   SET desconto_5x_percentual = COALESCE(desconto_5x_percentual, 5.0),
       desconto_vista_percentual = COALESCE(desconto_vista_percentual, 10.0)
 WHERE id = 'global_config';

-- 3. Multi-tenant: adicionar company_id às tabelas V2 onde aplicável (C2)
ALTER TABLE public.v2_pedidos_venda ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.v2_pedidos_compra ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.v2_produtos ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.v2_tabelas_preco ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.v2_contas_pagar ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.v2_estoque_movimentacoes ADD COLUMN IF NOT EXISTS company_id UUID;

-- 4. Criar índices para busca rápida de orçamentos por cliente e status
CREATE INDEX IF NOT EXISTS v2_pedidos_venda_status_idx ON public.v2_pedidos_venda (status);
CREATE INDEX IF NOT EXISTS v2_pedidos_venda_cliente_id_idx ON public.v2_pedidos_venda (cliente_id);

COMMIT;
