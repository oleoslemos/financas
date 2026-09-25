import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  ChevronRight,
  Plus,
  X,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  Trash2,
  RefreshCw,
  Users,
  TrendingUp,
  Bed,
  Sparkles,
} from 'lucide-react'
import {
  BemAvivClient,
  ClientStatus,
  CommercialStage,
  computeKpi,
  createClient,
  deleteClient,
  fetchClients,
  formatClientPhone,
  updateClient,
} from '../services/v2ClientesService'
import { getCurrentV2User } from '../services/v2AuthService'
import { useCompany } from '../../context/CompanyContext'

// ─────────────────────────────────────────────────────────────────────────────
// Constants / helpers
// ─────────────────────────────────────────────────────────────────────────────

const CLIENT_STATUSES: { value: ClientStatus; label: string }[] = [
  { value: 'PROSPECÇÃO', label: 'Prospecção' },
  { value: 'CLIENTE - COLCHÃO', label: 'Cliente – Colchão' },
  { value: 'CLIENTE - DIVERSOS', label: 'Cliente – Diversos' },
  { value: 'CLIENTE - COLCHÃO/DIVERSOS', label: 'Cliente – Colchão/Diversos' },
]

const COMMERCIAL_STAGES: { value: CommercialStage; label: string }[] = [
  { value: 'CONTATO', label: 'Contato' },
  { value: 'VISITA AGENDADA', label: 'Visita Agendada' },
  { value: 'VISITA REALIZADA', label: 'Visita Realizada' },
  { value: 'FECHADO PLATAFORMA CONFORTO', label: 'Fechado – Plataforma Conforto' },
  { value: 'FECHADO DEMAIS PRODUTOS', label: 'Fechado – Demais Produtos' },
]

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

function formatDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  return iso.split('T')[0].split(' ')[0]
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty form
// ─────────────────────────────────────────────────────────────────────────────

