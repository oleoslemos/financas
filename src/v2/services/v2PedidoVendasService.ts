import { supabase } from '../../lib/supabaseClient'
import {
  saveContaPagar,
  updateContaPagarPorPedidoId,
  deleteContaPagarPorPedidoId,
  deleteContaPagar,
  listContasPagar,
  verificarSePedidoTemPagamento,
  StatusConta,
  ContaPagar,
  ContaPagarParcela,
} from './v2ContasPagarService'
import {
  reservarEstoqueVenda,
  liberarEstoqueVenda,
  baixarFisicoEntregaVenda,
} from './v2EstoqueService'

export type CanalVenda = 'representacao' | 'distribuicao'

export type StatusVenda = 'proposta' | 'aprovado' | 'faturado' | 'entregue' | 'cancelado'

export type PedidoVendaItem = {
  produto_id: string
  produto_nome: string
  quantidade: number
  preco_tabela: number
  preco_unitario: number
  preco_fabrica?: number
  preco_venda_minimo?: number
  desconto_percentual?: number
  total: number
}

export type PedidoVenda = {
  id: string
  numero: string
  canal: CanalVenda
  status: StatusVenda
  cliente_id?: string
  cliente_nome: string
  cliente_documento?: string
  cliente_cidade?: string
  tabela_preco_id?: string
  tabela_preco_nome?: string
  // Datas
  dataEmissao: string                   // Data do pedido (editável, retroativa)
  dataPrevistaEntrega?: string | null   // Previsão de entrega (editável)
  dataVencimento?: string | null        // Vencimento da conta a receber (único lançamento)
  dataEntrega?: string | null           // Data efetiva da entrega
  // Pagamento
  formaPagamento: string
  numeroParcelas: number                // mantido por compatibilidade (sempre 1 no novo fluxo)
  contaEntradaTag?: string
  frete?: number                        // Frete (separado dos itens, somado no total)
  // Observações e descontos
  observacao?: string | null
  subtotal: number                      // soma dos itens
  descontoTotal: number
  total: number                         // subtotal + frete
  desconto5xPercentual?: number
  total5x?: number
  descontoVistaPercentual?: number
  totalVista?: number
  condicaoSelecionada?: 'sem_desconto' | 'ate_5x' | 'a_vista'
  // Comissões
  vendedor_nome?: string | null
  comissao_percentual?: number | null
  comissao_valor?: number | null
  comissao_valor_total?: number | null
  comissao_valor_gerado?: number | null
  comissao_gerada?: boolean | null
  comissao_data_geracao?: string | null
  pagamento_fabrica?: number | null
  resultado_liquido?: number | null
  itens: PedidoVendaItem[]
  created_at: string
  updated_at: string
}

const STORAGE_KEY = 'v2_pedidos_venda'
const SUPABASE_TABLE = 'v2_pedidos_venda'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Calcula data + N dias corridos */
function adicionarDias(dataBase: string, dias: number): string {
  const d = new Date(dataBase + 'T00:00:00')
  d.setDate(d.getDate() + dias)
  return d.toISOString().split('T')[0]
}

/** Data de hoje no formato YYYY-MM-DD */
function dataHoje(): string {
  return new Date().toISOString().split('T')[0]
}

