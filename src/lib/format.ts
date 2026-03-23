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
