-- Migration: 20261030111500_v2_add_pedidos_venda_vinculados.sql
-- Adiciona suporte a vinculo de pedidos de venda aos pedidos de compra

ALTER TABLE public.v2_pedidos_compra ADD COLUMN IF NOT EXISTS "pedidosVendaVinculados" JSONB DEFAULT '[]'::jsonb;
