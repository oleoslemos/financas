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

export type BemAvivEko7Filter = 'TODOS' | 'APRESENTADO' | 'PENDENTE'

export function clientHadEko7Presentation(client: { eko7_presentation_at?: string | null }): boolean {
  return Boolean(client.eko7_presentation_at)
}

export function clientMatchesEko7Filter(
  client: { eko7_presentation_at?: string | null },
  filter: BemAvivEko7Filter,
): boolean {
  if (filter === 'TODOS') return true
  const presented = clientHadEko7Presentation(client)
  return filter === 'APRESENTADO' ? presented : !presented
}
