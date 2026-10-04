import { supabase } from '../../lib/supabaseClient'
import {
  getContaPagarPorPedidoId,
  updateContaPagar,
  verificarSePedidoTemPagamento,
  deleteContaPagarPorPedidoId,
  StatusConta,
} from './v2ContasPagarService'
import {
  registrarEntradaCompra,
  desfazerEntradaCompra,
  validarConsumoEstoque,
} from './v2EstoqueService'

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
  observacao?: string | null
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
  const novoNumero = current.length > 0 ? Math.max(...current.map((p) => p.numero || 0)) + 1 : 1001

  const newPedido: PedidoCompra = {
    ...pedido,
    id: crypto.randomUUID(),
    numero: novoNumero,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (supabase) {
    try {
      await supabase.from(SUPABASE_TABLE).insert([newPedido])
    } catch {}
  }

  current.unshift(newPedido)
  localStorage.setItem(KEY, JSON.stringify(current))

  return newPedido
}

export async function updatePedidoCompra(pedido: PedidoCompra): Promise<PedidoCompra> {
  const current = await listPedidosCompra()
  const updated = {
    ...pedido,
    updated_at: new Date().toISOString(),
  }

  if (supabase) {
    try {
      await supabase.from(SUPABASE_TABLE).upsert(updated)
    } catch {}
  }

  const updatedList = current.map((p) => (p.id === pedido.id ? updated : p))
  localStorage.setItem(KEY, JSON.stringify(updatedList))

  // Atualizar Contas a Pagar associado
  const contaExistente = await getContaPagarPorPedidoId(pedido.id)
  if (contaExistente) {
    const itemNome = pedido.itens.length > 1
      ? `${pedido.itens[0]?.produto_nome || 'Item'} (+${pedido.itens.length - 1} itens)`
      : (pedido.itens[0]?.produto_nome || 'Item')
    const parcelasArray = []
    const valorParcela = pedido.total / (pedido.numeroParcelas || 1)
    const dataHoje = new Date()
    for (let i = 1; i <= (pedido.numeroParcelas || 1); i++) {
      const vencimento = new Date(dataHoje)
      vencimento.setMonth(vencimento.getMonth() + i)
      parcelasArray.push({
        numero: i,
        vencimento: vencimento.toISOString().split('T')[0],
        valor: valorParcela,
        status: (contaExistente.parcelas[i - 1]?.status || 'aberta') as StatusConta,
      })
    }

    await updateContaPagar({
      ...contaExistente,
      fornecedor: pedido.fornecedor,
      descricao: `Pedido de Compra #${pedido.numero} - ${itemNome}`,
      total: pedido.total,
      parcelas: parcelasArray,
    })
  }

  return updated
}

export async function receberPedidoCompra(pedidoId: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const current = await listPedidosCompra()
  const pedido = current.find((p) => p.id === pedidoId)
  if (!pedido) return { ok: false, erro: 'Pedido não encontrado.' }
  if (pedido.status === 'recebido') return { ok: false, erro: 'Pedido já foi recebido.' }
  if (pedido.status === 'cancelado') return { ok: false, erro: 'Pedido cancelado não pode ser recebido.' }

  // Dar entrada no estoque
  await registrarEntradaCompra({
    pedidoId: pedido.id,
    pedidoNumero: pedido.numero,
    itens: pedido.itens,
  })

  // Atualizar status do pedido
  pedido.status = 'recebido'
  await updatePedidoCompra(pedido)

  return { ok: true }
}

export async function desfazerRecebimentoPedidoCompra(pedidoId: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const current = await listPedidosCompra()
  const pedido = current.find((p) => p.id === pedidoId)
  if (!pedido) return { ok: false, erro: 'Pedido não encontrado.' }
  if (pedido.status !== 'recebido' && pedido.status !== 'recebido_parcial') {
    return { ok: false, erro: 'Pedido não está no status de recebido.' }
  }

  // Estornar entrada com validação de consumo
  const resEstorno = await desfazerEntradaCompra({
    pedidoId: pedido.id,
    pedidoNumero: pedido.numero,
    itens: pedido.itens,
  })

  if (!resEstorno.ok) {
    return resEstorno
  }

  // Voltar status para emitido
  pedido.status = 'emitido'
  await updatePedidoCompra(pedido)

  return { ok: true }
}

export async function deletePedidoCompra(pedidoId: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const current = await listPedidosCompra()
  const pedido = current.find((p) => p.id === pedidoId)
  if (!pedido) return { ok: false, erro: 'Pedido não encontrado.' }

  // 1. Validar se tem baixa/pagamento no financeiro
  const temPagamento = await verificarSePedidoTemPagamento(pedidoId)
  if (temPagamento) {
    return {
      ok: false,
      erro: 'Não é possível excluir o pedido: existem baixas/pagamentos efetuados no Contas a Pagar. Estorne os pagamentos antes de excluir.',
    }
  }

  // 2. Se já foi recebido, validar se é possível estornar estoque
  if (pedido.status === 'recebido' || pedido.status === 'recebido_parcial') {
    const resConsumo = await validarConsumoEstoque(pedido.itens)
    if (!resConsumo.ok) {
      return {
        ok: false,
        erro: 'Não é possível excluir o pedido: os produtos recebidos já foram consumidos do estoque.',
      }
    }
    // Estornar estoque
    await desfazerEntradaCompra({
      pedidoId: pedido.id,
      pedidoNumero: pedido.numero,
      itens: pedido.itens,
    })
  }

  // 3. Deletar Contas a Pagar associado
  await deleteContaPagarPorPedidoId(pedidoId)

  // 4. Deletar o pedido
  if (supabase) {
    try {
      await supabase.from(SUPABASE_TABLE).delete().eq('id', pedidoId)
    } catch {}
  }

  const filtered = current.filter((p) => p.id !== pedidoId)
  localStorage.setItem(KEY, JSON.stringify(filtered))

  return { ok: true }
}
