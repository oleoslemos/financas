import { supabase } from '../../lib/supabaseClient'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ClientStatus =
  | 'PROSPECÇÃO'
  | 'CLIENTE - COLCHÃO'
  | 'CLIENTE - DIVERSOS'
  | 'CLIENTE - COLCHÃO/DIVERSOS'

export type CommercialStage =
  | 'CONTATO'
  | 'VISITA AGENDADA'
  | 'VISITA REALIZADA'
  | 'FECHADO PLATAFORMA CONFORTO'
  | 'FECHADO DEMAIS PRODUTOS'

export interface BemAvivClient {
  id: string
  company_id: string | null
  full_name: string
  cpf: string
  birth_date: string | null
  phone_1: string | null
  phone_2: string | null
  email: string | null
  // address
  cep: string | null
  address_street: string | null
  address_number: string | null
  address_complement: string | null
  address_district: string | null
  address_city: string | null
  address_state: string | null
  // status
  client_status: ClientStatus
  commercial_stage: CommercialStage | null
  // follow-up
  last_contact_at: string | null
  next_followup_at: string | null
  next_followup_note: string | null
  next_followup_status: string | null
  // eko7
  eko7_presentation_at: string | null
  // misc
  group_reference: string | null
  created_at: string
}

export type BemAvivClientInput = Omit<BemAvivClient, 'id' | 'created_at' | 'client_status'>

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatPhone(raw: string | null | undefined): string {
  if (!raw) return ''
  const d = raw.replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return raw
}

