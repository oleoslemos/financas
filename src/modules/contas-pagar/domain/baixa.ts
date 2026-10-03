import { arredondar, somar } from '../../lib/money'
import { compararDatas, type DataISO } from '../../lib/datas'

export type StatusParcela = 'aberta' | 'parcial' | 'paga' | 'cancelada'

export type PagamentoRegistrado = {
  valorPrincipal: number
  estornado: boolean
}

export type BaixaInput = {
  valorPrincipal: number // quanto do valor da parcela está sendo quitado
  juros?: number
  multa?: number
  desconto?: number
}

/** Principal já quitado = soma dos pagamentos não estornados. */
export function valorPagoParcela(pagamentos: PagamentoRegistrado[]): number {
  return somar(...pagamentos.filter((p) => !p.estornado).map((p) => p.valorPrincipal))
}

export function saldoParcela(valorParcela: number, pagamentos: PagamentoRegistrado[]): number {
  return somar(valorParcela, -valorPagoParcela(pagamentos))
}

export function statusDaParcela(params: {
  valorParcela: number
  pagamentos: PagamentoRegistrado[]
  cancelada?: boolean
}): StatusParcela {
  if (params.cancelada) return 'cancelada'
  const pago = valorPagoParcela(params.pagamentos)
  if (pago <= 0) return 'aberta'
  return pago >= params.valorParcela ? 'paga' : 'parcial'
}

/** "Vencida" é derivada: parcela aberta ou parcial com vencimento anterior a hoje. */
export function estaVencida(params: { status: StatusParcela; vencimento: DataISO; hoje: DataISO }): boolean {
  if (params.status !== 'aberta' && params.status !== 'parcial') return false
  return compararDatas(params.vencimento, params.hoje) < 0
}

/**
 * Valida e calcula uma baixa.
 * valorTotalPago = principal + juros + multa - desconto (o que efetivamente sai da conta financeira).
 */
export function calcularBaixa(params: {
  valorParcela: number
  pagamentos: PagamentoRegistrado[]
  baixa: BaixaInput
  contaFinanceiraTagId: string | null | undefined
  statusParcela: StatusParcela
}) {
  const { baixa } = params
  if (!params.contaFinanceiraTagId)
    throw new Error('Informe a conta financeira de onde saiu o dinheiro')
  if (params.statusParcela === 'cancelada') throw new Error('Parcela cancelada não pode ser paga')
  if (params.statusParcela === 'paga') throw new Error('Parcela já está paga')

  const juros = baixa.juros ?? 0
  const multa = baixa.multa ?? 0
  const desconto = baixa.desconto ?? 0
  if (baixa.valorPrincipal <= 0) throw new Error('Valor da baixa deve ser maior que zero')
  if (juros < 0 || multa < 0 || desconto < 0) throw new Error('Juros, multa e desconto não podem ser negativos')

  const saldo = saldoParcela(params.valorParcela, params.pagamentos)
  if (arredondar(baixa.valorPrincipal) > saldo) throw new Error('Valor da baixa maior que o saldo da parcela')

  const valorTotalPago = somar(baixa.valorPrincipal, juros, multa, -desconto)
  if (valorTotalPago < 0) throw new Error('Desconto maior que o valor devido')

  const novosPagamentos = [...params.pagamentos, { valorPrincipal: baixa.valorPrincipal, estornado: false }]
  return {
    valorPrincipal: arredondar(baixa.valorPrincipal),
    juros: arredondar(juros),
    multa: arredondar(multa),
    desconto: arredondar(desconto),
    valorTotalPago,
    novoStatus: statusDaParcela({ valorParcela: params.valorParcela, pagamentos: novosPagamentos }),
  }
}
