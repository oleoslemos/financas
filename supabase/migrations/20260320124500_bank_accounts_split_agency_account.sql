-- Separa o campo antigo agency_account em agency e account_number.
-- Mantém agency_account para retrocompatibilidade.
ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS agency text,
  ADD COLUMN IF NOT EXISTS account_number text;
