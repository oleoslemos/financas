-- LSH — schema inicial + RLS para JWT Clerk (claim `sub`)
-- Rode no SQL Editor do Supabase após configurar integração Clerk ↔ JWT no painel.

-- Tipos auxiliares
CREATE TYPE public.category_type AS ENUM ('income', 'expense', 'neutral');
CREATE TYPE public.payable_kind AS ENUM ('payable', 'receivable');
CREATE TYPE public.payable_status AS ENUM ('open', 'paid');
CREATE TYPE public.invoice_status AS ENUM ('open', 'closed', 'paid');

-- Contas bancárias
CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  name text NOT NULL,
  bank_name text,
  agency text,
  account_number text,
  initial_balance numeric(14,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bank_accounts_user_id_idx ON public.bank_accounts (user_id);

-- Categorias
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  name text NOT NULL,
  type public.category_type NOT NULL DEFAULT 'neutral',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE INDEX categories_user_id_idx ON public.categories (user_id);

-- Contas a pagar / receber
CREATE TABLE public.payables_receivables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  kind public.payable_kind NOT NULL,
  amount numeric(14,2) NOT NULL,
  due_date date NOT NULL,
  description text NOT NULL DEFAULT '',
  status public.payable_status NOT NULL DEFAULT 'open',
  category_id uuid REFERENCES public.categories (id) ON DELETE SET NULL,
  bank_account_id uuid REFERENCES public.bank_accounts (id) ON DELETE SET NULL,
  installment_group_id uuid,
  installment_number int,
  installment_count int,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT installment_consistency CHECK (
    (installment_group_id IS NULL AND installment_number IS NULL AND installment_count IS NULL)
    OR (installment_group_id IS NOT NULL AND installment_number IS NOT NULL AND installment_count IS NOT NULL)
  )
);

CREATE INDEX payables_user_due_idx ON public.payables_receivables (user_id, due_date);
CREATE INDEX payables_installment_group_idx ON public.payables_receivables (installment_group_id);

-- Cartões
CREATE TABLE public.credit_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  name text NOT NULL,
  brand text,
  closing_day int NOT NULL CHECK (closing_day >= 1 AND closing_day <= 31),
  due_day int NOT NULL CHECK (due_day >= 1 AND due_day <= 31),
  limit_amount numeric(14,2),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX credit_cards_user_id_idx ON public.credit_cards (user_id);

-- Faturas (payable_id após payables existir)
CREATE TABLE public.credit_card_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  credit_card_id uuid NOT NULL REFERENCES public.credit_cards (id) ON DELETE CASCADE,
  reference_month date NOT NULL,
  due_date date NOT NULL,
  status public.invoice_status NOT NULL DEFAULT 'open',
  payable_id uuid REFERENCES public.payables_receivables (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (credit_card_id, reference_month)
);

CREATE INDEX credit_card_invoices_user_idx ON public.credit_card_invoices (user_id);
CREATE INDEX credit_card_invoices_card_idx ON public.credit_card_invoices (credit_card_id);

-- Itens da fatura
CREATE TABLE public.credit_card_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.credit_card_invoices (id) ON DELETE CASCADE,
  occurred_on date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL DEFAULT '',
  amount numeric(14,2) NOT NULL,
  category_id uuid REFERENCES public.categories (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX credit_card_invoice_items_invoice_idx ON public.credit_card_invoice_items (invoice_id);

-- RLS
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payables_receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_card_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_card_invoice_items ENABLE ROW LEVEL SECURITY;

-- Políticas: usuário = JWT sub (Clerk)
CREATE POLICY bank_accounts_all ON public.bank_accounts
  FOR ALL USING ((auth.jwt()->>'sub') = user_id) WITH CHECK ((auth.jwt()->>'sub') = user_id);

CREATE POLICY categories_all ON public.categories
  FOR ALL USING ((auth.jwt()->>'sub') = user_id) WITH CHECK ((auth.jwt()->>'sub') = user_id);

CREATE POLICY payables_all ON public.payables_receivables
  FOR ALL USING ((auth.jwt()->>'sub') = user_id) WITH CHECK ((auth.jwt()->>'sub') = user_id);

CREATE POLICY credit_cards_all ON public.credit_cards
  FOR ALL USING ((auth.jwt()->>'sub') = user_id) WITH CHECK ((auth.jwt()->>'sub') = user_id);

CREATE POLICY credit_card_invoices_all ON public.credit_card_invoices
  FOR ALL USING ((auth.jwt()->>'sub') = user_id) WITH CHECK ((auth.jwt()->>'sub') = user_id);

CREATE POLICY credit_card_invoice_items_all ON public.credit_card_invoice_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.credit_card_invoices i
      WHERE i.id = credit_card_invoice_items.invoice_id
        AND (auth.jwt()->>'sub') = i.user_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.credit_card_invoices i
      WHERE i.id = credit_card_invoice_items.invoice_id
        AND (auth.jwt()->>'sub') = i.user_id
    )
  );
