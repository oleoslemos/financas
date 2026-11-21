-- Permite RLS multi-empresa quando o JWT do Clerk não traz e-mail (token padrão só tem `sub`).
-- Opção A: no Clerk, customize o Session token e inclua o e-mail (ver README).
-- Opção B: no SQL Editor (como postgres), preencha clerk_user_id com o `user_...` do Clerk:
--   UPDATE public.company_members SET clerk_user_id = 'user_XXXXX'
--   WHERE lower(trim(email)) = 'seu@email.com';

ALTER TABLE public.company_members
  ADD COLUMN IF NOT EXISTS clerk_user_id text;

COMMENT ON COLUMN public.company_members.clerk_user_id IS
  'Opcional: ID do usuário no Clerk (JWT claim `sub`). Usado pelo RLS quando o e-mail não está no token.';

CREATE UNIQUE INDEX IF NOT EXISTS company_members_company_clerk_uidx
  ON public.company_members (company_id, clerk_user_id)
  WHERE clerk_user_id IS NOT NULL AND btrim(clerk_user_id) <> '';

CREATE OR REPLACE FUNCTION public.bem_aviv_user_company_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
AS $$
  SELECT cm.company_id
  FROM public.company_members cm
  WHERE (
    lower(trim(cm.email)) = coalesce(public.auth_jwt_email_lower(), '')
  )
  OR (
    cm.clerk_user_id IS NOT NULL
    AND btrim(cm.clerk_user_id) <> ''
    AND cm.clerk_user_id = nullif(trim(auth.jwt()->>'sub'), '')
  );
$$;

CREATE OR REPLACE FUNCTION public.bem_aviv_user_in_company(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = p_company_id
      AND (
        lower(trim(cm.email)) = coalesce(public.auth_jwt_email_lower(), '')
        OR (
          cm.clerk_user_id IS NOT NULL
          AND btrim(cm.clerk_user_id) <> ''
          AND cm.clerk_user_id = nullif(trim(auth.jwt()->>'sub'), '')
        )
      )
  );
$$;

DROP POLICY IF EXISTS company_members_select_self ON public.company_members;
CREATE POLICY company_members_select_self ON public.company_members
  FOR SELECT
  USING (
    lower(trim(email)) = coalesce(public.auth_jwt_email_lower(), '')
    OR (
      clerk_user_id IS NOT NULL
      AND btrim(clerk_user_id) <> ''
      AND clerk_user_id = nullif(trim(auth.jwt()->>'sub'), '')
    )
  );
