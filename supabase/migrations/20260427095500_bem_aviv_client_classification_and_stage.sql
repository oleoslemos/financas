-- Separa classificação do cliente (PROSPECÇÃO/CLIENTE) da etapa comercial.

ALTER TABLE public.bem_aviv_clients
  ADD COLUMN IF NOT EXISTS commercial_stage text;

UPDATE public.bem_aviv_clients
SET commercial_stage = CASE
  WHEN client_status = 'FECHADO PLATAFORMA CONFORTO' THEN 'FECHADO PLATAFORMA CONFORTO'
  WHEN client_status = 'VISITA AGENDADA' THEN 'VISITA AGENDADA'
  WHEN client_status = 'VISITA REALIZADA' THEN 'VISITA REALIZADA'
  WHEN client_status = 'FECHADO DEMAIS PRODUTOS' THEN 'FECHADO DEMAIS PRODUTOS'
  ELSE 'CONTATO'
END
WHERE commercial_stage IS NULL;

UPDATE public.bem_aviv_clients
SET client_status = CASE
  WHEN commercial_stage = 'FECHADO PLATAFORMA CONFORTO' THEN 'CLIENTE'
  ELSE 'PROSPECÇÃO'
END;

ALTER TABLE public.bem_aviv_clients
  ALTER COLUMN client_status SET DEFAULT 'PROSPECÇÃO';

ALTER TABLE public.bem_aviv_clients
  ALTER COLUMN commercial_stage SET DEFAULT 'CONTATO';

ALTER TABLE public.bem_aviv_clients
  DROP CONSTRAINT IF EXISTS bem_aviv_clients_client_status_allowed_chk;

ALTER TABLE public.bem_aviv_clients
  ADD CONSTRAINT bem_aviv_clients_client_status_allowed_chk
  CHECK (client_status IN ('PROSPECÇÃO', 'CLIENTE'));

ALTER TABLE public.bem_aviv_clients
  DROP CONSTRAINT IF EXISTS bem_aviv_clients_commercial_stage_allowed_chk;

ALTER TABLE public.bem_aviv_clients
  ADD CONSTRAINT bem_aviv_clients_commercial_stage_allowed_chk
  CHECK (
    commercial_stage IN (
      'CONTATO',
      'VISITA AGENDADA',
      'VISITA REALIZADA',
      'FECHADO PLATAFORMA CONFORTO',
      'FECHADO DEMAIS PRODUTOS'
    )
  );

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
