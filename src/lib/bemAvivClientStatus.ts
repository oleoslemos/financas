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

export type BemAvivEko7Filter =
  | 'TODOS'
  | 'APRESENTADO'
  | 'PENDENTE'
  | 'APRESENTADO_NAO_COMPROU'
  | 'APRESENTADO_COMPROU'

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
  const purchased = clientHasConfirmedPurchase(client)
  switch (filter) {
    case 'TODOS':
      return true
    case 'APRESENTADO':
      return presented
    case 'PENDENTE':
      return !presented
    case 'APRESENTADO_NAO_COMPROU':
      return presented && !purchased
    case 'APRESENTADO_COMPROU':
      return presented && purchased
    default:
      return true
  }
}
