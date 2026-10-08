import { supabase } from '../../lib/supabaseClient'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type CrmTipoContato = 'ligacao' | 'whatsapp' | 'email' | 'visita' | 'reuniao' | 'outro'
export type CrmDirecao = 'recebido' | 'realizado'
export type CrmTipoAgenda = 'evento' | 'tarefa'
export type CrmOrigem = 'sistema' | 'google'
export type CrmSyncStatus = 'pendente' | 'sincronizado' | 'erro'

export interface CrmContato {
  id: string
  legacy_id: string | null
  company_id: string | null
  cliente_id: string
  tipo: CrmTipoContato
  direcao: CrmDirecao
  assunto: string
  descricao: string | null
  resultado: string | null
  ocorrido_em: string
  responsavel_id: string | null
  proximo_contato_em: string | null
  criado_em: string
  criado_por: string | null
  atualizado_em: string
  cancelado_em: string | null
  // join
  cliente_nome?: string
  cliente_phone_1?: string | null
  cliente_phone_2?: string | null
}

export interface CrmContatoInput {
  cliente_id: string
  tipo: CrmTipoContato
  direcao: CrmDirecao
  assunto: string
  descricao?: string | null
  resultado?: string | null
  ocorrido_em: string
  proximo_contato_em?: string | null
  company_id?: string | null
}

export interface CrmAgendaItem {
  id: string
  company_id: string | null
  tipo: CrmTipoAgenda
  titulo: string
  descricao: string | null
  inicio: string
  fim: string | null
  dia_inteiro: boolean
  concluido_em: string | null
  cliente_id: string | null
  contato_id: string | null
  origem: CrmOrigem
  google_id: string | null
  google_etag: string | null
  google_atualizado_em: string | null
  sync_status: CrmSyncStatus
  sync_erro: string | null
  criado_em: string
  criado_por: string | null
  atualizado_em: string
  cancelado_em: string | null
  // join
  cliente_nome?: string | null
}

export interface CrmAgendaItemInput {
  tipo: CrmTipoAgenda
  titulo: string
  descricao?: string | null
  inicio: string
  fim?: string | null
  dia_inteiro?: boolean
  cliente_id?: string | null
  contato_id?: string | null
  company_id?: string | null
}

