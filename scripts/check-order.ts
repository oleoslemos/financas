// scripts/check-order.ts
import { supabase } from '../src/lib/supabaseClient';

async function main() {
  const orderId = '20261120001';
  const { data, error } = await supabase
    .from('v2_pedidos_venda')
    .select('*')
    .eq('id', orderId)
    .single();

  if (error) {
    console.error('Erro ao buscar pedido:', error);
    process.exit(1);
  }
  console.log('Pedido encontrado:', JSON.stringify(data, null, 2));
}

main();
