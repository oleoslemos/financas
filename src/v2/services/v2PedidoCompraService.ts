import { supabase } from '../../lib/supabaseClient'

export type StatusPedido = 'rascunho' | 'emitido' | 'recebido_parcial' | 'recebido' | 'cancelado'

export type PedidoCompraItem = {
  produto_id: string
  produto_nome: string
  quantidade: number
  preco_unitario: number
  total: number
}

export type PedidoCompra = {
  id: string
  numero: number
  fornecedor: string
  status: StatusPedido
  dataEmissao: string | null
  dataPrevistaEntrega: string | null
  total: number
  numeroParcelas: number
  itens: PedidoCompraItem[]
  created_at: string
  updated_at: string
}

const KEY = 'v2_pedidos_compra'
const SUPABASE_TABLE = 'v2_pedidos_compra'

export async function listPedidosCompra(): Promise<PedidoCompra[]> {
  let list: PedidoCompra[] = []
  if (supabase) {
    try {
      const { data, error } = await supabase.from(SUPABASE_TABLE).select('*').order('created_at', { ascending: false })
      if (!error && data) {
        list = data as PedidoCompra[]
      }
    } catch {}
  }
  if (list.length === 0) {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) list = JSON.parse(raw)
    } catch {}
  }
  return list
}

export async function savePedidoCompra(pedido: Omit<PedidoCompra, 'id' | 'numero' | 'created_at' | 'updated_at'>): Promise<PedidoCompra> {
  const current = await listPedidosCompra()
  
  const novoNumero = current.length > 0 ? Math.max(...current.map(p => p.numero || 0)) + 1 : 1001

  const newPedido: PedidoCompra = {
    ...pedido,
    id: crypto.randomUUID(),
    numero: novoNumero,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  if (supabase) {
    try {
      await supabase.from(SUPABASE_TABLE).insert([newPedido])
    } catch {}
  }

  current.push(newPedido)
  localStorage.setItem(KEY, JSON.stringify(current))

  return newPedido
}
