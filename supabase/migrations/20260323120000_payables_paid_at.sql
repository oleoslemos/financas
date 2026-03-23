-- Data em que o lançamento foi liquidado (pago/recebido)
ALTER TABLE public.payables_receivables
  ADD COLUMN IF NOT EXISTS paid_at date;

COMMENT ON COLUMN public.payables_receivables.paid_at IS 'Data de pagamento/recebimento quando status = paid';
