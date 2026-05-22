const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'] as const

export type MonthlyGoalsMap = Record<string, number>

export function monthLabels() {
  return MONTH_LABELS
}

export function emptyMonthlyGoals(): MonthlyGoalsMap {
  const m: MonthlyGoalsMap = {}
  for (let i = 1; i <= 12; i++) m[String(i)] = 0
  return m
}

export function parseMonthlyGoals(raw: unknown): MonthlyGoalsMap {
  const base = emptyMonthlyGoals()
  if (!raw || typeof raw !== 'object') return base
  for (let i = 1; i <= 12; i++) {
    const key = String(i)
    const v = (raw as Record<string, unknown>)[key]
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
    if (Number.isFinite(n) && n >= 0) base[key] = Math.round(n * 100) / 100
  }
  return base
}

export function monthlyGoalsToDraft(map: MonthlyGoalsMap): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 1; i <= 12; i++) {
    const key = String(i)
    const n = map[key] ?? 0
    out[key] = n > 0 ? String(n).replace('.', ',') : ''
  }
  return out
}

export function parseGoalMoneyInput(raw: string): number {
  const cleaned = (raw ?? '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100) / 100
}

export function formatGoalMoneyInput(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return ''
  return n.toFixed(2).replace('.', ',')
}

/** Média das vendas do mesmo mês em anos anteriores (pedidos confirmados). */
export function suggestMonthGoalFromHistory(
  month: number,
  monthlySoldAllTime: Record<string, number>,
  beforeYear: number,
): number | null {
  if (month < 1 || month > 12) return null
  const amounts: number[] = []
  for (const [mk, amt] of Object.entries(monthlySoldAllTime)) {
    const [yStr, mStr] = mk.split('-')
    const y = Number(yStr)
    const m = Number(mStr)
    if (!Number.isFinite(y) || !Number.isFinite(m) || m !== month || y >= beforeYear) continue
    if (Number.isFinite(amt) && amt > 0) amounts.push(amt)
  }
  if (amounts.length === 0) return null
  const sum = amounts.reduce((a, b) => a + b, 0)
  return Math.round((sum / amounts.length) * 100) / 100
}

export function sumYearToDateSold(monthlySoldAllTime: Record<string, number>, year: number, throughMonth?: number) {
  const now = new Date()
  const endMonth = throughMonth ?? (year < now.getFullYear() ? 12 : year === now.getFullYear() ? now.getMonth() + 1 : 0)
  let sum = 0
  for (let m = 1; m <= endMonth; m++) {
    const mk = `${year}-${String(m).padStart(2, '0')}`
    sum += monthlySoldAllTime[mk] ?? 0
  }
  return sum
}

export function sumMonthlyGoals(map: MonthlyGoalsMap): number {
  return Object.values(map).reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0)
}
