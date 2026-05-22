import { useUser } from '@clerk/clerk-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useSupabase } from '../hooks/useSupabase'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { getDefaultCompanySlugForHostname, getSeededCompanyIdForHostname } from '../lib/defaultCompanyByHost'
import {
  isCompanyPickerConfirmed,
  markCompanyPickerConfirmed,
} from '../lib/companySelectionSession'

export type CompanyRow = {
  id: string
  slug: string
  trade_name: string
  legal_name: string | null
  tax_id: string | null
  phone: string | null
  email_contact: string | null
  address_street: string | null
  address_city: string | null
  address_state: string | null
  zip_code: string | null
  company_kind: string | null
}

type CompanyContextValue = {
  loading: boolean
  error: string | null
  companies: CompanyRow[]
  /** true quando há e-mail Clerk mas a lista de empresas veio vazia (típico: JWT sem e-mail e sem clerk_user_id no banco). */
  cannotListCompanyMembership: boolean
  /** Com 2+ empresas no e-mail e sem confirmação nesta sessão, bloqueia o hub até escolher. */
  needsCompanySelection: boolean
  /** Empresa sugerida pelo hostname (ex.: distribuidoreko7 → comfortcare), se o usuário tiver vínculo. */
  suggestedCompanyId: string | null
  confirmCompanySelection: (id: string) => void
  activeCompanyId: string | null
  setActiveCompanyId: (id: string) => void
  activeCompany: CompanyRow | null
  refreshCompanies: () => Promise<void>
}

const CompanyContext = createContext<CompanyContextValue | null>(null)

