-- Migration: update client name on related orders (deprecated)
-- The RPC that updated `cliente_nome` in `v2_pedidos_venda` is no longer needed.
-- Keeping this file for history only; the function is commented out.

-- create or replace function public.update_client_name_on_orders(
--     p_client_id uuid,
--     p_new_name text
-- ) returns void
-- language plpgsql
-- as $$
-- begin
--   update v2_pedidos_venda
--   set cliente_nome = p_new_name
--   where cliente_id = p_client_id;
-- end;
-- $$;

