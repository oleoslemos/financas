-- Tipo da empresa (representante / distribuidor) e metas de vendas anuais + mensais.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS company_kind text;

UPDATE public.companies
SET company_kind = 'REPRESENTANTE'
WHERE slug = 'bem-aviv' AND (company_kind IS NULL OR company_kind = '');

UPDATE public.companies
SET company_kind = 'DISTRIBUIDOR'
WHERE slug = 'comfortcare' AND (company_kind IS NULL OR company_kind = '');

UPDATE public.companies
SET company_kind = 'DISTRIBUIDOR'
WHERE company_kind IS NULL;

ALTER TABLE public.companies
  ALTER COLUMN company_kind SET DEFAULT 'DISTRIBUIDOR';

ALTER TABLE public.companies
  ALTER COLUMN company_kind SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_company_kind_chk'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_company_kind_chk
      CHECK (company_kind IN ('REPRESENTANTE', 'DISTRIBUIDOR'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.company_sales_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  year int NOT NULL CHECK (year >= 2000 AND year <= 2100),
  annual_goal numeric(14, 2) NOT NULL DEFAULT 0 CHECK (annual_goal >= 0),
  monthly_goals jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, year)
);

CREATE INDEX IF NOT EXISTS company_sales_goals_company_year_idx
  ON public.company_sales_goals (company_id, year);

ALTER TABLE public.company_sales_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_sales_goals_select_member ON public.company_sales_goals;
CREATE POLICY company_sales_goals_select_member ON public.company_sales_goals
  FOR SELECT
  USING (public.bem_aviv_user_in_company(company_id));

DROP POLICY IF EXISTS company_sales_goals_insert_member ON public.company_sales_goals;
CREATE POLICY company_sales_goals_insert_member ON public.company_sales_goals
  FOR INSERT
  WITH CHECK (public.bem_aviv_user_in_company(company_id));

DROP POLICY IF EXISTS company_sales_goals_update_member ON public.company_sales_goals;
CREATE POLICY company_sales_goals_update_member ON public.company_sales_goals
  FOR UPDATE
  USING (public.bem_aviv_user_in_company(company_id))
  WITH CHECK (public.bem_aviv_user_in_company(company_id));

INSERT INTO public.company_sales_goals (company_id, year, annual_goal, monthly_goals)
VALUES
  ('10000000-0000-4000-8000-000000000001'::uuid, 2026, 100000, '{}'::jsonb),
  ('10000000-0000-4000-8000-000000000002'::uuid, 2026, 100000, '{}'::jsonb)
ON CONFLICT (company_id, year) DO NOTHING;