export function formatClientPhone(client: BemAvivClient): string {
  return formatPhone(client.phone_1) || formatPhone(client.phone_2) || '—'
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

const FIELDS = [
  'id',
  'company_id',
  'full_name',
  'cpf',
  'birth_date',
  'phone_1',
  'phone_2',
  'email',
  'cep',
  'address_street',
  'address_number',
  'address_complement',
  'address_district',
  'address_city',
  'address_state',
  'client_status',
  'commercial_stage',
  'last_contact_at',
  'next_followup_at',
  'next_followup_note',
  'next_followup_status',
  'eko7_presentation_at',
  'group_reference',
  'created_at',
].join(', ')

export async function fetchClients(companyId: string | null): Promise<{
  data: BemAvivClient[]
  error: string | null
}> {
  if (!supabase) return { data: [], error: 'Supabase não configurado.' }

  let query = supabase.from('bem_aviv_clients').select(FIELDS).order('full_name', { ascending: true })

  if (companyId) {
    query = query.eq('company_id', companyId)
  }

  const { data, error } = await query

  if (error) {
    console.error('fetchClients error:', error)
    return { data: [], error: error.message }
  }

  return { data: (data as unknown as BemAvivClient[]) ?? [], error: null }
}

export async function fetchClient(id: string): Promise<{
  data: BemAvivClient | null
  error: string | null
}> {
  if (!supabase) return { data: null, error: 'Supabase não configurado.' }

  const { data, error } = await supabase
    .from('bem_aviv_clients')
    .select(FIELDS)
    .eq('id', id)
    .maybeSingle()

  if (error) return { data: null, error: error.message }
  return { data: (data as unknown as BemAvivClient | null), error: null }
}

export async function createClient(
  input: BemAvivClientInput,
): Promise<{ data: BemAvivClient | null; error: string | null }> {
  if (!supabase) return { data: null, error: 'Supabase não configurado.' }

  const { data, error } = await supabase
    .from('bem_aviv_clients')
    .insert(input)
    .select(FIELDS)
    .maybeSingle()

  if (error) {
    console.error('createClient error:', error)
    return { data: null, error: error.message }
  }

  return { data: (data as unknown as BemAvivClient | null), error: null }
}

export async function updateClient(
  id: string,
  changes: Partial<BemAvivClientInput>,
): Promise<{ data: BemAvivClient | null; error: string | null }> {
  if (!supabase) return { data: null, error: 'Supabase não configurado.' }

  const { data, error } = await supabase
    .from('bem_aviv_clients')
    .update(changes)
    .eq('id', id)
    .select(FIELDS)
    .maybeSingle()

  if (error) {
    console.error('updateClient error:', error)
    return { data: null, error: error.message }
  }

  return { data: (data as unknown as BemAvivClient | null), error: null }
}

export async function deleteClient(id: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase não configurado.' }

  const { error } = await supabase.from('bem_aviv_clients').delete().eq('id', id)

  if (error) {
    console.error('deleteClient error:', error)
    return { error: error.message }
  }

  return { error: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface ClientesKpi {
  total: number
  prospects: number
  clientesAtivos: number
  clientesColchao: number
  clientesDiversos: number
  clientesMix: number
  comColchao: number
  comEko7: number
}

export function computeKpi(clients: BemAvivClient[]): ClientesKpi {
  const total = clients.length
  const prospects = clients.filter((c) => c.client_status === 'PROSPECÇÃO').length
  const clientesColchao = clients.filter((c) => c.client_status === 'CLIENTE - COLCHÃO').length
  const clientesDiversos = clients.filter((c) => c.client_status === 'CLIENTE - DIVERSOS').length
  const clientesMix = clients.filter((c) => c.client_status === 'CLIENTE - COLCHÃO/DIVERSOS').length
  const clientesAtivos = clientesColchao + clientesDiversos + clientesMix
  const comColchao = clientesColchao + clientesMix
  const comEko7 = clients.filter((c) => !!c.eko7_presentation_at).length

  return { total, prospects, clientesAtivos, clientesColchao, clientesDiversos, clientesMix, comColchao, comEko7 }
}

// ─────────────────────────────────────────────────────────────────────────────
// Relatives & Orders helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface Familiar {
  id: string
  client_id: string
  company_id?: string | null
  name: string
  relationship: string
  birth_date: string | null
  phone: string | null
  cpf?: string | null
}

export interface ClientOrderRow {
  id: string
  order_date: string
  document_type: 'ORCAMENTO' | 'PEDIDO'
  document_number: string | null
  status: string
  total_amount: number
}

export async function fetchRelatives(clientId: string, companyId?: string | null): Promise<Familiar[]> {
  if (!supabase) return []
  let query = supabase
    .from('bem_aviv_client_relatives')
    .select('id, client_id, name, relationship, birth_date, phone, cpf')
    .eq('client_id', clientId)
  if (companyId) query = query.eq('company_id', companyId)
  const { data } = await query.order('name', { ascending: true })
  return (data as unknown as Familiar[]) ?? []
}

export async function createRelative(input: Omit<Familiar, 'id'>): Promise<{ data: Familiar | null; error: string | null }> {
  if (!supabase) return { data: null, error: 'Supabase não configurado.' }
  const { data, error } = await supabase.from('bem_aviv_client_relatives').insert(input).select().maybeSingle()
  if (error) return { data: null, error: error.message }
  return { data: data as unknown as Familiar, error: null }
}

export async function updateRelative(
  id: string,
  changes: Partial<Omit<Familiar, 'id' | 'client_id'>>,
): Promise<{ data: Familiar | null; error: string | null }> {
  if (!supabase) return { data: null, error: 'Supabase não configurado.' }
  const { data, error } = await supabase
    .from('bem_aviv_client_relatives')
    .update(changes)
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) return { data: null, error: error.message }
  return { data: data as unknown as Familiar, error: null }
}

export async function deleteRelative(id: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase não configurado.' }
  const { error } = await supabase.from('bem_aviv_client_relatives').delete().eq('id', id)
  if (error) return { error: error.message }
  return { error: null }
}

export async function fetchClientOrders(clientId: string, companyId?: string | null): Promise<ClientOrderRow[]> {
  if (!supabase) return []
  let query = supabase
    .from('bem_aviv_sales_orders')
    .select('id, order_date, document_type, document_number, status, total_amount')
    .eq('client_id', clientId)
  if (companyId) query = query.eq('company_id', companyId)
  const { data } = await query.order('order_date', { ascending: false })
  return (data as unknown as ClientOrderRow[]) ?? []
}
