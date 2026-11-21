-- ============================================================================
-- Cadastros comerciais e metas (PARTE 1: estrutura + RLS policies)
--
-- Cria: fornecedores, representantes/distribuidores (com a Bem Aviv como padrão),
--       metas mensais (valor e visitas), formas de pagamento e taxas por parcela.
-- Altera: bem_aviv_sales_orders (nova coluna representative_id).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Função utilitária: mantém updated_at
-- ----------------------------------------------------------------------------
create or replace function public.tg_bem_aviv_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. Fornecedores
-- ----------------------------------------------------------------------------
create table if not exists public.bem_aviv_suppliers (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null,
  trade_name          text not null check (btrim(trade_name) <> ''),
  legal_name          text,
  cnpj                text check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  state_registration  text,
  contact_name        text,
  phone               text,
  email               text,
  category            text,
  address_city        text,
  notes               text,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  created_by_user_id  text,
  created_by_name     text,
  updated_at          timestamptz not null default now(),
  updated_by_user_id  text,
  updated_by_name     text,
  deleted_at          timestamptz,
  deleted_by_user_id  text,
  deleted_by_name     text
);

create unique index if not exists bem_aviv_suppliers_company_cnpj_uq
  on public.bem_aviv_suppliers (company_id, cnpj)
  where cnpj is not null and deleted_at is null;
create index if not exists bem_aviv_suppliers_company_name_idx
  on public.bem_aviv_suppliers (company_id, trade_name);

drop trigger if exists trg_bem_aviv_suppliers_touch on public.bem_aviv_suppliers;
create trigger trg_bem_aviv_suppliers_touch
  before update on public.bem_aviv_suppliers
  for each row execute function public.tg_bem_aviv_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Representantes / Distribuidores
-- ----------------------------------------------------------------------------
create table if not exists public.bem_aviv_representatives (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null,
  code                text not null,
  name                text not null check (btrim(name) <> ''),
  role                text not null check (role in ('DISTRIBUIDOR', 'REPRESENTANTE')),
  cpf_cnpj            text check (cpf_cnpj is null or cpf_cnpj ~ '^([0-9]{11}|[0-9]{14})$'),
  commission_rate     numeric(5,2) not null default 0
                        check (commission_rate >= 0 and commission_rate <= 100),
  phone               text,
  email               text,
  region              text,
  is_default          boolean not null default false,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  created_by_user_id  text,
  created_by_name     text,
  updated_at          timestamptz not null default now(),
  updated_by_user_id  text,
  updated_by_name     text,
  deleted_at          timestamptz,
  deleted_by_user_id  text,
  deleted_by_name     text,
  constraint bem_aviv_representatives_company_code_uq unique (company_id, code),
  constraint bem_aviv_representatives_id_company_uq   unique (id, company_id),
  constraint bem_aviv_representatives_default_chk
    check (not is_default or (role = 'DISTRIBUIDOR' and active and deleted_at is null))
);

create unique index if not exists bem_aviv_representatives_one_default_uq
  on public.bem_aviv_representatives (company_id)
  where is_default;
create unique index if not exists bem_aviv_representatives_company_doc_uq
  on public.bem_aviv_representatives (company_id, cpf_cnpj)
  where cpf_cnpj is not null and deleted_at is null;
create index if not exists bem_aviv_representatives_company_name_idx
  on public.bem_aviv_representatives (company_id, name);

create or replace function public.tg_bem_aviv_representatives_code()
returns trigger
language plpgsql
as $$
declare
  v_next integer;
begin
  if new.code is null or btrim(new.code) = '' then
    perform pg_advisory_xact_lock(hashtext('bem_aviv_representatives_code:' || new.company_id::text));
    select coalesce(max((substring(code from '^REP-([0-9]+)$'))::integer), 0) + 1
      into v_next
      from public.bem_aviv_representatives
     where company_id = new.company_id;
    new.code := 'REP-' || lpad(v_next::text, 3, '0');
  end if;
  new.code := upper(btrim(new.code));
  return new;
end;
$$;

drop trigger if exists trg_bem_aviv_representatives_code on public.bem_aviv_representatives;
create trigger trg_bem_aviv_representatives_code
  before insert on public.bem_aviv_representatives
  for each row execute function public.tg_bem_aviv_representatives_code();