const SEED_PEDIDOS: PedidoVenda[] = [
  {
    id: 'pv-001',
    numero: 'PV-20261011001',
    canal: 'distribuicao',
    status: 'faturado',
    cliente_nome: 'CLÍNICA LONGEVIDADE & SAÚDE LTDA',
    cliente_documento: '12.345.678/0001-90',
    cliente_cidade: 'Chapecó/SC',
    tabela_preco_nome: 'Tabela Padrão Distribuidor',
    dataEmissao: '2026-10-11',
    dataPrevistaEntrega: '2026-10-20',
    dataVencimento: '2026-10-25',
    formaPagamento: 'Boleto',
    numeroParcelas: 1,
    contaEntradaTag: '#Inter',
    observacao: 'Entrega pela manhã na sede principal.',
    subtotal: 3890.0,
    descontoTotal: 0,
    total: 3890.0,
    itens: [
      {
        produto_id: 'colchao-ouro',
        produto_nome: 'COLCHÃO MAGNÉTICO OURO HEALTH [CASAL]',
        quantidade: 1,
        preco_tabela: 3890.0,
        preco_unitario: 3890.0,
        desconto_percentual: 0,
        total: 3890.0,
      },
    ],
    created_at: '2026-10-11T10:00:00Z',
    updated_at: '2026-10-11T10:00:00Z',
  },
  {
    id: 'pv-002',
    numero: 'PV-20261012002',
    canal: 'representacao',
    status: 'proposta',
    cliente_nome: 'MARCOS AURÉLIO SILVEIRA',
    cliente_documento: '045.892.119-33',
    cliente_cidade: 'Florianópolis/SC',
    tabela_preco_nome: 'Tabela Consumidor Final',
    dataEmissao: '2026-10-12',
    dataPrevistaEntrega: '2026-10-25',
    dataVencimento: '2026-10-25',
    formaPagamento: 'Pix',
    numeroParcelas: 1,
    contaEntradaTag: '#Caixa',
    observacao: 'Proposta enviada pelo WhatsApp. Cliente aguardando aprovação familiar.',
    subtotal: 1250.0,
    descontoTotal: 50.0,
    total: 1200.0,
    itens: [
      {
        produto_id: 'palmilha-magnetica',
        produto_nome: 'PALMILHA MAGNÉTICA CONFORT ACTIVE [PAR]',
        quantidade: 4,
        preco_tabela: 312.5,
        preco_unitario: 300.0,
        desconto_percentual: 4,
        total: 1200.0,
      },
    ],
    created_at: '2026-10-12T14:30:00Z',
    updated_at: '2026-10-12T14:30:00Z',
  },
  {
    id: 'pv-003',
    numero: 'PV-20261013003',
    canal: 'distribuicao',
    status: 'aprovado',
    cliente_nome: 'FARMÁCIA VIDA NATURAL',
    cliente_documento: '98.765.432/0001-11',
    cliente_cidade: 'Joinville/SC',
    tabela_preco_nome: 'Tabela Revenda Especial',
    dataEmissao: '2026-10-13',
    dataPrevistaEntrega: '2026-10-22',
    dataVencimento: '2026-10-30',
    formaPagamento: 'Boleto',
    numeroParcelas: 1,
    contaEntradaTag: '#Nubank',
    observacao: 'Pedido aprovado. Separar no estoque central.',
    subtotal: 2450.0,
    descontoTotal: 0,
    total: 2450.0,
    itens: [
      {
        produto_id: 'travesseiro-cervical',
        produto_nome: 'TRAVESSEIRO CERVICAL ANATÔMICO MAGNÉTICO',
        quantidade: 10,
        preco_tabela: 245.0,
        preco_unitario: 245.0,
        desconto_percentual: 0,
        total: 2450.0,
      },
    ],
    created_at: '2026-10-13T09:15:00Z',
    updated_at: '2026-10-13T09:15:00Z',
  },
]

// ─── Storage ────────────────────────────────────────────────────────────────

function readFromStorage(): PedidoVenda[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as PedidoVenda[]
  } catch {}
  return SEED_PEDIDOS
}

