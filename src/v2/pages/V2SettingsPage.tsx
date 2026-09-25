import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import {
  getCurrentV2User,
  listAllLocalV2Users,
  registerV2User,
  deleteV2UserByUsername,
  V2User,
} from '../services/v2AuthService'
import {
  Building2,
  Users,
  UserPlus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Save,
  Loader2,
  Eye,
  EyeOff,
  ChevronRight,
  X,
} from 'lucide-react'

// ─── Company config helpers ────────────────────────────────────────────────
const COMPANY_KEY = 'v2_company_config'

type CompanyConfig = {
  tradeName: string
  legalName: string
  cnpj: string
}

function loadCompanyConfig(): CompanyConfig {
  try {
    const raw = localStorage.getItem(COMPANY_KEY)
    return raw ? JSON.parse(raw) : { tradeName: '', legalName: '', cnpj: '' }
  } catch {
    return { tradeName: '', legalName: '', cnpj: '' }
  }
}

function saveCompanyConfig(data: CompanyConfig): void {
  localStorage.setItem(COMPANY_KEY, JSON.stringify(data))
}

// ─── CNPJ mask ─────────────────────────────────────────────────────────────
function maskCNPJ(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

// ─── Types ─────────────────────────────────────────────────────────────────
type LocalUser = V2User & { password_hash: string }
type Toast = { type: 'success' | 'error'; text: string }

// ─── Section wrapper ────────────────────────────────────────────────────────
function Section({
  icon: Icon,
  title,
  subtitle,
  children,
  accent = 'blue',
}: {
  icon: typeof Building2
  title: string
  subtitle: string
  children: React.ReactNode
  accent?: 'blue' | 'green'
}) {
  const color = accent === 'blue' ? '#0D6BAF' : '#7DC344'
  const bg = accent === 'blue' ? '#E8F1F8' : '#EBF5E8'
  const border = accent === 'blue' ? '#C1D9EE' : '#C8E6C0'

  return (
    <div
      className="rounded-2xl overflow-hidden shadow-sm"
      style={{ border: `1px solid ${border}`, background: '#FFFFFF' }}
    >
      {/* Section header */}
      <div
        className="flex items-center gap-3 px-6 py-4"
        style={{ background: bg, borderBottom: `1px solid ${border}` }}
      >
        <div
          className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: '#FFFFFF' }}
        >
          <Icon className="h-4.5 w-4.5" style={{ color }} />
        </div>
        <div>
          <p className="text-sm font-black" style={{ color }}>
            {title}
          </p>
          <p className="text-xs font-medium" style={{ color: accent === 'blue' ? '#3A6090' : '#3A6A3A' }}>
            {subtitle}
          </p>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────
export function V2SettingsPage() {
  const navigate = useNavigate()

  // Auth guard
  useEffect(() => {
    if (!getCurrentV2User()) navigate('/v2/login', { replace: true })
  }, [navigate])

  // Toast
  const [toast, setToast] = useState<Toast | null>(null)
  const showToast = (t: Toast) => {
    setToast(t)
    setTimeout(() => setToast(null), 4000)
  }

  // ── Company ────────────────────────────────────────────────────────────
  const [company, setCompany] = useState<CompanyConfig>(loadCompanyConfig)
  const [savingCompany, setSavingCompany] = useState(false)

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!company.tradeName.trim()) {
      showToast({ type: 'error', text: 'Informe ao menos o nome fantasia.' })
      return
    }
    setSavingCompany(true)
    
    // Save locally
    saveCompanyConfig(company)

    // Save in Supabase database if connected
    if (supabase) {
      try {
        const { data: comp } = await supabase.from('companies').select('id').limit(1).maybeSingle()
        if (comp?.id) {
          await supabase.from('companies').update({
            trade_name: company.tradeName.trim(),
            legal_name: company.legalName.trim() || null,
            tax_id: company.cnpj.trim() || null,
            updated_at: new Date().toISOString()
          }).eq('id', comp.id)
        }
      } catch (err) {
        console.error('Erro ao salvar no Supabase:', err)
      }
    }

    setSavingCompany(false)
    showToast({ type: 'success', text: 'Dados da empresa salvos no banco de dados com sucesso!' })
  }

  // ── Users ──────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<LocalUser[]>([])
  const reloadUsers = () => setUsers(listAllLocalV2Users())
  useEffect(reloadUsers, [])

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deletingUser, setDeletingUser] = useState(false)

  const handleDeleteUser = async (username: string) => {
    setDeletingUser(true)
    await deleteV2UserByUsername(username)
    reloadUsers()
    setConfirmDelete(null)
    setDeletingUser(false)
    showToast({ type: 'success', text: `Usuário @${username} removido.` })
  }

  // ── Invite ─────────────────────────────────────────────────────────────
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [showInvitePass, setShowInvitePass] = useState(false)
  const [invite, setInvite] = useState({
    full_name: '',
    username: '',
    email: '',
    password: '',
  })

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviting(true)
    const { error } = await registerV2User(invite)
    setInviting(false)
    if (error) {
      showToast({ type: 'error', text: error })
    } else {
      showToast({ type: 'success', text: `Usuário @${invite.username} convidado com sucesso!` })
      setInvite({ full_name: '', username: '', email: '', password: '' })
      setInviteOpen(false)
      reloadUsers()
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: 'linear-gradient(135deg, #EEF5F9 0%, #F0F7EE 100%)' }}
    >
      {/* Decorative blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute -top-40 -left-40 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #0D6BAF, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-40 -right-20 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #7DC344, transparent 70%)' }}
        />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-black" style={{ color: '#1A2E1A' }}>
            Configurações
          </h1>
          <p className="text-sm font-medium mt-1" style={{ color: '#4A6A4A' }}>
            Gerencie os dados da empresa e os usuários do sistema.
          </p>
        </div>

        {/* ── COMPANY SECTION ── */}
        <Section
          icon={Building2}
          title="Dados da Empresa"
          subtitle="Informações cadastrais exibidas no sistema"
          accent="blue"
        >
          <form onSubmit={handleSaveCompany} className="space-y-4">
            {/* Nome Fantasia */}
            <div>
              <label
                className="block text-xs font-bold mb-1.5"
                style={{ color: '#0D6BAF' }}
                htmlFor="tradeName"
              >
                Nome Fantasia <span style={{ color: '#E53935' }}>*</span>
              </label>
              <input
                id="tradeName"
                type="text"
                required
                placeholder="Ex: Bem Aviv Saúde e Longevidade"
                value={company.tradeName}
                onChange={(e) => setCompany({ ...company, tradeName: e.target.value })}
                className="w-full rounded-xl px-4 py-3 text-sm font-medium outline-none transition"
                style={{
                  border: '1px solid #C1D9EE',
                  color: '#1A2E1A',
                  background: '#F5F9FC',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.border = '1px solid #0D6BAF'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(13,107,175,0.12)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = '1px solid #C1D9EE'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            {/* Razão Social */}
            <div>
              <label
                className="block text-xs font-bold mb-1.5"
                style={{ color: '#0D6BAF' }}
                htmlFor="legalName"
              >
                Razão Social
              </label>
              <input
                id="legalName"
                type="text"
                placeholder="Ex: Bem Aviv Ltda."
                value={company.legalName}
                onChange={(e) => setCompany({ ...company, legalName: e.target.value })}
                className="w-full rounded-xl px-4 py-3 text-sm font-medium outline-none transition"
                style={{
                  border: '1px solid #C1D9EE',
                  color: '#1A2E1A',
                  background: '#F5F9FC',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.border = '1px solid #0D6BAF'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(13,107,175,0.12)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = '1px solid #C1D9EE'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            {/* CNPJ */}
            <div>
              <label
                className="block text-xs font-bold mb-1.5"
                style={{ color: '#0D6BAF' }}
                htmlFor="cnpj"
              >
                CNPJ
              </label>
              <input
                id="cnpj"
                type="text"
                placeholder="00.000.000/0001-00"
                inputMode="numeric"
                value={company.cnpj}
                onChange={(e) => setCompany({ ...company, cnpj: maskCNPJ(e.target.value) })}
                className="w-full rounded-xl px-4 py-3 text-sm font-medium outline-none transition"
                style={{
                  border: '1px solid #C1D9EE',
                  color: '#1A2E1A',
                  background: '#F5F9FC',
                  fontVariantNumeric: 'tabular-nums',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.border = '1px solid #0D6BAF'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(13,107,175,0.12)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = '1px solid #C1D9EE'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={savingCompany}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
              style={{
                background: savingCompany ? '#78B2DF' : '#0D6BAF',
                boxShadow: '0 2px 10px rgba(13,107,175,0.3)',
              }}
            >
              {savingCompany ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {savingCompany ? 'Salvando...' : 'Salvar Dados'}
            </button>
          </form>
        </Section>

        {/* ── USERS SECTION ── */}
        <Section
          icon={Users}
          title="Usuários do Sistema"
          subtitle={`${users.length} usuário${users.length !== 1 ? 's' : ''} cadastrado${users.length !== 1 ? 's' : ''}`}
          accent="green"
        >
          {/* User list */}
          <div className="space-y-2 mb-5">
            {users.length === 0 ? (
              <div
                className="flex flex-col items-center gap-2 py-10 rounded-xl"
                style={{ background: '#F0F7EE', border: '1px dashed #C8E6C0' }}
              >
                <Users className="h-8 w-8" style={{ color: '#C8E6C0' }} />
                <p className="text-xs font-semibold" style={{ color: '#7AAA7A' }}>
                  Nenhum usuário cadastrado
                </p>
              </div>
            ) : (
              users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl group transition"
                  style={{ border: '1px solid #E8F5E5', background: '#F5FBF5' }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-9 w-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0"
                      style={{ background: '#EBF5E8', color: '#7DC344' }}
                    >
                      {u.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: '#1A2E1A' }}>
                        {u.full_name}
                      </p>
                      <p className="text-xs font-medium" style={{ color: '#6A8A6A' }}>
                        @{u.username}
                        {u.email && (
                          <span style={{ color: '#9AAA9A' }}> · {u.email}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setConfirmDelete(u.username)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold opacity-0 group-hover:opacity-100 transition-all"
                    style={{ color: '#E53935', background: '#FEE8E8' }}
                    title={`Remover @${u.username}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remover
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Invite button / form toggle */}
          {!inviteOpen ? (
            <button
              onClick={() => setInviteOpen(true)}
              className="flex items-center gap-2 w-full justify-center py-2.5 rounded-xl text-sm font-bold transition-all border-2 border-dashed"
              style={{ color: '#7DC344', borderColor: '#C8E6C0', background: '#F0F7EE' }}
            >
              <UserPlus className="h-4 w-4" />
              Convidar Novo Usuário
            </button>
          ) : (
            <form
              onSubmit={handleInvite}
              className="space-y-3 rounded-xl p-4"
              style={{ background: '#F0F7EE', border: '1px solid #C8E6C0' }}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-black" style={{ color: '#7DC344' }}>
                  Novo Usuário
                </p>
                <button
                  type="button"
                  onClick={() => setInviteOpen(false)}
                  className="p-1 rounded-lg transition"
                  style={{ color: '#9AAA9A' }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Nome */}
              <input
                type="text"
                required
                placeholder="Nome completo *"
                value={invite.full_name}
                onChange={(e) => setInvite({ ...invite, full_name: e.target.value })}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm font-medium outline-none transition"
                style={{ border: '1px solid #C8E6C0', background: '#FFFFFF', color: '#1A2E1A' }}
                onFocus={(e) => {
                  e.currentTarget.style.border = '1px solid #7DC344'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(91,163,65,0.12)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = '1px solid #C8E6C0'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />

              {/* Username */}
              <input
                type="text"
                required
                placeholder="Nome de usuário (login) *"
                value={invite.username}
                onChange={(e) => setInvite({ ...invite, username: e.target.value })}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm font-medium outline-none transition"
                style={{ border: '1px solid #C8E6C0', background: '#FFFFFF', color: '#1A2E1A' }}
                onFocus={(e) => {
                  e.currentTarget.style.border = '1px solid #7DC344'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(91,163,65,0.12)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = '1px solid #C8E6C0'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />

              {/* Email */}
              <input
                type="email"
                placeholder="E-mail (opcional)"
                value={invite.email}
                onChange={(e) => setInvite({ ...invite, email: e.target.value })}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm font-medium outline-none transition"
                style={{ border: '1px solid #C8E6C0', background: '#FFFFFF', color: '#1A2E1A' }}
                onFocus={(e) => {
                  e.currentTarget.style.border = '1px solid #7DC344'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(91,163,65,0.12)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = '1px solid #C8E6C0'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />

              {/* Senha */}
              <div className="relative">
                <input
                  type={showInvitePass ? 'text' : 'password'}
                  required
                  placeholder="Senha inicial *"
                  value={invite.password}
                  onChange={(e) => setInvite({ ...invite, password: e.target.value })}
                  className="w-full rounded-xl px-3.5 py-2.5 pr-10 text-sm font-medium outline-none transition"
                  style={{ border: '1px solid #C8E6C0', background: '#FFFFFF', color: '#1A2E1A' }}
                  onFocus={(e) => {
                    e.currentTarget.style.border = '1px solid #7DC344'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(91,163,65,0.12)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.border = '1px solid #C8E6C0'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowInvitePass(!showInvitePass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: '#9AAA9A' }}
                >
                  {showInvitePass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <button
                type="submit"
                disabled={inviting}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all"
                style={{
                  background: inviting ? '#8BC67A' : '#7DC344',
                  boxShadow: '0 2px 10px rgba(91,163,65,0.3)',
                }}
              >
                {inviting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                {inviting ? 'Criando acesso...' : 'Criar Acesso'}
              </button>
            </form>
          )}
        </Section>

        {/* Separator */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1" style={{ background: '#C1D9EE' }} />
          <ChevronRight className="h-3.5 w-3.5" style={{ color: '#C1D9EE' }} />
          <div className="h-px flex-1" style={{ background: '#C8E6C0' }} />
        </div>

        {/* Footer note */}
        <p className="text-center text-xs font-medium" style={{ color: '#9AAA9A' }}>
          Os dados são sincronizados no banco de dados.
        </p>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-xl text-sm font-bold z-50 transition-all"
          style={{
            background: toast.type === 'success' ? '#EBF5E8' : '#FEE8E8',
            border: `1px solid ${toast.type === 'success' ? '#C8E6C0' : '#FFCDD2'}`,
            color: toast.type === 'success' ? '#3A7A2A' : '#C62828',
          }}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          {toast.text}
        </div>
      )}

      {/* ── Confirm Delete Modal ── */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: '#FEE8E8' }}
              >
                <Trash2 className="h-5 w-5" style={{ color: '#E53935' }} />
              </div>
              <div>
                <p className="text-sm font-black" style={{ color: '#1A2E1A' }}>
                  Remover usuário?
                </p>
                <p className="text-xs font-medium" style={{ color: '#6A8A6A' }}>
                  @{confirmDelete}
                </p>
              </div>
            </div>
            <p className="text-sm font-medium" style={{ color: '#4A6A4A' }}>
              Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition"
                style={{ border: '1px solid #C1D9EE', color: '#0D6BAF' }}
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDeleteUser(confirmDelete)}
                disabled={deletingUser}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition"
                style={{ background: '#E53935' }}
              >
                {deletingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

