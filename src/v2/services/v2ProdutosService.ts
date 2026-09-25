import { supabase } from '../../lib/supabaseClient'

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type ProductType = 'SIMPLES' | 'VARIACAO' | 'KIT'

export type ProductCategory =
  | 'PLATAFORMA DE DESCANSO'
  | 'CABECEIRAS'
  | 'BASES / CAMAS'
  | 'ACESSÓRIOS'
  | 'OUTROS'

export interface ProductVariation {
  id: string
  name: string
  sku?: string
  cost_price: number
  sale_price: number
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
  name: string
  type: ProductType
  category: ProductCategory
  product_line?: string
  model?: string
  description?: string
  unit: string
  cost_price: number
  sale_price: number
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
const KEY_PRODUCTS = 'v2_products_list'

// ─── INITIAL DEMO PRODUCTS ───────────────────────────────────────────────────
const INITIAL_PRODUCTS: V2Product[] = [
  {
    id: 'prod-1',
    code_sku: 'EKO-PLAT-001',
    name: 'Plataforma Conforto Super Premium',
    type: 'VARIACAO',
    category: 'PLATAFORMA DE DESCANSO',
    product_line: 'SUPER PREMIUM',
    model: 'Plataforma Conforto',
    description: 'Plataforma de descanso terapêutica com sistema quântico e infravermelho longo EKO\'7.',
    unit: 'UN',
    cost_price: 2500.0,
    sale_price: 5200.0,
    variations: [
      {
        id: 'var-1',
        name: 'Solteiro (0,78m x 1,88m x 41cm)',
        sku: 'EKO-PLAT-001-SOL',
        cost_price: 2100.0,
        sale_price: 4300.0,
        dim_width_cm: 78,
        dim_length_cm: 188,
        dim_height_cm: 41,
      },
      {
        id: 'var-2',
        name: 'Casal (1,38m x 1,88m x 41cm)',
        sku: 'EKO-PLAT-001-CAS',
        cost_price: 2500.0,
        sale_price: 5200.0,
        dim_width_cm: 138,
        dim_length_cm: 188,
        dim_height_cm: 41,
      },
      {
        id: 'var-3',
        name: 'Queen Size (1,58m x 1,98m x 41cm)',
        sku: 'EKO-PLAT-001-QUE',
        cost_price: 2900.0,
        sale_price: 6100.0,
        dim_width_cm: 158,
        dim_length_cm: 198,
        dim_height_cm: 41,
      },
      {
        id: 'var-4',
        name: 'King Size (1,93m x 2,03m x 41cm)',
        sku: 'EKO-PLAT-001-KIN',
        cost_price: 3400.0,
        sale_price: 7200.0,
        dim_width_cm: 193,
        dim_length_cm: 203,
        dim_height_cm: 41,
      },
    ],
    active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'prod-2',
    code_sku: 'EKO-CAB-002',
    name: 'Cabeceira Estofada Paris',
    type: 'SIMPLES',
    category: 'CABECEIRAS',
    product_line: 'PREMIUM',
    model: 'Paris',
    description: 'Cabeceira de alto padrão com revestimento sintético premium antialérgico.',
    unit: 'UN',
    cost_price: 450.0,
    sale_price: 980.0,
    dim_width_cm: 158,
    dim_length_cm: 10,
    dim_height_cm: 125,
    active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'prod-3',
    code_sku: 'EKO-ACS-003',
    name: 'Travesseiro Anatômico Magnético',
    type: 'SIMPLES',
    category: 'ACESSÓRIOS',
    description: 'Travesseiro com pastilhas magnéticas e perfilados respiráveis.',
    unit: 'UN',
    cost_price: 95.0,
    sale_price: 220.0,
    active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'prod-4',
    code_sku: 'EKO-KIT-100',
    name: 'Kit Sono Perfeito (Queen + 2 Travesseiros + Cabeceira)',
    type: 'KIT',
    category: 'OUTROS',
    description: 'Combo completo de longevidade contendo 1 Plataforma Queen, 1 Cabeceira Paris e 2 Travesseiros Terapêuticos.',
    unit: 'SET',
    cost_price: 3540.0,
    sale_price: 7200.0,
    kit_price_mode: 'AUTO',
    kit_items: [
      { product_id: 'prod-1', variation_id: 'var-3', product_name: 'Plataforma Conforto Queen', quantity: 1, unit_price: 6100.0 },
      { product_id: 'prod-2', product_name: 'Cabeceira Estofada Paris', quantity: 1, unit_price: 980.0 },
      { product_id: 'prod-3', product_name: 'Travesseiro Anatômico Magnético', quantity: 2, unit_price: 220.0 },
    ],
    active: true,
    created_at: new Date().toISOString(),
  },
]

// ─── CRUD OPERATIONS ─────────────────────────────────────────────────────────

export async function listV2Products(): Promise<V2Product[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase.from('bem_aviv_products').select('*').order('name')
      if (!error && data && data.length > 0) {
        return data as V2Product[]
      }
    } catch {}
  }

  try {
    const raw = localStorage.getItem(KEY_PRODUCTS)
    if (raw) return JSON.parse(raw)
  } catch {}

  localStorage.setItem(KEY_PRODUCTS, JSON.stringify(INITIAL_PRODUCTS))
  return INITIAL_PRODUCTS
}

export async function saveV2Product(item: Omit<V2Product, 'id' | 'created_at'> & { id?: string }): Promise<V2Product> {
  const current = await listV2Products()
  const isEdit = Boolean(item.id)
  const id = item.id || 'prod-' + Date.now()
  const fullItem: V2Product = {
    ...item,
    id,
    created_at: item.id
      ? current.find((c) => c.id === item.id)?.created_at || new Date().toISOString()
      : new Date().toISOString(),
  }

  if (supabase) {
    try {
      await supabase.from('bem_aviv_products').upsert({
        id: fullItem.id,
        code_sku: fullItem.code_sku,
        name: fullItem.name,
        type: fullItem.type,
        category: fullItem.category,
        product_line: fullItem.product_line || null,
        model: fullItem.model || null,
        description: fullItem.description || null,
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
      await supabase.from('bem_aviv_products').delete().eq('id', id)
    } catch (err) {
      console.warn('Supabase product delete error:', err)
    }
  }
  const current = await listV2Products()
  const filtered = current.filter((p) => p.id !== id)
  localStorage.setItem(KEY_PRODUCTS, JSON.stringify(filtered))
}
