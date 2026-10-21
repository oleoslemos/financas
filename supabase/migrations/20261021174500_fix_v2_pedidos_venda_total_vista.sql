-- Migration: Corrigir case da coluna totalVista na tabela v2_pedidos_venda
DO 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'v2_pedidos_venda' AND column_name = 'totalvista'
  ) THEN
    ALTER TABLE public.v2_pedidos_venda RENAME COLUMN totalvista TO "totalVista";
  END IF;
END ;