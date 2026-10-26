import { supabase } from '../../lib/supabaseClient'
import {
  getContaPagarPorPedidoId,
  saveContaPagar,
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

// ─── Tipos ──────────────────────────────────────────────────────────────

export type StatusPedido = 'rascunho' | 'emitido' | 'recebido_parcial' | 'recebido' | 'cancelado'

export type PedidoCompraItem = {
  produto_id: string
  produto_nome: string
  quantidade: number
  preco_unitario: number
  total: number
  /** Quantidade já recebida (acumulada em recebimentos parciais) */
  quantidade_recebida?: number
}

export type RecebimentoCompra = {
  data: string
  itens: {
    produto_id: string
    produto_nome: string
    quantidade_recebida: number
  }[]
  justificativa?: string
}

export type PedidoCompra = {
  id: string
  numero: number | string
  fornecedor: string
  status: StatusPedido
  dataEmissao: string | null
  dataPrevistaEntrega: string | null
  observacao?: string | null
  total: number
  numeroParcelas: number
  formaPagamento?: string
  contaSaidaTag?: string
  itens: PedidoCompraItem[]
  created_at: string
  updated_at: string
  /** Frete armazenado separadamente – somado ao total na emissão */
  frete?: number
  /** Data do pedido (padrão = data atual, mas pode ser retroativa) */
  dataPedido?: string
  /** Data de vencimento do pagamento (livre, pode ser retroativa) */
  dataVencimento?: string | null
  /** Data prevista de recebimento (padrão = dataPedido + 20 dias corridos) */
  dataRecebimentoPrevista?: string | null
  /** Justificativa caso a data de recebimento prevista seja alterada */
  justificativaDataRecebimento?: string
  /** Histórico de recebimentos parciais */
  recebimentos?: RecebimentoCompra[]
}

// ─── Constantes ─────────────────────────────────────────────────────────

const KEY = 'v2_pedidos_compra'
const SUPABASE_TABLE = 'v2_pedidos_compra'

// ─── Helpers ────────────────────────────────────────────────────────────



function adicionarDias(dataBase: string, dias: number): string {
  const d = new Date(dataBase + 'T00:00:00')
  d.setDate(d.getDate() + dias)
  return d.toISOString().split('T')[0]
}

// ─── CRUD ───────────────────────────────────────────────────────────────

export function cleanPedidoCompraForSupabase(p: PedidoCompra): Record<string, any> {
  return {
    id: p.id,
    numero: p.numero,
    fornecedor: p.fornecedor || '',
    status: p.status || 'rascunho',
    dataEmissao: p.dataEmissao || null,
    dataPrevistaEntrega: p.dataPrevistaEntrega || null,
    observacao: p.observacao || null,
    total: Number(p.total) || 0,
    numeroParcelas: Number(p.numeroParcelas) || 1,
    formaPagamento: p.formaPagamento || null,
    contaSaidaTag: p.contaSaidaTag || null,
    frete: Number(p.frete) || 0,
    dataPedido: p.dataPedido || null,
    dataVencimento: p.dataVencimento || null,
    dataRecebimentoPrevista: p.dataRecebimentoPrevista || null,
    justificativaDataRecebimento: p.justificativaDataRecebimento || null,
    recebimentos: p.recebimentos || [],
    itens: p.itens || [],
    created_at: p.created_at || new Date().toISOString(),
    updated_at: p.updated_at || new Date().toISOString(),
  }
}

export async function listPedidosCompra(): Promise<PedidoCompra[]> {
  let localList: PedidoCompra[] = []
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) localList = JSON.parse(raw)
  } catch {}

  let list: PedidoCompra[] = []
  if (supabase) {
    try {
      const { data, error } = await supabase.from(SUPABASE_TABLE).select('*').order('created_at', { ascending: false })
      if (!error && data) {
        list = data as PedidoCompra[]
        const remoteIds = new Set(list.map((r) => r.id))
        const pendingLocal = localList.filter((loc) => !remoteIds.has(loc.id))

        if (pendingLocal.length > 0) {
          try {
            const cleanPending = pendingLocal.map(cleanPedidoCompraForSupabase)
            await supabase.from(SUPABASE_TABLE).upsert(cleanPending)
          } catch {}
          list = [...pendingLocal, ...list]
        }

        try {
          localStorage.setItem(KEY, JSON.stringify(list))
        } catch {}
        return list
      }
    } catch {}
  }
  return localList
}

