-- Migration: rename legacy v2_* tables to bemaviv_*
-- Run this migration on Supabase to align the database with the new code naming.

-- Rename v2_pedidos_venda to bemaviv_pedidos_venda
ALTER TABLE IF EXISTS public.v2_pedidos_venda RENAME TO bemaviv_pedidos_venda;

-- Rename v2_pedidos_compra to bemaviv_pedidos_compra
ALTER TABLE IF EXISTS public.v2_pedidos_compra RENAME TO bemaviv_pedidos_compra;

-- Rename v2_clientes to bemaviv_clientes
ALTER TABLE IF EXISTS public.v2_clientes RENAME TO bemaviv_clientes;

-- Rename v2_produtos to bemaviv_produtos
ALTER TABLE IF EXISTS public.v2_produtos RENAME TO bemaviv_produtos;

-- If there are any other v2_ tables, add similar statements here.