function writeToStorage(list: PedidoVenda[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {}
}

// ─── Sanitização para Supabase ──────────────────────────────────────────────
export function cleanPedidoForSupabase(p: PedidoVenda): Record<string, any> {
  return {
    id: p.id,
    numero: p.numero,
    canal: p.canal || 'distribuicao',
    status: p.status || 'proposta',
    cliente_id: p.cliente_id || null,
    cliente_nome: p.cliente_nome || '',
    cliente_documento: p.cliente_documento || null,
    cliente_cidade: p.cliente_cidade || null,
    tabela_preco_id: p.tabela_preco_id || null,
    tabela_preco_nome: p.tabela_preco_nome || null,
    dataEmissao: p.dataEmissao || null,
    dataPrevistaEntrega: p.dataPrevistaEntrega || null,
    dataVencimento: p.dataVencimento || null,
    dataEntrega: p.dataEntrega || null,
    formaPagamento: p.formaPagamento || 'Boleto',
    numeroParcelas: Number(p.numeroParcelas) || 1,
    contaEntradaTag: p.contaEntradaTag || null,
    frete: Number(p.frete) || 0,
    observacao: p.observacao || null,
    subtotal: Number(p.subtotal) || 0,
    descontoTotal: Number(p.descontoTotal) || 0,
    total: Number(p.total) || 0,
    desconto5xPercentual: Number(p.desconto5xPercentual) || 5,
    total5x: Number(p.total5x) || 0,
    descontoVistaPercentual: Number(p.descontoVistaPercentual) || 10,
    totalVista: Number(p.totalVista) || 0,
    condicaoSelecionada: p.condicaoSelecionada || 'sem_desconto',
    vendedor_nome: p.vendedor_nome || null,
    comissao_percentual: p.comissao_percentual != null ? Number(p.comissao_percentual) : null,
    comissao_valor: p.comissao_valor != null ? Number(p.comissao_valor) : null,
    comissao_valor_total: p.comissao_valor_total != null ? Number(p.comissao_valor_total) : null,
    comissao_valor_gerado: p.comissao_valor_gerado != null ? Number(p.comissao_valor_gerado) : null,
    comissao_gerada: Boolean(p.comissao_gerada),
    comissao_data_geracao: p.comissao_data_geracao || null,
    pagamento_fabrica: p.pagamento_fabrica != null ? Number(p.pagamento_fabrica) : null,
    resultado_liquido: p.resultado_liquido != null ? Number(p.resultado_liquido) : null,
    itens: p.itens || [],
    created_at: p.created_at || new Date().toISOString(),
    updated_at: p.updated_at || new Date().toISOString(),
  }
}

export function cleanPedidoBaseForSupabase(p: PedidoVenda): Record<string, any> {
  return {
    id: p.id,
    numero: p.numero,
    canal: p.canal || 'distribuicao',
    status: p.status || 'proposta',
    cliente_id: p.cliente_id || null,
    cliente_nome: p.cliente_nome || '',
    cliente_documento: p.cliente_documento || null,
    cliente_cidade: p.cliente_cidade || null,
    tabela_preco_id: p.tabela_preco_id || null,
    tabela_preco_nome: p.tabela_preco_nome || null,
    dataEmissao: p.dataEmissao || null,
    dataPrevistaEntrega: p.dataPrevistaEntrega || null,
    dataVencimento: p.dataVencimento || null,
    dataEntrega: p.dataEntrega || null,
    formaPagamento: p.formaPagamento || 'Boleto',
    numeroParcelas: Math.max(1, Number(p.numeroParcelas) || 1),
    contaEntradaTag: p.contaEntradaTag || null,
    frete: Number(p.frete) || 0,
    observacao: p.observacao || null,
    subtotal: Number(p.subtotal) || 0,
    descontoTotal: Number(p.descontoTotal) || 0,
    total: Number(p.total) || 0,
    desconto5xPercentual: Number(p.desconto5xPercentual) || 5,
    total5x: Number(p.total5x) || 0,
    descontoVistaPercentual: Number(p.descontoVistaPercentual) || 10,
    totalVista: Number(p.totalVista) || 0,
    condicaoSelecionada: p.condicaoSelecionada || 'sem_desconto',
    itens: p.itens || [],
    created_at: p.created_at || new Date().toISOString(),
    updated_at: p.updated_at || new Date().toISOString(),
  }
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function listPedidosVenda(): Promise<PedidoVenda[]> {
  const localList = readFromStorage()
  let list: PedidoVenda[] = []

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from(SUPABASE_TABLE)
        .select('*')
        .order('created_at', { ascending: false })

      if (!error && data) {
        list = data as PedidoVenda[]
        const remoteIds = new Set(list.map((r) => r.id))
        const pendingLocal = localList.filter((loc) => !remoteIds.has(loc.id) && !loc.id.startsWith('pv-00'))

        if (pendingLocal.length > 0) {
          try {
            const cleanPending = pendingLocal.map(cleanPedidoForSupabase)
            const { error: upsertErr } = await supabase.from(SUPABASE_TABLE).upsert(cleanPending)
            if (upsertErr) {
              console.error('Erro ao sincronizar pedidos locais pendentes:', upsertErr)
            } else {
              console.log('Pedidos locais pendentes sincronizados com sucesso no Supabase:', cleanPending.length)
            }
          } catch (syncErr) {
            console.warn('Erro ao sincronizar pedidos locais pendentes:', syncErr)
          }
          list = [...pendingLocal, ...list]
        }

        writeToStorage(list)
        return list
      }
    } catch (e) {
      console.warn('Falha ao buscar pedidos de venda do Supabase, usando local:', e)
    }
  }

  return localList
}

