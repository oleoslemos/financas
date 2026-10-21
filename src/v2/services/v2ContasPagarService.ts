import { supabase } from '../../lib/supabaseClient'
import { updateSaldoContaBancaria } from './v2ContasBancariasService'
import { registrarAuditoria } from './v2AuditoriaService'

export type TipoLancamento = 'pagar' | 'receber'
export type StatusConta = 'aberta' | 'parcial' | 'paga' | 'cancelada' | 'vencida'
export type OrigemConta = 'compra' | 'venda' | 'avulsa' | 'recorrente'

export type BaixaParcelaInfo = {
  dataBaixa: string
  valorOriginal: number
  descontoTipo: 'R$' | '%'
  descontoValor: number
  descontoFinal: number
  acrescimoTipo: 'R$' | '%'
  acrescimoValor: number
  acrescimoFinal: number
  valorFinalPago: number
  formaPagamento?: string
  observacao?: string
  contaBancariaId?: string
  contaBancariaNome?: string
}

export type ContaPagarParcela = {
  numero: number
  vencimento: string
  valor: number
  status: StatusConta
  baixa?: BaixaParcelaInfo
}

export type ContaPagar = {
  id: string
  tipo?: TipoLancamento // 'pagar' (default) ou 'receber'
  pedido_id?: string
  descricao: string
  fornecedor: string | null // Cliente ou fornecedor
  origem: OrigemConta
  categoria: string | null
  total: number // Valor previsto
  totalPago: number
  status: StatusConta
  vencimento?: string
  forma_pagamento?: string
  taxa_administradora?: number
  saldo_residual?: number
  diferenca_destino?: 'taxa' | 'parcial'
  conta_bancaria_id?: string
  conta_bancaria_tag?: string
  data_baixa?: string
  parcelas: ContaPagarParcela[]
  created_at: string
  updated_at: string
}

const KEY = 'v2_contas_pagar'
const SUPABASE_TABLE = 'v2_contas_pagar'

