-- Follow-up MVP para clientes Bem Aviv.

ALTER TABLE public.bem_aviv_clients
  ADD COLUMN IF NOT EXISTS last_contact_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_followup_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_followup_note text,
  ADD COLUMN IF NOT EXISTS next_followup_status text NOT NULL DEFAULT 'PENDENTE';

CREATE TABLE IF NOT EXISTS public.bem_aviv_client_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  client_id uuid NOT NULL REFERENCES public.bem_aviv_clients (id) ON DELETE CASCADE,
  contacted_at timestamptz NOT NULL,
  channel text NOT NULL,
  result text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bem_aviv_clients_next_followup_at_idx ON public.bem_aviv_clients (next_followup_at);
CREATE INDEX IF NOT EXISTS bem_aviv_client_followups_client_contacted_at_idx ON public.bem_aviv_client_followups (client_id, contacted_at DESC);
CREATE INDEX IF NOT EXISTS bem_aviv_client_followups_user_id_idx ON public.bem_aviv_client_followups (user_id);

ALTER TABLE public.bem_aviv_client_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bem_aviv_client_followups_all ON public.bem_aviv_client_followups;

CREATE POLICY bem_aviv_client_followups_all ON public.bem_aviv_client_followups
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

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
    NEW.client_status := upper(coalesce(NEW.client_status, 'CLIENTE'));
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

DROP TRIGGER IF EXISTS trg_upper_bem_aviv_client_followups ON public.bem_aviv_client_followups;
CREATE TRIGGER trg_upper_bem_aviv_client_followups BEFORE INSERT OR UPDATE ON public.bem_aviv_client_followups
FOR EACH ROW EXECUTE FUNCTION public.tg_uppercase_text_fields();
