-- ============================================================
-- CRM V2: modelo novo (com RLS) + migração do legado
-- Pré-requisito: usuários migrados para Supabase Auth (auth.users).
-- Ainda não vi o schema da tabela atual de contatos. Rode o PASSO 0,
-- me envie o resultado e eu fecho o PASSO 4 antes de você executar.
-- Premissa a confirmar: bem_aviv_clients.id é uuid.
-- ============================================================

-- PASSO 0: descobrir a tabela atual -------------------------
-- select table_name from information_schema.tables
--  where table_schema = 'public' and table_name ilike '%contat%'
--     or table_schema = 'public' and table_name ilike '%crm%';
--
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_schema = 'public' and table_name = '<TABELA_ATUAL>'
--  order by ordinal_position;
--
-- select count(*) from public.<TABELA_ATUAL>;
--
-- Estado atual do RLS nas tabelas do sistema:
-- select relname, relrowsecurity from pg_class
--  where relnamespace = 'public'::regnamespace and relkind = 'r'
--    and (relname like 'v2_%' or relname like 'bem_aviv_%');

-- PASSO 1: tipos ---------------------------------------------
create type crm_tipo_contato as enum
  ('ligacao','whatsapp','email','visita','reuniao','outro');
create type crm_direcao as enum ('recebido','realizado');
create type crm_tipo_agenda as enum ('evento','tarefa');
create type crm_origem as enum ('sistema','google');
create type crm_sync_status as enum ('pendente','sincronizado','erro');

-- PASSO 2: tabelas -------------------------------------------
create table crm_contato_v2 (
  id                 uuid primary key default gen_random_uuid(),
  legacy_id          text unique,
  company_id         uuid,                                  -- igual a bem_aviv_clients
  cliente_id         uuid not null references bem_aviv_clients(id),
  tipo               crm_tipo_contato not null default 'outro',
  direcao            crm_direcao not null default 'realizado',
  assunto            text not null,
  descricao          text,
  resultado          text,
  ocorrido_em        timestamptz not null,
  responsavel_id     uuid references auth.users(id),
  proximo_contato_em timestamptz,
  criado_em          timestamptz not null default now(),
  criado_por         uuid references auth.users(id) default auth.uid(),
  atualizado_em      timestamptz not null default now(),
  cancelado_em       timestamptz
);
create index on crm_contato_v2 (cliente_id, ocorrido_em desc);
create index on crm_contato_v2 (proximo_contato_em) where cancelado_em is null;

create table crm_agenda_item (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid,
  tipo                 crm_tipo_agenda not null,
  titulo               text not null,
  descricao            text,
  inicio               timestamptz not null,
  fim                  timestamptz,
  dia_inteiro          boolean not null default false,
  concluido_em         timestamptz,
  cliente_id           uuid references bem_aviv_clients(id),
  contato_id           uuid references crm_contato_v2(id),
  origem               crm_origem not null default 'sistema',
  google_id            text unique,
  google_etag          text,
  google_atualizado_em timestamptz,
  sync_status          crm_sync_status not null default 'pendente',
  sync_erro            text,
  criado_em            timestamptz not null default now(),
  criado_por           uuid references auth.users(id) default auth.uid(),
  atualizado_em        timestamptz not null default now(),
  cancelado_em         timestamptz
);
create index on crm_agenda_item (inicio) where cancelado_em is null;
create index on crm_agenda_item (sync_status) where sync_status <> 'sincronizado';

-- Estado da sincronização (sem segredos): a tela lê.
create table crm_google_sync_state (
  id                smallint primary key default 1 check (id = 1),
  conta_email       text not null default 'bemavivls@gmail.com',
  calendar_id       text not null default 'primary',
  events_sync_token text,
  channel_id        text,
  channel_expira_em timestamptz,
  tasklist_id       text,
  tasks_updated_min timestamptz,
  ultimo_sync_em    timestamptz,
  ultimo_erro       text
);

-- Tokens OAuth: sem nenhuma política. Só a Edge Function (service role) acessa.
create table crm_google_token (
  id                smallint primary key default 1 check (id = 1),
  refresh_token_enc text not null,
  atualizado_em     timestamptz not null default now()
);

