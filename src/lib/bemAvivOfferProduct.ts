export type OfferVariation = { code: string; dimensions: string; price: number }

export type OfferPayload = {
  variations?: OfferVariation[]
}

export type OfferProduct = {
  id: string
  name: string
  category: string | null
  product_line: string | null
  product_type: string | null
  payload: OfferPayload
}

export function normalizePayload(raw: unknown): OfferPayload {
  if (!raw || typeof raw !== 'object') return { variations: [] }
  const v = (raw as OfferPayload).variations
  if (!Array.isArray(v)) return { variations: [] }
  const variations: OfferVariation[] = []
  for (const row of v) {
    if (!row || typeof row !== 'object') continue
    const code = String((row as { code?: unknown }).code ?? '').trim()
    const dimensions = String((row as { dimensions?: unknown }).dimensions ?? '').trim()
    const price = Number((row as { price?: unknown }).price)
    if (!code || !Number.isFinite(price) || price <= 0) continue
    variations.push({ code, dimensions, price })
  }
  return { variations }
}
