export type TipoMovimentacao = 'entrada' | 'saida' | 'ajuste'
export type OrigemMovimentacao = 'compra' | 'venda' | 'ajuste_manual' | 'estorno'

/** Quantidades com 3 casas: compara/soma em milésimos para evitar erro de ponto flutuante. */
const milesimos = (n: number) => Math.round(n * 1000)
const deMilesimos = (m: number) => m / 1000

export type MovimentacaoEstoque = {
  id: string
  tipo: TipoMovimentacao
  quantidade: number // assinada
  origem: OrigemMovimentacao
  estornoDeId?: string | null
  custoUnitario?: number | null
}

/** Valida o sinal da quantidade conforme o tipo (espelha o CHECK do banco). */
export function validarSinal(tipo: TipoMovimentacao, quantidade: number): void {
  if (!Number.isFinite(quantidade) || milesimos(quantidade) === 0) {
    throw new Error('Quantidade não pode ser zero')
  }
  if (tipo === 'entrada' && quantidade < 0) throw new Error('Entrada deve ter quantidade positiva')
  if (tipo === 'saida' && quantidade > 0) throw new Error('Saída deve ter quantidade negativa')
}

/** Monta a movimentação com o sinal correto a partir de uma quantidade informada em valor absoluto. */
export function montarMovimentacao(params: { tipo: 'entrada' | 'saida'; quantidade: number }) {
  if (params.quantidade <= 0) throw new Error('Informe uma quantidade maior que zero')
  const quantidade = params.tipo === 'saida' ? -params.quantidade : params.quantidade
  validarSinal(params.tipo, quantidade)
  return { tipo: params.tipo, quantidade }
}

export function calcularSaldo(movimentacoes: { quantidade: number }[]): number {
  return deMilesimos(movimentacoes.reduce((acc, m) => acc + milesimos(m.quantidade), 0))
}

export type ResultadoValidacao = { ok: true } | { ok: false; erro: string }

/** Saída (ou estorno de entrada) só se houver saldo, a menos que o sistema permita saldo negativo. */
export function validarSaida(params: {
  saldoAtual: number
  quantidade: number // valor absoluto
  permitirNegativo?: boolean
}): ResultadoValidacao {
  if (params.quantidade <= 0) return { ok: false, erro: 'Informe uma quantidade maior que zero' }
  if (params.permitirNegativo) return { ok: true }
  if (milesimos(params.quantidade) > milesimos(params.saldoAtual)) {
    return { ok: false, erro: 'Saldo insuficiente em estoque' }
  }
  return { ok: true }
}

/**
 * Gera o estorno de uma movimentação: mesma quantidade com sinal invertido.
 */
export function criarEstorno(params: {
  original: MovimentacaoEstoque
  jaEstornada: boolean
  saldoAtual: number
  permitirNegativo?: boolean
  motivo: string
}) {
  const { original } = params
  if (original.origem === 'estorno') throw new Error('Não é possível estornar um estorno')
  if (params.jaEstornada) throw new Error('Movimentação já foi estornada')
  if (!params.motivo.trim()) throw new Error('Informe o motivo do estorno')

  const quantidade = -original.quantidade
  if (quantidade < 0) {
    const v = validarSaida({
      saldoAtual: params.saldoAtual,
      quantidade: -quantidade,
      permitirNegativo: params.permitirNegativo,
    })
    if (!v.ok) {
      throw new Error(
        'Não é possível estornar: o estoque recebido já foi consumido. Faça um ajuste se necessário.',
      )
    }
  }

  const tipo: TipoMovimentacao =
    original.tipo === 'entrada' ? 'saida' : original.tipo === 'saida' ? 'entrada' : 'ajuste'
  return {
    tipo,
    quantidade,
    origem: 'estorno' as const,
    estornoDeId: original.id,
    custoUnitario: original.tipo === 'saida' ? null : (original.custoUnitario ?? null),
    motivo: params.motivo.trim(),
  }
}

/**
 * Ajuste por contagem: devolve a diferença entre o contado e o saldo do sistema,
 * ou null se já está igual. O motivo é obrigatório (auditoria).
 */
export function calcularAjusteDeContagem(params: {
  saldoAtual: number
  quantidadeContada: number
  motivo: string
}) {
  if (params.quantidadeContada < 0) throw new Error('Quantidade contada não pode ser negativa')
  if (!params.motivo.trim()) throw new Error('Informe o motivo do ajuste')
  const diferenca = deMilesimos(milesimos(params.quantidadeContada) - milesimos(params.saldoAtual))
  if (diferenca === 0) return null
  return {
    tipo: 'ajuste' as const,
    quantidade: diferenca,
    origem: 'ajuste_manual' as const,
    motivo: params.motivo.trim(),
  }
}
