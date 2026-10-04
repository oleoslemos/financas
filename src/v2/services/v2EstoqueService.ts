import { supabase } from '../../lib/supabaseClient'
import { listV2Products } from './v2ProdutosService'

export type TipoMovimentacaoEstoque = 'entrada' | 'saida' | 'ajuste'
export type OrigemMovimentacaoEstoque = 'compra' | 'venda' | 'ajuste_manual' | 'estorno'

export interface MovimentacaoEstoqueV2 {
  id: string
  produto_id: string
  produto_nome: string
  tipo: TipoMovimentacaoEstoque
  quantidade: number // Positivo para entrada/ajuste+, negativo para saída
  origem: OrigemMovimentacaoEstoque
  referencia?: string // Ex: "Pedido #1001"
  data: string
  custo_unitario?: number | null
  created_at: string
}

export interface ItemSaldoEstoque {
  produto_id: string
  produto_nome: string
  codigo_sku: string
  categoria: string
  saldo: number
  unidade: string
  custo_medio: number
  ultimo_custo: number
  ultima_movimentacao: string
}

const KEY_MOVIMENTACOES = 'v2_estoque_movimentacoes'
const SUPABASE_TABLE = 'v2_estoque_movimentacoes'

export async function listMovimentacoesEstoque(): Promise<MovimentacaoEstoqueV2[]> {
  let list: MovimentacaoEstoqueV2[] = []

  if (supabase) {
    try {
      const { data, error } = await supabase.from(SUPABASE_TABLE).select('*').order('created_at', { ascending: false })
      if (!error && data) {
        list = data as MovimentacaoEstoqueV2[]
      }
    } catch {}
  }

  if (list.length === 0) {
    try {
      const raw = localStorage.getItem(KEY_MOVIMENTACOES)
      if (raw) list = JSON.parse(raw)
    } catch {}
  }

  return list
}

export async function getSaldoProduto(produtoId: string, produtoNome?: string): Promise<number> {
  const movs = await listMovimentacoesEstoque()
  const movsProduto = movs.filter(
    (m) => m.produto_id === produtoId || (produtoNome && m.produto_nome.toLowerCase() === produtoNome.toLowerCase())
  )
  const total = movsProduto.reduce((acc, m) => acc + m.quantidade, 0)
  return total
}

export async function listSaldosEstoque(): Promise<ItemSaldoEstoque[]> {
  const produtos = await listV2Products()
  const movs = await listMovimentacoesEstoque()

  const saldos: ItemSaldoEstoque[] = produtos.map((p) => {
    const movsP = movs.filter((m) => m.produto_id === p.id || m.produto_nome.toLowerCase() === p.name.toLowerCase())
    const saldoCalculado = movsP.reduce((acc, m) => acc + m.quantidade, 0)
    
    const ultMov = movsP[0]?.data || p.created_at.split('T')[0]
    const entradas = movsP.filter((m) => m.tipo === 'entrada' && m.custo_unitario)
    const custoMedio = entradas.length > 0 
      ? entradas.reduce((acc, m) => acc + (m.custo_unitario || 0), 0) / entradas.length
      : p.cost_price

    return {
      produto_id: p.id,
      produto_nome: p.name,
      codigo_sku: p.code_sku || 'EKO-PRD',
      categoria: p.category || p.product_line || 'Geral',
      saldo: Math.max(0, saldoCalculado),
      unidade: p.unit || 'un',
      custo_medio: custoMedio,
      ultimo_custo: p.cost_price,
      ultima_movimentacao: ultMov,
    }
  })

  return saldos
}

export async function registrarEntradaCompra(params: {
  pedidoId: string
  pedidoNumero: number
  itens: Array<{ produto_id: string; produto_nome: string; quantidade: number; preco_unitario: number }>
}): Promise<void> {
  const movsAtuais = await listMovimentacoesEstoque()
  const novasMovs: MovimentacaoEstoqueV2[] = params.itens.map((item) => ({
    id: crypto.randomUUID(),
    produto_id: item.produto_id,
    produto_nome: item.produto_nome,
    tipo: 'entrada',
    quantidade: item.quantidade,
    origem: 'compra',
    referencia: `Pedido #${params.pedidoNumero}`,
    data: new Date().toISOString().split('T')[0],
    custo_unitario: item.preco_unitario,
    created_at: new Date().toISOString(),
  }))

  if (supabase) {
    try {
      await supabase.from(SUPABASE_TABLE).insert(novasMovs)
    } catch {}
  }

  const atualizado = [...novasMovs, ...movsAtuais]
  localStorage.setItem(KEY_MOVIMENTACOES, JSON.stringify(atualizado))
}

export async function validarConsumoEstoque(itens: Array<{ produto_id: string; produto_nome: string; quantidade: number }>): Promise<{ ok: true } | { ok: false; erro: string }> {
  for (const item of itens) {
    const saldo = await getSaldoProduto(item.produto_id, item.produto_nome)
    if (saldo < item.quantidade) {
      return {
        ok: false,
        erro: `Não é possível desfazer o recebimento: o item "${item.produto_nome}" já foi consumido do estoque. Saldo disponível em estoque: ${saldo} un (necessário: ${item.quantidade} un).`,
      }
    }
  }
  return { ok: true }
}

export async function desfazerEntradaCompra(params: {
  pedidoId: string
  pedidoNumero: number
  itens: Array<{ produto_id: string; produto_nome: string; quantidade: number; preco_unitario: number }>
}): Promise<{ ok: true } | { ok: false; erro: string }> {
  const validacao = await validarConsumoEstoque(params.itens)
  if (!validacao.ok) {
    return validacao
  }

  const movsAtuais = await listMovimentacoesEstoque()
  const novasMovs: MovimentacaoEstoqueV2[] = params.itens.map((item) => ({
    id: crypto.randomUUID(),
    produto_id: item.produto_id,
    produto_nome: item.produto_nome,
    tipo: 'saida',
    quantidade: -item.quantidade,
    origem: 'estorno',
    referencia: `Estorno Pedido #${params.pedidoNumero}`,
    data: new Date().toISOString().split('T')[0],
    custo_unitario: item.preco_unitario,
    created_at: new Date().toISOString(),
  }))

  if (supabase) {
    try {
      await supabase.from(SUPABASE_TABLE).insert(novasMovs)
    } catch {}
  }

  const atualizado = [...novasMovs, ...movsAtuais]
  localStorage.setItem(KEY_MOVIMENTACOES, JSON.stringify(atualizado))

  return { ok: true }
}
