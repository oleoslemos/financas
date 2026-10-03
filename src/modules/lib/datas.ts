/**
 * Datas como strings ISO "YYYY-MM-DD" (sem fuso horário), compatíveis com colunas DATE.
 * Toda a aritmética é feita em UTC para evitar deslocamentos de dia.
 */

export type DataISO = string

function paraUTC(data: DataISO): Date {
  const [a, m, d] = data.split('-').map(Number)
  if (!a || !m || !d) throw new Error(`Data inválida: ${data}`)
  return new Date(Date.UTC(a, m - 1, d))
}

function paraISO(data: Date): DataISO {
  return data.toISOString().slice(0, 10)
}

export function ultimoDiaDoMes(ano: number, mes: number): number {
  // mes: 1-12
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

export function somarDias(data: DataISO, dias: number): DataISO {
  const d = paraUTC(data)
  d.setUTCDate(d.getUTCDate() + dias)
  return paraISO(d)
}

/** Soma meses preservando o dia; se o mês de destino for mais curto, usa o último dia (31/01 + 1 mês = 28/02). */
export function somarMeses(data: DataISO, meses: number): DataISO {
  const d = paraUTC(data)
  const dia = d.getUTCDate()
  const alvo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + meses, 1))
  const ultimo = ultimoDiaDoMes(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1)
  alvo.setUTCDate(Math.min(dia, ultimo))
  return paraISO(alvo)
}

export function compararDatas(a: DataISO, b: DataISO): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Retorna a data de hoje em formato ISO "YYYY-MM-DD". */
export function hoje(): DataISO {
  return new Date().toISOString().slice(0, 10)
}

/** Formata data ISO para exibição pt-BR (DD/MM/YYYY). */
export function formatarData(data: DataISO | null | undefined): string {
  if (!data) return '-'
  const [a, m, d] = data.split('-')
  return `${d}/${m}/${a}`
}
