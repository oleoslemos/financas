-- Migration: 20261008220000_relax_user_id_not_null_on_clients.sql
-- Relaxa a restrição NOT NULL da coluna user_id em bem_aviv_clients,
-- permitindo que a V2 crie clientes independentemente do sistema legado de autenticação.

ALTER TABLE IF EXISTS public.bem_aviv_clients
ALTER COLUMN user_id DROP NOT NULL;
