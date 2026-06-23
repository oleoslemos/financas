-- Evolução Financeira LSH - Parte 1: Adicionar valor 'transfer' ao enum payable_kind
ALTER TYPE public.payable_kind ADD VALUE IF NOT EXISTS 'transfer';
