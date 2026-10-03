import { arredondar } from '../../lib/money'

export type EstadoCusto = {
  saldoAtual: number // saldo em estoque ANTES da entrada (derivado das movimentações)
  custoMedioAtual: number
  ultimoCustoAtual: number
}

export type EntradaCusto = {
  quantidade: number
  custoUnitario: number
}

/**
 * Custo médio ponderado móvel:
 *   (saldo * custoMedio + qtdEntrada * custoEntrada) / (saldo + qtdEntrada)
 * Se o saldo anterior for <= 0 (estoque zerado ou negativo), o custo médio passa a ser o custo da entrada.
 * O último custo é sempre o custo da entrada mais recente.
 */
export function aplicarEntradaNoCusto(estado: EstadoCusto, entrada: EntradaCusto) {
  if (entrada.quantidade <= 0) throw new Error('Quantidade de entrada deve ser maior que zero')
  if (entrada.custoUnitario < 0) throw new Error('Custo de entrada não pode ser negativo')

  const novoSaldo = estado.saldoAtual + entrada.quantidade
  const custoMedio =
    estado.saldoAtual <= 0
      ? arredondar(entrada.custoUnitario)
      : arredondar(
          (estado.saldoAtual * estado.custoMedioAtual + entrada.quantidade * entrada.custoUnitario) / novoSaldo,
        )

  return {
    saldo: novoSaldo,
    custoMedio,
    ultimoCusto: arredondar(entrada.custoUnitario),
  }
}

export type MovimentoParaCusto = {
  id: string
  tipo: 'entrada' | 'saida' | 'ajuste'
  quantidade: number // assinada, como na movimentação de estoque
  custoUnitario: number | null
  estornoDeId?: string | null
}

/**
 * Recalcula saldo, custo médio e último custo refazendo o histórico de movimentações do produto.
 * Use depois de um estorno de entrada.
 */
export function recalcularCustoPorHistorico(movimentos: MovimentoParaCusto[]) {
  const ignorados = new Set<string>()
  for (const m of movimentos) {
    if (m.estornoDeId) {
      ignorados.add(m.id)
      ignorados.add(m.estornoDeId)
    }
  }

  let saldo = 0
  let custoMedio = 0
  let ultimoCusto = 0
  let temCusto = false

  for (const m of movimentos) {
    if (ignorados.has(m.id)) continue
    if (m.tipo === 'entrada' && m.custoUnitario !== null) {
      const r = aplicarEntradaNoCusto(
        { saldoAtual: saldo, custoMedioAtual: custoMedio, ultimoCustoAtual: ultimoCusto },
        { quantidade: m.quantidade, custoUnitario: m.custoUnitario },
      )
      saldo = r.saldo
      custoMedio = r.custoMedio
      ultimoCusto = r.ultimoCusto
      temCusto = true
    } else {
      saldo += m.quantidade
    }
    saldo = Math.round(saldo * 1000) / 1000
  }

  return { saldo, custoMedio, ultimoCusto, temCusto }
}
