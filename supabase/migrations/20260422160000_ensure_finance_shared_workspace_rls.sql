-- Garante políticas de workspace compartilhado nas tabelas do financeiro LSH.
-- Sem isso, um segundo usuário (ex.: com VITE_SHARED_DATA_OWNER_ID apontando para o dono)
-- não consegue ler categorias / inserir movimentos do dono (RLS antiga: sub = user_id).
-- Idempotente: pode rodar várias vezes.

DROP POLICY IF EXISTS bank_accounts_all ON public.bank_accounts;
DROP POLICY IF EXISTS categories_all ON public.categories;
DROP POLICY IF EXISTS payables_all ON public.payables_receivables;
DROP POLICY IF EXISTS credit_cards_all ON public.credit_cards;
DROP POLICY IF EXISTS credit_card_invoices_all ON public.credit_card_invoices;
DROP POLICY IF EXISTS credit_card_invoice_items_all ON public.credit_card_invoice_items;

CREATE POLICY bank_accounts_all ON public.bank_accounts
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY categories_all ON public.categories
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY payables_all ON public.payables_receivables
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY credit_cards_all ON public.credit_cards
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY credit_card_invoices_all ON public.credit_card_invoices
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY credit_card_invoice_items_all ON public.credit_card_invoice_items
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
