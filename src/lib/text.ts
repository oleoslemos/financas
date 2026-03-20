export function toUpperTrim(value: string): string {
  return value.trim().toUpperCase()
}

export function toUpperOrNull(value: string): string | null {
  const normalized = toUpperTrim(value)
  return normalized ? normalized : null
}
