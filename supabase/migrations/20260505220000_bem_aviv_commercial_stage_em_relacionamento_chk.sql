-- Alinha CHECK com as opções do app (bemAvivClientStatus.ts): inclui EM RELACIONAMENTO.

ALTER TABLE public.bem_aviv_clients
  DROP CONSTRAINT IF EXISTS bem_aviv_clients_commercial_stage_allowed_chk;

ALTER TABLE public.bem_aviv_clients
  ADD CONSTRAINT bem_aviv_clients_commercial_stage_allowed_chk
  CHECK (
    commercial_stage IN (
      'CONTATO',
      'EM RELACIONAMENTO',
      'VISITA AGENDADA',
      'VISITA REALIZADA',
      'FECHADO PLATAFORMA CONFORTO',
      'FECHADO DEMAIS PRODUTOS'
    )
  );
