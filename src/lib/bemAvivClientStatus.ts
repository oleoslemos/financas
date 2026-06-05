/** Classificação derivada dos pedidos (exceto cadastro novo = PROSPECÇÃO). */
export const BEM_AVIV_CLIENT_STATUS_OPTIONS = [
  'PROSPECÇÃO',
  'CLIENTE - COLCHÃO',
  'CLIENTE - DIVERSOS',
  'CLIENTE - COLCHÃO/DIVERSOS',
] as const

export type BemAvivClientStatusFilter = 'TODOS' | (typeof BEM_AVIV_CLIENT_STATUS_OPTIONS)[number]

export const BEM_AVIV_CLIENT_COMMERCIAL_STAGE_OPTIONS = [
  'CONTATO',
  'EM RELACIONAMENTO',
  'VISITA AGENDADA',
  'VISITA REALIZADA',
  'FECHADO PLATAFORMA CONFORTO',
  'FECHADO DEMAIS PRODUTOS',
] as const

export type BemAvivClientStatus = (typeof BEM_AVIV_CLIENT_STATUS_OPTIONS)[number]

/** Rótulo curto para filtros / KPIs em telas pequenas */
export function bemAvivClientStatusShortLabel(status: string | null | undefined): string {
  const s = (status ?? '').trim()
  if (s === 'PROSPECÇÃO') return 'Prospecção'
  if (s === 'CLIENTE - COLCHÃO') return 'Colchão'
  if (s === 'CLIENTE - DIVERSOS') return 'Diversos'
  if (s === 'CLIENTE - COLCHÃO/DIVERSOS') return 'Colchão + div.'
  return s || '—'
}
export type BemAvivClientCommercialStage = (typeof BEM_AVIV_CLIENT_COMMERCIAL_STAGE_OPTIONS)[number]

export interface ClientStatusInfo {
  status: 'PROSPECÇÃO' | 'CLIENTE'
  tags: ('COLCHÃO' | 'DIVERSOS')[]
}

export function getDisplayStatusAndTags(status: string | null | undefined): ClientStatusInfo {
  const s = (status ?? '').trim().toUpperCase()
  if (s.startsWith('CLIENTE')) {
    const tags: ('COLCHÃO' | 'DIVERSOS')[] = []
    if (s.includes('COLCHÃO') || s.includes('COLCHAO')) {
      tags.push('COLCHÃO')
    }
    if (s.includes('DIVERSOS')) {
      tags.push('DIVERSOS')
    }
    return { status: 'CLIENTE', tags }
  }
  return { status: 'PROSPECÇÃO', tags: [] }
}

export type BemAvivEko7Filter =
  | 'TODOS'
  | 'APRESENTADO'
  | 'PENDENTE'

export function clientHadEko7Presentation(client: { eko7_presentation_at?: string | null }): boolean {
  return Boolean(client.eko7_presentation_at)
}

/** Cliente com pedido confirmado (status derivado dos pedidos, não aberto/cancelado). */
export function clientHasConfirmedPurchase(client: { client_status?: string | null }): boolean {
  const s = (client.client_status ?? '').trim()
  return s !== 'PROSPECÇÃO' && s.startsWith('CLIENTE')
}

export function clientMatchesEko7Filter(
  client: { eko7_presentation_at?: string | null; client_status?: string | null },
  filter: BemAvivEko7Filter,
): boolean {
  const presented = clientHadEko7Presentation(client)
  switch (filter) {
    case 'TODOS':
      return true
    case 'APRESENTADO':
      return presented
    case 'PENDENTE':
      return !presented
    default:
      return true
  }
}

