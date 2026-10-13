import { supabase } from '../../lib/supabaseClient'
import { updateSaldoContaBancaria } from './v2ContasBancariasService'

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
  fornecedor: string | null // Para receber pode ser cliente/origem
  origem: OrigemConta
  categoria: string | null
  total: number
  totalPago: number
  status: StatusConta
  parcelas: ContaPagarParcela[]
  created_at: string
  updated_at: string
}

const KEY = 'v2_contas_pagar'
const SUPABASE_TABLE = 'v2_contas_pagar'

// Helper: lê SEMPRE do localStorage primeiro (fonte de verdade local)
function readFromStorage(): ContaPagar[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as ContaPagar[]
  } catch {}
  return []
}

// Helper: grava no localStorage e sincroniza com Supabase em background
function writeToStorage(list: ContaPagar[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {}
}

export async function listContasPagar(): Promise<ContaPagar[]> {
  // Sempre retorna o localStorage (fonte primária e confiável)
  const list = readFromStorage()

  // Se localStorage está vazio, tenta trazer dados do Supabase e salvar localmente
  if (list.length === 0 && supabase) {
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

export async function saveContaPagar(conta: Omit<ContaPagar, 'id' | 'created_at' | 'updated_at'>): Promise<ContaPagar> {
  const newConta: ContaPagar = {
    ...conta,
    tipo: conta.tipo || 'pagar',
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  const current = readFromStorage()
  current.push(newConta)
  writeToStorage(current)

  if (supabase) {
    try {
      await supabase.from(SUPABASE_TABLE).insert([newConta])
    } catch {}
  }

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

export async function estornarBaixaParcela(
  contaId: string,
  numeroParcela: number
): Promise<ContaPagar | null> {
  const current = readFromStorage()
  const conta = current.find((c) => c.id === contaId)
  if (!conta) return null

  const parcela = conta.parcelas.find((p) => p.numero === numeroParcela)
  if (!parcela) return null

  // Se a parcela não está paga e não tem baixa, não há o que estornar
  if (parcela.status !== 'paga' && !parcela.baixa) return null

  const baixa = parcela.baixa
  const isPagar = (conta.tipo || 'pagar') === 'pagar'

  // Se a baixa tinha conta bancária vinculada, reverte o saldo
  if (baixa?.contaBancariaId) {
    // Se era conta a pagar: o dinheiro saiu (-), logo no estorno o dinheiro volta (+)
    // Se era conta a receber: o dinheiro entrou (+), logo no estorno o dinheiro sai (-)
    const deltaReversao = isPagar ? baixa.valorFinalPago : -baixa.valorFinalPago
    await updateSaldoContaBancaria(baixa.contaBancariaId, deltaReversao)
  }

  // Verifica se a parcela está vencida hoje
  const hojeStr = new Date().toISOString().split('T')[0]
  const statusRevertido: StatusConta =
    parcela.vencimento < hojeStr ? 'vencida' : 'aberta'

  const novasParcelas = conta.parcelas.map((p) => {
    if (p.numero === numeroParcela) {
      return {
        ...p,
        status: statusRevertido,
        baixa: undefined,
      }
    }
    return p
  })

  // Recalcula total pago
  const valorEstornado = baixa?.valorFinalPago ?? parcela.valor
  const novoTotalPago = Math.max(0, Math.round((conta.totalPago - valorEstornado) * 100) / 100)

  // Recalcula status geral da conta
  let novoStatusConta: StatusConta = 'aberta'
  const temAlgumaPaga = novasParcelas.some((p) => p.status === 'paga')
  const todasPagas = novasParcelas.every((p) => p.status === 'paga')
  const temVencida = novasParcelas.some((p) => p.status === 'vencida')

  if (todasPagas) {
    novoStatusConta = 'paga'
  } else if (temAlgumaPaga || novoTotalPago > 0) {
    novoStatusConta = 'parcial'
  } else if (temVencida) {
    novoStatusConta = 'vencida'
  } else {
    novoStatusConta = 'aberta'
  }

  const contaAtualizada: ContaPagar = {
    ...conta,
    parcelas: novasParcelas,
    totalPago: novoTotalPago,
    status: novoStatusConta,
    updated_at: new Date().toISOString(),
  }

  const updatedList = current.map((c) => (c.id === contaId ? contaAtualizada : c))
  writeToStorage(updatedList)

  if (supabase) {
    try {
      await supabase.from(SUPABASE_TABLE).upsert(contaAtualizada)
    } catch {}
  }

  return contaAtualizada
}

