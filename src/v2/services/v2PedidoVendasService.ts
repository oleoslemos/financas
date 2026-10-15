import { supabase } from '../../lib/supabaseClient'
import { saveContaPagar, StatusConta, deleteContaPagarPorPedidoId } from './v2ContasPagarService'

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
  dataEmissao: string
  dataPrevistaEntrega?: string | null
  dataEntrega?: string | null
  formaPagamento: string
  numeroParcelas: number
  contaEntradaTag?: string
  observacao?: string | null
  subtotal: number
  descontoTotal: number
  total: number
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
    formaPagamento: 'Boleto',
    numeroParcelas: 2,
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
    formaPagamento: 'Cartão Crédito',
    numeroParcelas: 3,
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

export async function listPedidosVenda(): Promise<PedidoVenda[]> {
  let list: PedidoVenda[] = []

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from(SUPABASE_TABLE)
        .select('*')
        .order('created_at', { ascending: false })

      if (!error && data && data.length > 0) {
        list = data as PedidoVenda[]
        writeToStorage(list)
        return list
      }
    } catch (e) {
      console.warn('Falha ao buscar pedidos de venda do Supabase, usando local:', e)
    }
  }

  // Se não veio do Supabase, lê do storage local
  const localList = readFromStorage()

  // Se tem dados no storage local e Supabase está conectado, migra os dados locais para a nuvem
  if (supabase && localList.length > 0 && list.length === 0) {
    try {
      const { error: insErr } = await supabase.from(SUPABASE_TABLE).upsert(localList)
      if (!insErr) {
        console.info('Pedidos de venda sincronizados com sucesso na nuvem Supabase.')
      }
    } catch {}
  }

  return localList
}

export async function savePedidoVenda(
  pedido: Omit<PedidoVenda, 'id' | 'numero' | 'created_at' | 'updated_at'>
): Promise<PedidoVenda> {
  const current = await listPedidosVenda()

  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const datePrefix = `PV-${yyyy}${mm}${dd}`

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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (supabase) {
    try {
      await supabase.from(SUPABASE_TABLE).insert([novo])
    } catch {}
  }

  current.unshift(novo)
  writeToStorage(current)

  return novo
}

export async function updatePedidoVenda(pedido: PedidoVenda): Promise<PedidoVenda> {
  const current = await listPedidosVenda()
  const updated: PedidoVenda = {
    ...pedido,
    updated_at: new Date().toISOString(),
  }

  if (supabase) {
    try {
      await supabase.from(SUPABASE_TABLE).upsert(updated)
    } catch {}
  }

  const list = current.map((p) => (p.id === pedido.id ? updated : p))
  writeToStorage(list)
  return updated
}

export async function aprovarPedidoVenda(pedidoId: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const current = await listPedidosVenda()
  const pedido = current.find((p) => p.id === pedidoId)
  if (!pedido) return { ok: false, erro: 'Pedido não encontrado.' }

  pedido.status = 'aprovado'
  await updatePedidoVenda(pedido)
  return { ok: true }
}

export async function faturarPedidoVenda(pedidoId: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const current = await listPedidosVenda()
  const pedido = current.find((p) => p.id === pedidoId)
  if (!pedido) return { ok: false, erro: 'Pedido não encontrado.' }

  // Integrar com o Financeiro gerando Contas a Receber
  const parcelasArray = []
  const valorParcela = Math.round((pedido.total / (pedido.numeroParcelas || 1)) * 100) / 100
  const dataHojeObj = new Date()
  let soma = 0
  for (let i = 1; i <= (pedido.numeroParcelas || 1); i++) {
    const vencimento = new Date(dataHojeObj)
    vencimento.setMonth(vencimento.getMonth() + i)
    const val = i === pedido.numeroParcelas ? Math.round((pedido.total - soma) * 100) / 100 : valorParcela
    soma += val
    parcelasArray.push({
      numero: i,
      vencimento: vencimento.toISOString().split('T')[0],
      valor: val,
      status: 'aberta' as StatusConta,
    })
  }

  const descricaoItens =
    pedido.itens && pedido.itens.length > 1
      ? `${pedido.itens[0]?.produto_nome || 'Produto'} (+${pedido.itens.length - 1} itens)`
      : (pedido.itens?.[0]?.produto_nome || 'Produto')

  await saveContaPagar({
    tipo: 'receber',
    pedido_id: pedido.id,
    descricao: `Venda ${pedido.numero} - ${descricaoItens}`,
    fornecedor: pedido.cliente_nome,
    origem: 'venda',
    categoria: 'Receita de Vendas',
    total: pedido.total,
    totalPago: 0,
    status: 'aberta',
    parcelas: parcelasArray,
  })

  pedido.status = 'faturado'
  await updatePedidoVenda(pedido)
  return { ok: true }
}

export async function entregarPedidoVenda(
  pedidoId: string,
  dataEntrega: string = new Date().toISOString().split('T')[0]
): Promise<{ ok: true; pedido: PedidoVenda } | { ok: false; erro: string }> {
  const current = await listPedidosVenda()
  const pedido = current.find((p) => p.id === pedidoId)
  if (!pedido) return { ok: false, erro: 'Pedido não encontrado.' }

  pedido.status = 'entregue'
  pedido.dataEntrega = dataEntrega
  await updatePedidoVenda(pedido)
  return { ok: true, pedido }
}

export async function cancelarPedidoVenda(pedidoId: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const current = await listPedidosVenda()
  const pedido = current.find((p) => p.id === pedidoId)
  if (!pedido) return { ok: false, erro: 'Pedido não encontrado.' }

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

  // Delete associated financial record
  await deleteContaPagarPorPedidoId(pedidoId)

  const list = current.filter((p) => p.id !== pedidoId)
  writeToStorage(list)
  return { ok: true }
}

