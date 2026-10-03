import { deCentavos, paraCentavos } from '../../lib/money'
import { somarDias, somarMeses, type DataISO } from '../../lib/datas'

export type Intervalo = { tipo: 'dias'; valor: number } | { tipo: 'meses'; valor: number }

export type ParcelaGerada = {
  numero: number
  vencimento: DataISO
  valor: number
}

/**
 * Divide o total em N parcelas. O resto de centavos vai para a última parcela.
 * O vencimento da parcela i é calculado a partir do primeiro vencimento (não encadeado),
 * para que meses curtos não "arrastem" as datas seguintes.
 */
export function gerarParcelas(params: {
  total: number
  numeroParcelas: number
  primeiroVencimento: DataISO
  intervalo?: Intervalo
}): ParcelaGerada[] {
  const { total, numeroParcelas, primeiroVencimento } = params
  const intervalo = params.intervalo ?? { tipo: 'meses', valor: 1 }

  if (!Number.isInteger(numeroParcelas) || numeroParcelas < 1) {
    throw new Error('Número de parcelas inválido')
  }
  if (intervalo.valor < 1) throw new Error('Intervalo inválido')
  const totalCent = paraCentavos(total)
  if (totalCent <= 0) throw new Error('Total deve ser maior que zero')
  if (totalCent < numeroParcelas) throw new Error('Total menor que o número de parcelas (centavos)')

  const base = Math.floor(totalCent / numeroParcelas)
  const resto = totalCent - base * numeroParcelas

  return Array.from({ length: numeroParcelas }, (_, i) => {
    const ehUltima = i === numeroParcelas - 1
    const deslocamento = i * intervalo.valor
    return {
      numero: i + 1,
      vencimento:
        intervalo.tipo === 'meses'
          ? somarMeses(primeiroVencimento, deslocamento)
          : somarDias(primeiroVencimento, deslocamento),
      valor: deCentavos(ehUltima ? base + resto : base),
    }
  })
}
