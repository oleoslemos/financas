import { supabase } from '../../lib/supabaseClient'

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type ProductType = 'SIMPLES' | 'VARIACAO' | 'KIT'

export interface ProductVariation {
  id: string
  name: string
  sku?: string
  cost_price: number // Tabela Fábrica
  sale_price: number // Tabela Vendas Sul
  dim_width_cm?: number | null
  dim_length_cm?: number | null
  dim_height_cm?: number | null
}

export interface KitItem {
  product_id: string
  variation_id?: string
  product_name: string
  quantity: number
  unit_price: number
}

export interface V2Product {
  id: string
  code_sku: string
  name: string // Descrição Produto
  type: ProductType
  category?: string
  product_line?: string // Linha do Produto
  model?: string
  unit: string
  cost_price: number // Tabela Fábrica (R$)
  sale_price: number // Tabela Vendas Sul (R$)
  dim_width_cm?: number | null
  dim_length_cm?: number | null
  dim_height_cm?: number | null
  variations?: ProductVariation[]
  kit_items?: KitItem[]
  kit_price_mode?: 'AUTO' | 'MANUAL'
  active: boolean
  created_at: string
}

// ─── STORAGE KEYS ─────────────────────────────────────────────────────────────
const KEY_PRODUCTS = 'v2_produtos_v2_clean'
const SUPABASE_TABLE = 'v2_produtos'

// ─── CRUD OPERATIONS ─────────────────────────────────────────────────────────

export async function listV2Products(): Promise<V2Product[]> {
  let list: V2Product[] = []

  if (supabase) {
    try {
      const { data, error } = await supabase.from(SUPABASE_TABLE).select('*').order('code_sku')
      if (!error && data) {
        list = data as V2Product[]
      }
    } catch {}
  }

  if (list.length === 0) {
    try {
      const raw = localStorage.getItem(KEY_PRODUCTS)
      if (raw) list = JSON.parse(raw)
    } catch {}
  }

  // Ensure all products have an auto-generated SKU if missing
  let count = 1
  const updatedList = list.map((p) => {
    if (!p.code_sku) {
      const sku = `EKO-PRD-${String(count++).padStart(3, '0')}`
      return { ...p, code_sku: sku }
    }
    return p
  })

  return updatedList
}

export async function saveV2Product(item: Omit<V2Product, 'id' | 'created_at'> & { id?: string }): Promise<V2Product> {
  const current = await listV2Products()
  const isEdit = Boolean(item.id)
  const id = item.id || 'prod-' + Date.now()
  const nextNum = current.length + 1
  const autoSku = item.code_sku || `EKO-PRD-${String(nextNum).padStart(3, '0')}`

  const fullItem: V2Product = {
    ...item,
    id,
    code_sku: autoSku,
    unit: item.unit || 'UN',
    created_at: item.id
      ? current.find((c) => c.id === item.id)?.created_at || new Date().toISOString()
      : new Date().toISOString(),
  }

  if (supabase) {
    try {
      await supabase.from(SUPABASE_TABLE).upsert({
        id: fullItem.id,
        code_sku: fullItem.code_sku,
        name: fullItem.name,
        type: fullItem.type,
        product_line: fullItem.product_line || null,
        model: fullItem.model || null,
        unit: fullItem.unit || 'UN',
        cost_price: fullItem.cost_price,
        sale_price: fullItem.sale_price,
        dim_width_cm: fullItem.dim_width_cm || null,
        dim_length_cm: fullItem.dim_length_cm || null,
        dim_height_cm: fullItem.dim_height_cm || null,
        variations: fullItem.variations || null,
        kit_items: fullItem.kit_items || null,
        kit_price_mode: fullItem.kit_price_mode || 'AUTO',
        active: fullItem.active,
        updated_at: new Date().toISOString(),
      })
    } catch (err) {
      console.warn('Supabase product upsert fallback:', err)
    }
  }

  let updatedList: V2Product[]
  if (isEdit) {
    updatedList = current.map((p) => (p.id === id ? fullItem : p))
  } else {
    updatedList = [fullItem, ...current]
  }
  localStorage.setItem(KEY_PRODUCTS, JSON.stringify(updatedList))
  return fullItem
}

export async function deleteV2Product(id: string): Promise<void> {
  if (supabase) {
    try {
      await supabase.from(SUPABASE_TABLE).delete().eq('id', id)
    } catch (err) {
      console.warn('Supabase product delete error:', err)
    }
  }
  const current = await listV2Products()
  const filtered = current.filter((p) => p.id !== id)
  localStorage.setItem(KEY_PRODUCTS, JSON.stringify(filtered))
}

export async function clearAllV2Products(): Promise<void> {
  if (supabase) {
    try {
      // Delete all records from Supabase table
      await supabase.from(SUPABASE_TABLE).delete().neq('id', '00000000-0000-0000-0000-000000000000')
    } catch (err) {
      console.warn('Supabase wipe products error:', err)
    }
  }
  localStorage.removeItem(KEY_PRODUCTS)
}

export async function getDistinctProductLines(): Promise<string[]> {
  const prods = await listV2Products()
  const lines = prods.flatMap((p) => p.product_line ? p.product_line.split('|').map(l => l.trim()) : [])
    .filter((l): l is string => Boolean(l && l.trim()))
  return Array.from(new Set(lines)).sort()
}

// ─── CSV EXPORT UTILITY ───────────────────────────────────────────────────────

export function exportProductsToCSV(products: V2Product[]): void {
  const headers = [
    'SKU',
    'DESCRIÇÃO PRODUTO',
    'LINHA DO PRODUTO',
    'DIMENSÕES',
    'TABELA FÁBRICA (R$)',
    'TABELA VENDAS SUL (R$)',
    'TIPO',
    'STATUS',
  ]

  const rows = products.map((p) => {
    const dim = [
      p.dim_width_cm ? `${(p.dim_width_cm / 100).toFixed(2).replace('.', ',')}m` : '',
      p.dim_length_cm ? `${(p.dim_length_cm / 100).toFixed(2).replace('.', ',')}m` : '',
      p.dim_height_cm ? `${p.dim_height_cm}cm` : '',
    ]
      .filter(Boolean)
      .join(' x ')

    return [
      `"${p.code_sku || ''}"`,
      `"${(p.name || '').replace(/"/g, '""')}"`,
      `"${(p.product_line || '').replace(/"/g, '""')}"`,
      `"${dim || '—'}"`,
      `"${(p.cost_price || 0).toFixed(2).replace('.', ',')}"`,
      `"${(p.sale_price || 0).toFixed(2).replace('.', ',')}"`,
      `"${p.type || 'SIMPLES'}"`,
      `"${p.active ? 'Ativo' : 'Inativo'}"`,
    ].join(';')
  })

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `Produtos_BemAviv_${new Date().toISOString().slice(0, 10)}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