export async function savePedidoCompra(pedido: Omit<PedidoCompra, 'id' | 'numero' | 'created_at' | 'updated_at'>): Promise<PedidoCompra> {
  const current = await listPedidosCompra()

  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const datePrefix = `${yyyy}${mm}${dd}`

  const todayOrders = current.filter((p) => String(p.numero).startsWith(datePrefix))
  let seq = 1
  if (todayOrders.length > 0) {
    const seqs = todayOrders.map((p) => {
      const numStr = String(p.numero).substring(datePrefix.length)
      return parseInt(numStr, 10) || 0
    })
    seq = Math.max(...seqs) + 1
  }

  const seqStr = String(seq).padStart(3, '0')
  const novoNumeroStr = `${datePrefix}${seqStr}`

  // Preencher dataPedido padrão se não informada
  const dataPedidoFinal = pedido.dataPedido || new Date().toISOString().split('T')[0]
  // Preencher dataRecebimentoPrevista padrão (dataPedido + 20 dias) se não informada
  const dataRecebimentoPrevistaFinal = pedido.dataRecebimentoPrevista || adicionarDias(dataPedidoFinal, 20)

  const newPedido: PedidoCompra = {
    ...pedido,
    id: crypto.randomUUID(),
    numero: novoNumeroStr,
    dataPedido: dataPedidoFinal,
    dataRecebimentoPrevista: dataRecebimentoPrevistaFinal,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (supabase) {
    try {
      await supabase.from(SUPABASE_TABLE).insert([cleanPedidoCompraForSupabase(newPedido)])
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
      await supabase.from(SUPABASE_TABLE).upsert(cleanPedidoCompraForSupabase(updated))
    } catch {}
  }

  const updatedList = current.map((p) => (p.id === pedido.id ? updated : p))
  localStorage.setItem(KEY, JSON.stringify(updatedList))

  // Atualizar Contas a Pagar associada (parcela única)
  const contaExistente = await getContaPagarPorPedidoId(pedido.id)
  if (contaExistente) {
    const itemNome = pedido.itens.length > 1
      ? `${pedido.itens[0]?.produto_nome || 'Item'} (+${pedido.itens.length - 1} itens)`
      : (pedido.itens[0]?.produto_nome || 'Item')

    const totalComFrete = (pedido.total ?? 0) + (pedido.frete ?? 0)
    const vencimento = pedido.dataVencimento || contaExistente.parcelas?.[0]?.vencimento || new Date().toISOString().split('T')[0]

    await updateContaPagar({
      ...contaExistente,
      fornecedor: pedido.fornecedor,
      descricao: `Pedido de Compra #${pedido.numero} - ${itemNome}`,
      total: totalComFrete,
      parcelas: [
        {
          numero: 1,
          vencimento,
          valor: totalComFrete,
          status: (contaExistente.parcelas?.[0]?.status || 'aberta') as StatusConta,
        },
      ],
    })
  }

  return updated
}

// ─── Emissão ────────────────────────────────────────────────────────────

export async function emitirPedidoCompra(pedidoId: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const current = await listPedidosCompra()
  const pedido = current.find((p) => p.id === pedidoId)
  if (!pedido) return { ok: false, erro: 'Pedido não encontrado.' }

  if (pedido.status !== 'rascunho') {
    return { ok: false, erro: 'Pedido já foi emitido.' }
  }

  // Calcular total com frete
  const totalComFrete = (pedido.total ?? 0) + (pedido.frete ?? 0)

  // Vencimento: usar dataVencimento do pedido ou 30 dias a partir da emissão
  const vencimento = pedido.dataVencimento || adicionarDias(new Date().toISOString().split('T')[0], 30)

  const descricaoItens =
    pedido.itens && pedido.itens.length > 1
      ? `${pedido.itens[0]?.produto_nome || 'Item'} (+${pedido.itens.length - 1} itens)`
      : (pedido.itens?.[0]?.produto_nome || 'Item')

  // Gerar Contas a Pagar com parcela ÚNICA
  await saveContaPagar({
    pedido_id: pedido.id,
    descricao: `Pedido de Compra #${pedido.numero} - ${descricaoItens}`,
    fornecedor: pedido.fornecedor,
    origem: 'compra',
    categoria: 'Mercadoria',
    total: totalComFrete,
    totalPago: 0,
    status: 'aberta',
    parcelas: [
      {
        numero: 1,
        vencimento,
        valor: totalComFrete,
        status: 'aberta' as StatusConta,
      },
    ],
  })

  pedido.status = 'emitido'
  pedido.dataEmissao = new Date().toISOString().split('T')[0]
  await updatePedidoCompra(pedido)
  return { ok: true }
}

// ─── Recebimento por Item ───────────────────────────────────────────────

/**
 * Recebe itens de um pedido informando a quantidade recebida de cada produto.
 * - Registra entrada de estoque somente para quantidades recebidas.
 * - Atualiza status para 'recebido_parcial' ou 'recebido'.
 * - Registra histórico de recebimento.
 */
export async function receberPedidoCompraPorItem(
  pedidoId: string,
  itensRecebimento: {
    produto_id: string
    quantidade_recebida: number
  }[],
  justificativa?: string
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const current = await listPedidosCompra()
  const pedido = current.find((p) => p.id === pedidoId)
  if (!pedido) return { ok: false, erro: 'Pedido não encontrado.' }
  if (pedido.status === 'recebido') return { ok: false, erro: 'Pedido já foi totalmente recebido.' }
  if (pedido.status === 'cancelado') return { ok: false, erro: 'Pedido cancelado não pode ser recebido.' }
  if (pedido.status === 'rascunho') return { ok: false, erro: 'Pedido precisa ser emitido antes de receber.' }

  // Validar e atualizar cada item
  for (const ir of itensRecebimento) {
    const item = pedido.itens.find((i) => i.produto_id === ir.produto_id)
    if (!item) return { ok: false, erro: `Item ${ir.produto_id} não encontrado no pedido.` }

    const jaRecebido = item.quantidade_recebida ?? 0
    const pendente = item.quantidade - jaRecebido
    if (ir.quantidade_recebida > pendente) {
      return { ok: false, erro: `Quantidade recebida (${ir.quantidade_recebida}) excede o pendente (${pendente}) para "${item.produto_nome}".` }
    }
    if (ir.quantidade_recebida < 0) {
      return { ok: false, erro: `Quantidade recebida não pode ser negativa para "${item.produto_nome}".` }
    }

    // Acumular quantidade recebida
    item.quantidade_recebida = jaRecebido + ir.quantidade_recebida
  }

  // Registrar entrada de estoque somente para os itens recebidos nesta operação
  const itensParaEstoque = itensRecebimento
    .filter((ir) => ir.quantidade_recebida > 0)
    .map((ir) => {
      const item = pedido.itens.find((i) => i.produto_id === ir.produto_id)!
      return {
        produto_id: ir.produto_id,
        produto_nome: item.produto_nome,
        quantidade: ir.quantidade_recebida,
        preco_unitario: item.preco_unitario,
        total: ir.quantidade_recebida * item.preco_unitario,
      }
    })

  if (itensParaEstoque.length > 0) {
    await registrarEntradaCompra({
      pedidoId: pedido.id,
      pedidoNumero: pedido.numero,
      itens: itensParaEstoque,
    })
  }

  // Determinar se ainda há itens pendentes
  const aindaPendente = pedido.itens.some((i) => {
    const recebido = i.quantidade_recebida ?? 0
    return recebido < i.quantidade
  })
  pedido.status = aindaPendente ? 'recebido_parcial' : 'recebido'

  // Registrar histórico de recebimento
  const novoRecebimento: RecebimentoCompra = {
    data: new Date().toISOString().split('T')[0],
    itens: itensRecebimento
      .filter((ir) => ir.quantidade_recebida > 0)
      .map((ir) => ({
        produto_id: ir.produto_id,
        produto_nome: pedido.itens.find((i) => i.produto_id === ir.produto_id)?.produto_nome || '',
        quantidade_recebida: ir.quantidade_recebida,
      })),
    justificativa,
  }
  pedido.recebimentos = (pedido.recebimentos ?? []).concat(novoRecebimento)

  await updatePedidoCompra(pedido)
  return { ok: true }
}

/**
 * Wrapper de compatibilidade: recebe tudo de uma vez (todos os itens completos).
 */
export async function receberPedidoCompra(pedidoId: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const current = await listPedidosCompra()
  const pedido = current.find((p) => p.id === pedidoId)
  if (!pedido) return { ok: false, erro: 'Pedido não encontrado.' }

  const itensRecebimento = pedido.itens.map((it) => ({
    produto_id: it.produto_id,
    quantidade_recebida: it.quantidade - (it.quantidade_recebida ?? 0),
  }))
  return await receberPedidoCompraPorItem(pedidoId, itensRecebimento)
}

// ─── Ajustar Quantidade de Item ─────────────────────────────────────────

/**
 * Ajusta a quantidade de um item no pedido para a quantidade já recebida.
 * Recalcula o total do item, do pedido e da Conta a Pagar associada.
 * Usa-se quando a quantidade recebida é menor que a pedida e o
 * fornecedor não vai entregar o restante.
 */
export async function ajustarQuantidadeItem(
  pedidoId: string,
  produtoId: string,
  novaQuantidade: number
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const current = await listPedidosCompra()
  const pedido = current.find((p) => p.id === pedidoId)
  if (!pedido) return { ok: false, erro: 'Pedido não encontrado.' }

  const item = pedido.itens.find((i) => i.produto_id === produtoId)
  if (!item) return { ok: false, erro: 'Item não encontrado no pedido.' }

  const jaRecebido = item.quantidade_recebida ?? 0
  if (novaQuantidade < jaRecebido) {
    return { ok: false, erro: `A nova quantidade (${novaQuantidade}) não pode ser menor que a já recebida (${jaRecebido}).` }
  }

  // Atualizar o item
  item.quantidade = novaQuantidade
  item.total = novaQuantidade * item.preco_unitario

  // Recalcular total do pedido (soma dos itens, sem frete)
  pedido.total = pedido.itens.reduce((sum, i) => sum + i.total, 0)

  // Re-verificar status
  const aindaPendente = pedido.itens.some((i) => {
    const recebido = i.quantidade_recebida ?? 0
    return recebido < i.quantidade
  })
  if (!aindaPendente && (pedido.status === 'recebido_parcial' || pedido.status === 'emitido')) {
    pedido.status = 'recebido'
  }

  // updatePedidoCompra já recalcula a Conta a Pagar
  await updatePedidoCompra(pedido)
  return { ok: true }
}

// ─── Desfazer Recebimento ───────────────────────────────────────────────

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

  // Zerar quantidades recebidas em todos os itens
  for (const item of pedido.itens) {
    item.quantidade_recebida = 0
  }

  // Limpar histórico de recebimentos
  pedido.recebimentos = []

  // Voltar status para emitido
  pedido.status = 'emitido'
  await updatePedidoCompra(pedido)

  return { ok: true }
}

