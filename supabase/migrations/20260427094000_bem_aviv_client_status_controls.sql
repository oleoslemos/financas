-- Controles de status comercial para clientes Bem Aviv.

ALTER TABLE public.bem_aviv_clients
  ALTER COLUMN client_status SET DEFAULT 'PROSPECÇÃO';

UPDATE public.bem_aviv_clients
SET client_status = 'PROSPECÇÃO'
WHERE client_status IS NULL OR btrim(client_status) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bem_aviv_clients_client_status_allowed_chk'
      AND conrelid = 'public.bem_aviv_clients'::regclass
  ) THEN
    ALTER TABLE public.bem_aviv_clients
      ADD CONSTRAINT bem_aviv_clients_client_status_allowed_chk
      CHECK (
        client_status IN (
          'PROSPECÇÃO',
          'CONTATO',
          'VISITA AGENDADA',
          'VISITA REALIZADA',
          'FECHADO PLATAFORMA CONFORTO',
          'FECHADO DEMAIS PRODUTOS',
          'CLIENTE'
        )
      );
  END IF;
END $$;