create table crm_auditoria (
  id         bigint generated always as identity primary key,
  tabela     text not null,
  registro   uuid not null,
  acao       text not null,                -- insert | update | cancelar
  usuario_id uuid default auth.uid(),
  antes      jsonb,
  depois     jsonb,
  em         timestamptz not null default now()
);
create index on crm_auditoria (tabela, registro, em desc);

-- PASSO 3: auditoria, atualizado_em e RLS ---------------------
create or replace function crm_trigger_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into crm_auditoria (tabela, registro, acao, depois)
    values (tg_table_name, new.id, 'insert', to_jsonb(new));
    return new;
  end if;
  new.atualizado_em := now();
  insert into crm_auditoria (tabela, registro, acao, antes, depois)
  values (tg_table_name, new.id,
          case when old.cancelado_em is null and new.cancelado_em is not null
               then 'cancelar' else 'update' end,
          to_jsonb(old), to_jsonb(new));
  return new;
end $$;

create trigger aud_contato after insert on crm_contato_v2
  for each row execute function crm_trigger_auditoria();
create trigger aud_contato_upd before update on crm_contato_v2
  for each row execute function crm_trigger_auditoria();
create trigger aud_agenda after insert on crm_agenda_item
  for each row execute function crm_trigger_auditoria();
create trigger aud_agenda_upd before update on crm_agenda_item
  for each row execute function crm_trigger_auditoria();

alter table crm_contato_v2        enable row level security;
alter table crm_agenda_item       enable row level security;
alter table crm_google_sync_state enable row level security;
alter table crm_google_token      enable row level security;   -- sem políticas
alter table crm_auditoria         enable row level security;

-- Usuário logado lê, cria e altera. Ninguém apaga (cancelamento lógico).
create policy contato_select on crm_contato_v2  for select to authenticated using (true);
create policy contato_insert on crm_contato_v2  for insert to authenticated with check (true);
create policy contato_update on crm_contato_v2  for update to authenticated using (true) with check (true);

create policy agenda_select on crm_agenda_item  for select to authenticated using (true);
create policy agenda_insert on crm_agenda_item  for insert to authenticated with check (true);
create policy agenda_update on crm_agenda_item  for update to authenticated using (true) with check (true);

create policy sync_select on crm_google_sync_state for select to authenticated using (true);
create policy audit_select on crm_auditoria        for select to authenticated using (true);
-- AJUSTAR: se houver mais de uma empresa (company_id), trocar (true) por
-- uma checagem de empresa do usuário.

-- PASSO 4: migração do legado (AJUSTAR APÓS O PASSO 0) --------
begin;

insert into crm_contato_v2
  (legacy_id, company_id, cliente_id, tipo, direcao, assunto, descricao,
   ocorrido_em, criado_em)
select
  l.id::text,
  c.company_id,
  l.cliente_id,                                   -- AJUSTAR
  coalesce(
    case lower(l.tipo)                            -- AJUSTAR valores reais
      when 'ligacao'  then 'ligacao'::crm_tipo_contato
      when 'whatsapp' then 'whatsapp'::crm_tipo_contato
      when 'email'    then 'email'::crm_tipo_contato
      when 'visita'   then 'visita'::crm_tipo_contato
      when 'reuniao'  then 'reuniao'::crm_tipo_contato
    end, 'outro'::crm_tipo_contato),
  'realizado',
  coalesce(nullif(l.assunto, ''), 'Contato sem assunto'),   -- AJUSTAR
  l.descricao,                                              -- AJUSTAR
  coalesce(l.data_contato, l.created_at),                   -- AJUSTAR
  coalesce(l.created_at, now())
from public.<TABELA_ATUAL> l                                -- AJUSTAR
join bem_aviv_clients c on c.id = l.cliente_id
on conflict (legacy_id) do nothing;

-- PASSO 5: validação (antes do commit) -----------------------
select (select count(*) from public.<TABELA_ATUAL>) as origem,
       (select count(*) from crm_contato_v2 where legacy_id is not null) as destino;

-- Deve retornar zero linhas. Se vier algo, o contato não tem cliente válido
-- e precisa de decisão antes do commit.
select l.id from public.<TABELA_ATUAL> l
 where not exists (select 1 from crm_contato_v2 v where v.legacy_id = l.id::text);

-- commit;   -- origem = destino e segunda consulta vazia
-- rollback; -- caso contrário

-- PASSO 6 (só após sua aprovação): renomear a antiga.
-- alter table public.<TABELA_ATUAL> rename to <TABELA_ATUAL>_legado;
