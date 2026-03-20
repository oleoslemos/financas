export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export function parseMoney(input: string): number {
  const n = Number(
    input
      .replace(/\s/g, '')
      .replace(/R\$\s?/i, '')
      .replace(/\./g, '')
      .replace(',', '.'),
  )
  return Number.isFinite(n) ? n : 0
}