drop trigger if exists trg_bem_aviv_representatives_touch on public.bem_aviv_representatives;
create trigger trg_bem_aviv_representatives_touch
  before update on public.bem_aviv_representatives
  for each row execute function public.tg_bem_aviv_touch_updated_at();

create or replace function public.bem_aviv_ensure_default_distributor(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id
    from public.bem_aviv_representatives
   where company_id = p_company_id and is_default;

  if v_id is null then
    perform pg_advisory_xact_lock(hashtext('bem_aviv_default_distributor:' || p_company_id::text));

    select id into v_id
      from public.bem_aviv_representatives
     where company_id = p_company_id and is_default;

    if v_id is null then
      insert into public.bem_aviv_representatives (company_id, code, name, role, is_default)
      values (p_company_id, 'DIST-001', 'BEM AVIV', 'DISTRIBUIDOR', true)
      returning id into v_id;
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.bem_aviv_ensure_default_distributor(uuid)
  from public, anon, authenticated;

-- Carga inicial: um distribuidor padrão por empresa já existente
do $$
declare
  v_sql     text := 'select distinct company_id from public.bem_aviv_clients where company_id is not null';
  v_company uuid;
begin
  if to_regclass('public.companies') is not null then
    v_sql := 'select id from public.companies union ' || v_sql;
  end if;

  for v_company in execute v_sql loop
    perform public.bem_aviv_ensure_default_distributor(v_company);
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Metas mensais (valor e visitas) — representante e distribuidor
-- ----------------------------------------------------------------------------
create table if not exists public.bem_aviv_representative_goals (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null,
  representative_id   uuid not null,
  month               date not null check (extract(day from month) = 1),
  sales_goal          numeric(14,2) check (sales_goal >= 0),
  visits_goal         integer check (visits_goal >= 0),
  created_at          timestamptz not null default now(),
  created_by_user_id  text,
  created_by_name     text,
  updated_at          timestamptz not null default now(),
  updated_by_user_id  text,
  updated_by_name     text,
  constraint bem_aviv_representative_goals_month_uq unique (representative_id, month),
  constraint bem_aviv_representative_goals_rep_fk
    foreign key (representative_id, company_id)
    references public.bem_aviv_representatives (id, company_id)
);

create index if not exists bem_aviv_representative_goals_company_month_idx
  on public.bem_aviv_representative_goals (company_id, month);

drop trigger if exists trg_bem_aviv_representative_goals_touch on public.bem_aviv_representative_goals;
create trigger trg_bem_aviv_representative_goals_touch
  before update on public.bem_aviv_representative_goals
  for each row execute function public.tg_bem_aviv_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 4. Formas de pagamento e taxas por parcela
-- ----------------------------------------------------------------------------
create table if not exists public.bem_aviv_payment_methods (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null,
  name                text not null check (btrim(name) <> ''),
  category            text not null
                        check (category in ('PIX','CREDIT_CARD','DEBIT_CARD','BOLETO','CASH','OTHER')),
  max_installments    integer not null default 1 check (max_installments between 1 and 48),
  days_to_receive     integer not null default 0 check (days_to_receive >= 0),
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  created_by_user_id  text,
  created_by_name     text,
  updated_at          timestamptz not null default now(),
  updated_by_user_id  text,
  updated_by_name     text,
  deleted_at          timestamptz,
  deleted_by_user_id  text,
  deleted_by_name     text,
  constraint bem_aviv_payment_methods_id_company_uq unique (id, company_id)
);

create unique index if not exists bem_aviv_payment_methods_company_name_uq
  on public.bem_aviv_payment_methods (company_id, lower(btrim(name)))
  where deleted_at is null;

drop trigger if exists trg_bem_aviv_payment_methods_touch on public.bem_aviv_payment_methods;
create trigger trg_bem_aviv_payment_methods_touch
  before update on public.bem_aviv_payment_methods
  for each row execute function public.tg_bem_aviv_touch_updated_at();

create table if not exists public.bem_aviv_payment_method_rates (
  payment_method_id   uuid not null,
  company_id          uuid not null,
  installment         integer not null check (installment >= 1),
  fee_percentage      numeric(5,2) not null check (fee_percentage >= 0 and fee_percentage <= 100),
  primary key (payment_method_id, installment),
  constraint bem_aviv_payment_method_rates_method_fk
    foreign key (payment_method_id, company_id)
    references public.bem_aviv_payment_methods (id, company_id)
    on delete cascade
);

create or replace function public.tg_bem_aviv_payment_method_rates_check()
returns trigger
language plpgsql
as $$
declare
  v_max integer;
begin
  select max_installments into v_max
    from public.bem_aviv_payment_methods
   where id = new.payment_method_id;

  if new.installment > v_max then
    raise exception 'A parcela % passa do máximo de % parcelas desta forma de pagamento', new.installment, v_max
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bem_aviv_payment_method_rates_check on public.bem_aviv_payment_method_rates;
create trigger trg_bem_aviv_payment_method_rates_check
  before insert or update on public.bem_aviv_payment_method_rates
  for each row execute function public.tg_bem_aviv_payment_method_rates_check();

create or replace function public.tg_bem_aviv_payment_methods_max_check()
returns trigger
language plpgsql
as $$
begin
  if new.max_installments < old.max_installments
     and exists (
       select 1 from public.bem_aviv_payment_method_rates
        where payment_method_id = new.id and installment > new.max_installments
     ) then
    raise exception 'Existem taxas cadastradas acima de % parcelas; remova-as antes de reduzir o máximo', new.max_installments
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bem_aviv_payment_methods_max_check on public.bem_aviv_payment_methods;
create trigger trg_bem_aviv_payment_methods_max_check
  before update of max_installments on public.bem_aviv_payment_methods
  for each row execute function public.tg_bem_aviv_payment_methods_max_check();

-- ----------------------------------------------------------------------------
-- 5. Pedidos: vínculo com representante/distribuidor (padrão = Bem Aviv)
-- ----------------------------------------------------------------------------
alter table public.bem_aviv_sales_orders
  add column if not exists representative_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bem_aviv_sales_orders_representative_fk'
  ) then
    alter table public.bem_aviv_sales_orders
      add constraint bem_aviv_sales_orders_representative_fk
      foreign key (representative_id, company_id)
      references public.bem_aviv_representatives (id, company_id);
  end if;
