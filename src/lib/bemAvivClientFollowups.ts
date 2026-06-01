import type { SupabaseClient } from '@supabase/supabase-js'

export const CHANNEL_AGENDAMENTO = 'AGENDAMENTO'

export type ClientFollowupRow = {
  id: string
  client_id: string
  contacted_at: string
  channel: string
  created_by_name?: string | null
  result: string | null
  notes: string | null
}

export type LatestFollowupsByClient = {
  latestAny: Record<string, ClientFollowupRow>
  latestContact: Record<string, ClientFollowupRow>
}

const FOLLOWUP_CHUNK_SIZE = 120

/** Último registro por cliente (chunked). Separa contato real de agendamento. */
export async function fetchLatestFollowupsByClientIds(
  supabase: SupabaseClient,
  companyId: string,
  clientIds: string[],
): Promise<LatestFollowupsByClient> {
  const latestAny: Record<string, ClientFollowupRow> = {}
  const latestContact: Record<string, ClientFollowupRow> = {}

  if (clientIds.length === 0) return { latestAny, latestContact }

  for (let i = 0; i < clientIds.length; i += FOLLOWUP_CHUNK_SIZE) {
    const chunk = clientIds.slice(i, i + FOLLOWUP_CHUNK_SIZE)
    const { data, error } = await supabase
      .from('bem_aviv_client_followups')
      .select('id, client_id, contacted_at, channel, created_by_name, result, notes')
      .is('deleted_at', null)
      .eq('company_id', companyId)
      .in('client_id', chunk)
      .order('contacted_at', { ascending: false })

    if (error) throw error

    for (const row of (data ?? []) as ClientFollowupRow[]) {
      if (!latestAny[row.client_id]) latestAny[row.client_id] = row
      if (row.channel !== CHANNEL_AGENDAMENTO && !latestContact[row.client_id]) {
        latestContact[row.client_id] = row
      }
    }
  }

  return { latestAny, latestContact }
}

export function lastClientTouchIso(
  client: { last_contact_at?: string | null },
  latestContact?: ClientFollowupRow | null,
): string | null {
  const fromClient = client.last_contact_at?.trim()
  if (fromClient) return fromClient
  if (latestContact?.contacted_at) return latestContact.contacted_at
  return null
}

export type CriticalFollowupReason = 'Atrasado' | 'Sem contato' | `Sem contato há ${number}+ dias`

export type CriticalFollowupEntry = {
  client: { id: string; full_name: string; next_followup_at: string | null; next_followup_status: string | null }
  reason: CriticalFollowupReason
  lastTouchIso: string | null
  isOverdue: boolean
  isNoContact: boolean
  isStaleContact: boolean
}

export function buildCriticalFollowupEntries(
  clients: Array<{
    id: string
    full_name: string
    cpf?: string | null
    last_contact_at?: string | null
    next_followup_at: string | null
    next_followup_status: string | null
  }>,
  latestContactByClient: Record<string, ClientFollowupRow>,
  options: {
    now?: number
    staleDays: number
    excludeNames?: Set<string>
    excludeCpfs?: Set<string>
  },
): CriticalFollowupEntry[] {
  const now = options.now ?? Date.now()
  const staleMs = options.staleDays * 86_400_000
  const excludeNames = options.excludeNames ?? new Set()
  const excludeCpfs = options.excludeCpfs ?? new Set()

  return clients
    .filter((c) => !excludeNames.has(c.full_name.trim().toUpperCase()))
    .filter((c) => {
      const cpf = (c.cpf ?? '').replace(/\D/g, '')
      return !cpf || !excludeCpfs.has(cpf)
    })
    .map((c) => {
      const latestContact = latestContactByClient[c.id]
      const lastTouchIso = lastClientTouchIso(c, latestContact)
      const lastTouchMs = lastTouchIso ? new Date(lastTouchIso).getTime() : 0
      const isNoContact = !lastTouchMs || Number.isNaN(lastTouchMs)
      const isStaleContact = !!lastTouchMs && now - lastTouchMs >= staleMs
      const followupStatus = (c.next_followup_status ?? 'PENDENTE').toUpperCase()
      const nextFollowupMs = c.next_followup_at ? new Date(c.next_followup_at).getTime() : 0
      const isOverdue =
        !!nextFollowupMs &&
        !Number.isNaN(nextFollowupMs) &&
        nextFollowupMs < now &&
        followupStatus !== 'CANCELADO' &&
        followupStatus !== 'CONCLUIDO' &&
        (isNoContact || lastTouchMs <= nextFollowupMs)

      const reason: CriticalFollowupReason = isOverdue
        ? 'Atrasado'
        : isNoContact
          ? 'Sem contato'
          : isStaleContact
            ? `Sem contato há ${options.staleDays}+ dias`
            : 'Sem contato'

      return { client: c, reason, lastTouchIso, isOverdue, isNoContact, isStaleContact }
    })
    .filter((x) => {
      if (!x.isNoContact && !x.isStaleContact && !x.isOverdue) return false
      const st = (x.client.next_followup_status ?? 'PENDENTE').toUpperCase()
      const nf = x.client.next_followup_at
      if (nf && st !== 'CANCELADO' && st !== 'CONCLUIDO') {
        const nfMs = new Date(nf).getTime()
        if (!Number.isNaN(nfMs) && nfMs >= now) return false
      }
      return true
    })
    .sort((a, b) => {
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1
      if (a.isNoContact !== b.isNoContact) return a.isNoContact ? -1 : 1
      const ta = a.client.next_followup_at ? new Date(a.client.next_followup_at).getTime() : Number.MAX_SAFE_INTEGER
      const tb = b.client.next_followup_at ? new Date(b.client.next_followup_at).getTime() : Number.MAX_SAFE_INTEGER
      if (ta !== tb) return ta - tb
      const la = a.lastTouchIso ? new Date(a.lastTouchIso).getTime() : 0
      const lb = b.lastTouchIso ? new Date(b.lastTouchIso).getTime() : 0
      return la - lb
    })
}