const SEED_CONTAS: ContaPagar[] = [
  {
    id: 'fin-001',
    tipo: 'receber',
    descricao: 'Venda PV-20261012002 · Colchão Renova [1,38 x 1,88] (+3 itens)',
    fornecedor: 'Ana Paula S.',
    origem: 'venda',
    categoria: 'Receita de vendas',
    total: 1972.0,
    totalPago: 0,
    status: 'aberta',
    vencimento: '2026-11-15',
    forma_pagamento: 'cartão de crédito (repasses da administradora)',
    created_at: '2026-10-12T10:00:00Z',
    updated_at: '2026-10-12T10:00:00Z',
    parcelas: [
      {
        numero: 1,
        vencimento: '2026-11-15',
        valor: 1972.0,
        status: 'aberta',
      },
    ],
  },
  {
    id: 'fin-002',
    tipo: 'pagar',
    descricao: 'Contabilidade',
    fornecedor: 'Rta Cont',
    origem: 'avulsa',
    categoria: 'Serviços contábeis',
    total: 225.0,
    totalPago: 0,
    status: 'aberta',
    vencimento: '2026-11-10',
    forma_pagamento: 'boleto',
    created_at: '2026-10-10T10:00:00Z',
    updated_at: '2026-10-10T10:00:00Z',
    parcelas: [
      {
        numero: 1,
        vencimento: '2026-11-10',
        valor: 225.0,
        status: 'aberta',
      },
    ],
  },
  {
    id: 'fin-003',
    tipo: 'receber',
    descricao: 'Venda PV-20261013003 · Travesseiro terapêutico',
    fornecedor: 'Rita M.',
    origem: 'venda',
    categoria: 'Receita de vendas',
    total: 244.34,
    totalPago: 0,
    status: 'aberta',
    vencimento: '2026-10-18',
    forma_pagamento: 'Pix',
    created_at: '2026-10-13T10:00:00Z',
    updated_at: '2026-10-13T10:00:00Z',
    parcelas: [
      {
        numero: 1,
        vencimento: '2026-10-18',
        valor: 244.34,
        status: 'aberta',
      },
    ],
  },
  {
    id: 'fin-004',
    tipo: 'pagar',
    descricao: 'Pedido de compra #20261006001 · Tênis FN1',
    fornecedor: 'Colchões Serra Ltda',
    origem: 'compra',
    categoria: 'Compra de mercadorias',
    total: 244.34,
    totalPago: 0,
    status: 'vencida',
    vencimento: '2026-10-12',
    forma_pagamento: 'boleto',
    created_at: '2026-10-06T10:00:00Z',
    updated_at: '2026-10-06T10:00:00Z',
    parcelas: [
      {
        numero: 1,
        vencimento: '2026-10-12',
        valor: 244.34,
        status: 'vencida',
      },
    ],
  },
  {
    id: 'fin-005',
    tipo: 'receber',
    descricao: 'Venda PV-20261008001 · Travesseiro terapêutico',
    fornecedor: 'Carlos L.',
    origem: 'venda',
    categoria: 'Receita de vendas',
    total: 244.34,
    totalPago: 237.31,
    taxa_administradora: 7.03,
    status: 'paga',
    vencimento: '2026-10-08',
    forma_pagamento: 'cartão de crédito',
    data_baixa: '2026-10-08',
    conta_bancaria_id: 'conta-inter',
    conta_bancaria_tag: '#BANCOINTER',
    created_at: '2026-10-08T10:00:00Z',
    updated_at: '2026-10-08T10:00:00Z',
    parcelas: [
      {
        numero: 1,
        vencimento: '2026-10-08',
        valor: 244.34,
        status: 'paga',
        baixa: {
          dataBaixa: '2026-10-08',
          valorOriginal: 244.34,
          descontoTipo: 'R$',
          descontoValor: 7.03,
          descontoFinal: 7.03,
          acrescimoTipo: 'R$',
          acrescimoValor: 0,
          acrescimoFinal: 0,
          valorFinalPago: 237.31,
          formaPagamento: 'Cartão de crédito',
          contaBancariaId: 'conta-inter',
          contaBancariaNome: '#BANCOINTER',
          observacao: 'Repasse da administradora',
        },
      },
    ],
  },
]

