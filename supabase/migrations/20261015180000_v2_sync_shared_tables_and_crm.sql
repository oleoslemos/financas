-- Migration: 20261015180000_v2_sync_shared_tables_and_crm.sql
-- Sincronização e compartilhamento de tabelas para a V2 (Pedidos de Venda, CRM Follow-ups e Usuários)

-- 1. Tabela de Pedidos de Venda V2 (compartilhamento nuvem entre notebook, tablet e smartphone)
CREATE TABLE IF NOT EXISTS public.v2_pedidos_venda (
  id TEXT PRIMARY KEY,
  numero TEXT,
  canal TEXT DEFAULT 'distribuicao',
  status TEXT DEFAULT 'proposta',
  cliente_id TEXT,
  cliente_nome TEXT NOT NULL,
  cliente_documento TEXT,
  cliente_cidade TEXT,
  tabela_preco_id TEXT,
  tabela_preco_nome TEXT,
  "dataEmissao" TEXT,
  "dataPrevistaEntrega" TEXT,
  "dataEntrega" TEXT,
  "formaPagamento" TEXT,
  "numeroParcelas" INTEGER DEFAULT 1,
  "contaEntradaTag" TEXT,
  observacao TEXT,
  subtotal NUMERIC DEFAULT 0,
  "descontoTotal" NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  "desconto5xPercentual" NUMERIC DEFAULT 5,
  total5x NUMERIC DEFAULT 0,
  "descontoVistaPercentual" NUMERIC DEFAULT 10,
  totalVista NUMERIC DEFAULT 0,
  "condicaoSelecionada" TEXT,
  itens JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.v2_pedidos_venda ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acesso total em v2_pedidos_venda" ON public.v2_pedidos_venda;
CREATE POLICY "Permitir acesso total em v2_pedidos_venda" ON public.v2_pedidos_venda FOR ALL TO public USING (true) WITH CHECK (true);

-- 2. Permissões públicas e ajustes em bem_aviv_client_followups
ALTER TABLE public.bem_aviv_client_followups ALTER COLUMN user_id DROP NOT NULL;

DROP POLICY IF EXISTS "Allow public select on bem_aviv_client_followups" ON public.bem_aviv_client_followups;
CREATE POLICY "Allow public select on bem_aviv_client_followups" ON public.bem_aviv_client_followups FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Allow public insert on bem_aviv_client_followups" ON public.bem_aviv_client_followups;
CREATE POLICY "Allow public insert on bem_aviv_client_followups" ON public.bem_aviv_client_followups FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update on bem_aviv_client_followups" ON public.bem_aviv_client_followups;
CREATE POLICY "Allow public update on bem_aviv_client_followups" ON public.bem_aviv_client_followups FOR UPDATE TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public delete on bem_aviv_client_followups" ON public.bem_aviv_client_followups;
CREATE POLICY "Allow public delete on bem_aviv_client_followups" ON public.bem_aviv_client_followups FOR DELETE TO public USING (true);

-- 3. Ajustes na tabela v2_users para permitir e-mails opcionais e gerenciamento completo
ALTER TABLE public.v2_users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.v2_users DROP CONSTRAINT IF EXISTS v2_users_email_key;

DROP POLICY IF EXISTS "Allow public update on v2_users" ON public.v2_users;
CREATE POLICY "Allow public update on v2_users" ON public.v2_users FOR UPDATE TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public delete on v2_users" ON public.v2_users;
CREATE POLICY "Allow public delete on v2_users" ON public.v2_users FOR DELETE TO public USING (true);
