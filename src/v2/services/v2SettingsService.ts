import { supabase } from '../../lib/supabaseClient'

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface Fornecedor {
  id: string
  trade_name: string
  legal_name?: string
  cnpj?: string
  state_registration?: string
  contact_name?: string
  phone?: string
  email?: string
  category?: string
  address_city?: string
  notes?: string
  active: boolean
  created_at: string
}

export type RepresentanteRole = 'DISTRIBUIDOR' | 'REPRESENTANTE'

export interface Representante {
  id: string
  company_id?: string
  code?: string
  name: string
  role: RepresentanteRole
  cpf_cnpj?: string
  commission_rate: number
  phone?: string
  email?: string
  region?: string
  is_default?: boolean
  active: boolean
  created_at: string
  sales_goal?: number | null
  visits_goal?: number | null
}

export interface RepresentativeGoal {
  id?: string
  representative_id: string
  company_id?: string
  month: string // YYYY-MM-01
  sales_goal: number | null
  visits_goal: number | null
  created_at?: string
  updated_at?: string
}

export interface InstallmentRate {
  installment: number
  fee_percentage: number
}

export interface FormaPagamento {
  id: string
  name: string
  category: 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'BOLETO' | 'CASH' | 'OTHER'
  max_installments: number
  fee_percentage: number
  installment_rates?: InstallmentRate[]
  days_to_receive: number
  active: boolean
  created_at: string
}

// ─── HELPER ──────────────────────────────────────────────────────────────────
export function generateDefaultInstallmentRates(maxInstallments: number, baseFee: number): InstallmentRate[] {
  const rates: InstallmentRate[] = []
  for (let i = 1; i <= maxInstallments; i++) {
    // 0.6% increment per additional installment as default suggestion
    const fee = i === 1 ? baseFee : parseFloat((baseFee + (i - 1) * 0.6).toFixed(2))
    rates.push({ installment: i, fee_percentage: fee })
  }
  return rates
}

// ─── KEYS ────────────────────────────────────────────────────────────────────
const KEY_FORNECEDORES = 'v2_fornecedores_list'
const KEY_REPRESENTANTES = 'v2_representantes_list'
const KEY_PAYMENT_METHODS = 'v2_payment_methods_list'

// ─── INITIAL DEMO DATA ───────────────────────────────────────────────────────
const INITIAL_FORNECEDORES: Fornecedor[] = [
  {
    id: 'forn-1',
    trade_name: "EKO'7 Brasil Colchões",
    legal_name: "EKO'7 Indústria e Comércio de Colchões Ltda",
    cnpj: '12.345.678/0001-90',
    state_registration: '123.456.789.110',
    contact_name: 'Geraldo Silva (Atendimento Comercial)',
    phone: '(11) 98765-4321',
    email: 'comercial@eko7.com.br',
    category: 'Colchões e Plataformas de Descanso',
    address_city: 'Chapecó - SC',
    notes: 'Fornecedor principal da linha de saúde e longevidade.',
    active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'forn-2',
    trade_name: 'Espumas & Tecidos Sul',
    legal_name: 'Sul Espumas Indústria Textil Ltda',
    cnpj: '98.765.432/0001-10',
    state_registration: '987.654.321.000',
    contact_name: 'Juliana Ramos',
    phone: '(47) 99123-8877',
    email: 'vendas@sulespumas.com.br',
    category: 'Matéria-Prima e Acessórios',
    address_city: 'Joinville - SC',
    notes: 'Fornecedor de acessórios e espumas especiais.',
    active: true,
    created_at: new Date().toISOString(),
  },
]

const INITIAL_REPRESENTANTES: Representante[] = [
  {
    id: 'rep-1',
    code: 'REP-001',
    name: 'Carlos Eduardo Santos',
    role: 'REPRESENTANTE',
    cpf_cnpj: '123.456.789-00',
    commission_rate: 5.0,
    phone: '(11) 97111-2233',
    email: 'carlos.representante@bemaviv.com.br',
    region: 'São Paulo - SP',
    active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'rep-2',
    code: 'REP-002',
    name: 'Fernanda Lima Consultoria',
    role: 'DISTRIBUIDOR',
    cpf_cnpj: '98.765.432/0001-88',
    commission_rate: 6.5,
    phone: '(21) 98222-3344',
    email: 'fernanda.vendas@bemaviv.com.br',
    region: 'Rio de Janeiro / Minas Gerais',
    active: true,
    created_at: new Date().toISOString(),
  },
]

