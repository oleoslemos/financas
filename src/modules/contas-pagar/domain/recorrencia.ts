import { ultimoDiaDoMes, type DataISO } from '../../lib/datas'

/** Competência no formato "YYYY-MM". */
export type Competencia = string

export function proximaCompetencia(c: Competencia, deslocamento = 1): Competencia {
  const [a, m] = c.split('-').map(Number)
  const total = a * 12 + (m - 1) + deslocamento
  const ano = Math.floor(total / 12)
  const mes = (total % 12) + 1
  return `${ano}-${String(mes).padStart(2, '0')}`
}

/** Vencimento da competência; dia 31 em mês curto vira o último dia do mês. */
export function vencimentoDaCompetencia(competencia: Competencia, diaVencimento: number): DataISO {
  if (!Number.isInteger(diaVencimento) || diaVencimento < 1 || diaVencimento > 31) {
    throw new Error('Dia de vencimento inválido')
  }
  const [a, m] = competencia.split('-').map(Number)
  const dia = Math.min(diaVencimento, ultimoDiaDoMes(a, m))
  return `${a}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/**
 * Competências que ainda precisam ser geradas para uma recorrência mensal.
 * Gera da primeira competência pendente até `mesesAFrente` meses depois da competência atual,
 * respeitando início, fim opcional e as competências já geradas (idempotente).
 */
export function competenciasPendentes(params: {
  competenciaInicio: Competencia
  competenciaFim?: Competencia | null
  competenciaAtual: Competencia
  mesesAFrente: number
  jaGeradas: Competencia[]
}): Competencia[] {
  const limite = proximaCompetencia(params.competenciaAtual, params.mesesAFrente)
  const geradas = new Set(params.jaGeradas)
  const resultado: Competencia[] = []
  let c = params.competenciaInicio
  while (c <= limite) {
    if (params.competenciaFim && c > params.competenciaFim) break
    if (!geradas.has(c)) resultado.push(c)
    c = proximaCompetencia(c)
  }
  return resultado
}