function readFromStorage(): ContaPagar[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ContaPagar[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {}
  return SEED_CONTAS
}

function writeToStorage(list: ContaPagar[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {}
}

export async function listContasPagar(): Promise<ContaPagar[]> {
  const list = readFromStorage()

  if (list === SEED_CONTAS && supabase) {
    try {
      const { data, error } = await supabase.from(SUPABASE_TABLE).select('*').order('created_at', { ascending: false })
      if (!error && data && data.length > 0) {
        const remoteList = data as ContaPagar[]
        writeToStorage(remoteList)
        return remoteList.map((c) => ({ ...c, tipo: c.tipo || 'pagar' }))
      }
    } catch {}
  }

  return list.map((c) => ({ ...c, tipo: c.tipo || 'pagar' }))
}

export async function getContaPagarPorPedidoId(pedidoId: string): Promise<ContaPagar | undefined> {
  const current = await listContasPagar()
  return current.find((c) => c.pedido_id === pedidoId)
}

export async function verificarSePedidoTemPagamento(pedidoId: string): Promise<boolean> {
  const conta = await getContaPagarPorPedidoId(pedidoId)
  if (!conta) return false
  if (conta.status === 'paga' || conta.status === 'parcial' || conta.totalPago > 0) {
    return true
  }
  const temParcelaPaga = conta.parcelas.some((p) => p.status === 'paga' || p.status === 'parcial')
  return temParcelaPaga
}

export async function saveContaPagar(
  conta: Omit<ContaPagar, 'id' | 'created_at' | 'updated_at'> & { usuarioNome?: string }
): Promise<ContaPagar> {
  const vencimento = conta.vencimento || conta.parcelas?.[0]?.vencimento || new Date().toISOString().split('T')[0]
  const parcelas: ContaPagarParcela[] =
    conta.parcelas && conta.parcelas.length > 0
      ? conta.parcelas
      : [
          {
            numero: 1,
            vencimento,
            valor: conta.total,
            status: conta.status || 'aberta',
          },
        ]

  const newConta: ContaPagar = {
    ...conta,
    tipo: conta.tipo || 'pagar',
    vencimento,
    parcelas,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const current = readFromStorage()
  current.unshift(newConta)
  writeToStorage(current)

  if (supabase) {
    try {
      await supabase.from(SUPABASE_TABLE).insert([newConta])
    } catch {}
  }

  void registrarAuditoria({
    usuario_nome: conta.usuarioNome || 'Usuário',
    area: 'Financeiro',
    objeto: newConta.descricao,
    o_que_mudou: 'Novo lançamento financeiro criado',
    detalhe: {
      acao_titulo: 'Novo lançamento criado',
      subtitulo: `${newConta.descricao} · ${newConta.fornecedor || 'Sem vínculo'}`,
      mudancas: [
        { campo: 'Tipo', antes: '—', depois: newConta.tipo === 'receber' ? 'A receber' : 'A pagar' },
        { campo: 'Valor', antes: '—', depois: `R$ ${newConta.total.toFixed(2)}` },
        { campo: 'Vencimento', antes: '—', depois: vencimento },
      ],
      link_objeto: '/v2/contas-pagar',
    },
  })

  return newConta
}

export async function updateContaPagar(conta: ContaPagar): Promise<ContaPagar> {
  const updatedConta: ContaPagar = {
    ...conta,
    tipo: conta.tipo || 'pagar',
    updated_at: new Date().toISOString(),
  }

  const current = readFromStorage()
  const exists = current.some((c) => c.id === conta.id)
  const updatedList = exists
    ? current.map((c) => (c.id === conta.id ? updatedConta : c))
    : [updatedConta, ...current]
  writeToStorage(updatedList)

  if (supabase) {
    try {
      await supabase.from(SUPABASE_TABLE).upsert(updatedConta)
    } catch {}
  }

  return updatedConta
}

export async function deleteContaPagar(id: string): Promise<void> {
  const current = readFromStorage()
  const filtered = current.filter((c) => c.id !== id)
  writeToStorage(filtered)

  if (supabase) {
    try {
      await supabase.from(SUPABASE_TABLE).delete().eq('id', id)
    } catch {}
  }
}

export async function deleteContaPagarPorPedidoId(pedidoId: string): Promise<void> {
  const current = readFromStorage()
  const conta = current.find((c) => c.pedido_id === pedidoId)
  if (!conta) return

  const filtered = current.filter((c) => c.id !== conta.id)
  writeToStorage(filtered)

  if (supabase) {
    try {
      await supabase.from(SUPABASE_TABLE).delete().eq('id', conta.id)
    } catch {}
  }
}

export interface BaixarLancamentoParams {
  id: string
  valorRecebidoOuPago: number
  diferencaDestino: 'taxa' | 'parcial'
  dataBaixa: string
  formaPagamento: string
  contaBancariaId: string
  contaBancariaTag?: string
  observacao?: string
  usuarioNome?: string
}

export async function baixarLancamento(params: BaixarLancamentoParams): Promise<ContaPagar | null> {
  const current = readFromStorage()
  const conta = current.find((c) => c.id === params.id)
  if (!conta) return null

  const isPagar = (conta.tipo || 'pagar') === 'pagar'
  const valorPrevisto = conta.total
  const dif = valorPrevisto - params.valorRecebidoOuPago

  let novoStatus: StatusConta = 'paga'
  let taxaAdmin = 0
  let saldoResidual = 0

  if (params.diferencaDestino === 'parcial' && dif > 0) {
    novoStatus = 'parcial'
    saldoResidual = Math.round(dif * 100) / 100
  } else {
    novoStatus = 'paga'
    if (dif > 0) {
      taxaAdmin = Math.round(dif * 100) / 100
    }
  }

  // Atualiza saldo da conta bancária
  const deltaBancario = isPagar ? -params.valorRecebidoOuPago : params.valorRecebidoOuPago
  await updateSaldoContaBancaria(params.contaBancariaId, deltaBancario)

  const baixaInfo: BaixaParcelaInfo = {
    dataBaixa: params.dataBaixa,
    valorOriginal: valorPrevisto,
    descontoTipo: 'R$',
    descontoValor: taxaAdmin,
    descontoFinal: taxaAdmin,
    acrescimoTipo: 'R$',
    acrescimoValor: 0,
    acrescimoFinal: 0,
    valorFinalPago: params.valorRecebidoOuPago,
    formaPagamento: params.formaPagamento,
    observacao: params.observacao,
    contaBancariaId: params.contaBancariaId,
    contaBancariaNome: params.contaBancariaTag,
  }

  const novasParcelas: ContaPagarParcela[] = (conta.parcelas && conta.parcelas.length > 0
    ? conta.parcelas
    : [{ numero: 1, vencimento: conta.vencimento || params.dataBaixa, valor: valorPrevisto, status: 'aberta' as StatusConta }]
  ).map((p, idx) => {
    if (idx === 0) {
      return {
        ...p,
        status: novoStatus,
        baixa: baixaInfo,
      }
    }
    return p
  })

  const contaAtualizada: ContaPagar = {
    ...conta,
    status: novoStatus,
    totalPago: params.valorRecebidoOuPago,
    taxa_administradora: taxaAdmin,
    saldo_residual: saldoResidual,
    diferenca_destino: params.diferencaDestino,
    conta_bancaria_id: params.contaBancariaId,
    conta_bancaria_tag: params.contaBancariaTag,
    data_baixa: params.dataBaixa,
    forma_pagamento: params.formaPagamento,
    parcelas: novasParcelas,
    updated_at: new Date().toISOString(),
  }

  const updatedList = current.map((c) => (c.id === params.id ? contaAtualizada : c))
  writeToStorage(updatedList)

  if (supabase) {
    try {
      await supabase.from(SUPABASE_TABLE).upsert(contaAtualizada)
    } catch {}
  }

  void registrarAuditoria({
    usuario_nome: params.usuarioNome || 'Usuário',
    area: 'Financeiro',
    objeto: conta.descricao,
    o_que_mudou: 'Baixa de lançamento realizada',
    detalhe: {
      acao_titulo: 'Baixa de lançamento realizada',
      subtitulo: `${conta.descricao} · ${conta.fornecedor || ''}`,
      mudancas: [
        { campo: 'Status', antes: conta.status, depois: novoStatus },
        { campo: 'Valor baixado', antes: 'R$ 0,00', depois: `R$ ${params.valorRecebidoOuPago.toFixed(2)}` },
        ...(taxaAdmin > 0 ? [{ campo: 'Taxa / Ajuste', antes: 'R$ 0,00', depois: `R$ ${taxaAdmin.toFixed(2)}` }] : []),
        ...(saldoResidual > 0 ? [{ campo: 'Saldo em aberto', antes: 'R$ 0,00', depois: `R$ ${saldoResidual.toFixed(2)}` }] : []),
      ],
      campos_extras: [
        { label: 'Conta bancária', valor: params.contaBancariaTag || params.contaBancariaId },
        { label: 'Data da baixa', valor: params.dataBaixa },
        { label: 'Forma', valor: params.formaPagamento },
      ],
      link_objeto: '/v2/contas-pagar',
    },
  })

  return contaAtualizada
}

export async function estornarLancamento(id: string, usuarioNome?: string): Promise<ContaPagar | null> {
  const current = readFromStorage()
  const conta = current.find((c) => c.id === id)
  if (!conta) return null

  if (conta.status !== 'paga' && conta.status !== 'parcial' && conta.totalPago <= 0) {
    return null
  }

  const valorPago = conta.totalPago || conta.parcelas?.[0]?.baixa?.valorFinalPago || conta.total
  const isPagar = (conta.tipo || 'pagar') === 'pagar'
  const contaBancariaId = conta.conta_bancaria_id || conta.parcelas?.[0]?.baixa?.contaBancariaId

  if (contaBancariaId) {
    const deltaReversao = isPagar ? valorPago : -valorPago
    await updateSaldoContaBancaria(contaBancariaId, deltaReversao)
  }

  const hojeStr = new Date().toISOString().split('T')[0]
  const vencimento = conta.vencimento || conta.parcelas?.[0]?.vencimento || hojeStr
  const statusRevertido: StatusConta = vencimento < hojeStr ? 'vencida' : 'aberta'

  const novasParcelas = (conta.parcelas || []).map((p) => ({
    ...p,
    status: statusRevertido,
    baixa: undefined,
  }))

  const contaAtualizada: ContaPagar = {
    ...conta,
    status: statusRevertido,
    totalPago: 0,
    taxa_administradora: 0,
    saldo_residual: 0,
    data_baixa: undefined,
    diferenca_destino: undefined,
    parcelas: novasParcelas,
    updated_at: new Date().toISOString(),
  }

  const updatedList = current.map((c) => (c.id === id ? contaAtualizada : c))
  writeToStorage(updatedList)

  if (supabase) {
    try {
      await supabase.from(SUPABASE_TABLE).upsert(contaAtualizada)
    } catch {}
  }

  void registrarAuditoria({
    usuario_nome: usuarioNome || 'Usuário',
    area: 'Financeiro',
    objeto: conta.descricao,
    o_que_mudou: 'Estorno de baixa realizado',
    detalhe: {
      acao_titulo: 'Estorno de baixa realizado',
      subtitulo: `${conta.descricao} · ${conta.fornecedor || ''}`,
      mudancas: [
        { campo: 'Status', antes: conta.status, depois: statusRevertido },
        { campo: 'Valor estornado', antes: `R$ ${valorPago.toFixed(2)}`, depois: 'R$ 0,00' },
      ],
      campos_extras: [
        { label: 'Conta bancária afetada', valor: conta.conta_bancaria_tag || contaBancariaId || '—' },
        { label: 'Data do estorno', valor: hojeStr },
      ],
      link_objeto: '/v2/contas-pagar',
    },
  })

  return contaAtualizada
}

export async function excluirLancamentoAberto(id: string, usuarioNome?: string): Promise<boolean> {
  const current = readFromStorage()
  const conta = current.find((c) => c.id === id)
  if (!conta) return false

  if (conta.status === 'paga' || conta.totalPago > 0) {
    return false
  }

  await deleteContaPagar(id)

  void registrarAuditoria({
    usuario_nome: usuarioNome || 'Usuário',
    area: 'Financeiro',
    objeto: conta.descricao,
    o_que_mudou: 'Lançamento em aberto excluído',
    detalhe: {
      acao_titulo: 'Lançamento excluído',
      subtitulo: `${conta.descricao} · ${conta.fornecedor || ''}`,
      mudancas: [
        { campo: 'Status', antes: conta.status, depois: 'Excluído' },
        { campo: 'Valor', antes: `R$ ${conta.total.toFixed(2)}`, depois: '—' },
      ],
      link_objeto: '/v2/contas-pagar',
    },
  })

  return true
}

export async function estornarBaixaParcela(
  contaId: string,
  _numeroParcela: number
): Promise<ContaPagar | null> {
  return estornarLancamento(contaId)
}

