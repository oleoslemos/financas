import { Building2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useCompany, type CompanyRow } from '../context/CompanyContext'
import { getDefaultCompanySlugForHostname } from '../lib/defaultCompanyByHost'
import { cn } from '../lib/cn'

function hostCompanyHint(hostname: string, companies: CompanyRow[]): string | null {
  const slug = getDefaultCompanySlugForHostname(hostname)
  const row = companies.find((c) => c.slug === slug)
  if (!row) return null
  if (hostname.includes('distribuidoreko7')) {
    return `Neste endereço o padrão é ${row.trade_name} (ComfortCare).`
  }
  if (slug === 'bem-aviv') {
    return `Neste endereço o padrão é ${row.trade_name} (Bem Aviv).`
  }
  return `Sugestão para este site: ${row.trade_name}.`
}

export function CompanySelectionGate({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const {
    loading,
    error,
    companies,
    cannotListCompanyMembership,
    needsCompanySelection,
    suggestedCompanyId,
    confirmCompanySelection,
  } = useCompany()

  const onBemAviv = location.pathname.startsWith('/bem-aviv')
  const [pickedId, setPickedId] = useState<string | null>(null)

  useEffect(() => {
    if (suggestedCompanyId) {
      setPickedId(suggestedCompanyId)
    } else if (companies.length > 0) {
      setPickedId(companies[0].id)
    }
  }, [suggestedCompanyId, companies])

  if (!onBemAviv) {
    return <>{children}</>
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-600">
        Carregando empresas…
      </div>
    )
  }

  if (cannotListCompanyMembership || error) {
    return <>{children}</>
  }

  if (!needsCompanySelection) {
    return <>{children}</>
  }

  const hostHint =
    typeof window !== 'undefined' ? hostCompanyHint(window.location.hostname, companies) : null

  return (
    <div className="mx-auto flex min-h-[min(70vh,720px)] max-w-lg flex-col justify-center px-2 py-8">
      <header className="text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
          <Building2 size={24} strokeWidth={2} aria-hidden />
        </span>
        <h1 className="font-hub text-2xl font-bold tracking-tight text-slate-900">Escolher empresa</h1>
        <p className="mt-2 text-sm text-slate-600">
          Seu e-mail está vinculado a mais de uma empresa. Selecione qual deseja usar nesta sessão antes de
          acessar o menu e os dados.
        </p>
        {hostHint ? <p className="mt-2 text-xs font-medium text-[#185FA5]">{hostHint}</p> : null}
      </header>

      <ul className="mt-8 space-y-2" role="listbox" aria-label="Empresas disponíveis">
        {companies.map((c) => {
          const selected = pickedId === c.id
          const suggested = c.id === suggestedCompanyId
          return (
            <li key={c.id}>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                className={cn(
                  'flex w-full flex-col items-start gap-1 rounded-xl border px-4 py-3 text-left transition',
                  selected
                    ? 'border-[#185FA5] bg-[#E6F1FB] shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                )}
                onClick={() => setPickedId(c.id)}
              >
                <span className="font-hub text-base font-semibold text-slate-900">{c.trade_name}</span>
                <span className="text-xs text-slate-500">
                  {c.slug}
                  {suggested ? ' · sugerida neste site' : ''}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        disabled={!pickedId}
        className="mt-6 w-full rounded-lg bg-[#185FA5] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#144a87] disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => {
          if (pickedId) confirmCompanySelection(pickedId)
        }}
      >
        Continuar
      </button>
    </div>
  )
}
