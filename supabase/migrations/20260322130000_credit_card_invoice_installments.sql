-- Parcelamento de faturas de cartão (grupo + número + total)
ALTER TABLE public.credit_card_invoices
  ADD COLUMN IF NOT EXISTS installment_group_id uuid,
  ADD COLUMN IF NOT EXISTS installment_number int,
  ADD COLUMN IF NOT EXISTS installment_count int;

ALTER TABLE public.credit_card_invoices
  DROP CONSTRAINT IF EXISTS credit_card_invoices_installment_chk;

ALTER TABLE public.credit_card_invoices
  ADD CONSTRAINT credit_card_invoices_installment_chk CHECK (
    (installment_group_id IS NULL AND installment_number IS NULL AND installment_count IS NULL)
    OR (
      installment_group_id IS NOT NULL
      AND installment_number IS NOT NULL
      AND installment_count IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS credit_card_invoices_installment_group_idx
  ON public.credit_card_invoices (installment_group_id);
