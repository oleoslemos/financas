# Financeiro LS

Planejamento financeiro (web + PWA): **Clerk** (login) + **Supabase** (Postgres + RLS).

## Rodar local

```bash
npm install
cp .env.example .env
# Preencha VITE_* no .env
npm run dev
```

## Supabase

1. Crie o projeto no [Supabase](https://supabase.com).
2. No **SQL Editor**, execute o arquivo [`supabase/migrations/20260320120000_initial_schema.sql`](./supabase/migrations/20260320120000_initial_schema.sql).
3. Configure a integração **Clerk ↔ Supabase** (JWT):
   - [Documentação Clerk + Supabase](https://clerk.com/docs/integrations/databases/supabase)
   - No Clerk: JWT Template chamado **`supabase`** (como o app solicita em `getToken({ template: 'supabase' })`).
   - No Supabase: habilite o provedor / assinatura JWT conforme o guia (para `auth.jwt()->>'sub'` nas políticas funcionar).

## Clerk

1. Crie uma aplicação em [Clerk](https://clerk.com).
2. Copie a **Publishable key** para `VITE_CLERK_PUBLISHABLE_KEY`.
3. Em **Paths**, use sign-in `/sign-in` e sign-up `/sign-up` (o app já expõe essas rotas).

## Deploy na Vercel

1. Conecte o repositório Git ao projeto [Vercel](https://vercel.com) (ex.: `financeiro-ls`).
2. Em **Settings → Environment Variables**, adicione:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_CLERK_PUBLISHABLE_KEY`
3. **Build**: `npm run build` — **Output**: `dist` (detectado automaticamente para Vite).
4. O arquivo [`vercel.json`](./vercel.json) redireciona rotas do SPA para `index.html`.

## Segurança

- Não commite `.env`.
- Não use `SUPABASE_SERVICE_ROLE_KEY` no frontend; só no servidor se um dia houver backend.
