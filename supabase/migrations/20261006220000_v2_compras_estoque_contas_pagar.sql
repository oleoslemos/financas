-- 1. v2_pedidos_compra
CREATE TABLE IF NOT EXISTS public.v2_pedidos_compra (
  id TEXT PRIMARY KEY,
  numero TEXT,
  fornecedor TEXT,
  status TEXT DEFAULT 'rascunho',
  "dataEmissao" TEXT,
  "dataPrevistaEntrega" TEXT,
  observacao TEXT,
  total NUMERIC DEFAULT 0,
  "numeroParcelas" INTEGER DEFAULT 1,
  itens JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.v2_pedidos_compra ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acesso total em v2_pedidos_compra" ON public.v2_pedidos_compra;
CREATE POLICY "Permitir acesso total em v2_pedidos_compra" ON public.v2_pedidos_compra FOR ALL TO public USING (true) WITH CHECK (true);

-- 2. v2_estoque_movimentacoes
CREATE TABLE IF NOT EXISTS public.v2_estoque_movimentacoes (
  id TEXT PRIMARY KEY,
  produto_id TEXT,
  produto_nome TEXT,
  tipo TEXT,
  quantidade NUMERIC DEFAULT 0,
  origem TEXT,
  referencia TEXT,
  data TEXT,
  custo_unitario NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.v2_estoque_movimentacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acesso total em v2_estoque_movimentacoes" ON public.v2_estoque_movimentacoes;
CREATE POLICY "Permitir acesso total em v2_estoque_movimentacoes" ON public.v2_estoque_movimentacoes FOR ALL TO public USING (true) WITH CHECK (true);

-- 3. v2_contas_pagar
CREATE TABLE IF NOT EXISTS public.v2_contas_pagar (
  id TEXT PRIMARY KEY,
  pedido_id TEXT,
  descricao TEXT,
  fornecedor TEXT,
  origem TEXT DEFAULT 'avulsa',
  categoria TEXT,
  total NUMERIC DEFAULT 0,
  "totalPago" NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'aberta',
  parcelas JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.v2_contas_pagar ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acesso total em v2_contas_pagar" ON public.v2_contas_pagar;
CREATE POLICY "Permitir acesso total em v2_contas_pagar" ON public.v2_contas_pagar FOR ALL TO public USING (true) WITH CHECK (true);
