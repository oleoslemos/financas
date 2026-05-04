export type OfferVariation = { code: string; dimensions: string; price: number }

/** Itens do kit: sempre referenciam outro `bem_aviv_offer_products` já cadastrado. */
export type OfferKitLine = {
  offer_product_id: string
  variation_code: string
  quantity: number
}

export type OfferPayload = {
  variations?: OfferVariation[]
  kit_lines?: OfferKitLine[]
}

export type OfferProduct = {
  id: string
  name: string
  category: string | null
  product_line: string | null
  product_type: string | null
  pricing_mode?: 'UNICO' | 'GRADE' | 'KIT' | null
  price_table_id?: string | null
  payload: OfferPayload
}

function normalizeKitLines(raw: unknown): OfferKitLine[] {
  if (!Array.isArray(raw)) return []
  const out: OfferKitLine[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const offer_product_id = String((row as { offer_product_id?: unknown }).offer_product_id ?? '').trim()
    const variation_code = String((row as { variation_code?: unknown }).variation_code ?? '').trim()
    const quantity = Number((row as { quantity?: unknown }).quantity)
    if (!offer_product_id || !variation_code || !Number.isFinite(quantity) || quantity < 1) continue
    out.push({ offer_product_id, variation_code, quantity: Math.max(1, Math.floor(quantity)) })
  }
  return out
}

export function normalizePayload(raw: unknown): OfferPayload {
  if (!raw || typeof raw !== 'object') return { variations: [] }
  const v = (raw as OfferPayload).variations
  const variations: OfferVariation[] = []
  if (Array.isArray(v)) {
    for (const row of v) {
      if (!row || typeof row !== 'object') continue
      const code = String((row as { code?: unknown }).code ?? '').trim()
      const dimensions = String((row as { dimensions?: unknown }).dimensions ?? '').trim()
      const price = Number((row as { price?: unknown }).price)
      if (!code || !Number.isFinite(price) || price <= 0) continue
      variations.push({ code, dimensions, price })
    }
  }
  const kit_lines = normalizeKitLines((raw as OfferPayload).kit_lines)
  return {
    variations,
    kit_lines: kit_lines.length ? kit_lines : undefined,
  }
}

/** Preço unitário de uma linha do kit a partir do produto componente. */
export function resolveKitLineUnitPrice(component: OfferProduct | undefined, variationCode: string): number | null {
  if (!component || component.pricing_mode === 'KIT') return null
  const vars = normalizePayload(component.payload).variations ?? []
  const hit = vars.find((x) => x.code === variationCode)
  if (!hit || !Number.isFinite(hit.price) || hit.price <= 0) return null
  return hit.price
}

/**
 * Soma os preços das linhas do kit usando o catálogo atual (componentes não-kit).
 * Retorna null se faltar produto, variação ou referência circular ao próprio kit.
 */
export function computeKitPayloadPrice(
  catalogById: Map<string, OfferProduct>,
  kitLines: OfferKitLine[],
  options?: { excludeKitProductId?: string },
): number | null {
  let total = 0
  for (const line of kitLines) {
    if (options?.excludeKitProductId && line.offer_product_id === options.excludeKitProductId) return null
    const comp = catalogById.get(line.offer_product_id)
    const unit = resolveKitLineUnitPrice(comp, line.variation_code)
    if (unit == null) return null
    total += unit * line.quantity
  }
  return total
}
