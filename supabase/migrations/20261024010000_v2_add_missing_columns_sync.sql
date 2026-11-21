-- Migration: 20261024010000_v2_add_missing_columns_sync.sql
-- Adiciona colunas criadas na Etapa 2 para permitir sincronizacao e persistencia em nuvem entre dispositivos
-- 1. v2_pedidos_venda
ALTER TABLE public.v2_pedidos_venda ADD COLUMN IF NOT EXISTS "dataVencimento" TEXT;
ALTER TABLE public.v2_pedidos_venda ADD COLUMN IF NOT EXISTS frete NUMERIC DEFAULT 0;

-- 2. v2_pedidos_compra
ALTER TABLE public.v2_pedidos_compra ADD COLUMN IF NOT EXISTS "formaPagamento" TEXT;
ALTER TABLE public.v2_pedidos_compra ADD COLUMN IF NOT EXISTS "contaSaidaTag" TEXT;
ALTER TABLE public.v2_pedidos_compra ADD COLUMN IF NOT EXISTS frete NUMERIC DEFAULT 0;
ALTER TABLE public.v2_pedidos_compra ADD COLUMN IF NOT EXISTS "dataPedido" TEXT;
ALTER TABLE public.v2_pedidos_compra ADD COLUMN IF NOT EXISTS "dataVencimento" TEXT;
ALTER TABLE public.v2_pedidos_compra ADD COLUMN IF NOT EXISTS "dataRecebimentoPrevista" TEXT;
ALTER TABLE public.v2_pedidos_compra ADD COLUMN IF NOT EXISTS "justificativaDataRecebimento" TEXT;
ALTER TABLE public.v2_pedidos_compra ADD COLUMN IF NOT EXISTS recebimentos JSONB DEFAULT '[]'::jsonb;

-- 3. v2_contas_pagar
ALTER TABLE public.v2_contas_pagar ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'pagar';
ALTER TABLE public.v2_contas_pagar ADD COLUMN IF NOT EXISTS vencimento TEXT;
ALTER TABLE public.v2_contas_pagar ADD COLUMN IF NOT EXISTS forma_pagamento TEXT;
ALTER TABLE public.v2_contas_pagar ADD COLUMN IF NOT EXISTS taxa_administradora NUMERIC;
ALTER TABLE public.v2_contas_pagar ADD COLUMN IF NOT EXISTS saldo_residual NUMERIC;
ALTER TABLE public.v2_contas_pagar ADD COLUMN IF NOT EXISTS diferenca_destino TEXT;
ALTER TABLE public.v2_contas_pagar ADD COLUMN IF NOT EXISTS conta_bancaria_id TEXT;
ALTER TABLE public.v2_contas_pagar ADD COLUMN IF NOT EXISTS conta_bancaria_tag TEXT;
ALTER TABLE public.v2_contas_pagar ADD COLUMN IF NOT EXISTS data_baixa TEXT;
