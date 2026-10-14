-- ═══════════════════════════════════════════════════════════════
-- Migration: push_notification_preferences
-- Tabela de preferências de notificações push por usuário
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.push_notification_preferences (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    text NOT NULL,
  user_email                 text,
  system_source              text NOT NULL DEFAULT 'v1',

  -- ── CRM / Follow-up ──────────────────────────────────────────
  notify_followup_today      boolean NOT NULL DEFAULT true,    -- follow-ups do dia (resumo matinal)
  notify_followup_overdue    boolean NOT NULL DEFAULT true,    -- follow-ups atrasados
  notify_birthdays_today     boolean NOT NULL DEFAULT true,    -- aniversariantes do dia
  notify_birthdays_upcoming  boolean NOT NULL DEFAULT true,    -- aniversariantes nos próximos 3 dias

  -- ── Feedback pós-entrega ──────────────────────────────────────
  notify_feedback_3d         boolean NOT NULL DEFAULT true,    -- feedback 3 dias após entrega
  notify_feedback_10d        boolean NOT NULL DEFAULT true,    -- feedback 10 dias após entrega
  notify_feedback_30d        boolean NOT NULL DEFAULT true,    -- feedback 30 dias após entrega

  -- ── Validade de produtos (cadastro do cliente) ────────────────
  notify_product_expiry_30d  boolean NOT NULL DEFAULT true,    -- produto vence em 30 dias

  -- ── Pedidos e vendas ──────────────────────────────────────────
  notify_orders_pending      boolean NOT NULL DEFAULT true,    -- pedidos pendentes de entrega
  notify_orders_payment      boolean NOT NULL DEFAULT false,   -- entradas/pagamentos pendentes
  notify_new_order           boolean NOT NULL DEFAULT false,   -- novo pedido criado

  -- ── Horários de envio ─────────────────────────────────────────
  morning_hour               smallint NOT NULL DEFAULT 8  CHECK (morning_hour BETWEEN 0 AND 23),
  morning_minute             smallint NOT NULL DEFAULT 0  CHECK (morning_minute BETWEEN 0 AND 59),
  evening_enabled            boolean  NOT NULL DEFAULT false,
  evening_hour               smallint NOT NULL DEFAULT 17 CHECK (evening_hour BETWEEN 0 AND 23),
  evening_minute             smallint NOT NULL DEFAULT 30 CHECK (evening_minute BETWEEN 0 AND 59),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Uma preferência por usuário + sistema
CREATE UNIQUE INDEX IF NOT EXISTS push_notification_preferences_user_system_idx
  ON public.push_notification_preferences (user_id, system_source);

-- RLS
ALTER TABLE public.push_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own preferences"
  ON public.push_notification_preferences FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own preferences"
  ON public.push_notification_preferences FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own preferences"
  ON public.push_notification_preferences FOR UPDATE
  USING (auth.uid()::text = user_id);

-- Service role bypasses RLS
CREATE POLICY "Service role full access to preferences"
  ON public.push_notification_preferences FOR ALL
  USING (auth.role() = 'service_role');

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at_preferences()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS set_updated_at_preferences ON public.push_notification_preferences;
CREATE TRIGGER set_updated_at_preferences
  BEFORE UPDATE ON public.push_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_preferences();

-- ═══════════════════════════════════════════════════════════════
-- Migration: adicionar campo warranty_months em bem_aviv_clients
-- Validade estimada do produto principal adquirido (em meses)
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.bem_aviv_clients
  ADD COLUMN IF NOT EXISTS product_purchase_date  date,
  ADD COLUMN IF NOT EXISTS product_warranty_months integer DEFAULT 12;

COMMENT ON COLUMN public.bem_aviv_clients.product_purchase_date IS
  'Data de compra/entrega do produto principal cadastrado para cálculo de validade de garantia';
COMMENT ON COLUMN public.bem_aviv_clients.product_warranty_months IS
  'Duração da garantia em meses. Notificação é disparada 30 dias antes do vencimento.';
