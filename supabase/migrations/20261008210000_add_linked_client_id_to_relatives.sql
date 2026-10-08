-- Migration: 20261008210000_add_linked_client_id_to_relatives.sql
-- Adiciona suporte a vínculo de familiar com cadastro de cliente (ex: cônjuge cliente)

ALTER TABLE IF EXISTS public.bem_aviv_client_relatives
ADD COLUMN IF NOT EXISTS linked_client_id uuid REFERENCES public.bem_aviv_clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bem_aviv_client_relatives_linked_client_id
ON public.bem_aviv_client_relatives(linked_client_id);
