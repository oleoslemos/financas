-- 1. Remover colunas antigas de cônjuge e adicionar campo de referência em bem_aviv_clients
ALTER TABLE public.bem_aviv_clients
  DROP COLUMN IF EXISTS spouse_name,
  DROP COLUMN IF EXISTS spouse_birth_date,
  DROP COLUMN IF EXISTS spouse_phone,
  ADD COLUMN IF NOT EXISTS group_reference text;

-- 2. Atualizar a trigger function de uppercase para incluir group_reference e remover spouse_fields
CREATE OR REPLACE FUNCTION public.tg_uppercase_text_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'bank_accounts' THEN
    NEW.name := upper(coalesce(NEW.name, ''));
    NEW.bank_name := upper(NEW.bank_name);
    NEW.agency := upper(NEW.agency);
    NEW.account_number := upper(NEW.account_number);
  ELSIF TG_TABLE_NAME = 'categories' THEN
    NEW.name := upper(coalesce(NEW.name, ''));
  ELSIF TG_TABLE_NAME = 'payables_receivables' THEN
    NEW.description := upper(coalesce(NEW.description, ''));
  ELSIF TG_TABLE_NAME = 'credit_cards' THEN
    NEW.name := upper(coalesce(NEW.name, ''));
    NEW.brand := upper(NEW.brand);
  ELSIF TG_TABLE_NAME = 'credit_card_invoice_items' THEN
    NEW.description := upper(coalesce(NEW.description, ''));
  ELSIF TG_TABLE_NAME = 'bem_aviv_clients' THEN
    NEW.full_name := upper(coalesce(NEW.full_name, ''));
    NEW.cpf := regexp_replace(coalesce(NEW.cpf, ''), '\D', '', 'g');
    NEW.phone_1 := regexp_replace(coalesce(NEW.phone_1, ''), '\D', '', 'g');
    NEW.phone_2 := regexp_replace(coalesce(NEW.phone_2, ''), '\D', '', 'g');
    NEW.cep := regexp_replace(coalesce(NEW.cep, ''), '\D', '', 'g');
    NEW.address_street := upper(coalesce(NEW.address_street, ''));
    NEW.address_number := upper(coalesce(NEW.address_number, ''));
    NEW.address_complement := upper(coalesce(NEW.address_complement, ''));
    NEW.address_district := upper(coalesce(NEW.address_district, ''));
    NEW.address_city := upper(coalesce(NEW.address_city, ''));
    NEW.address_state := upper(coalesce(NEW.address_state, ''));
    NEW.full_address := upper(coalesce(NEW.full_address, ''));
    NEW.email := upper(coalesce(NEW.email, ''));
    NEW.client_status := upper(coalesce(NEW.client_status, 'PROSPECÇÃO'));
    NEW.commercial_stage := upper(coalesce(NEW.commercial_stage, 'CONTATO'));
    NEW.next_followup_note := upper(coalesce(NEW.next_followup_note, ''));
    NEW.next_followup_status := upper(coalesce(NEW.next_followup_status, 'PENDENTE'));
    NEW.group_reference := upper(coalesce(NEW.group_reference, ''));
  ELSIF TG_TABLE_NAME = 'bem_aviv_client_followups' THEN
    NEW.user_id := upper(coalesce(NEW.user_id, ''));
    NEW.channel := upper(coalesce(NEW.channel, 'OUTRO'));
    NEW.result := upper(coalesce(NEW.result, ''));
    NEW.notes := upper(coalesce(NEW.notes, ''));
  ELSIF TG_TABLE_NAME = 'bem_aviv_products' THEN
    NEW.category := upper(coalesce(NEW.category, ''));
    NEW.name := upper(coalesce(NEW.name, ''));
    NEW.description := upper(coalesce(NEW.description, ''));
  ELSIF TG_TABLE_NAME = 'bem_aviv_sales_orders' THEN
    NEW.status := upper(coalesce(NEW.status, ''));
    NEW.notes := upper(coalesce(NEW.notes, ''));
  ELSIF TG_TABLE_NAME = 'bem_aviv_categories' THEN
    NEW.name := upper(coalesce(NEW.name, ''));
  ELSIF TG_TABLE_NAME = 'bem_aviv_price_tables' THEN
    NEW.name := upper(coalesce(NEW.name, ''));
    NEW.description := upper(coalesce(NEW.description, ''));
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Criar tabela public.bem_aviv_client_relatives
CREATE TABLE IF NOT EXISTS public.bem_aviv_client_relatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.bem_aviv_clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  relationship text NOT NULL,
  birth_date date,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Habilitar RLS e criar políticas
ALTER TABLE public.bem_aviv_client_relatives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bem_aviv_client_relatives_select ON public.bem_aviv_client_relatives;
CREATE POLICY bem_aviv_client_relatives_select ON public.bem_aviv_client_relatives
  FOR SELECT USING (public.bem_aviv_user_in_company(company_id));

DROP POLICY IF EXISTS bem_aviv_client_relatives_insert ON public.bem_aviv_client_relatives;
CREATE POLICY bem_aviv_client_relatives_insert ON public.bem_aviv_client_relatives
  FOR INSERT WITH CHECK (public.bem_aviv_user_in_company(company_id));

DROP POLICY IF EXISTS bem_aviv_client_relatives_update ON public.bem_aviv_client_relatives;
CREATE POLICY bem_aviv_client_relatives_update ON public.bem_aviv_client_relatives
  FOR UPDATE USING (public.bem_aviv_user_in_company(company_id)) WITH CHECK (public.bem_aviv_user_in_company(company_id));

DROP POLICY IF EXISTS bem_aviv_client_relatives_delete ON public.bem_aviv_client_relatives;
CREATE POLICY bem_aviv_client_relatives_delete ON public.bem_aviv_client_relatives
  FOR DELETE USING (public.bem_aviv_user_in_company(company_id));

-- 5. Criar trigger de normalização para familiares
CREATE OR REPLACE FUNCTION public.tg_uppercase_relatives_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.name := upper(coalesce(NEW.name, ''));
  NEW.relationship := upper(coalesce(NEW.relationship, ''));
  NEW.phone := regexp_replace(coalesce(NEW.phone, ''), '\D', '', 'g');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_upper_bem_aviv_client_relatives ON public.bem_aviv_client_relatives;
CREATE TRIGGER trg_upper_bem_aviv_client_relatives
BEFORE INSERT OR UPDATE ON public.bem_aviv_client_relatives
FOR EACH ROW EXECUTE FUNCTION public.tg_uppercase_relatives_fields();
