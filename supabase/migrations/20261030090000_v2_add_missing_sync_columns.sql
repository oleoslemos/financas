-- Migration: 20261030090000_v2_add_missing_sync_columns.sql
-- Adiciona colunas para persistência e sincronização de comissões, notas fiscais e status entre dispositivos

-- 1. v2_pedidos_venda
ALTER TABLE public.v2_pedidos_venda ADD COLUMN IF NOT EXISTS vendedor_nome TEXT;
ALTER TABLE public.v2_pedidos_venda ADD COLUMN IF NOT EXISTS comissao_percentual NUMERIC;
ALTER TABLE public.v2_pedidos_venda ADD COLUMN IF NOT EXISTS comissao_valor NUMERIC;
ALTER TABLE public.v2_pedidos_venda ADD COLUMN IF NOT EXISTS comissao_valor_total NUMERIC;
ALTER TABLE public.v2_pedidos_venda ADD COLUMN IF NOT EXISTS comissao_valor_gerado NUMERIC;
ALTER TABLE public.v2_pedidos_venda ADD COLUMN IF NOT EXISTS comissao_gerada BOOLEAN DEFAULT false;
ALTER TABLE public.v2_pedidos_venda ADD COLUMN IF NOT EXISTS comissao_data_geracao TEXT;
ALTER TABLE public.v2_pedidos_venda ADD COLUMN IF NOT EXISTS pagamento_fabrica NUMERIC;
ALTER TABLE public.v2_pedidos_venda ADD COLUMN IF NOT EXISTS resultado_liquido NUMERIC;

-- 2. v2_pedidos_compra
ALTER TABLE public.v2_pedidos_compra ADD COLUMN IF NOT EXISTS "numeroNf" TEXT;
ALTER TABLE public.v2_pedidos_compra ADD COLUMN IF NOT EXISTS "dataNf" TEXT;
ALTER TABLE public.v2_pedidos_compra ADD COLUMN IF NOT EXISTS "chaveNf" TEXT;
ALTER TABLE public.v2_pedidos_compra ADD COLUMN IF NOT EXISTS "notasFiscais" JSONB DEFAULT '[]'::jsonb;
