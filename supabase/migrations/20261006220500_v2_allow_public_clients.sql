-- Permissões públicas para tabelas comerciais usadas na V2
DO $$
BEGIN
  -- bem_aviv_clients
  DROP POLICY IF EXISTS "Allow public select on bem_aviv_clients" ON public.bem_aviv_clients;
  CREATE POLICY "Allow public select on bem_aviv_clients" ON public.bem_aviv_clients FOR SELECT TO public USING (true);
  
  DROP POLICY IF EXISTS "Allow public insert on bem_aviv_clients" ON public.bem_aviv_clients;
  CREATE POLICY "Allow public insert on bem_aviv_clients" ON public.bem_aviv_clients FOR INSERT TO public WITH CHECK (true);
  
  DROP POLICY IF EXISTS "Allow public update on bem_aviv_clients" ON public.bem_aviv_clients;
  CREATE POLICY "Allow public update on bem_aviv_clients" ON public.bem_aviv_clients FOR UPDATE TO public USING (true) WITH CHECK (true);
  
  DROP POLICY IF EXISTS "Allow public delete on bem_aviv_clients" ON public.bem_aviv_clients;
  CREATE POLICY "Allow public delete on bem_aviv_clients" ON public.bem_aviv_clients FOR DELETE TO public USING (true);

  -- bem_aviv_client_relatives
  DROP POLICY IF EXISTS "Allow public select on bem_aviv_client_relatives" ON public.bem_aviv_client_relatives;
  CREATE POLICY "Allow public select on bem_aviv_client_relatives" ON public.bem_aviv_client_relatives FOR SELECT TO public USING (true);

  DROP POLICY IF EXISTS "Allow public insert on bem_aviv_client_relatives" ON public.bem_aviv_client_relatives;
  CREATE POLICY "Allow public insert on bem_aviv_client_relatives" ON public.bem_aviv_client_relatives FOR INSERT TO public WITH CHECK (true);

  DROP POLICY IF EXISTS "Allow public update on bem_aviv_client_relatives" ON public.bem_aviv_client_relatives;
  CREATE POLICY "Allow public update on bem_aviv_client_relatives" ON public.bem_aviv_client_relatives FOR UPDATE TO public USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Allow public delete on bem_aviv_client_relatives" ON public.bem_aviv_client_relatives;
  CREATE POLICY "Allow public delete on bem_aviv_client_relatives" ON public.bem_aviv_client_relatives FOR DELETE TO public USING (true);

  -- bem_aviv_sales_orders
  DROP POLICY IF EXISTS "Allow public select on bem_aviv_sales_orders" ON public.bem_aviv_sales_orders;
  CREATE POLICY "Allow public select on bem_aviv_sales_orders" ON public.bem_aviv_sales_orders FOR SELECT TO public USING (true);

  DROP POLICY IF EXISTS "Allow public insert on bem_aviv_sales_orders" ON public.bem_aviv_sales_orders;
  CREATE POLICY "Allow public insert on bem_aviv_sales_orders" ON public.bem_aviv_sales_orders FOR INSERT TO public WITH CHECK (true);

  DROP POLICY IF EXISTS "Allow public update on bem_aviv_sales_orders" ON public.bem_aviv_sales_orders;
  CREATE POLICY "Allow public update on bem_aviv_sales_orders" ON public.bem_aviv_sales_orders FOR UPDATE TO public USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Allow public delete on bem_aviv_sales_orders" ON public.bem_aviv_sales_orders;
  CREATE POLICY "Allow public delete on bem_aviv_sales_orders" ON public.bem_aviv_sales_orders FOR DELETE TO public USING (true);

  -- companies (leitura)
  DROP POLICY IF EXISTS "Allow public select on companies" ON public.companies;
  CREATE POLICY "Allow public select on companies" ON public.companies FOR SELECT TO public USING (true);
END $$;
