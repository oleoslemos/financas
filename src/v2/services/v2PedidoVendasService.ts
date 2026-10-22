import { supabase } from '../../lib/supabaseClient'
import { saveContaPagar, updateContaPagarPorPedidoId, deleteContaPagarPorPedidoId, StatusConta } from './v2ContasPagarService'
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
        const pendingLocal = localList.filter((loc) => !remoteIds.has(loc.id))

        if (pendingLocal.length > 0) {
          try {
            await supabase.from(SUPABASE_TABLE).upsert(pendingLocal)
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

export async function savePedidoVenda(
  pedido: Omit<PedidoVenda, 'id' | 'numero' | 'created_at' | 'updated_at'>
): Promise<PedidoVenda> {
  const current = await listPedidosVenda()

  const dataEmissao = pedido.dataEmissao || dataHoje()
  const ano = dataEmissao.slice(0, 4)
  const mm = dataEmissao.slice(5, 7)
  const dd = dataEmissao.slice(8, 10)
  const datePrefix = `PV-${ano}${mm}${dd}`

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
      const { error: insError } = await supabase.from(SUPABASE_TABLE).insert([novo])
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
    numeroParcelas: 1,
    updated_at: new Date().toISOString(),
  }

  if (supabase) {
    try {
      const { error: upErr } = await supabase.from(SUPABASE_TABLE).upsert(updated)
      if (upErr) {
        console.error('Erro ao atualizar pedido de venda no Supabase:', upErr)
      }
    } catch (e) {
      console.error('Exceção ao atualizar pedido no Supabase:', e)
    }
  }

  // Atualizar conta a receber se já faturado
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

  // Vencimento padrão: dataPrevistaEntrega ou +30 dias da emissão
  const vencimento =
    pedido.dataVencimento ||
    pedido.dataPrevistaEntrega ||
    adicionarDias(pedido.dataEmissao || dataHoje(), 30)

  await saveContaPagar({
    tipo: 'receber',
    pedido_id: pedido.id,
    descricao: _descricaoVenda(pedido),
    fornecedor: pedido.cliente_nome,
    origem: 'venda',
    categoria: 'Receita de Vendas',
    total: pedido.total,
    totalPago: 0,
    status: 'aberta' as StatusConta,
    parcelas: [
      {
        numero: 1,
        vencimento,
        valor: pedido.total,
        status: 'aberta' as StatusConta,
      },
    ],
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

  // Liberar estoque reservado (se aprovado ou faturado)
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

  // Excluir conta a receber vinculada
  try {
    await deleteContaPagarPorPedidoId(pedidoId)
  } catch {}

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