const INITIAL_FORMAS_PAGAMENTO: FormaPagamento[] = [
  {
    id: 'pay-1',
    name: 'Pix à Vista',
    category: 'PIX',
    max_installments: 1,
    fee_percentage: 0.0,
    installment_rates: [{ installment: 1, fee_percentage: 0.0 }],
    days_to_receive: 0,
    active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'pay-2',
    name: 'Cartão de Crédito à Vista (1x)',
    category: 'CREDIT_CARD',
    max_installments: 1,
    fee_percentage: 2.5,
    installment_rates: [{ installment: 1, fee_percentage: 2.5 }],
    days_to_receive: 30,
    active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'pay-3',
    name: 'Cartão de Crédito Parcelado (1x a 12x)',
    category: 'CREDIT_CARD',
    max_installments: 12,
    fee_percentage: 2.5,
    installment_rates: [
      { installment: 1, fee_percentage: 2.5 },
      { installment: 2, fee_percentage: 3.2 },
      { installment: 3, fee_percentage: 3.9 },
      { installment: 4, fee_percentage: 4.5 },
      { installment: 5, fee_percentage: 5.1 },
      { installment: 6, fee_percentage: 5.8 },
      { installment: 7, fee_percentage: 6.4 },
      { installment: 8, fee_percentage: 7.0 },
      { installment: 9, fee_percentage: 7.6 },
      { installment: 10, fee_percentage: 8.2 },
      { installment: 11, fee_percentage: 8.8 },
      { installment: 12, fee_percentage: 9.5 },
    ],
    days_to_receive: 30,
    active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'pay-4',
    name: 'Boleto Bancário (30 Dias)',
    category: 'BOLETO',
    max_installments: 1,
    fee_percentage: 1.5,
    installment_rates: [{ installment: 1, fee_percentage: 1.5 }],
    days_to_receive: 30,
    active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'pay-5',
    name: 'Dinheiro em Espécie',
    category: 'CASH',
    max_installments: 1,
    fee_percentage: 0.0,
    installment_rates: [{ installment: 1, fee_percentage: 0.0 }],
    days_to_receive: 0,
    active: true,
    created_at: new Date().toISOString(),
  },
]

// ─── FORNECEDORES ────────────────────────────────────────────────────────────

export async function listFornecedores(): Promise<Fornecedor[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase.from('suppliers').select('*').order('trade_name')
      if (!error && data && data.length > 0) {
        return data as Fornecedor[]
      }
    } catch {}
  }

  try {
    const raw = localStorage.getItem(KEY_FORNECEDORES)
    if (raw) return JSON.parse(raw)
  } catch {}

  localStorage.setItem(KEY_FORNECEDORES, JSON.stringify(INITIAL_FORNECEDORES))
  return INITIAL_FORNECEDORES
}

export async function saveFornecedor(item: Omit<Fornecedor, 'id' | 'created_at'> & { id?: string }): Promise<Fornecedor> {
  const current = await listFornecedores()
  const isEdit = Boolean(item.id)
  const id = item.id || 'forn-' + Date.now()
  const fullItem: Fornecedor = {
    ...item,
    id,
    created_at: item.id ? (current.find(c => c.id === item.id)?.created_at || new Date().toISOString()) : new Date().toISOString(),
  }

  if (supabase) {
    try {
      await supabase.from('suppliers').upsert({
        id: fullItem.id,
        trade_name: fullItem.trade_name,
        legal_name: fullItem.legal_name || null,
        cnpj: fullItem.cnpj || null,
        state_registration: fullItem.state_registration || null,
        contact_name: fullItem.contact_name || null,
        phone: fullItem.phone || null,
        email: fullItem.email || null,
        category: fullItem.category || null,
        address_city: fullItem.address_city || null,
        notes: fullItem.notes || null,
        active: fullItem.active,
        updated_at: new Date().toISOString()
      })
    } catch (err) {
      console.warn('Supabase supplier upsert fallback:', err)
    }
  }

  let updatedList: Fornecedor[]
  if (isEdit) {
    updatedList = current.map(f => f.id === id ? fullItem : f)
  } else {
    updatedList = [fullItem, ...current]
  }
  localStorage.setItem(KEY_FORNECEDORES, JSON.stringify(updatedList))
  return fullItem
}

export async function deleteFornecedor(id: string): Promise<void> {
  if (supabase) {
    try {
      await supabase.from('suppliers').delete().eq('id', id)
    } catch (err) {
      console.warn('Supabase supplier delete error:', err)
    }
  }
  const current = await listFornecedores()
  const filtered = current.filter(f => f.id !== id)
  localStorage.setItem(KEY_FORNECEDORES, JSON.stringify(filtered))
}

// ─── REPRESENTANTES ──────────────────────────────────────────────────────────

