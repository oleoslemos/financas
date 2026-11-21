-- ============================================================
-- Migration: Reset contas bancárias → apenas MercadoPago e 3 subcontas
-- Data: 2026-11-01
-- ============================================================

-- Remove todas as contas bancárias existentes
-- (a restrição bank_account_id na tabela de lançamentos usa ON DELETE SET NULL,
--  então os lançamentos existentes não serão afetados)
DELETE FROM public.bank_accounts;

-- Recria apenas as 4 contas necessárias
-- user_id usa 'shared' pois as contas bancárias são compartilhadas entre todos os usuários da empresa
INSERT INTO public.bank_accounts (id, user_id, name, bank_name, initial_balance, color, is_active, created_at)
VALUES
  (
    gen_random_uuid(),
    'shared',
    'MercadoPago',
    'Mercado Pago',
    0,
    '#009EE3',
    true,
    now()
  ),
  (
    gen_random_uuid(),
    'shared',
    'Comissão LS - MercadoPago',
    'Mercado Pago',
    0,
    '#0064A6',
    true,
    now()
  ),
  (
    gen_random_uuid(),
    'shared',
    'Impostos - MercadoPago',
    'Mercado Pago',
    0,
    '#C92A2A',
    true,
    now()
  ),
  (
    gen_random_uuid(),
    'shared',
    'Contabilidade - MercadoPago',
    'Mercado Pago',
    0,
    '#6741D9',
    true,
    now()
  );
