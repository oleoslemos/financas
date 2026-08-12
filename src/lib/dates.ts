/** Adiciona meses mantendo o dia quando possível (JS ajusta overflow). */
export function addMonths(d: Date, months: number): Date {
  const x = new Date(d.getTime())
  x.setMonth(x.getMonth() + months)
  return x
}

export function toISODate(d: Date): string {
  if (!d || Number.isNaN(d.getTime())) return ''
  try {
    return d.toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

export function parseISODate(s: string): Date {
  const [y, m, day] = s.split('-').map(Number)
  return new Date(y, m - 1, day)
}

export function monthLabel(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(d)
}

/** Valor para `<input type="date">` (YYYY-MM-DD) no fuso local. */
export function toInputDate(value?: string | null): string {
  if (!value) return ''
  try {
    const trimmed = value.trim()
    if (!trimmed) return ''
    const dt = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? parseISODate(trimmed) : new Date(trimmed)
    if (Number.isNaN(dt.getTime())) return ''
    const y = dt.getFullYear()
    const m = String(dt.getMonth() + 1).padStart(2, '0')
    const day = String(dt.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  } catch {
    return ''
  }
}

export function todayInputDate(): string {
  return toInputDate(new Date().toISOString())
}

/** Converte YYYY-MM-DD (ou datetime-local legado) para ISO no início do dia local. */
export function dateInputToIso(value: string): string {
  if (!value) return ''
  try {
    const trimmed = value.trim()
    if (!trimmed) return ''
    if (trimmed.includes('T')) {
      const dt = new Date(trimmed)
      return Number.isNaN(dt.getTime()) ? '' : dt.toISOString()
    }
    const datePart = trimmed.slice(0, 10)
    const dt = parseISODate(datePart)
    return Number.isNaN(dt.getTime()) ? '' : dt.toISOString()
  } catch {
    return ''
  }
}

export function formatDateOnly(value?: string | null): string {
  if (!value) return '—'
  try {
    const dt = new Date(value)
    if (Number.isNaN(dt.getTime())) return '—'
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(dt)
  } catch {
    return '—'
  }
}