export async function listRepresentantes(companyId?: string | null): Promise<Representante[]> {
  if (supabase) {
    try {
      let query = supabase
        .from('bem_aviv_representatives')
        .select('*')
        .is('deleted_at', null)

      if (companyId) {
        query = query.eq('company_id', companyId)
      }

      const { data, error } = await query.order('name')

      if (!error && data && data.length > 0) {
        const repIds = data.map((r: any) => r.id)
        let goalsMap: Record<string, { sales_goal: number | null; visits_goal: number | null }> = {}
        try {
          const now = new Date()
          const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
          const { data: goalsData } = await supabase
            .from('bem_aviv_representative_goals')
            .select('*')
            .in('representative_id', repIds)
            .eq('month', currentMonthStr)

          if (goalsData) {
            for (const g of goalsData) {
              goalsMap[g.representative_id] = {
                sales_goal: g.sales_goal != null ? Number(g.sales_goal) : null,
                visits_goal: g.visits_goal != null ? Number(g.visits_goal) : null,
              }
            }
          }
        } catch {}

        return data.map((r: any) => ({
          id: r.id,
          company_id: r.company_id,
          code: r.code,
          name: r.name,
          role: r.role || 'REPRESENTANTE',
          cpf_cnpj: r.cpf_cnpj || undefined,
          commission_rate: Number(r.commission_rate) || 0,
          phone: r.phone || undefined,
          email: r.email || undefined,
          region: r.region || undefined,
          is_default: Boolean(r.is_default),
          active: Boolean(r.active),
          created_at: r.created_at,
          sales_goal: goalsMap[r.id]?.sales_goal ?? null,
          visits_goal: goalsMap[r.id]?.visits_goal ?? null,
        })) as Representante[]
      }
    } catch {}
  }

  try {
    const raw = localStorage.getItem(KEY_REPRESENTANTES)
    if (raw) {
      const parsed = JSON.parse(raw) as Representante[]
      return parsed.map((r) => ({
        ...r,
        role: r.role || 'REPRESENTANTE',
      }))
    }
  } catch {}

  localStorage.setItem(KEY_REPRESENTANTES, JSON.stringify(INITIAL_REPRESENTANTES))
  return INITIAL_REPRESENTANTES
}

export async function saveRepresentante(
  item: Omit<Representante, 'id' | 'created_at'> & { id?: string },
  companyId?: string | null
): Promise<Representante> {
  const current = await listRepresentantes(companyId)
  const isEdit = Boolean(item.id)
  const id = item.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'rep-' + Date.now())
  const compId = companyId || '10000000-0000-4000-8000-000000000001'

  const fullItem: Representante = {
    ...item,
    role: item.role || 'REPRESENTANTE',
    id,
    created_at: item.id ? (current.find(c => c.id === item.id)?.created_at || new Date().toISOString()) : new Date().toISOString(),
    sales_goal: item.sales_goal ?? null,
    visits_goal: item.visits_goal ?? null,
  }

  if (supabase) {
    try {
      const repPayload: any = {
        id: fullItem.id,
        company_id: compId,
        code: fullItem.code || null,
        name: fullItem.name,
        role: fullItem.role,
        cpf_cnpj: fullItem.cpf_cnpj ? fullItem.cpf_cnpj.replace(/\D/g, '') : null,
        commission_rate: fullItem.commission_rate || 0,
        phone: fullItem.phone || null,
        email: fullItem.email || null,
        region: fullItem.region || null,
        active: fullItem.active,
        updated_at: new Date().toISOString(),
      }

      await supabase.from('bem_aviv_representatives').upsert(repPayload)

      if (fullItem.sales_goal !== undefined || fullItem.visits_goal !== undefined) {
        const now = new Date()
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        await supabase.from('bem_aviv_representative_goals').upsert({
          company_id: compId,
          representative_id: fullItem.id,
          month: currentMonth,
          sales_goal: fullItem.sales_goal,
          visits_goal: fullItem.visits_goal,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'representative_id,month' })
      }
    } catch (err) {
      console.warn('Supabase representative upsert fallback:', err)
    }
  }

  let updatedList: Representante[]
  if (isEdit) {
    updatedList = current.map(r => r.id === id ? fullItem : r)
  } else {
    updatedList = [fullItem, ...current]
  }
  localStorage.setItem(KEY_REPRESENTANTES, JSON.stringify(updatedList))
  return fullItem
}