export async function syncPedidosVendaComSupabase(): Promise<{ ok: boolean; count: number; error?: string }> {
  if (!supabase) return { ok: false, count: 0, error: 'Supabase não inicializado' }
  try {
    const localList = readFromStorage()
    const { data, error } = await supabase.from(SUPABASE_TABLE).select('*').order('created_at', { ascending: false })
    if (error) return { ok: false, count: 0, error: error.message }
    const remoteList = (data as PedidoVenda[]) || []
    const remoteIds = new Set(remoteList.map((r) => r.id))
    const pendingLocal = localList.filter((loc) => !remoteIds.has(loc.id) && !loc.id.startsWith('pv-00'))

    if (pendingLocal.length > 0) {
      const cleanPending = pendingLocal.map(cleanPedidoForSupabase)
      const { error: upErr } = await supabase.from(SUPABASE_TABLE).upsert(cleanPending)
      if (upErr) return { ok: false, count: 0, error: upErr.message }
    }

    const merged = [...pendingLocal, ...remoteList]
    writeToStorage(merged)
    return { ok: true, count: merged.length }
  } catch (err: any) {
    return { ok: false, count: 0, error: err?.message || String(err) }
  }
}

export async function savePedidoVenda(
  pedido: Omit<PedidoVenda, 'id' | 'numero' | 'created_at' | 'updated_at'>
): Promise<PedidoVenda> {
  const current = await listPedidosVenda()

  const dataEmissao = pedido.dataEmissao || dataHoje()
  const ano = dataEmissao.slice(0, 4)
  const mm = dataEmissao.slice(5, 7)
  const dd = dataEmissao.slice(8, 10)
  const datePrefix = `${ano}${mm}${dd}`
  
  const todayOrders = current.filter((p) => {
    const n = String(p.numero).replace(/^#/, '').replace(/^PV-/, '')
    return n.startsWith(datePrefix)
  })
  let seq = 1
  if (todayOrders.length > 0) {
    const seqs = todayOrders.map((p) => {
      const n = String(p.numero).replace(/^#/, '').replace(/^PV-/, '')
      const numStr = n.substring(datePrefix.length)
      return parseInt(numStr, 10) || 0
    })
    seq = Math.max(...seqs) + 1
  }

  const seqStr = String(seq).padStart(3, '0')
  const novoNumero = `${datePrefix}${seqStr}`

  const novo: PedidoVenda = {
    ...pedido,
    id: crypto.randomUUID(),
    numero: novoNumero,
    numeroParcelas: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (supabase) {
    try {
      const { error: insError } = await supabase.from(SUPABASE_TABLE).insert([cleanPedidoForSupabase(novo)])
      if (insError) {
        console.error('Erro ao salvar pedido de venda no Supabase:', insError)
      }
    } catch (e) {
      console.error('Exceção ao inserir pedido no Supabase:', e)
    }
  }

  current.unshift(novo)
  writeToStorage(current)

  return novo
}

export async function updatePedidoVenda(pedido: PedidoVenda): Promise<PedidoVenda> {
  const current = await listPedidosVenda()
  const updated: PedidoVenda = {
    ...pedido,
    numeroParcelas: Math.max(1, Number(pedido.numeroParcelas) || 1),
    updated_at: new Date().toISOString(),
  }

  if (supabase) {
    try {
      const clean = cleanPedidoForSupabase(updated)
      const { error: upErr } = await supabase.from(SUPABASE_TABLE).upsert(clean)
      if (upErr) {
        console.warn('Tentando persistência no Supabase com colunas base:', upErr.message)
        // Fallback defensivo com colunas essenciais para que o status NUNCA falhe
        await supabase.from(SUPABASE_TABLE).upsert(cleanPedidoBaseForSupabase(updated))
      }
    } catch (e) {
      try {
        await supabase.from(SUPABASE_TABLE).upsert(cleanPedidoBaseForSupabase(updated))
      } catch (errFallback) {
        console.error('Exceção ao atualizar pedido no Supabase:', errFallback)
      }
    }
  }

  // Atualizar conta a receber se faturado ou entregue
  if (updated.status === 'faturado' || updated.status === 'entregue') {
    try {
      await updateContaPagarPorPedidoId(pedido.id, {
        total: updated.total,
        descricao: _descricaoVenda(updated),
        fornecedor: updated.cliente_nome,
      })
    } catch {}
  }

  const list = current.map((p) => (p.id === pedido.id ? updated : p))
  writeToStorage(list)
  return updated
}

// ─── Descrição para conta a receber ─────────────────────────────────────────

function _descricaoVenda(pedido: PedidoVenda): string {
  const descItens =
    pedido.itens && pedido.itens.length > 1
      ? `${pedido.itens[0]?.produto_nome || 'Produto'} (+${pedido.itens.length - 1} itens)`
      : (pedido.itens?.[0]?.produto_nome || 'Produto')
  return `Venda ${pedido.numero} - ${descItens}`
}

// ─── Fluxo de Status ─────────────────────────────────────────────────────────

export async function aprovarPedidoVenda(pedidoId: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const current = await listPedidosVenda()
  const pedido = current.find((p) => p.id === pedidoId)
  if (!pedido) return { ok: false, erro: 'Pedido não encontrado.' }

  // Reservar estoque ao aprovar
  if (pedido.itens && pedido.itens.length > 0) {
    try {
      await reservarEstoqueVenda({
        venda_id: pedido.id,
        venda_numero: pedido.numero,
        itens: pedido.itens.map((it) => ({
          produto_id: it.produto_id,
          produto_nome: it.produto_nome,
          quantidade: it.quantidade,
        })),
      })
    } catch (e) {
      console.warn('Erro ao reservar estoque:', e)
    }
  }

  pedido.status = 'aprovado'
  await updatePedidoVenda(pedido)
  return { ok: true }
}

/**
 * Faturar pedido de venda:
 * - Gera **uma única** conta a receber com dataVencimento do pedido
 * - Altera status para 'faturado'
 */
export async function faturarPedidoVenda(pedidoId: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const current = await listPedidosVenda()
  const pedido = current.find((p) => p.id === pedidoId)
  if (!pedido) return { ok: false, erro: 'Pedido não encontrado.' }

  // Vencimento padrão: dataVencimento, dataPrevistaEntrega ou +30 dias da emissão
  const vencimentoInicial =
    pedido.dataVencimento ||
    pedido.dataPrevistaEntrega ||
    adicionarDias(pedido.dataEmissao || dataHoje(), 30)

  const numParcelas = Math.max(1, Number(pedido.numeroParcelas) || 1)
  const valorTotal = Number(pedido.total) || 0
  const valorParcelaBase = Number((valorTotal / numParcelas).toFixed(2))

  const parcelas: ContaPagarParcela[] = []
  for (let i = 1; i <= numParcelas; i++) {
    const venc = i === 1 ? vencimentoInicial : adicionarDias(vencimentoInicial, (i - 1) * 30)
    // Ajuste de centavos na última parcela para fechar exatamente o valor total
    const valor = i === numParcelas ? Number((valorTotal - valorParcelaBase * (numParcelas - 1)).toFixed(2)) : valorParcelaBase
    parcelas.push({
      numero: i,
      vencimento: venc,
      valor,
      status: 'aberta' as StatusConta,
    })
  }

  await saveContaPagar({
    tipo: 'receber',
    pedido_id: pedido.id,
    descricao: _descricaoVenda(pedido),
    fornecedor: pedido.cliente_nome,
    origem: 'venda',
    categoria: 'Receita de Vendas',
    total: valorTotal,
    totalPago: 0,
    status: 'aberta' as StatusConta,
    vencimento: vencimentoInicial,
    forma_pagamento: pedido.formaPagamento || 'Boleto',
    parcelas,
  })

  pedido.status = 'faturado'
  await updatePedidoVenda(pedido)
  return { ok: true }
}

/**
 * Confirmar entrega:
 * - Baixa físico do estoque (saída)
 * - Altera status para 'entregue'
 * - Salva dataEntrega
 */
export async function entregarPedidoVenda(
  pedidoId: string,
  dataEntrega: string = dataHoje()
): Promise<{ ok: true; pedido: PedidoVenda } | { ok: false; erro: string }> {
  const current = await listPedidosVenda()
  const pedido = current.find((p) => p.id === pedidoId)
  if (!pedido) return { ok: false, erro: 'Pedido não encontrado.' }

  // Baixar físico do estoque
  if (pedido.itens && pedido.itens.length > 0) {
    try {
      await baixarFisicoEntregaVenda({
        venda_id: pedido.id,
        venda_numero: pedido.numero,
        itens: pedido.itens.map((it) => ({
          produto_id: it.produto_id,
          produto_nome: it.produto_nome,
          quantidade: it.quantidade,
        })),
      })
    } catch (e) {
      console.warn('Erro ao baixar estoque na entrega:', e)
    }
  }

  pedido.status = 'entregue'
  pedido.dataEntrega = dataEntrega
  await updatePedidoVenda(pedido)
  return { ok: true, pedido }
}

export async function cancelarPedidoVenda(pedidoId: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const current = await listPedidosVenda()
  const pedido = current.find((p) => p.id === pedidoId)
  if (!pedido) return { ok: false, erro: 'Pedido não encontrado.' }

  // 1. Validar se tem título baixado/recebido no Financeiro
  const temPagamento = await verificarSePedidoTemPagamento(pedidoId)
  if (temPagamento) {
    return {
      ok: false,
      erro: 'Não é possível cancelar: o título financeiro deste pedido já foi baixado/recebido. É necessário estornar o recebimento no módulo Financeiro antes de cancelar.',
    }
  }

  // 2. Liberar estoque reservado (se aprovado ou faturado)
  if ((pedido.status === 'aprovado' || pedido.status === 'faturado') && pedido.itens?.length > 0) {
    try {
      await liberarEstoqueVenda({
        venda_id: pedido.id,
        venda_numero: pedido.numero,
        motivo: 'cancelamento',
        itens: pedido.itens.map((it) => ({
          produto_id: it.produto_id,
          produto_nome: it.produto_nome,
          quantidade: it.quantidade,
        })),
      })
    } catch (e) {
      console.warn('Erro ao liberar estoque no cancelamento:', e)
    }
  }

  // 3. Excluir conta a receber vinculada em aberto no financeiro
  try {
    await deleteContaPagarPorPedidoId(pedidoId)
  } catch {}

  // 4. Alterar status para cancelado
  pedido.status = 'cancelado'
  await updatePedidoVenda(pedido)
  return { ok: true }
}

export async function voltarPedidoVendaStatus(
  pedidoId: string,
  novoStatus: StatusVenda
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const current = await listPedidosVenda()
  const pedido = current.find((p) => p.id === pedidoId)
  if (!pedido) return { ok: false, erro: 'Pedido não encontrado.' }

  pedido.status = novoStatus
  await updatePedidoVenda(pedido)
  return { ok: true }
}

export async function excluirPedidoVenda(pedidoId: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const current = await listPedidosVenda()
  const pedido = current.find((p) => p.id === pedidoId)
  if (!pedido) return { ok: false, erro: 'Pedido não encontrado.' }

  if (supabase) {
    try {
      await supabase.from(SUPABASE_TABLE).delete().eq('id', pedidoId)
    } catch {}
  }

  // Excluir conta a receber vinculada
  await deleteContaPagarPorPedidoId(pedidoId)

  // Liberar estoque se necessário
  if ((pedido.status === 'aprovado' || pedido.status === 'faturado') && pedido.itens?.length > 0) {
    try {
      await liberarEstoqueVenda({
        venda_id: pedido.id,
        venda_numero: pedido.numero,
        motivo: 'excluído',
        itens: pedido.itens.map((it) => ({
          produto_id: it.produto_id,
          produto_nome: it.produto_nome,
          quantidade: it.quantidade,
        })),
      })
    } catch {}
  }

  const list = current.filter((p) => p.id !== pedidoId)
  writeToStorage(list)
  return { ok: true }
}

// ─── Comissões sobre Vendas ──────────────────────────────────────────────────

/**
 * Retorna o valor líquido do pedido de venda para comissão.
 * Valor líquido = Subtotal dos produtos - Desconto aplicado (exclui o frete).
 */
export function calcularValorLiquidoPedido(pedido: PedidoVenda): number {
  if (pedido.subtotal && pedido.subtotal > 0) {
    return Math.max(0, Number((Number(pedido.subtotal) - Number(pedido.descontoTotal || 0)).toFixed(2)))
  }
  return Math.max(0, Number((Number(pedido.total || 0) - Number(pedido.frete || 0)).toFixed(2)))
}

export interface CalculoComissaoVenda {
  valorVenda: number
  valorRecebido: number
  pagamentoFabrica: number
  resultadoLiquido: number
  taxaPercentual: number
  valorComissaoTotal: number
  valorComissaoJaGerado: number
  saldoRestante: number
  status: 'pendente' | 'parcial' | 'gerada'
}

/**
 * Realiza o cálculo exato da comissão sobre o RESULTADO LÍQUIDO da venda:
 * Venda (Bruto)
 * Valor Recebido (em caixa na baixa)
 * Pagamento Fábrica (custo)
 * Resultado Líquido = Valor Recebido - Pagamento Fábrica
 * Comissão Total = Resultado Líquido * (taxa / 100)
 */
export function calcularComissaoVenda(
  pedido: PedidoVenda,
  contaReceber?: ContaPagar | null,
  contasPagarComissao?: ContaPagar[]
): CalculoComissaoVenda {
  const valorVenda = Number(pedido.total) || 0

  // Valor recebido = valorPago da baixa no financeiro (se liquidada)
  const isBaixada = contaReceber && contaReceber.status === 'paga'
  const valorRecebido = isBaixada
    ? Number((contaReceber as any).valorPago || contaReceber.totalPago || contaReceber.total || valorVenda)
    : 0

  // Pagamento Fábrica = soma do custo dos itens ou valor manual salvo
  let pagamentoFabrica = pedido.pagamento_fabrica != null ? Number(pedido.pagamento_fabrica) : 0
  if (pagamentoFabrica === 0 && pedido.itens && pedido.itens.length > 0) {
    let somaItens = 0
    for (const it of pedido.itens) {
      if (it.preco_fabrica && it.preco_fabrica > 0) {
        somaItens += it.preco_fabrica * (it.quantidade || 1)
      }
    }
    if (somaItens > 0) pagamentoFabrica = Number(somaItens.toFixed(2))
  }

  // Resultado Líquido = Valor Recebido - Pagamento Fábrica
  const resultadoLiquido = Math.max(0, Number((valorRecebido - pagamentoFabrica).toFixed(2)))

  // Taxa de comissão
  const taxaPercentual = pedido.comissao_percentual != null ? Number(pedido.comissao_percentual) : 50

  // Comissão total calculada
  const valorComissaoTotal = Number(((resultadoLiquido * taxaPercentual) / 100).toFixed(2))

  // Total já gerado em contas a pagar
  let valorComissaoJaGerado = 0
  if (contasPagarComissao && contasPagarComissao.length > 0) {
    valorComissaoJaGerado = contasPagarComissao.reduce((acc, c) => acc + (Number(c.total) || 0), 0)
    valorComissaoJaGerado = Number(valorComissaoJaGerado.toFixed(2))
  } else if (pedido.comissao_valor_gerado != null) {
    valorComissaoJaGerado = Number(pedido.comissao_valor_gerado)
  } else if (pedido.comissao_gerada && pedido.comissao_valor) {
    valorComissaoJaGerado = Number(pedido.comissao_valor)
  }

  const saldoRestante = Math.max(0, Number((valorComissaoTotal - valorComissaoJaGerado).toFixed(2)))

  let status: 'pendente' | 'parcial' | 'gerada' = 'pendente'
  if (valorComissaoJaGerado >= valorComissaoTotal && valorComissaoTotal > 0) {
    status = 'gerada'
  } else if (valorComissaoJaGerado > 0) {
    status = 'parcial'
  }

  return {
    valorVenda,
    valorRecebido,
    pagamentoFabrica,
    resultadoLiquido,
    taxaPercentual,
    valorComissaoTotal,
    valorComissaoJaGerado,
    saldoRestante,
    status,
  }
}

export interface GerarComissaoParams {
  pedidoId: string
  vendedorNome: string
  taxaPercentual: number
  valorComissao?: number // Valor que o usuário definiu (pode ser parcial ou total)
  valorRecebido?: number
  pagamentoFabrica?: number
  resultadoLiquido?: number
  dataVencimento?: string
  formaPagamento?: string
}

/**
 * Gera a conta a pagar da comissão do pedido de venda no Financeiro
 * calculada sobre o RESULTADO LÍQUIDO da venda.
 * Permite pagamentos parciais até atingir o total da comissão.
 */
export async function gerarComissaoPedidoVenda(
  params: GerarComissaoParams
): Promise<{ ok: true; valorComissaoGerado: number; saldoRestante: number } | { ok: false; erro: string }> {
  const current = await listPedidosVenda()
  const pedido = current.find((p) => p.id === params.pedidoId)
  if (!pedido) return { ok: false, erro: 'Pedido não encontrado.' }

  const contas = await listContasPagar()
  const contaReceber = contas.find((c) => c.pedido_id === pedido.id && c.tipo === 'receber')

  const taxa = Number(params.taxaPercentual) || 50
  const valorRecebido = params.valorRecebido != null
    ? Number(params.valorRecebido)
    : contaReceber && contaReceber.status === 'paga'
    ? Number((contaReceber as any).valorPago || contaReceber.totalPago || contaReceber.total || pedido.total)
    : Number(pedido.total)

  const pagamentoFabrica = params.pagamentoFabrica != null
    ? Number(params.pagamentoFabrica)
    : Number(pedido.pagamento_fabrica || 0)

  const resultadoLiquido = Math.max(0, Number((valorRecebido - pagamentoFabrica).toFixed(2)))
  const valorComissaoTotal = Number(((resultadoLiquido * taxa) / 100).toFixed(2))

  // Contas a pagar de comissão já geradas
  const contasComissaoAnteriores = contas.filter(
    (c) => c.pedido_id === pedido.id && c.tipo === 'pagar' && c.categoria === 'Comissões'
  )
  const totalJaGeradoAntes = contasComissaoAnteriores.reduce((acc, c) => acc + (Number(c.total) || 0), 0)

  // Valor a gerar nesta operação
  const valorGerar = params.valorComissao != null
    ? Number(Number(params.valorComissao).toFixed(2))
    : Math.max(0, Number((valorComissaoTotal - totalJaGeradoAntes).toFixed(2)))

  if (valorGerar <= 0) {
    return { ok: false, erro: 'O valor da comissão a gerar deve ser maior que zero.' }
  }

  const novoTotalGerado = Number((totalJaGeradoAntes + valorGerar).toFixed(2))
  const saldoRestante = Math.max(0, Number((valorComissaoTotal - novoTotalGerado).toFixed(2)))

  const vencimento = params.dataVencimento || adicionarDias(dataHoje(), 15)
  const vendedor = params.vendedorNome.trim() || 'Representante / Vendedor'

  // Descrição do lançamento
  const isParcial = saldoRestante > 0
  const descLancamento = isParcial
    ? `Comissão Venda #${pedido.numero} - Parcela R$ ${valorGerar.toFixed(2)} (Total R$ ${valorComissaoTotal.toFixed(2)}) - ${vendedor}`
    : `Comissão Venda #${pedido.numero} - ${vendedor} (${taxa}%)`

  // Salvar no financeiro como conta a pagar
  await saveContaPagar({
    tipo: 'pagar',
    pedido_id: pedido.id,
    descricao: descLancamento,
    fornecedor: vendedor,
    origem: 'venda',
    categoria: 'Comissões',
    total: valorGerar,
    totalPago: 0,
    status: 'aberta' as StatusConta,
    vencimento,
    forma_pagamento: params.formaPagamento || 'Pix',
    parcelas: [
      {
        numero: contasComissaoAnteriores.length + 1,
        vencimento,
        valor: valorGerar,
        status: 'aberta' as StatusConta,
      },
    ],
  })

  // Atualizar pedido
  pedido.comissao_valor_total = valorComissaoTotal
  pedido.comissao_valor_gerado = novoTotalGerado
  pedido.comissao_valor = novoTotalGerado
  pedido.comissao_percentual = taxa
  pedido.vendedor_nome = vendedor
  pedido.pagamento_fabrica = pagamentoFabrica
  pedido.resultado_liquido = resultadoLiquido
  pedido.comissao_gerada = novoTotalGerado >= valorComissaoTotal
  pedido.comissao_data_geracao = new Date().toISOString()
  await updatePedidoVenda(pedido)

  return { ok: true, valorComissaoGerado: valorGerar, saldoRestante }
}

/**
 * Estorna comissão gerada (pode estornar uma conta específica ou todas do pedido).
 */
export async function estornarComissaoPedidoVenda(
  pedidoId: string,
  contaId?: string
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const current = await listPedidosVenda()
  const pedido = current.find((p) => p.id === pedidoId)
  if (!pedido) return { ok: false, erro: 'Pedido não encontrado.' }

  try {
    const contas = await listContasPagar()
    if (contaId) {
      await deleteContaPagar(contaId)
    } else {
      const contasComissao = contas.filter(
        (c) => c.pedido_id === pedidoId && c.tipo === 'pagar' && c.categoria === 'Comissões'
      )
      for (const c of contasComissao) {
        await deleteContaPagar(c.id)
      }
    }
  } catch {}

  // Recalcular saldo gerado restante
  const contasAtualizadas = await listContasPagar()
  const contasRestantes = contasAtualizadas.filter(
    (c) => c.pedido_id === pedidoId && c.tipo === 'pagar' && c.categoria === 'Comissões'
  )
  const totalRestante = contasRestantes.reduce((acc, c) => acc + (Number(c.total) || 0), 0)

  pedido.comissao_valor_gerado = totalRestante
  pedido.comissao_valor = totalRestante
  pedido.comissao_gerada = totalRestante > 0 && pedido.comissao_valor_total != null && totalRestante >= pedido.comissao_valor_total
  if (totalRestante === 0) {
    pedido.comissao_data_geracao = null
  }
  await updatePedidoVenda(pedido)

  return { ok: true }
}

