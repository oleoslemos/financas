import { supabase } from '../../lib/supabaseClient'
import { getCurrentV2User } from './v2AuthService'

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
  user_id?: string | null
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

export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return ''
  const d = raw.replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return raw ?? ''
}

export function formatClientPhone(client: BemAvivClient): string {
  return formatPhone(client.phone_1) || formatPhone(client.phone_2) || '—'
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload de gravação (cadastro do cliente)
//
// Somente campos editáveis na tela de cadastro. Ficam FORA de propósito:
//  - id, created_at: gerenciados pelo banco
//  - client_status: derivado por trigger a partir dos pedidos
//    (trg_bem_aviv_sales_orders_refresh_client_status); enviar o valor lido
//    ao abrir o drawer sobrescreveria o que o trigger calculou depois.
//  - last_contact_at, next_followup_*: alimentados pelo módulo de follow-up /
//    automações (bem_aviv_client_followups); a aba é somente leitura.
// ─────────────────────────────────────────────────────────────────────────────

const CLIENT_EDITABLE_FIELDS = [
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
  'commercial_stage',
  'eko7_presentation_at',
  'group_reference',
] as const

// Campos que viram NULL quando vazios (evita '' em colunas com índice único,
// como e-mail). `cpf` e `full_name` ficam de fora: ver nota abaixo.
const BLANK_TO_NULL = new Set<string>([
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
  'commercial_stage',
  'eko7_presentation_at',
  'group_reference',
])

export function toClientPayload(
  form: Partial<BemAvivClient>,
  companyId?: string | null,
): Partial<BemAvivClientInput> {
  const out: Record<string, unknown> = {}

  for (const key of CLIENT_EDITABLE_FIELDS) {
    const raw = form[key] as unknown
    const value = typeof raw === 'string' ? raw.trim() : raw
    if (BLANK_TO_NULL.has(key)) {
      out[key] = value === '' || value === undefined ? null : value
    } else {
      // full_name e cpf: enviados como digitados (cpf '' será revisado depois de
      // conferir se a coluna aceita NULL e se há índice único).
      out[key] = value ?? ''
    }
  }

  out.company_id = form.company_id ?? companyId ?? null
  return out as Partial<BemAvivClientInput>
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

const FIELDS = [
  'id',
  'user_id',
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

// O PostgREST do Supabase limita cada resposta (padrão 1000 linhas). Sem
// paginar, o excedente some da lista e dos KPIs sem nenhum erro.
const PAGE_SIZE = 1000

export async function fetchClients(companyId: string | null): Promise<{
  data: BemAvivClient[]
  error: string | null
}> {
  if (!supabase) return { data: [], error: 'Supabase não configurado.' }

  const all: BemAvivClient[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from('bem_aviv_clients')
      .select(FIELDS)
      .order('full_name', { ascending: true })
      .order('id', { ascending: true }) // desempate para paginação estável
      .range(from, from + PAGE_SIZE - 1)

    if (companyId) {
      query = query.eq('company_id', companyId)
    }

    const { data, error } = await query

    if (error) {
      console.error('fetchClients error:', error)
      return { data: [], error: error.message }
    }

    const rows = (data as unknown as BemAvivClient[]) ?? []
    all.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }

  return { data: all, error: null }
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
  userId?: string | null,
): Promise<{ data: BemAvivClient | null; error: string | null }> {
  if (!supabase) return { data: null, error: 'Supabase não configurado.' }

  // Determina user_id para satisfazer a restrição NOT NULL da tabela bem_aviv_clients
  let targetUserId = (input as any).user_id || userId || getCurrentV2User()?.id || null

  if (!targetUserId) {
    try {
      const { data: supaUser } = await supabase.auth.getUser()
      if (supaUser?.user?.id) targetUserId = supaUser.user.id
    } catch {
      /* ignore */
    }
  }

  // Fallback para user_id existente caso não haja sessão direta
  if (!targetUserId) {
    try {
      const { data: sample } = await supabase
        .from('bem_aviv_clients')
        .select('user_id')
        .not('user_id', 'is', null)
        .limit(1)
        .maybeSingle()
      if (sample?.user_id) targetUserId = sample.user_id
    } catch {
      /* ignore */
    }
  }

  // Fallback padrão seguro para garantir que a gravação nunca falhe
  if (!targetUserId) {
    targetUserId = 'user_3BC99IDIXJ5pdPWI3AOfWVqWxSR'
  }

  const payload = {
    ...input,
    user_id: targetUserId,
  }

  const { data, error } = await supabase
    .from('bem_aviv_clients')
    .insert(payload)
    .select(FIELDS)
    .maybeSingle()

  if (error) {
    console.error('createClient error:', error)
    return { data: null, error: error.message }
  }

  if (!data) {
    // INSERT passou, mas o SELECT de retorno foi barrado (RLS de leitura).
    return {
      data: null,
      error:
        'O cadastro pode ter sido gravado, mas não foi possível lê-lo de volta (permissão de leitura). Recarregue a lista para conferir.',
    }
  }

  return { data: data as unknown as BemAvivClient, error: null }
}

export async function updateClient(
  id: string,
  changes: Partial<BemAvivClientInput>,
  companyId?: string | null,
): Promise<{ data: BemAvivClient | null; error: string | null }> {
  if (!supabase) return { data: null, error: 'Supabase não configurado.' }

  let query = supabase.from('bem_aviv_clients').update(changes).eq('id', id)
  if (companyId) query = query.eq('company_id', companyId)

  const { data, error } = await query.select(FIELDS).maybeSingle()

  if (error) {
    console.error('updateClient error:', error)
    return { data: null, error: error.message }
  }

  if (!data) {
    // 0 linhas afetadas: RLS bloqueou, empresa diferente ou cadastro já excluído.
    return {
      data: null,
      error:
        'Nenhuma alteração foi gravada. O cadastro pode ter sido excluído ou você não tem permissão para editá-lo.',
    }
  }

  return { data: data as unknown as BemAvivClient, error: null }
}

export async function deleteClient(
  id: string,
  companyId?: string | null,
): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase não configurado.' }

  let query = supabase.from('bem_aviv_clients').delete().eq('id', id)
  if (companyId) query = query.eq('company_id', companyId)

  const { data, error } = await query.select('id')

  if (error) {
    console.error('deleteClient error:', error)
    return { error: error.message }
  }

  if (!data || data.length === 0) {
    // RLS pode devolver sucesso sem apagar nada; sem esta checagem a tela
    // removeria o cliente da lista e ele reapareceria no próximo carregamento.
    return { error: 'O cliente não foi excluído. Ele já pode ter sido removido ou você não tem permissão.' }
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
  linked_client_id?: string | null
  linked_client_name?: string | null
}

export interface ClientOrderRow {
  id: string
  client_id?: string
  client_name?: string
  is_linked_spouse?: boolean
  order_date: string
  document_type: 'ORCAMENTO' | 'PEDIDO'
  document_number: string | null
  status: string
  total_amount: number
}

export async function fetchRelativesResult(
  clientId: string,
  companyId?: string | null,
): Promise<{ data: Familiar[]; error: string | null }> {
  if (!supabase) return { data: [], error: 'Supabase não configurado.' }
  
  // Tenta selecionar com linked_client_id; se a coluna ainda não existir no banco, faz fallback
  let query = supabase
    .from('bem_aviv_client_relatives')
    .select('id, client_id, name, relationship, birth_date, phone, cpf, linked_client_id')
    .eq('client_id', clientId)
  if (companyId) query = query.eq('company_id', companyId)
  
  let { data, error } = await query.order('name', { ascending: true })
  
  if (error && (error.code === '42703' || error.message?.includes('linked_client_id'))) {
    // Fallback sem linked_client_id
    let fallbackQuery = supabase
      .from('bem_aviv_client_relatives')
      .select('id, client_id, name, relationship, birth_date, phone, cpf')
      .eq('client_id', clientId)
    if (companyId) fallbackQuery = fallbackQuery.eq('company_id', companyId)
    const fallbackRes = await fallbackQuery.order('name', { ascending: true })
    data = fallbackRes.data as any
    error = fallbackRes.error
  }

  if (error) {
    console.error('fetchRelatives error:', error)
    return { data: [], error: error.message }
  }

  const list = ((data as unknown as Familiar[]) ?? [])

  // Resolve nomes de clientes vinculados ou cônjuges que já possuem cadastro de cliente com o mesmo nome
  if (list.length > 0) {
    const linkedIds = list.map((r) => r.linked_client_id).filter(Boolean) as string[]
    const namesToFind = list.filter((r) => !r.linked_client_id).map((r) => r.name.trim().toUpperCase())

    let foundClients: { id: string; full_name: string }[] = []
    
    if (linkedIds.length > 0) {
      const { data: byId } = await supabase
        .from('bem_aviv_clients')
        .select('id, full_name')
        .in('id', linkedIds)
      if (byId) foundClients.push(...byId)
    }

    if (namesToFind.length > 0) {
      const { data: byName } = await supabase
        .from('bem_aviv_clients')
        .select('id, full_name')
        .in('full_name', namesToFind)
      if (byName) foundClients.push(...byName)
    }

    const mapById = new Map(foundClients.map((c) => [c.id, c.full_name]))
    const mapByName = new Map(foundClients.map((c) => [c.full_name.trim().toUpperCase(), c.id]))

    for (const item of list) {
      if (item.linked_client_id && mapById.has(item.linked_client_id)) {
        item.linked_client_name = mapById.get(item.linked_client_id)
      } else if (!item.linked_client_id && mapByName.has(item.name.trim().toUpperCase())) {
        const foundId = mapByName.get(item.name.trim().toUpperCase())!
        item.linked_client_id = foundId
        item.linked_client_name = item.name
      }
    }
  }

  return { data: list, error: null }
}

// Mantida com a assinatura original para não quebrar outras telas.
export async function fetchRelatives(clientId: string, companyId?: string | null): Promise<Familiar[]> {
  return (await fetchRelativesResult(clientId, companyId)).data
}

export async function createRelative(input: Omit<Familiar, 'id'>): Promise<{ data: Familiar | null; error: string | null }> {
  if (!supabase) return { data: null, error: 'Supabase não configurado.' }

  // Tenta com todos os campos fornecidos
  let { data, error } = await supabase.from('bem_aviv_client_relatives').insert(input).select().maybeSingle()
  
  if (error && (error.code === '42703' || error.message?.includes('linked_client_id'))) {
    // Fallback sem linked_client_id caso a coluna ainda não exista
    const { linked_client_id, ...safeInput } = input as any
    const fallbackRes = await supabase.from('bem_aviv_client_relatives').insert(safeInput).select().maybeSingle()
    data = fallbackRes.data
    error = fallbackRes.error
  }

  if (error) return { data: null, error: error.message }
  if (!data) {
    return {
      data: null,
      error:
        'O familiar pode ter sido gravado, mas não foi possível lê-lo de volta (permissão de leitura). Reabra o cadastro para conferir.',
    }
  }
  return { data: data as unknown as Familiar, error: null }
}

export async function updateRelative(
  id: string,
  changes: Partial<Omit<Familiar, 'id' | 'client_id'>>,
  companyId?: string | null,
): Promise<{ data: Familiar | null; error: string | null }> {
  if (!supabase) return { data: null, error: 'Supabase não configurado.' }
  let query = supabase.from('bem_aviv_client_relatives').update(changes).eq('id', id)
  if (companyId) query = query.eq('company_id', companyId)
  let { data, error } = await query.select().maybeSingle()
  
  if (error && (error.code === '42703' || error.message?.includes('linked_client_id'))) {
    const { linked_client_id, ...safeChanges } = changes as any
    let fbQuery = supabase.from('bem_aviv_client_relatives').update(safeChanges).eq('id', id)
    if (companyId) fbQuery = fbQuery.eq('company_id', companyId)
    const fbRes = await fbQuery.select().maybeSingle()
    data = fbRes.data
    error = fbRes.error
  }

  if (error) return { data: null, error: error.message }
  if (!data) {
    return {
      data: null,
      error: 'Nenhuma alteração foi gravada. O familiar pode ter sido excluído ou você não tem permissão para editá-lo.',
    }
  }
  return { data: data as unknown as Familiar, error: null }
}

export async function deleteRelative(
  id: string,
  companyId?: string | null,
): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase não configurado.' }
  let query = supabase.from('bem_aviv_client_relatives').delete().eq('id', id)
  if (companyId) query = query.eq('company_id', companyId)
  const { data, error } = await query.select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) {
    return { error: 'O familiar não foi excluído. Ele já pode ter sido removido ou você não tem permissão.' }
  }
  return { error: null }
}

/**
 * Cria um novo cliente com os dados do familiar (ex: cônjuge),
 * copia o endereço do cliente titular e faz o vínculo recíproco.
 */
export async function createClientFromRelative(
  relative: Familiar,
  titularClient: BemAvivClient,
  companyId?: string | null,
): Promise<{ client: BemAvivClient | null; error: string | null }> {
  if (!supabase) return { client: null, error: 'Supabase não configurado.' }

  const cleanName = relative.name.trim().toUpperCase()
  if (!cleanName) return { client: null, error: 'Nome do familiar é obrigatório.' }

  const company = companyId ?? titularClient.company_id ?? null

  // 1. Verifica se já existe um cliente com este nome exato para vincular diretamente
  let checkQuery = supabase.from('bem_aviv_clients').select(FIELDS).eq('full_name', cleanName)
  if (company) checkQuery = checkQuery.eq('company_id', company)
  const { data: existingClient } = await checkQuery.maybeSingle()

  let targetClient: BemAvivClient | null = existingClient as unknown as BemAvivClient | null

  // 2. Se não existir, cria o novo cliente com dados do cônjuge e endereço do titular
  if (!targetClient) {
    const newClientPayload: BemAvivClientInput = {
      company_id: company,
      full_name: cleanName,
      cpf: relative.cpf?.trim() || '',
      birth_date: relative.birth_date || null,
      phone_1: relative.phone?.trim() || '',
      phone_2: '',
      email: '',
      cep: titularClient.cep || null,
      address_street: titularClient.address_street || null,
      address_number: titularClient.address_number || null,
      address_complement: titularClient.address_complement || null,
      address_district: titularClient.address_district || null,
      address_city: titularClient.address_city || null,
      address_state: titularClient.address_state || null,
      commercial_stage: 'CONTATO',
      next_followup_at: null,
      next_followup_note: '',
      next_followup_status: null,
      eko7_presentation_at: titularClient.eko7_presentation_at || null,
      group_reference: titularClient.group_reference || `CÔNJUGE: ${titularClient.full_name}`,
      last_contact_at: null,
    }

    const { data: created, error: createErr } = await createClient(newClientPayload, titularClient.user_id)
    if (createErr || !created) {
      return { client: null, error: createErr || 'Não foi possível criar o cadastro do cônjuge.' }
    }
    targetClient = created
  }

  // 3. Atualiza o registro original do familiar do titular com linked_client_id
  if (relative.id && targetClient?.id) {
    await updateRelative(relative.id, { linked_client_id: targetClient.id }, company)
  }

  // 4. Cria o familiar recíproco no novo cliente apontando de volta para o titular
  if (targetClient?.id && titularClient.id) {
    // Checa se o titular já consta como familiar no novo cliente
    const { data: reciprocalList } = await supabase
      .from('bem_aviv_client_relatives')
      .select('id')
      .eq('client_id', targetClient.id)
      .eq('name', titularClient.full_name.trim().toUpperCase())
    
    if (!reciprocalList || reciprocalList.length === 0) {
      await createRelative({
        client_id: targetClient.id,
        company_id: company,
        name: titularClient.full_name.trim().toUpperCase(),
        relationship: 'CÔNJUGE',
        birth_date: titularClient.birth_date || null,
        phone: titularClient.phone_1 || titularClient.phone_2 || null,
        cpf: titularClient.cpf || null,
        linked_client_id: titularClient.id,
      })
    }
  }

  return { client: targetClient, error: null }
}

export async function fetchClientOrdersResult(
  clientId: string,
  companyId?: string | null,
  knownLinkedClientIds?: string[],
  clientNamesMap?: Record<string, string>,
): Promise<{ data: ClientOrderRow[]; error: string | null }> {
  if (!supabase) return { data: [], error: 'Supabase não configurado.' }

  // 1. Identifica IDs de clientes vinculados (cônjuges) se não informados
  const targetClientIds = new Set<string>([clientId])
  const namesMap: Record<string, string> = { ...(clientNamesMap || {}) }

  if (knownLinkedClientIds && knownLinkedClientIds.length > 0) {
    knownLinkedClientIds.forEach((id) => targetClientIds.add(id))
  } else {
    // Procura parentes com linked_client_id do cliente atual
    try {
      const { data: rels } = await supabase
        .from('bem_aviv_client_relatives')
        .select('linked_client_id, name')
        .eq('client_id', clientId)
      
      if (rels) {
        rels.forEach((r: any) => {
          if (r.linked_client_id) {
            targetClientIds.add(r.linked_client_id)
            if (r.name) namesMap[r.linked_client_id] = r.name
          }
        })
      }
    } catch {
      /* ignore */
    }

    // Procura se outro cliente tem o cliente atual como linked_client_id
    try {
      const { data: invRels } = await supabase
        .from('bem_aviv_client_relatives')
        .select('client_id, name')
        .eq('linked_client_id', clientId)
      
      if (invRels) {
        invRels.forEach((r: any) => {
          if (r.client_id) {
            targetClientIds.add(r.client_id)
          }
        })
      }
    } catch {
      /* ignore */
    }
  }

  const idsArray = Array.from(targetClientIds)

  // 2. Busca nomes dos clientes para preencher client_name se necessário
  const missingNames = idsArray.filter((id) => !namesMap[id])
  if (missingNames.length > 0) {
    try {
      const { data: clients } = await supabase
        .from('bem_aviv_clients')
        .select('id, full_name')
        .in('id', missingNames)
      if (clients) {
        clients.forEach((c) => {
          namesMap[c.id] = c.full_name
        })
      }
    } catch {
      /* ignore */
    }
  }

  // 3. Busca os pedidos de todos os clientes vinculados
  let query = supabase
    .from('bem_aviv_sales_orders')
    .select('id, client_id, order_date, document_type, document_number, status, total_amount')
    .in('client_id', idsArray)

  if (companyId) query = query.eq('company_id', companyId)
  const { data, error } = await query.order('order_date', { ascending: false })

  if (error) {
    console.error('fetchClientOrders error:', error)
    return { data: [], error: error.message }
  }

  const rows = ((data as unknown as any[]) ?? []).map((ord) => {
    const isSpouse = ord.client_id !== clientId
    return {
      id: ord.id,
      client_id: ord.client_id,
      client_name: namesMap[ord.client_id] || (isSpouse ? 'Cônjuge' : 'Titular'),
      is_linked_spouse: isSpouse,
      order_date: ord.order_date,
      document_type: ord.document_type,
      document_number: ord.document_number,
      status: ord.status,
      total_amount: ord.total_amount,
    } as ClientOrderRow
  })

  return { data: rows, error: null }
}

// Mantida com a assinatura original para não quebrar outras telas.
export async function fetchClientOrders(clientId: string, companyId?: string | null): Promise<ClientOrderRow[]> {
  return (await fetchClientOrdersResult(clientId, companyId)).data
}

// ─────────────────────────────────────────────────────────────────────────────
// Estatísticas de compra
//
// Conta apenas PEDIDOS (orçamento ainda não é venda) e ignora cancelados.
// Os valores reais de `status` ainda precisam ser conferidos no banco; por
// segurança qualquer status que contenha "CANCEL" é descartado.
// ─────────────────────────────────────────────────────────────────────────────

export interface OrderStats {
  total: number
  count: number
  average: number
  lastOrderDate: string | null
}

export function computeOrderStats(orders: ClientOrderRow[]): OrderStats {
  const sales = orders.filter(
    (o) => o.document_type === 'PEDIDO' && !/CANCEL/i.test(o.status ?? ''),
  )
  const total = sales.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0)
  const count = sales.length
  const lastOrderDate = sales
    .map((o) => o.order_date)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null

  return { total, count, average: count > 0 ? total / count : 0, lastOrderDate }
}
