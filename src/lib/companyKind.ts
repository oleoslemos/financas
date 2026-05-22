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