end $$;

create index if not exists bem_aviv_sales_orders_representative_idx
  on public.bem_aviv_sales_orders (representative_id);

create or replace function public.tg_bem_aviv_sales_orders_default_representative()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.representative_id is null and new.company_id is not null then
    new.representative_id := public.bem_aviv_ensure_default_distributor(new.company_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bem_aviv_sales_orders_default_representative on public.bem_aviv_sales_orders;
create trigger trg_bem_aviv_sales_orders_default_representative
  before insert on public.bem_aviv_sales_orders
  for each row execute function public.tg_bem_aviv_sales_orders_default_representative();

-- ----------------------------------------------------------------------------
-- 6. Segurança e Policies (RLS)
-- ----------------------------------------------------------------------------
alter table public.bem_aviv_suppliers             enable row level security;
alter table public.bem_aviv_representatives       enable row level security;
alter table public.bem_aviv_representative_goals  enable row level security;
alter table public.bem_aviv_payment_methods       enable row level security;
alter table public.bem_aviv_payment_method_rates  enable row level security;

drop policy if exists "bem_aviv_suppliers_all" on public.bem_aviv_suppliers;
create policy "bem_aviv_suppliers_all" on public.bem_aviv_suppliers for all to public using (true) with check (true);

drop policy if exists "bem_aviv_representatives_all" on public.bem_aviv_representatives;
create policy "bem_aviv_representatives_all" on public.bem_aviv_representatives for all to public using (true) with check (true);

drop policy if exists "bem_aviv_representative_goals_all" on public.bem_aviv_representative_goals;
create policy "bem_aviv_representative_goals_all" on public.bem_aviv_representative_goals for all to public using (true) with check (true);

drop policy if exists "bem_aviv_payment_methods_all" on public.bem_aviv_payment_methods;
create policy "bem_aviv_payment_methods_all" on public.bem_aviv_payment_methods for all to public using (true) with check (true);

drop policy if exists "bem_aviv_payment_method_rates_all" on public.bem_aviv_payment_method_rates;
create policy "bem_aviv_payment_method_rates_all" on public.bem_aviv_payment_method_rates for all to public using (true) with check (true);

commit;
