export function toUpperTrim(value: string): string {
  return value.trim().toUpperCase()
}

export function toUpperOrNull(value: string): string | null {
  const normalized = toUpperTrim(value)
  return normalized ? normalized : null
}

/** Remove acentuação para buscas e comparações tolerantes (ex.: PATRI = PATRÍCIA). */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
}