export async function deleteRepresentante(id: string): Promise<void> {
  if (supabase) {
    try {
      // 1. Tenta soft delete desmarcando is_default
      const { error } = await supabase
        .from('bem_aviv_representatives')
        .update({
          is_default: false,
          active: false,
          deleted_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (error) {
        // 2. Se falhar por constraint, tenta delete físico
        console.warn('Soft-delete failed, attempting hard delete:', error)
        await supabase.from('bem_aviv_representatives').delete().eq('id', id)
      }
    } catch (err) {
      console.warn('Supabase representative delete error:', err)
      try {
        await supabase.from('bem_aviv_representatives').delete().eq('id', id)
      } catch {}
    }
  }
  const current = await listRepresentantes()
  const filtered = current.filter(r => r.id !== id)
  localStorage.setItem(KEY_REPRESENTANTES, JSON.stringify(filtered))
}

// ─── METAS COMERCIAIS MÊS A MÊS ──────────────────────────────────────────────

export async function listRepresentativeGoals(
  representativeId: string,
  year?: number
): Promise<RepresentativeGoal[]> {
  if (supabase) {
    try {
      let query = supabase
        .from('bem_aviv_representative_goals')
        .select('*')
        .eq('representative_id', representativeId)

      if (year) {
        query = query
          .gte('month', `${year}-01-01`)
          .lte('month', `${year}-12-01`)
      }

      const { data, error } = await query.order('month', { ascending: true })
      if (!error && data) {
        return data.map((g: any) => ({
          id: g.id,
          representative_id: g.representative_id,
          company_id: g.company_id,
          month: g.month,
          sales_goal: g.sales_goal != null ? Number(g.sales_goal) : null,
          visits_goal: g.visits_goal != null ? Number(g.visits_goal) : null,
          created_at: g.created_at,
          updated_at: g.updated_at,
        }))
      }
    } catch (err) {
      console.warn('Error fetching goals:', err)
    }
  }

  try {
    const raw = localStorage.getItem(`v2_rep_goals_${representativeId}`)
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

export async function saveRepresentativeGoals(
  representativeId: string,
  goals: { month: string; sales_goal: number | null; visits_goal: number | null }[],
  companyId?: string | null
): Promise<void> {
  const compId = companyId || '10000000-0000-4000-8000-000000000001'

  if (supabase) {
    try {
      const records = goals.map((g) => ({
        company_id: compId,
        representative_id: representativeId,
        month: g.month,
        sales_goal: g.sales_goal != null ? Number(g.sales_goal) : null,
        visits_goal: g.visits_goal != null ? Number(g.visits_goal) : null,
        updated_at: new Date().toISOString(),
      }))

      const { error } = await supabase
        .from('bem_aviv_representative_goals')
        .upsert(records, { onConflict: 'representative_id,month' })

      if (error) {
        console.warn('Error upserting goals in Supabase:', error)
      }
    } catch (err) {
      console.warn('Error saving goals in Supabase:', err)
    }
  }

  try {
    localStorage.setItem(`v2_rep_goals_${representativeId}`, JSON.stringify(goals))
  } catch {}
}

// ─── FORMAS DE PAGAMENTO ─────────────────────────────────────────────────────

export async function listFormasPagamento(): Promise<FormaPagamento[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase.from('payment_methods').select('*').order('name')
      if (!error && data && data.length > 0) {
        return data as FormaPagamento[]
      }
    } catch {}
  }

  try {
    const raw = localStorage.getItem(KEY_PAYMENT_METHODS)
    if (raw) return JSON.parse(raw)
  } catch {}

  localStorage.setItem(KEY_PAYMENT_METHODS, JSON.stringify(INITIAL_FORMAS_PAGAMENTO))
  return INITIAL_FORMAS_PAGAMENTO
}

export async function saveFormaPagamento(item: Omit<FormaPagamento, 'id' | 'created_at'> & { id?: string }): Promise<FormaPagamento> {
  const current = await listFormasPagamento()
  const isEdit = Boolean(item.id)
  const id = item.id || 'pay-' + Date.now()
  const fullItem: FormaPagamento = {
    ...item,
    id,
    created_at: item.id ? (current.find(c => c.id === item.id)?.created_at || new Date().toISOString()) : new Date().toISOString(),
  }

  if (supabase) {
    try {
      await supabase.from('payment_methods').upsert({
        id: fullItem.id,
        name: fullItem.name,
        category: fullItem.category,
        max_installments: fullItem.max_installments,
        fee_percentage: fullItem.fee_percentage,
        installment_rates: fullItem.installment_rates || null,
        days_to_receive: fullItem.days_to_receive,
        active: fullItem.active,
        updated_at: new Date().toISOString()
      })
    } catch (err) {
      console.warn('Supabase payment_methods upsert fallback:', err)
    }
  }

  let updatedList: FormaPagamento[]
  if (isEdit) {
    updatedList = current.map(p => p.id === id ? fullItem : p)
  } else {
    updatedList = [fullItem, ...current]
  }
  localStorage.setItem(KEY_PAYMENT_METHODS, JSON.stringify(updatedList))
  return fullItem
}

export async function deleteFormaPagamento(id: string): Promise<void> {
  if (supabase) {
    try {
      await supabase.from('payment_methods').delete().eq('id', id)
    } catch (err) {
      console.warn('Supabase payment_methods delete error:', err)
    }
  }
  const current = await listFormasPagamento()
  const filtered = current.filter(p => p.id !== id)
  localStorage.setItem(KEY_PAYMENT_METHODS, JSON.stringify(filtered))
}