function emptyForm(companyId: string | null): Partial<BemAvivClient> {
  return {
    company_id: companyId ?? undefined,
    full_name: '',
    cpf: '',
    birth_date: null,
    phone_1: '',
    phone_2: '',
    email: '',
    cep: '',
    address_street: '',
    address_number: '',
    address_complement: '',
    address_district: '',
    address_city: '',
    address_state: '',
    commercial_stage: 'CONTATO',
    next_followup_at: null,
    next_followup_note: '',
    eko7_presentation_at: null,
    group_reference: '',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Drawer Component
// ─────────────────────────────────────────────────────────────────────────────

interface DrawerProps {
  open: boolean
  client: BemAvivClient | null // null = new
  companyId: string | null
  onClose: () => void
  onSaved: (c: BemAvivClient) => void
  onDeleted: (id: string) => void
}

function ClientDrawer({ open, client, companyId, onClose, onSaved, onDeleted }: DrawerProps) {
  const [form, setForm] = useState<Partial<BemAvivClient>>(emptyForm(companyId))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'dados' | 'contato' | 'followup'>('dados')
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setForm(client ? { ...client } : emptyForm(companyId))
      setError(null)
      setTab('dados')
    }
  }, [open, client, companyId])

  const set = (key: keyof BemAvivClient, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    if (!form.full_name?.trim()) {
      setError('Nome completo é obrigatório.')
      return
    }
    setSaving(true)
    setError(null)

    const payload: Partial<BemAvivClient> = { ...form }
    if (!payload.company_id) payload.company_id = companyId ?? undefined

    if (client?.id) {
      const { data, error: e } = await updateClient(client.id, payload)
      setSaving(false)
      if (e) { setError(e); return }
      if (data) onSaved(data)
    } else {
      const { data, error: e } = await createClient(payload as Parameters<typeof createClient>[0])
      setSaving(false)
      if (e) { setError(e); return }
      if (data) onSaved(data)
    }
  }

  const handleDelete = async () => {
    if (!client?.id) return
    if (!confirm(`Excluir "${client.full_name}"? Esta ação não pode ser desfeita.`)) return
    setDeleting(true)
    const { error: e } = await deleteClient(client.id)
    setDeleting(false)
    if (e) { setError(e); return }
    onDeleted(client.id)
  }

  const BRAND_BLUE = '#0D6BAF'

  const inputClass = (disabled = false) => ({
    width: '100%',
    border: '1px solid #D1D5DB',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 14,
    color: '#111827',
    background: disabled ? '#F9FAFB' : '#FFFFFF',
    outline: 'none',
    transition: 'border-color 0.15s',
    boxSizing: 'border-box' as const,
  })

  const labelStyle = { fontSize: 12, fontWeight: 700, color: '#6B7280', marginBottom: 4, display: 'block' as const }

  return (
    <>
      {/* overlay */}
      <div
        ref={overlayRef}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
          zIndex: 998, opacity: open ? 1 : 0, pointerEvents: open ? 'all' : 'none',
          transition: 'opacity 0.25s',
        }}
      />

      {/* drawer */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: '100%', maxWidth: 520,
          background: '#FFFFFF',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.15)',
          zIndex: 999,
          display: 'flex', flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid #F3F4F6',
          background: BRAND_BLUE,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#FFFFFF' }}>
              {client ? 'Editar Cliente' : 'Novo Cliente'}
            </h2>
            {client && (
              <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
                {client.full_name}
              </p>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #F3F4F6', background: '#FAFAFA' }}>
          {(['dados', 'contato', 'followup'] as const).map((t) => {
            const labels = { dados: 'Dados Pessoais', contato: 'Endereço', followup: 'Follow-up' }
            const isActive = tab === t
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1, padding: '12px 8px', fontSize: 12, fontWeight: 700,
                  border: 'none', borderBottom: isActive ? `2px solid ${BRAND_BLUE}` : '2px solid transparent',
                  background: 'none', cursor: 'pointer',
                  color: isActive ? BRAND_BLUE : '#9CA3AF',
                  transition: 'all 0.15s',
                }}
              >
                {labels[t]}
              </button>
            )
          })}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, marginBottom: 16 }}>
              <AlertCircle size={16} color="#DC2626" />
              <span style={{ fontSize: 13, color: '#DC2626' }}>{error}</span>
            </div>
          )}

          {/* ── Aba: Dados Pessoais ── */}
          {tab === 'dados' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Nome Completo *</label>
                <input style={inputClass()} value={form.full_name ?? ''} onChange={(e) => set('full_name', e.target.value.toUpperCase())} placeholder="NOME COMPLETO" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>CPF</label>
                  <input style={inputClass()} value={form.cpf ?? ''} onChange={(e) => set('cpf', e.target.value)} placeholder="000.000.000-00" />
                </div>
                <div>
                  <label style={labelStyle}>Data de Nascimento</label>
                  <input style={inputClass()} type="date" value={formatDateInput(form.birth_date)} onChange={(e) => set('birth_date', e.target.value || null)} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Telefone 1</label>
                  <input style={inputClass()} value={form.phone_1 ?? ''} onChange={(e) => set('phone_1', e.target.value)} placeholder="(00) 00000-0000" />
                </div>
                <div>
                  <label style={labelStyle}>Telefone 2</label>
                  <input style={inputClass()} value={form.phone_2 ?? ''} onChange={(e) => set('phone_2', e.target.value)} placeholder="(00) 00000-0000" />
                </div>
              </div>
              <div>
                <label style={labelStyle}>E-mail</label>
                <input style={inputClass()} type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} placeholder="email@exemplo.com" />
              </div>
              <div>
                <label style={labelStyle}>Referência / Grupo</label>
                <input style={inputClass()} value={form.group_reference ?? ''} onChange={(e) => set('group_reference', e.target.value.toUpperCase())} placeholder="Ex: FAMÍLIA SILVA, INDICADO POR JOÃO" />
              </div>
              <div>
                <label style={labelStyle}>Etapa Comercial</label>
                <select
                  style={{ ...inputClass(), cursor: 'pointer' }}
                  value={form.commercial_stage ?? 'CONTATO'}
                  onChange={(e) => set('commercial_stage', e.target.value as CommercialStage)}
                >
                  {COMMERCIAL_STAGES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: '#F0FDF4', borderRadius: 8, border: '1px solid #BBF7D0' }}>
                <input
                  id="eko7-check"
                  type="checkbox"
                  checked={!!form.eko7_presentation_at}
                  onChange={(e) => set('eko7_presentation_at', e.target.checked ? new Date().toISOString() : null)}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <label htmlFor="eko7-check" style={{ fontSize: 13, fontWeight: 600, color: '#065F46', cursor: 'pointer' }}>
                  EKO7 Apresentado
                  {form.eko7_presentation_at && (
                    <span style={{ fontSize: 11, fontWeight: 400, color: '#6B7280', marginLeft: 8 }}>
                      em {formatDate(form.eko7_presentation_at)}
                    </span>
                  )}
                </label>
              </div>
            </div>
          )}

          {/* ── Aba: Endereço ── */}
          {tab === 'contato' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>CEP</label>
                  <input style={inputClass()} value={form.cep ?? ''} onChange={(e) => set('cep', e.target.value)} placeholder="00000-000" />
                </div>
                <div>
                  <label style={labelStyle}>Estado (UF)</label>
                  <input style={inputClass()} value={form.address_state ?? ''} maxLength={2} onChange={(e) => set('address_state', e.target.value.toUpperCase())} placeholder="SP" />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Logradouro</label>
                <input style={inputClass()} value={form.address_street ?? ''} onChange={(e) => set('address_street', e.target.value.toUpperCase())} placeholder="RUA / AV / TRAVESSA..." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Número</label>
                  <input style={inputClass()} value={form.address_number ?? ''} onChange={(e) => set('address_number', e.target.value.toUpperCase())} placeholder="123" />
                </div>
                <div>
                  <label style={labelStyle}>Complemento</label>
                  <input style={inputClass()} value={form.address_complement ?? ''} onChange={(e) => set('address_complement', e.target.value.toUpperCase())} placeholder="APTO / BLOCO..." />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Bairro</label>
                <input style={inputClass()} value={form.address_district ?? ''} onChange={(e) => set('address_district', e.target.value.toUpperCase())} placeholder="BAIRRO" />
              </div>
              <div>
                <label style={labelStyle}>Cidade</label>
                <input style={inputClass()} value={form.address_city ?? ''} onChange={(e) => set('address_city', e.target.value.toUpperCase())} placeholder="CIDADE" />
              </div>
            </div>
          )}

          {/* ── Aba: Follow-up ── */}
          {tab === 'followup' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {client && (
                <div style={{ padding: '10px 14px', background: '#F0F7EE', borderRadius: 8, border: '1px solid #C8E6C0' }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#065F46' }}>Status atual</p>
                  <div style={{ marginTop: 6 }}>{statusBadge(client.client_status)}</div>
                  {client.last_contact_at && (
                    <p style={{ margin: '8px 0 0', fontSize: 11, color: '#6B7280' }}>
                      Último contato: {formatDate(client.last_contact_at)}
                    </p>
                  )}
                </div>
              )}
              <div>
                <label style={labelStyle}>Data do Próximo Follow-up</label>
                <input style={inputClass()} type="date" value={formatDateInput(form.next_followup_at)} onChange={(e) => set('next_followup_at', e.target.value || null)} />
              </div>
              <div>
                <label style={labelStyle}>Observação do Follow-up</label>
                <textarea
                  rows={4}
                  style={{ ...inputClass(), resize: 'vertical' as const }}
                  value={form.next_followup_note ?? ''}
                  onChange={(e) => set('next_followup_note', e.target.value.toUpperCase())}
                  placeholder="DESCREVA A AÇÃO PLANEJADA..."
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          borderTop: '1px solid #F3F4F6',
          padding: '14px 20px',
          display: 'flex',
          gap: 10,
          background: '#FAFAFA',
        }}>
          {client && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626',
                cursor: deleting ? 'not-allowed' : 'pointer',
              }}
            >
              {deleting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
              Excluir
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              border: '1px solid #D1D5DB', background: '#FFFFFF', color: '#374151', cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              border: 'none', background: BRAND_BLUE, color: '#FFFFFF', cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
            {client ? 'Salvar Alterações' : 'Criar Cliente'}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  )
}

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

  const openNew = () => { setSelectedClient(null); setDrawerOpen(true) }
  const openEdit = (c: BemAvivClient) => { setSelectedClient(c); setDrawerOpen(true) }
  const closeDrawer = () => setDrawerOpen(false)

  const handleSaved = (c: BemAvivClient) => {
    setClients((prev) => {
      const idx = prev.findIndex((p) => p.id === c.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = c; return next }
      return [c, ...prev]
    })
    setDrawerOpen(false)
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
      <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto', minHeight: '100vh' }}>
        {/* ── Page Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
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
          {/* Table Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1.5fr 40px',
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
          {!loading && filtered.map((c, i) => {
            const hasFollowup = !!c.next_followup_at
            const followupPast = hasFollowup && new Date(c.next_followup_at!) < new Date()
            return (
              <div
                key={c.id}
                onClick={() => openEdit(c)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1.5fr 40px',
                  padding: '12px 16px',
                  alignItems: 'center',
                  borderBottom: i < filtered.length - 1 ? '1px solid #F9FAFB' : 'none',
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
                  <p style={{ margin: 0, fontSize: 12, color: '#374151', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Phone size={11} color="#9CA3AF" />
                    {formatClientPhone(c) || '—'}
                  </p>
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

        {/* Count footer */}
        {!loading && filtered.length > 0 && (
          <p style={{ margin: '10px 0 0', fontSize: 11, color: '#9CA3AF', textAlign: 'right' }}>
            Exibindo {filtered.length} de {clients.length} clientes
          </p>
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
      />
    </>
  )
}
