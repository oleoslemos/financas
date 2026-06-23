-- Evolução Financeira LSH: Transferências, Subcategorias, Familiares e Cores de Contas

-- 1. Adicionar valor 'transfer' ao enum payable_kind
ALTER TYPE public.payable_kind ADD VALUE IF NOT EXISTS 'transfer';

-- 2. Adicionar coluna 'color' na tabela de contas bancárias
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS color text;

-- 3. Adicionar coluna 'parent_id' na tabela de categorias
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;

-- 4. Criar tabela public.lsh_family_members
CREATE TABLE IF NOT EXISTS public.lsh_family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Habilitar RLS e criar políticas para lsh_family_members
ALTER TABLE public.lsh_family_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lsh_family_members_all ON public.lsh_family_members;
CREATE POLICY lsh_family_members_all ON public.lsh_family_members
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Trigger de uppercase para lsh_family_members
CREATE OR REPLACE FUNCTION public.tg_uppercase_lsh_family_members()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.name := upper(coalesce(NEW.name, ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_upper_lsh_family_members ON public.lsh_family_members;
CREATE TRIGGER trg_upper_lsh_family_members
BEFORE INSERT OR UPDATE ON public.lsh_family_members
FOR EACH ROW EXECUTE FUNCTION public.tg_uppercase_lsh_family_members();

-- 5. Adicionar colunas de relacionamento na tabela payables_receivables
ALTER TABLE public.payables_receivables ADD COLUMN IF NOT EXISTS destination_bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.payables_receivables ADD COLUMN IF NOT EXISTS family_member_id uuid REFERENCES public.lsh_family_members(id) ON DELETE SET NULL;

-- Adicionar restrição CHECK para transferências
ALTER TABLE public.payables_receivables DROP CONSTRAINT IF EXISTS chk_transfer_destination;
ALTER TABLE public.payables_receivables
  ADD CONSTRAINT chk_transfer_destination
  CHECK (
    (kind <> 'transfer') OR
    (kind = 'transfer' AND destination_bank_account_id IS NOT NULL AND destination_bank_account_id <> bank_account_id)
  );

-- 6. Adicionar coluna family_member_id na tabela credit_card_invoice_items
ALTER TABLE public.credit_card_invoice_items ADD COLUMN IF NOT EXISTS family_member_id uuid REFERENCES public.lsh_family_members(id) ON DELETE SET NULL;
