export type CompanyKind = 'REPRESENTANTE' | 'DISTRIBUIDOR'

export const COMPANY_KIND_OPTIONS: { value: CompanyKind; label: string }[] = [
  { value: 'REPRESENTANTE', label: 'Representante' },
  { value: 'DISTRIBUIDOR', label: 'Distribuidor' },
]

export function companyKindLabel(kind: string | null | undefined): string {
  const k = (kind ?? '').toUpperCase()
  if (k === 'REPRESENTANTE') return 'Representante'
  if (k === 'DISTRIBUIDOR') return 'Distribuidor'
  return 'Distribuidor'
}

export function parseCompanyKind(raw: string | null | undefined): CompanyKind {
  return (raw ?? '').toUpperCase() === 'REPRESENTANTE' ? 'REPRESENTANTE' : 'DISTRIBUIDOR'
}

export function isRepresentante(kind: string | null | undefined): boolean {
  return parseCompanyKind(kind) === 'REPRESENTANTE'
}

/** Meta global padrão da Bem Aviv (representante). */
export const BEM_AVIV_GLOBAL_GOAL_BRL = 100_000

export function defaultGlobalAnnualGoal(companySlug: string | null | undefined, kind: string | null | undefined): number {
  if (!isRepresentante(kind)) return 0
  if ((companySlug ?? '').toLowerCase() === 'bem-aviv') return BEM_AVIV_GLOBAL_GOAL_BRL
  return 0
}