export interface ClienteResumido {
  id: string
  full_name: string
  phone_1: string | null
  phone_2: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gera link wa.me para o telefone informado.
 * Regras:
 *  - limpa não-dígitos
 *  - 13 dígitos começando com 55 → usa como está (DDI+DDD+9+número)
 *  - 11 dígitos (DDD+9+número) → prefixa com 55
 *  - 12 dígitos começando com 55 (sem 9ᵒ dígito) → usa como está
 *  - outros comprimentos → usa como está (melhor esforço)
 *  - sem telefone → retorna null
 */
export function formatarWaMe(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null

  let number = digits
  if (digits.length === 11) {
    // DDD + 9 + 8 dígitos → adiciona DDI Brasil
    number = `55${digits}`
  } else if (digits.length === 13 && digits.startsWith('55')) {
    number = digits
  } else if (digits.length === 12 && digits.startsWith('55')) {
    number = digits
  }
  // demais: usa como está

  return `https://wa.me/${number}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Contatos
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchContatos(
  filtros?: { cliente_id?: string; somente_ativos?: boolean },
): Promise<CrmContato[]> {
  let query = supabase
    .from('crm_contato_v2')
    .select(
      `id, legacy_id, company_id, cliente_id, tipo, direcao, assunto, descricao,
       resultado, ocorrido_em, responsavel_id, proximo_contato_em,
       criado_em, criado_por, atualizado_em, cancelado_em,
       bem_aviv_clients!crm_contato_v2_cliente_id_fkey(full_name, phone_1, phone_2)`,
    )
    .order('ocorrido_em', { ascending: false })

  if (filtros?.cliente_id) {
    query = query.eq('cliente_id', filtros.cliente_id)
  }
  if (filtros?.somente_ativos !== false) {
    query = query.is('cancelado_em', null)
  }

  const { data, error } = await query

  if (error) {
    throw `Erro ao buscar contatos: ${error.message}`
  }

  type RawRow = Omit<CrmContato, 'cliente_nome' | 'cliente_phone_1' | 'cliente_phone_2'> & {
    bem_aviv_clients: { full_name: string; phone_1: string | null; phone_2: string | null } | null
  }

  return ((data as unknown as RawRow[]) ?? []).map((row) => ({
    ...row,
    bem_aviv_clients: undefined,
    cliente_nome: row.bem_aviv_clients?.full_name ?? undefined,
    cliente_phone_1: row.bem_aviv_clients?.phone_1 ?? null,
    cliente_phone_2: row.bem_aviv_clients?.phone_2 ?? null,
  }))
}

export async function fetchContatosByCliente(clienteId: string): Promise<CrmContato[]> {
  return fetchContatos({ cliente_id: clienteId, somente_ativos: false })
}

export async function criarContato(
  input: CrmContatoInput,
  userId: string,
): Promise<CrmContato> {
  const payload = {
    cliente_id: input.cliente_id,
    tipo: input.tipo,
    direcao: input.direcao,
    assunto: input.assunto.trim(),
    descricao: input.descricao?.trim() || null,
    resultado: input.resultado?.trim() || null,
    ocorrido_em: input.ocorrido_em,
    proximo_contato_em: input.proximo_contato_em || null,
    company_id: input.company_id ?? null,
    criado_por: userId,
  }

  const { data, error } = await supabase
    .from('crm_contato_v2')
    .insert(payload)
    .select(
      `id, legacy_id, company_id, cliente_id, tipo, direcao, assunto, descricao,
       resultado, ocorrido_em, responsavel_id, proximo_contato_em,
       criado_em, criado_por, atualizado_em, cancelado_em`,
    )
    .maybeSingle()

  if (error) throw `Erro ao criar contato: ${error.message}`
  if (!data) throw 'Contato pode ter sido gravado, mas não foi possível lê-lo de volta.'

  const contato = data as unknown as CrmContato

  // Se informou próximo contato, cria item de agenda vinculado
  if (input.proximo_contato_em) {
    const agendaPayload: Record<string, unknown> = {
      tipo: 'tarefa',
      titulo: `Follow-up: ${input.assunto.slice(0, 80)}`,
      inicio: input.proximo_contato_em,
      cliente_id: input.cliente_id,
      contato_id: contato.id,
      origem: 'sistema',
      company_id: input.company_id ?? null,
      criado_por: userId,
    }
    const { error: agErr } = await supabase.from('crm_agenda_item').insert(agendaPayload)
    if (agErr) {
      console.warn('Contato criado, mas falha ao criar item de agenda:', agErr.message)
    }
  }

  return contato
}

export async function cancelarContato(id: string): Promise<void> {
  const { error } = await supabase
    .from('crm_contato_v2')
    .update({ cancelado_em: new Date().toISOString() })
    .eq('id', id)

  if (error) throw `Erro ao cancelar contato: ${error.message}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Agenda
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchAgendaItems(de: string, ate: string): Promise<CrmAgendaItem[]> {
  const { data, error } = await supabase
    .from('crm_agenda_item')
    .select(
      `id, company_id, tipo, titulo, descricao, inicio, fim, dia_inteiro,
       concluido_em, cliente_id, contato_id, origem, google_id, google_etag,
       google_atualizado_em, sync_status, sync_erro, criado_em, criado_por,
       atualizado_em, cancelado_em,
       bem_aviv_clients!crm_agenda_item_cliente_id_fkey(full_name)`,
    )
    .is('cancelado_em', null)
    .gte('inicio', de)
    .lte('inicio', ate)
    .order('inicio', { ascending: true })

  if (error) throw `Erro ao buscar agenda: ${error.message}`

  type RawAgenda = Omit<CrmAgendaItem, 'cliente_nome'> & {
    bem_aviv_clients: { full_name: string } | null
  }

  return ((data as unknown as RawAgenda[]) ?? []).map((row) => ({
    ...row,
    bem_aviv_clients: undefined,
    cliente_nome: row.bem_aviv_clients?.full_name ?? null,
  }))
}

export async function criarAgendaItem(
  input: CrmAgendaItemInput,
  userId: string,
): Promise<CrmAgendaItem> {
  const payload = {
    tipo: input.tipo,
    titulo: input.titulo.trim(),
    descricao: input.descricao?.trim() || null,
    inicio: input.inicio,
    fim: input.fim || null,
    dia_inteiro: input.dia_inteiro ?? false,
    cliente_id: input.cliente_id ?? null,
    contato_id: input.contato_id ?? null,
    origem: 'sistema' as const,
    company_id: input.company_id ?? null,
    criado_por: userId,
  }

  const { data, error } = await supabase
    .from('crm_agenda_item')
    .insert(payload)
    .select()
    .maybeSingle()

  if (error) throw `Erro ao criar item de agenda: ${error.message}`
  if (!data) throw 'Item de agenda pode ter sido gravado, mas não foi possível lê-lo de volta.'

  return data as unknown as CrmAgendaItem
}

export async function concluirAgendaItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('crm_agenda_item')
    .update({ concluido_em: new Date().toISOString() })
    .eq('id', id)

  if (error) throw `Erro ao concluir item de agenda: ${error.message}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Clientes para select
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchClientesParaSelect(
  companyId?: string | null,
): Promise<ClienteResumido[]> {
  let query = supabase
    .from('bem_aviv_clients')
    .select('id, full_name, phone_1, phone_2')
    .order('full_name', { ascending: true })

  if (companyId) {
    query = query.eq('company_id', companyId)
  }

  const { data, error } = await query

  if (error) throw `Erro ao carregar clientes: ${error.message}`

  return (data as unknown as ClienteResumido[]) ?? []
}