function storageKey(userId: string | undefined) {
  return userId ? `sistema-financeiro.activeCompanyId.${userId}` : ''
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser()
  const supabase = useSupabase()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null)
  const [pickerConfirmed, setPickerConfirmed] = useState(() => isCompanyPickerConfirmed(user?.id))
  const activeCompanyIdRef = useRef<string | null>(null)
  useEffect(() => {
    activeCompanyIdRef.current = activeCompanyId
  }, [activeCompanyId])

  useEffect(() => {
    setPickerConfirmed(isCompanyPickerConfirmed(user?.id))
  }, [user?.id])

  const emails = useMemo(() => clerkEmailCandidates(user), [user])

  const loadMemberships = useCallback(
    async (preferredActiveId?: string | null) => {
      if (!isLoaded) {
        setLoading(true)
        return
      }
      if (!supabase) {
        setCompanies([])
        setError(null)
        setLoading(true)
        return
      }
      if (emails.length === 0) {
        setCompanies([])
        setLoading(false)
        setError(null)
        // Não zera activeCompanyId: e-mails do Clerk podem hidratar um instante depois; o seed por host
        // mantém a home utilizável enquanto isso.
        return
      }

      setLoading(true)
      setError(null)

      const membershipSelect =
        'company_id, companies (id, slug, trade_name, legal_name, tax_id, phone, email_contact, address_street, address_city, address_state, zip_code, company_kind)'

      let data: unknown = null
      let fetchError: { message: string } | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 400 * attempt))
        }
        const res = await supabase.from('company_members').select(membershipSelect).in('email', emails)
        data = res.data
        fetchError = res.error
        if (!fetchError) break
        const m = (fetchError.message ?? '').toLowerCase()
        const transient =
          m.includes('failed to fetch') ||
          m.includes('networkerror') ||
          m.includes('load failed') ||
          m.includes('aborted') ||
          m.includes('err_network')
        if (!transient || attempt === 2) break
      }

      if (fetchError) {
        const hint =
          (fetchError.message ?? '').toLowerCase().includes('failed to fetch') ||
          (fetchError.message ?? '').toLowerCase().includes('network')
            ? ' Possível rede, bloqueador ou cache do app (atualize a página ou limpe dados do site).'
            : ''
        setError(`${fetchError.message ?? 'Erro desconhecido'}.${hint}`)
        setCompanies([])
        // Mantém activeCompanyId (ex.: seed por host) para a dashboard não ficar presa em "Carregando empresa".
        setLoading(false)
        return
      }

      const rows: CompanyRow[] = []
      const seen = new Set<string>()
      const membershipRows = Array.isArray(data) ? data : []
      for (const r of membershipRows) {
        const raw = (r as unknown as { companies?: CompanyRow | CompanyRow[] | null }).companies
        const c = Array.isArray(raw) ? raw[0] : raw
        if (c?.id && !seen.has(c.id)) {
          seen.add(c.id)
          rows.push(c)
        }
      }
      rows.sort((a, b) => a.trade_name.localeCompare(b.trade_name, 'pt-BR'))
      setCompanies(rows)

      const key = storageKey(user?.id)
      const host = typeof window !== 'undefined' ? window.location.hostname : ''
      const hostSlug = getDefaultCompanySlugForHostname(host)
      const hostCompany = rows.find((c) => c.slug === hostSlug) ?? null
      const multiCompany = rows.length > 1
      const sessionOk = isCompanyPickerConfirmed(user?.id)

      let next: string | null = null

      if (rows.length === 1) {
        next = rows[0].id
        markCompanyPickerConfirmed(user?.id)
        setPickerConfirmed(true)
      } else if (multiCompany && sessionOk) {
        if (preferredActiveId && rows.some((c) => c.id === preferredActiveId)) {
          next = preferredActiveId
        }
        if (!next && key) {
          try {
            const stored = localStorage.getItem(key)
            const storedRow = stored ? rows.find((c) => c.id === stored) : undefined
            if (storedRow) next = storedRow.id
          } catch {
            /* ignore */
          }
        }
        if (!next && hostCompany) {
          next = hostCompany.id
        }
        if (!next) {
          next = rows[0].id
        }
      } else if (multiCompany) {
        next = null
      } else if (rows.length === 0) {
        next = getSeededCompanyIdForHostname(host)
      }

      setActiveCompanyIdState(next)
      if (key && next) {
        try {
          localStorage.setItem(key, next)
        } catch {
          /* ignore */
        }
      }
      setLoading(false)
    },
    [isLoaded, supabase, emails, user?.id],
  )

  useEffect(() => {
    void loadMemberships(undefined)
  }, [loadMemberships])

  const refreshCompanies = useCallback(async () => {
    await loadMemberships(activeCompanyIdRef.current)
  }, [loadMemberships])

  const confirmCompanySelection = useCallback(
    (id: string) => {
      if (!companies.some((c) => c.id === id)) return
      setActiveCompanyIdState(id)
      markCompanyPickerConfirmed(user?.id)
      setPickerConfirmed(true)
      const key = storageKey(user?.id)
      if (!key) return
      try {
        localStorage.setItem(key, id)
      } catch {
        /* ignore */
      }
    },
    [companies, user?.id],
  )

  const setActiveCompanyId = useCallback(
    (id: string) => {
      confirmCompanySelection(id)
    },
    [confirmCompanySelection],
  )

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === activeCompanyId) ?? null,
    [companies, activeCompanyId],
  )

  const cannotListCompanyMembership = useMemo(
    () =>
      Boolean(
        isLoaded &&
          supabase &&
          emails.length > 0 &&
          !loading &&
          error === null &&
          companies.length === 0,
      ),
    [isLoaded, supabase, emails.length, loading, error, companies.length],
  )

  const suggestedCompanyId = useMemo(() => {
    if (typeof window === 'undefined') return null
    const hostSlug = getDefaultCompanySlugForHostname(window.location.hostname)
    return companies.find((c) => c.slug === hostSlug)?.id ?? null
  }, [companies])

  const needsCompanySelection = useMemo(
    () => companies.length > 1 && !pickerConfirmed,
    [companies.length, pickerConfirmed],
  )

  const value = useMemo<CompanyContextValue>(
    () => ({
      loading,
      error,
      companies,
      cannotListCompanyMembership,
      needsCompanySelection,
      suggestedCompanyId,
      confirmCompanySelection,
      activeCompanyId,
      setActiveCompanyId,
      activeCompany,
      refreshCompanies,
    }),
    [
      loading,
      error,
      companies,
      cannotListCompanyMembership,
      needsCompanySelection,
      suggestedCompanyId,
      confirmCompanySelection,
      activeCompanyId,
      setActiveCompanyId,
      activeCompany,
      refreshCompanies,
    ],
  )

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>
}

export function useCompany(): CompanyContextValue {
  const ctx = useContext(CompanyContext)
  if (!ctx) throw new Error('useCompany deve ser usado dentro de CompanyProvider')
  return ctx
}
