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
  responsavel_id?: string | null
  proximo_contato_em?: string | null
  criado_por?: string | null
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
  criado_por?: string | null
  company_id?: string | null
}

export interface ClienteResumido {
  id: string
  full_name: string
  phone_1: string | null
  phone_2: string | null
  email: string | null
  company_id: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Formata data/hora em pt-BR curto */
export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

/** Formata data curta sem hora */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(iso))
  } catch {
    return iso
  }
}

/**
 * Gera link wa.me para um telefone.
 * Regra: remove não-dígitos; se 11 dígitos (DDD+9+num) prefixar com 55;
 * se 13 dígitos (55+DDD+9+num) usar como está; outros: prefixar 55.
 * Retorna null se sem telefone válido.
 */
export function formatarWaMe(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (!digits || digits.length < 8) return null
  let numero = digits
  if (digits.length === 11) {
    numero = `55${digits}`
  } else if (digits.length === 13 && digits.startsWith('55')) {
    numero = digits
  } else if (!digits.startsWith('55')) {
    numero = `55${digits}`
  }
  return `https://wa.me/${numero}`
}

export function obterTelefoneCliente(c: { phone_1?: string | null; phone_2?: string | null }): string | null {
  return c.phone_1 || c.phone_2 || null
}

// ─────────────────────────────────────────────────────────────────────────────
// Contatos
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchContatos(): Promise<CrmContato[]> {
  const { data, error } = await supabase
    .from('crm_contato_v2')
    .select(`
      *,
      bem_aviv_clients!crm_contato_v2_cliente_id_fkey (
        full_name, phone_1, phone_2
      )
    `)
    .is('cancelado_em', null)
    .order('ocorrido_em', { ascending: false })
    .limit(200)

  if (error) throw new Error(`Erro ao carregar contatos: ${error.message}`)

  return (data ?? []).map((row: Record<string, unknown>) => {
    const client = row['bem_aviv_clients'] as Record<string, unknown> | null
    return {
      ...(row as unknown as CrmContato),
      cliente_nome: (client?.['full_name'] as string) ?? '—',
      cliente_phone_1: (client?.['phone_1'] as string | null) ?? null,
      cliente_phone_2: (client?.['phone_2'] as string | null) ?? null,
    }
  })
}

export async function fetchContatosByCliente(clienteId: string): Promise<CrmContato[]> {
  const { data, error } = await supabase
    .from('crm_contato_v2')
    .select(`
      *,
      bem_aviv_clients!crm_contato_v2_cliente_id_fkey (
        full_name, phone_1, phone_2
      )
    `)
    .eq('cliente_id', clienteId)
    .is('cancelado_em', null)
    .order('ocorrido_em', { ascending: false })

  if (error) throw new Error(`Erro ao carregar contatos do cliente: ${error.message}`)

  return (data ?? []).map((row: Record<string, unknown>) => {
    const client = row['bem_aviv_clients'] as Record<string, unknown> | null
    return {
      ...(row as unknown as CrmContato),
      cliente_nome: (client?.['full_name'] as string) ?? '—',
      cliente_phone_1: (client?.['phone_1'] as string | null) ?? null,
      cliente_phone_2: (client?.['phone_2'] as string | null) ?? null,
    }
  })
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
    responsavel_id: userId || null,
    proximo_contato_em: input.proximo_contato_em || null,
    criado_por: userId || null,
    company_id: input.company_id ?? null,
  }

  const { data, error } = await supabase
    .from('crm_contato_v2')
    .insert(payload)
    .select()
    .single()

  if (error) throw new Error(`Erro ao registrar contato: ${error.message}`)

  // Se tem próximo contato, cria item de agenda vinculado
  if (input.proximo_contato_em && data) {
    const agendaPayload = {
      tipo: 'tarefa' as CrmTipoAgenda,
      titulo: `Follow-up: ${input.assunto.trim()}`,
      descricao: `Próximo contato com cliente — ${input.assunto.trim()}`,
      inicio: input.proximo_contato_em,
      cliente_id: input.cliente_id,
      contato_id: (data as unknown as CrmContato).id,
      origem: 'sistema' as CrmOrigem,
      criado_por: userId || null,
      company_id: input.company_id ?? null,
    }

    const { error: agErr } = await supabase.from('crm_agenda_item').insert(agendaPayload)
    if (agErr) {
      // Contato foi criado mas agenda falhou — informa mas não desfaz
      console.error('Aviso: contato criado, mas falha ao criar item de agenda:', agErr.message)
    }
  }

  return data as unknown as CrmContato
}

export async function cancelarContato(id: string): Promise<void> {
  const { error } = await supabase
    .from('crm_contato_v2')
    .update({ cancelado_em: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(`Erro ao cancelar contato: ${error.message}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Agenda
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchAgendaItems(de: string, ate: string): Promise<CrmAgendaItem[]> {
  const { data, error } = await supabase
    .from('crm_agenda_item')
    .select(`
      *,
      bem_aviv_clients!crm_agenda_item_cliente_id_fkey (
        full_name
      )
    `)
    .is('cancelado_em', null)
    .gte('inicio', de)
    .lte('inicio', ate)
    .order('inicio', { ascending: true })

  if (error) throw new Error(`Erro ao carregar agenda: ${error.message}`)

  return (data ?? []).map((row: Record<string, unknown>) => {
    const client = row['bem_aviv_clients'] as Record<string, unknown> | null
    return {
      ...(row as unknown as CrmAgendaItem),
      cliente_nome: (client?.['full_name'] as string) ?? null,
    }
  })
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
    cliente_id: input.cliente_id || null,
    contato_id: input.contato_id || null,
    origem: 'sistema' as CrmOrigem,
    criado_por: userId || null,
    company_id: input.company_id ?? null,
  }

  const { data, error } = await supabase
    .from('crm_agenda_item')
    .insert(payload)
    .select()
    .single()

  if (error) throw new Error(`Erro ao criar item de agenda: ${error.message}`)
  return data as unknown as CrmAgendaItem
}

export async function concluirAgendaItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('crm_agenda_item')
    .update({ concluido_em: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(`Erro ao concluir item: ${error.message}`)
}

export async function cancelarAgendaItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('crm_agenda_item')
    .update({ cancelado_em: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(`Erro ao cancelar item: ${error.message}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Clientes para select
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchClientesParaSelect(
  companyId?: string | null,
): Promise<ClienteResumido[]> {
  let query = supabase
    .from('bem_aviv_clients')
    .select('id, full_name, phone_1, phone_2, email, company_id')
    .order('full_name', { ascending: true })
    .limit(500)

  if (companyId) {
    query = query.eq('company_id', companyId)
  }

  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar clientes: ${error.message}`)
  return (data ?? []) as ClienteResumido[]
}