// ─── Voltar para Aberto (Rascunho) ─────────────────────────────────────

export async function voltarPedidoParaAberto(pedidoId: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const current = await listPedidosCompra()
  const pedido = current.find((p) => p.id === pedidoId)
  if (!pedido) return { ok: false, erro: 'Pedido não encontrado.' }

  // Validar pagamentos antes de voltar para aberto
  const temPagamento = await verificarSePedidoTemPagamento(pedidoId)
  if (temPagamento) {
    return {
      ok: false,
      erro: 'Não é possível voltar o pedido para aberto: existem baixas/pagamentos efetuados no Contas a Pagar. Estorne os pagamentos antes de voltar para aberto.',
    }
  }

  // Se já foi recebido, estornar estoque
  if (pedido.status === 'recebido' || pedido.status === 'recebido_parcial') {
    const resEstorno = await desfazerEntradaCompra({
      pedidoId: pedido.id,
      pedidoNumero: pedido.numero,
      itens: pedido.itens,
    })
    if (!resEstorno.ok) {
      return resEstorno
    }
    // Zerar quantidades recebidas
    for (const item of pedido.itens) {
      item.quantidade_recebida = 0
    }
    pedido.recebimentos = []
  }

  // Deletar o contas a pagar não pago para voltar para rascunho/aberto limpo
  await deleteContaPagarPorPedidoId(pedidoId)

  pedido.status = 'rascunho'
  await updatePedidoCompra(pedido)
  return { ok: true }
}

// ─── Cancelar ───────────────────────────────────────────────────────────

export async function cancelarPedidoCompra(pedidoId: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const current = await listPedidosCompra()
  const pedido = current.find((p) => p.id === pedidoId)
  if (!pedido) return { ok: false, erro: 'Pedido não encontrado.' }

  const temPagamento = await verificarSePedidoTemPagamento(pedidoId)
  if (temPagamento) {
    return {
      ok: false,
      erro: 'Não é possível cancelar o pedido: existem baixas/pagamentos efetuados no Contas a Pagar. Estorne os pagamentos antes de cancelar.',
    }
  }

  if (pedido.status === 'recebido' || pedido.status === 'recebido_parcial') {
    const resEstorno = await desfazerEntradaCompra({
      pedidoId: pedido.id,
      pedidoNumero: pedido.numero,
      itens: pedido.itens,
    })
    if (!resEstorno.ok) return resEstorno
  }

  pedido.status = 'cancelado'
  await updatePedidoCompra(pedido)
  return { ok: true }
}

// ─── Excluir ────────────────────────────────────────────────────────────

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
