import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  ChevronRight,
  Plus,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Users,
  TrendingUp,
  Sparkles,
  MessageCircle,
} from 'lucide-react'
import {
  BemAvivClient,
  ClientStatus,
  computeKpi,
  fetchClient,
  fetchClients,
  formatClientPhone,
} from '../services/v2ClientesService'
import { getCurrentV2User } from '../services/v2AuthService'
import { useCompany } from '../../context/CompanyContext'
import { V2ClientDrawer } from '../components/V2ClientDrawer'

// ─────────────────────────────────────────────────────────────────────────────
// Constants / helpers
// ─────────────────────────────────────────────────────────────────────────────

type QuickFilter = 'todos' | 'prospeccao' | 'colchao' | 'diversos' | 'mix'
type Eko7Filter = 'todos' | 'sim' | 'nao'

function statusBadge(status: ClientStatus) {
  const map: Record<ClientStatus, { label: string; bg: string; color: string }> = {
    'PROSPECÇÃO': { label: 'Prospecção', bg: '#FEF3C7', color: '#92400E' },
    'CLIENTE - COLCHÃO': { label: 'Colchão', bg: '#DBEAFE', color: '#1E40AF' },
    'CLIENTE - DIVERSOS': { label: 'Diversos', bg: '#D1FAE5', color: '#065F46' },
    'CLIENTE - COLCHÃO/DIVERSOS': { label: 'Mix', bg: '#EDE9FE', color: '#4C1D95' },
  }
  const cfg = map[status] ?? { label: status, bg: '#F3F4F6', color: '#374151' }
  return (
    <span
      style={{
        background: cfg.bg,
        color: cfg.color,
        padding: '2px 8px',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {cfg.label}
    </span>
  )
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return iso
  }
}

function getWhatsappUrl(phone?: string | null): string | null {
  if (!phone) return null
  const d = phone.replace(/\D/g, '')
  if (!d || d.length < 8) return null
  const normalized = d.startsWith('55') ? d : `55${d}`
  return `https://wa.me/${normalized}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Drawer Component (reutilizado de V2ClientDrawer)
// ─────────────────────────────────────────────────────────────────────────────
const ClientDrawer = V2ClientDrawer

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function V2ClientesPage() {
  const navigate = useNavigate()
  const { activeCompanyId } = useCompany()

  const [clients, setClients] = useState<BemAvivClient[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<BemAvivClient | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('todos')
  const [eko7Filter, setEko7Filter] = useState<Eko7Filter>('todos')

  const BRAND_BLUE = '#0D6BAF'
  const BRAND_GREEN = '#7DC344'

  // Guard
  useEffect(() => {
    const user = getCurrentV2User()
    if (!user) navigate('/v2/login', { replace: true })
  }, [navigate])

  // Load
  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await fetchClients(activeCompanyId)
    setLoading(false)
    if (error) { setLoadError(error); return }
    setClients(data)
  }, [activeCompanyId])

  useEffect(() => { load() }, [load])

  // KPI
  const kpi = useMemo(() => computeKpi(clients), [clients])

  const ITEMS_PER_PAGE = 50
  const [page, setPage] = useState(1)

  // Filtered list
  const filtered = useMemo(() => {
    return clients.filter((c) => {
      const q = search.toLowerCase()
      const searchOk = !search
        || c.full_name.toLowerCase().includes(q)
        || (c.phone_1 ?? '').includes(q)
        || (c.phone_2 ?? '').includes(q)
        || (c.email ?? '').toLowerCase().includes(q)
        || (c.cpf ?? '').includes(q)

      const filterOk =
        quickFilter === 'todos' ||
        (quickFilter === 'prospeccao' && c.client_status === 'PROSPECÇÃO') ||
        (quickFilter === 'colchao' && c.client_status === 'CLIENTE - COLCHÃO') ||
        (quickFilter === 'diversos' && c.client_status === 'CLIENTE - DIVERSOS') ||
        (quickFilter === 'mix' && c.client_status === 'CLIENTE - COLCHÃO/DIVERSOS')

      const eko7Ok =
        eko7Filter === 'todos' ||
        (eko7Filter === 'sim' && !!c.eko7_presentation_at) ||
        (eko7Filter === 'nao' && !c.eko7_presentation_at)

      return searchOk && filterOk && eko7Ok
    })
  }, [clients, search, quickFilter, eko7Filter])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [search, quickFilter, eko7Filter])

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE) || 1
  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginatedClients = useMemo(() => {
    return filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE)
  }, [filtered, startIndex])

  const openNew = () => { setSelectedClient(null); setDrawerOpen(true) }
  const openEdit = (c: BemAvivClient) => { setSelectedClient(c); setDrawerOpen(true) }
  const closeDrawer = () => setDrawerOpen(false)

  const handleSaved = (c: BemAvivClient) => {
    setClients((prev) => {
      const idx = prev.findIndex((p) => p.id === c.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = c; return next }
      return [c, ...prev]
    })
    setSelectedClient(c)
    // Regra: nunca fechar a gaveta ao salvar em qualquer guia, apenas ao clicar em Fechar
  }

  const handleClientCreated = (c: BemAvivClient) => {
    setClients((prev) => {
      const idx = prev.findIndex((p) => p.id === c.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = c; return next }
      return [c, ...prev]
    })
  }

  const handleOpenClientById = async (clientId: string) => {
    const local = clients.find((c) => c.id === clientId)
    if (local) {
      setSelectedClient(local)
      setDrawerOpen(true)
      return
    }
    const { data: fetched } = await fetchClient(clientId)
    if (fetched) {
      setSelectedClient(fetched)
      setDrawerOpen(true)
    }
  }

  const handleDeleted = (id: string) => {
    setClients((prev) => prev.filter((c) => c.id !== id))
    setDrawerOpen(false)
  }

  // ── KPI card helper
  const KpiCard = ({
    label, value, sub, icon: Icon, accent, filter,
  }: {
    label: string; value: number; sub?: React.ReactNode; icon: typeof Users
    accent: string; filter: QuickFilter
  }) => {
    const active = quickFilter === filter
    return (
      <button
        onClick={() => setQuickFilter(active ? 'todos' : filter)}
        style={{
          background: active ? accent : '#FFFFFF',
          border: `1.5px solid ${active ? accent : '#E5E7EB'}`,
          borderRadius: 14,
          padding: '14px 16px',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'all 0.2s',
          boxShadow: active ? `0 4px 20px ${accent}44` : '0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <Icon size={16} color={active ? 'rgba(255,255,255,0.8)' : accent} />
          {active && <CheckCircle2 size={14} color="rgba(255,255,255,0.7)" />}
        </div>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: active ? 'rgba(255,255,255,0.8)' : '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 26, fontWeight: 900, color: active ? '#FFFFFF' : '#111827', lineHeight: 1 }}>
          {value}
        </p>
        {sub && (
          <div style={{ marginTop: 6, fontSize: 11, color: active ? 'rgba(255,255,255,0.7)' : '#9CA3AF' }}>
            {sub}
          </div>
        )}
      </button>
    )
  }

  const quickFilters: { value: QuickFilter; label: string }[] = [
    { value: 'todos', label: 'Todos' },
    { value: 'prospeccao', label: 'Prospecção' },
    { value: 'colchao', label: 'Colchão' },
    { value: 'diversos', label: 'Diversos' },
    { value: 'mix', label: 'Mix' },
  ]

  return (
    <>
      <div className="p-3 sm:p-6 max-w-7xl mx-auto min-h-screen font-sans">
        {/* ── Page Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#111827' }}>Clientes</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6B7280' }}>
              {loading ? 'Carregando...' : `${clients.length} cadastros encontrados`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={load}
              disabled={loading}
              title="Recarregar"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 40, height: 40, borderRadius: 10,
                border: '1.5px solid #E5E7EB', background: '#FFFFFF', cursor: 'pointer',
                color: '#6B7280',
              }}
            >
              <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            </button>
            <button
              onClick={openNew}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '0 18px', height: 40, borderRadius: 10,
                border: 'none', background: BRAND_BLUE, color: '#FFFFFF',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                boxShadow: `0 4px 14px ${BRAND_BLUE}55`,
              }}
            >
              <Plus size={16} />
              Novo Cliente
            </button>
          </div>
        </div>

        {/* ── Error ── */}
        {loadError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, marginBottom: 20 }}>
            <AlertCircle size={16} color="#DC2626" />
            <span style={{ fontSize: 13, color: '#DC2626' }}>{loadError}</span>
          </div>
        )}

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
          <KpiCard label="Total de Cadastros" value={kpi.total} icon={Users} accent={BRAND_BLUE} filter="todos"
            sub={<span>{kpi.prospects} prospect{kpi.prospects !== 1 ? 's' : ''}</span>}
          />
          <KpiCard label="Prospecção" value={kpi.prospects} icon={TrendingUp} accent="#F59E0B" filter="prospeccao" />
          <KpiCard
            label="Clientes Ativos"
            value={kpi.clientesAtivos}
            icon={CheckCircle2}
            accent={BRAND_GREEN}
            filter="colchao"
            sub={
              <>
                <div style={{ display: 'flex', height: 4, borderRadius: 99, overflow: 'hidden', marginBottom: 3 }}>
                  {kpi.clientesAtivos > 0 && (
                    <>
                      <div style={{ flex: kpi.clientesColchao, background: '#60A5FA' }} title="Colchão" />
                      <div style={{ flex: kpi.clientesDiversos, background: BRAND_GREEN }} title="Diversos" />
                      <div style={{ flex: kpi.clientesMix, background: '#A78BFA' }} title="Mix" />
                    </>
                  )}
                </div>
                {kpi.clientesColchao} Colchão · {kpi.clientesDiversos} Div · {kpi.clientesMix} Mix
              </>
            }
          />
          <div
            style={{
              background: '#FFFFFF', border: '1.5px solid #E5E7EB',
              borderRadius: 14, padding: '14px 16px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            }}
          >
            <Sparkles size={16} color="#7C3AED" style={{ marginBottom: 8 }} />
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>EKO7 Apresentado</p>
            <p style={{ margin: '2px 0 0', fontSize: 26, fontWeight: 900, color: '#111827', lineHeight: 1 }}>{kpi.comEko7}</p>
            <p style={{ margin: '6px 0 0', fontSize: 11, color: '#9CA3AF' }}>{kpi.total - kpi.comEko7} não apresentados</p>
          </div>
        </div>

        {/* ── Filters ── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, telefone, e-mail ou CPF..."
              style={{
                width: '100%', border: '1.5px solid #E5E7EB', borderRadius: 10,
                padding: '9px 12px 9px 36px', fontSize: 13, color: '#111827',
                background: '#FFFFFF', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Quick filter pills */}
          <div style={{ display: 'flex', gap: 6 }}>
            {quickFilters.map(({ value, label }) => {
              const active = quickFilter === value
              return (
                <button
                  key={value}
                  onClick={() => setQuickFilter(value)}
                  style={{
                    padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                    border: `1.5px solid ${active ? BRAND_BLUE : '#E5E7EB'}`,
                    background: active ? BRAND_BLUE : '#FFFFFF',
                    color: active ? '#FFFFFF' : '#6B7280',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {/* EKO7 filter */}
          <select
            value={eko7Filter}
            onChange={(e) => setEko7Filter(e.target.value as Eko7Filter)}
            style={{
              border: '1.5px solid #E5E7EB', borderRadius: 10, padding: '8px 14px',
              fontSize: 12, fontWeight: 700, color: '#6B7280', background: '#FFFFFF', cursor: 'pointer',
            }}
          >
            <option value="todos">EKO7: Todos</option>
            <option value="sim">EKO7: Apresentado</option>
            <option value="nao">EKO7: Não apresentado</option>
          </select>
        </div>

        {/* ── Table ── */}
        <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1.5px solid #E5E7EB', overflow: 'hidden', boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
          <div className="overflow-x-auto">
            <div style={{ minWidth: 700 }}>
              {/* Table Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1.6fr 1fr 1.5fr 40px',
                padding: '10px 16px',
                background: '#F9FAFB',
                borderBottom: '1px solid #F3F4F6',
                fontSize: 11, fontWeight: 800, color: '#9CA3AF',
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                <span>Cliente</span>
                <span>Contato</span>
                <span>Status</span>
                <span>Próximo Follow-up</span>
                <span />
              </div>

          {/* Loading */}
          {loading && (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <Loader2 size={24} color={BRAND_BLUE} style={{ animation: 'spin 1s linear infinite' }} />
              <p style={{ margin: '12px 0 0', fontSize: 13, color: '#9CA3AF' }}>Carregando clientes...</p>
            </div>
          )}

          {/* Rows */}
          {!loading && paginatedClients.map((c, i) => {
            const hasFollowup = !!c.next_followup_at
            const followupPast = hasFollowup && new Date(c.next_followup_at!) < new Date()
            const waUrl = getWhatsappUrl(c.phone_1 || c.phone_2)
            return (
              <div
                key={c.id}
                onClick={() => openEdit(c)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1.6fr 1fr 1.5fr 40px',
                  padding: '12px 16px',
                  alignItems: 'center',
                  borderBottom: i < paginatedClients.length - 1 ? '1px solid #F9FAFB' : 'none',
                  background: i % 2 === 1 ? '#FAFAFA' : '#FFFFFF',
                  cursor: 'pointer',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#EFF6FF' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = i % 2 === 1 ? '#FAFAFA' : '#FFFFFF' }}
              >
                {/* Name */}
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#111827' }}>{c.full_name}</p>
                  {c.address_city && (
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <MapPin size={10} />
                      {c.address_city}{c.address_state ? ` – ${c.address_state}` : ''}
                    </p>
                  )}
                </div>

                {/* Contact */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <p style={{ margin: 0, fontSize: 12, color: '#374151', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Phone size={11} color="#9CA3AF" />
                      {formatClientPhone(c) || '—'}
                    </p>
                    {waUrl && (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title="Enviar mensagem no WhatsApp"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '2px 6px', borderRadius: 6,
                          background: '#25D366', color: '#FFFFFF',
                          fontSize: 10, fontWeight: 700, textDecoration: 'none',
                        }}
                      >
                        <MessageCircle size={10} /> WhatsApp
                      </a>
                    )}
                  </div>
                  {c.email && (
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Mail size={10} />
                      {c.email.length > 22 ? c.email.slice(0, 22) + '…' : c.email}
                    </p>
                  )}
                </div>

                {/* Status */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {statusBadge(c.client_status)}
                  {c.eko7_presentation_at && (
                    <span style={{ background: '#EDE9FE', color: '#5B21B6', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, display: 'inline-block' }}>
                      EKO7 ✓
                    </span>
                  )}
                </div>

                {/* Follow-up */}
                <div>
                  {hasFollowup ? (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      background: followupPast ? '#FEF2F2' : '#FEF3C7',
                      color: followupPast ? '#DC2626' : '#92400E',
                      padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    }}>
                      <Calendar size={10} />
                      {formatDate(c.next_followup_at)}
                      {c.next_followup_note && ` · ${c.next_followup_note.slice(0, 20)}${c.next_followup_note.length > 20 ? '…' : ''}`}
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: '#D1D5DB' }}>Sem agendamento</span>
                  )}
                </div>

                {/* Arrow */}
                <div style={{ textAlign: 'right' }}>
                  <ChevronRight size={16} color="#D1D5DB" />
                </div>
              </div>
            )
          })}

          {/* Empty */}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: '48px', textAlign: 'center' }}>
              <User size={36} color="#D1D5DB" style={{ margin: '0 auto 12px' }} />
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#9CA3AF' }}>Nenhum cliente encontrado</p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#D1D5DB' }}>Tente ajustar os filtros ou cadastre um novo cliente</p>
              <button
                onClick={openNew}
                style={{
                  marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                  border: `1.5px solid ${BRAND_BLUE}`, background: 'transparent', color: BRAND_BLUE, cursor: 'pointer',
                }}
              >
                <Plus size={14} />
                Novo Cliente
              </button>
            </div>
          )}
            </div>
          </div>
        </div>

        {/* Pagination & Count footer */}
        {!loading && filtered.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, flexWrap: 'wrap', gap: 10 }}>
            <p style={{ margin: 0, fontSize: 12, color: '#6B7280' }}>
              Mostrando {startIndex + 1} a {Math.min(startIndex + ITEMS_PER_PAGE, filtered.length)} de {filtered.length} clientes
              {filtered.length !== clients.length && ` (filtrado de ${clients.length} no total)`}
            </p>
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    border: '1px solid #D1D5DB', background: '#FFFFFF', color: currentPage === 1 ? '#9CA3AF' : '#374151',
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Anterior
                </button>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                  Página {currentPage} de {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    border: '1px solid #D1D5DB', background: '#FFFFFF', color: currentPage === totalPages ? '#9CA3AF' : '#374151',
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  }}
                >
                  Próxima
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Drawer ── */}
      <ClientDrawer
        open={drawerOpen}
        client={selectedClient}
        companyId={activeCompanyId}
        onClose={closeDrawer}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
        onOpenClient={handleOpenClientById}
        onClientCreated={handleClientCreated}
      />
    </>
  )
}
