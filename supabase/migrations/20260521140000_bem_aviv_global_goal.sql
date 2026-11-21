-- Bem Aviv (representante): meta global R$ 100.000 por ano (2024–2026).

INSERT INTO public.company_sales_goals (company_id, year, annual_goal, monthly_goals)
VALUES
  ('10000000-0000-4000-8000-000000000001'::uuid, 2024, 100000, '{}'::jsonb),
  ('10000000-0000-4000-8000-000000000001'::uuid, 2025, 100000, '{}'::jsonb)
ON CONFLICT (company_id, year) DO UPDATE
SET annual_goal = 100000, updated_at = now();

UPDATE public.company_sales_goals
SET annual_goal = 100000, updated_at = now()
WHERE company_id = '10000000-0000-4000-8000-000000000001'::uuid
  AND year = 2026
  AND annual_goal < 100000;
