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

### Restringir quem pode usar o app

**1) No código (já implementado)**  
Defina no `.env` e na Vercel a variável:

`VITE_ALLOWED_EMAILS=leoslemos@gmail.com,suelenjalves@gmail.com`

(separados por vírgula ou `;`, maiúsculas/minúsculas ignoradas). Quem entrar com outro e-mail vê “Acesso restrito” e pode sair.  
Se `VITE_ALLOWED_EMAILS` estiver vazia, **não** há esse filtro no front.

**2) No Clerk (recomendado para bloquear cadastro)**  
No [Clerk Dashboard](https://dashboard.clerk.com) → sua aplicação → **User & authentication** → **Restrictions** (ou **Allowlist** / lista permitida, conforme o plano): limite quem pode **criar conta** ou use **somente convites**, alinhado aos mesmos e-mails. Assim estranhos nem chegam a logar.

> Os valores `VITE_*` vão no bundle do navegador — a lista de e-mails não é “secreta”. Para regra sensível, use restrições no Clerk ou um backend.

## Deploy na Vercel

1. [Importar](https://vercel.com/new) o repositório Git. Para o domínio **`bemaviv.vercel.app`**, o **nome do projeto** na Vercel deve ser **`bemaviv`**.
2. **Root Directory**: vazio (raiz), salvo se o código estiver em subpasta.
3. **Environment Variables** (Production e Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, e opcionalmente `VITE_ALLOWED_EMAILS` (ex.: `a@x.com,b@y.com`).
4. O [`vercel.json`](./vercel.json) usa `npm install --include=dev` (garante Vite/TypeScript no build), `npm run build` e saída **`dist`**, além do rewrite do SPA.

**Se o deploy falhar:** abra o deployment → log de **Build** e veja a última mensagem de erro. Comuns: `vite`/`tsc` não encontrados (corrigido com o `installCommand` acima), repositório desconectado (**Settings → Git**), ou **Root Directory** errado.

## Segurança

- Não commite `.env`.
- Não use `SUPABASE_SERVICE_ROLE_KEY` no frontend; só no servidor se um dia houver backend.
