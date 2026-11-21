-- Permite produtos do catálogo em modo kit (composição por outros produtos cadastrados).

ALTER TABLE public.bem_aviv_offer_products
  DROP CONSTRAINT IF EXISTS bem_aviv_offer_products_pricing_mode_check;

ALTER TABLE public.bem_aviv_offer_products
  ADD CONSTRAINT bem_aviv_offer_products_pricing_mode_check
  CHECK (pricing_mode IN ('UNICO', 'GRADE', 'KIT'));
