-- Migration: Tabela push_subscriptions para PWA Web Push (Bem Aviv Hub)
-- Suporta tanto usuários da Versão 1 (Supabase Auth / LSH / EKO'7) quanto Versão 2 (Distribuidor V2)

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  user_email text,
  system_source text default 'v1', -- 'v1' (Bem Aviv / EKO'7) | 'v2' (Distribuidor V2)
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Índices para performance em buscas e disparo em massa
create index if not exists idx_push_subs_user_id on public.push_subscriptions(user_id);
create index if not exists idx_push_subs_user_email on public.push_subscriptions(user_email);
create index if not exists idx_push_subs_system_source on public.push_subscriptions(system_source);

-- Habilitar RLS
alter table public.push_subscriptions enable row level security;

-- Políticas de segurança
-- Usuários podem registrar, atualizar e remover sua assinatura
create policy "Permitir gerenciamento de push subscriptions"
  on public.push_subscriptions
  for all
  using (true)
  with check (true);
