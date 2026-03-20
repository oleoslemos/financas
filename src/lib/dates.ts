/** Adiciona meses mantendo o dia quando possível (JS ajusta overflow). */
export function addMonths(d: Date, months: number): Date {
  const x = new Date(d.getTime())
  x.setMonth(x.getMonth() + months)
  return x
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function parseISODate(s: string): Date {
  const [y, m, day] = s.split('-').map(Number)
  return new Date(y, m - 1, day)
}

export function monthLabel(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(d)
}
