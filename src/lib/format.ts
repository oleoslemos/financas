export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export function parseMoney(input: string): number {
  const raw = input.replace(/\s/g, '').replace(/R\$\s?/i, '')
  let normalized = raw

  // Suporta: 3500 | 3500.75 | 3500,75 | 3.500,75
  if (raw.includes('.') && raw.includes(',')) {
    // pt-BR típico: ponto milhar, vírgula decimal
    normalized = raw.replace(/\./g, '').replace(',', '.')
  } else if (raw.includes(',')) {
    normalized = raw.replace(',', '.')
  } // se tiver apenas ponto, tratamos como decimal padrão

  const n = Number(normalized)
  return Number.isFinite(n) ? n : 0
}

/** Só dígitos = centavos acumulados (ex: "150050" → R$ 1.500,50). */
export function parseDigitsCentsToNumber(digits: string): number {
  const v = parseInt(digits.replace(/\D/g, '') || '0', 10)
  return Number.isFinite(v) ? v / 100 : 0
}

export function numberToCentsDigits(n: number): string {
  if (!Number.isFinite(n)) return ''
  return String(Math.round(n * 100))
}

/** Máscara R$ para exibir enquanto o estado guarda apenas dígitos (centavos). */
export function formatBRLFromCentsDigits(digits: string): string {
  const n = parseDigitsCentsToNumber(digits)
  if (!digits.replace(/\D/g, '')) return ''
  return formatBRL(n)
}

/** Máscara 0,00% — mesma precisão de centésimos (ex.: dígitos "1050" → 10,50%). */
export function formatPercentFromDigits(digits: string): string {
  const n = parseDigitsCentsToNumber(digits)
  if (!digits.replace(/\D/g, '')) return ''
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

export function onlyDigits(raw: string): string {
  return raw.replace(/\D/g, '')
}

/** Backspace/Delete em máscara monetária ou percentual: remove o último dígito (centésimos). */
export function handleCentsMaskKeyDown(
  e: React.KeyboardEvent<HTMLInputElement>,
  digits: string,
  onDigitsChange: (next: string) => void,
): void {
  if (e.key !== 'Backspace' && e.key !== 'Delete') return
  const el = e.currentTarget
  if (el.selectionStart !== el.selectionEnd) return
  e.preventDefault()
  if (digits.length > 0) onDigitsChange(digits.slice(0, -1))
}
