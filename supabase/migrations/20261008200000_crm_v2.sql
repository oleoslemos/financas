-- ============================================================
-- CRM V2: modelo de dados + RLS
-- Migration: 20261008200000_crm_v2.sql
-- Nota: responsavel_id e criado_por são text (compatível com v2_users.id
--       antes de migrar para auth.users). Quando migrar para Supabase Auth,
--       criar migration separada para alterar para uuid e adicionar FK.
-- ============================================================

-- PASSO 1: tipos ---------------------------------------------
do $$ begin
  create type crm_tipo_contato as enum
    ('ligacao','whatsapp','email','visita','reuniao','outro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type crm_direcao as enum ('recebido','realizado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type crm_tipo_agenda as enum ('evento','tarefa');
exception when duplicate_object then null; end $$;

do $$ begin
  create type crm_origem as enum ('sistema','google');
exception when duplicate_object then null; end $$;

do $$ begin
  create type crm_sync_status as enum ('pendente','sincronizado','erro');
exception when duplicate_object then null; end $$;

-- PASSO 2: tabelas -------------------------------------------
create table if not exists crm_contato_v2 (
  id                 uuid primary key default gen_random_uuid(),
  legacy_id          text unique,
  company_id         uuid,
  cliente_id         uuid not null references bem_aviv_clients(id),
  tipo               crm_tipo_contato not null default 'outro',
  direcao            crm_direcao not null default 'realizado',
  assunto            text not null,
  descricao          text,
  resultado          text,
  ocorrido_em        timestamptz not null default now(),
  responsavel_id     text,            -- v2_users.id (text por ora)
  proximo_contato_em timestamptz,
  criado_em          timestamptz not null default now(),
  criado_por         text,            -- v2_users.id (text por ora)
  atualizado_em      timestamptz not null default now(),
  cancelado_em       timestamptz
);

create index if not exists crm_contato_v2_cliente_ocorrido
  on crm_contato_v2 (cliente_id, ocorrido_em desc);
create index if not exists crm_contato_v2_proximo
  on crm_contato_v2 (proximo_contato_em) where cancelado_em is null;

create table if not exists crm_agenda_item (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid,
  tipo                 crm_tipo_agenda not null default 'evento',
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
  criado_por           text,          -- v2_users.id (text por ora)
  atualizado_em        timestamptz not null default now(),
  cancelado_em         timestamptz
);

create index if not exists crm_agenda_item_inicio
  on crm_agenda_item (inicio) where cancelado_em is null;
create index if not exists crm_agenda_item_sync
  on crm_agenda_item (sync_status) where sync_status <> 'sincronizado';

-- Estado da sincronização (sem segredos): a tela lê.
create table if not exists crm_google_sync_state (
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

insert into crm_google_sync_state (id) values (1) on conflict (id) do nothing;

-- Tokens OAuth: sem políticas. Só Edge Function (service role) acessa.
create table if not exists crm_google_token (
  id                smallint primary key default 1 check (id = 1),
  refresh_token_enc text not null,
  atualizado_em     timestamptz not null default now()
);

create table if not exists crm_auditoria (
  id         bigint generated always as identity primary key,
  tabela     text not null,
  registro   uuid not null,
  acao       text not null,  -- insert | update | cancelar
  usuario_id text,           -- v2_users.id (text por ora)
  antes      jsonb,
  depois     jsonb,
  em         timestamptz not null default now()
);

create index if not exists crm_auditoria_tabela_registro
  on crm_auditoria (tabela, registro, em desc);

-- PASSO 3: trigger atualizado_em + auditoria -----------------
create or replace function crm_set_atualizado_em() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists set_atualizado_em_contato on crm_contato_v2;
create trigger set_atualizado_em_contato
  before update on crm_contato_v2
  for each row execute function crm_set_atualizado_em();

drop trigger if exists set_atualizado_em_agenda on crm_agenda_item;
create trigger set_atualizado_em_agenda
  before update on crm_agenda_item
  for each row execute function crm_set_atualizado_em();

-- PASSO 4: RLS -----------------------------------------------
-- Tabelas CRM: qualquer authenticated lê, cria e altera.
-- Ninguém apaga (cancelamento lógico).
alter table crm_contato_v2        enable row level security;
alter table crm_agenda_item       enable row level security;
alter table crm_google_sync_state enable row level security;
alter table crm_google_token      enable row level security;
alter table crm_auditoria         enable row level security;

-- crm_contato_v2
drop policy if exists contato_select on crm_contato_v2;
drop policy if exists contato_insert on crm_contato_v2;
drop policy if exists contato_update on crm_contato_v2;
create policy contato_select on crm_contato_v2 for select using (true);
create policy contato_insert on crm_contato_v2 for insert with check (true);
create policy contato_update on crm_contato_v2 for update using (true) with check (true);

-- crm_agenda_item
drop policy if exists agenda_select on crm_agenda_item;
drop policy if exists agenda_insert on crm_agenda_item;
drop policy if exists agenda_update on crm_agenda_item;
create policy agenda_select on crm_agenda_item for select using (true);
create policy agenda_insert on crm_agenda_item for insert with check (true);
create policy agenda_update on crm_agenda_item for update using (true) with check (true);

-- crm_google_sync_state: só leitura pelo cliente
drop policy if exists sync_select on crm_google_sync_state;
create policy sync_select on crm_google_sync_state for select using (true);

-- crm_auditoria: só leitura
drop policy if exists audit_select on crm_auditoria;
create policy audit_select on crm_auditoria for select using (true);
