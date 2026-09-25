import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import {
  getCurrentV2User,
  listAllLocalV2Users,
  registerV2User,
  deleteV2UserByUsername,
  V2User,
} from '../services/v2AuthService'
import {
  listFornecedores,
  saveFornecedor,
  deleteFornecedor,
  Fornecedor,
  listRepresentantes,
  saveRepresentante,
  deleteRepresentante,
  Representante,
  RepresentanteRole,
  listFormasPagamento,
  saveFormaPagamento,
  deleteFormaPagamento,
  FormaPagamento,
} from '../services/v2SettingsService'
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
  X,
  Truck,
  Briefcase,
  CreditCard,
  Plus,
  Search,
  Edit2,
  Percent,
  ToggleLeft,
  ToggleRight,
  Tag,
} from 'lucide-react'

// ─── Company config helpers ────────────────────────────────────────────────
const COMPANY_KEY = 'v2_company_config'

type CompanyConfig = {
  tradeName: string
  legalName: string
  cnpj: string
  stateRegistration: string
  phone: string
  emailContact: string
  addressStreet: string
  addressCity: string
  addressState: string
  zipCode: string
  companyKind: 'DISTRIBUIDOR' | 'REPRESENTANTE'
}

function loadCompanyConfig(): CompanyConfig {
  try {
    const raw = localStorage.getItem(COMPANY_KEY)
    return raw
      ? JSON.parse(raw)
      : {
          tradeName: 'BEM AVIV SAÚDE E LONGEVIDADE',
          legalName: 'BEM AVIV SAÚDE E LONGEVIDADE LTDA',
          cnpj: '49.969.462/0001-03',
          stateRegistration: '',
          phone: '(11) 99999-8888',
          emailContact: 'contato@bemaviv.com.br',
          addressStreet: 'Av. Paulista, 1000',
          addressCity: 'São Paulo',
          addressState: 'SP',
          zipCode: '01310-100',
          companyKind: 'DISTRIBUIDOR',
        }
  } catch {
    return {
      tradeName: 'BEM AVIV SAÚDE E LONGEVIDADE',
      legalName: 'BEM AVIV SAÚDE E LONGEVIDADE LTDA',
      cnpj: '49.969.462/0001-03',
      stateRegistration: '',
      phone: '',
      emailContact: '',
      addressStreet: '',
      addressCity: '',
      addressState: '',
      zipCode: '',
      companyKind: 'DISTRIBUIDOR',
    }
  }
}

function saveCompanyConfig(data: CompanyConfig): void {
  localStorage.setItem(COMPANY_KEY, JSON.stringify(data))
}

function maskCNPJ(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

function maskCPFCNPJ(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length <= 11) {
    return digits
      .slice(0, 11)
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return maskCNPJ(digits)
}

function maskPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return d
}

// ─── Types ─────────────────────────────────────────────────────────────────
type LocalUser = V2User & { password_hash: string }
type Toast = { type: 'success' | 'error'; text: string }
type SettingsTab = 'empresa' | 'fornecedor' | 'representante' | 'formas_pagamento'

// ─── Section Wrapper ────────────────────────────────────────────────────────
function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children,
  accent = 'blue',
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  title: string
  subtitle: string
  children: React.ReactNode
  accent?: 'blue' | 'green' | 'amber' | 'purple'
}) {
  const accentColors = {
    blue: { color: '#0D6BAF', bg: '#E8F1F8', border: '#C1D9EE' },
    green: { color: '#7DC344', bg: '#EBF5E8', border: '#C8E6C0' },
    amber: { color: '#D97706', bg: '#FEF3C7', border: '#FDE68A' },
    purple: { color: '#7C3AED', bg: '#F3E8FF', border: '#DDD6FE' },
  }
  const { color, bg, border } = accentColors[accent]

  return (
    <div
      className="rounded-2xl overflow-hidden shadow-sm transition-all"
      style={{ border: `1px solid ${border}`, background: '#FFFFFF' }}
    >
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ background: bg, borderBottom: `1px solid ${border}` }}
      >
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
            style={{ background: '#FFFFFF' }}
          >
            <Icon className="h-5 w-5" style={{ color }} />
          </div>
          <div>
            <h2 className="text-base font-black tracking-tight" style={{ color }}>
              {title}
            </h2>
            <p className="text-xs font-medium" style={{ color: '#4B5563' }}>
              {subtitle}
            </p>
          </div>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────
export function V2SettingsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const currentTab = (searchParams.get('tab') as SettingsTab) || 'empresa'
  const setTab = (tab: SettingsTab) => {
    setSearchParams({ tab })
  }

  // Auth guard
  useEffect(() => {
    if (!getCurrentV2User()) navigate('/v2/login', { replace: true })
  }, [navigate])

  // Toast state
  const [toast, setToast] = useState<Toast | null>(null)
  const showToast = (t: Toast) => {
    setToast(t)
    setTimeout(() => setToast(null), 4000)
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 1. EMPRESA STATE
  // ──────────────────────────────────────────────────────────────────────────
  const [company, setCompany] = useState<CompanyConfig>(loadCompanyConfig)
  const [savingCompany, setSavingCompany] = useState(false)

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!company.tradeName.trim()) {
      showToast({ type: 'error', text: 'Informe ao menos o nome fantasia.' })
      return
    }
    setSavingCompany(true)

    saveCompanyConfig(company)

    if (supabase) {
      try {
        const { data: comp } = await supabase.from('companies').select('id').limit(1).maybeSingle()
        if (comp?.id) {
          await supabase.from('companies').update({
            trade_name: company.tradeName.trim(),
            legal_name: company.legalName.trim() || null,
            tax_id: company.cnpj.trim() || null,
            phone: company.phone.trim() || null,
            email_contact: company.emailContact.trim() || null,
            address_street: company.addressStreet.trim() || null,
            address_city: company.addressCity.trim() || null,
            address_state: company.addressState.trim() || null,
            zip_code: company.zipCode.trim() || null,
            company_kind: company.companyKind,
            updated_at: new Date().toISOString(),
          }).eq('id', comp.id)
        }
      } catch (err) {
        console.error('Erro ao salvar no Supabase:', err)
      }
    }

    setSavingCompany(false)
    showToast({ type: 'success', text: 'Dados da empresa salvos com sucesso!' })
  }

  // Users state
  const [users, setUsers] = useState<LocalUser[]>([])
  const reloadUsers = () => setUsers(listAllLocalV2Users())
  useEffect(reloadUsers, [])

  const [confirmDeleteUser, setConfirmDeleteUser] = useState<string | null>(null)
  const [deletingUser, setDeletingUser] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [showInvitePass, setShowInvitePass] = useState(false)
  const [invite, setInvite] = useState({ full_name: '', username: '', email: '', password: '' })

  const handleDeleteUser = async (username: string) => {
    setDeletingUser(true)
    await deleteV2UserByUsername(username)
    reloadUsers()
    setConfirmDeleteUser(null)
    setDeletingUser(false)
    showToast({ type: 'success', text: `Usuário @${username} removido.` })
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviting(true)
    const { error } = await registerV2User(invite)
    setInviting(false)
    if (error) {
      showToast({ type: 'error', text: error })
    } else {
      showToast({ type: 'success', text: `Usuário @${invite.username} cadastrado com sucesso!` })
      setInvite({ full_name: '', username: '', email: '', password: '' })
      setInviteOpen(false)
      reloadUsers()
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. FORNECEDOR STATE
  // ──────────────────────────────────────────────────────────────────────────
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [loadingForn, setLoadingForn] = useState(false)
  const [searchForn, setSearchForn] = useState('')
  const [modalFornOpen, setModalFornOpen] = useState(false)
  const [editingForn, setEditingForn] = useState<Fornecedor | null>(null)
  const [savingForn, setSavingForn] = useState(false)

  const [fornForm, setFornForm] = useState({
    trade_name: '',
    legal_name: '',
    cnpj: '',
    state_registration: '',
    contact_name: '',
    phone: '',
    email: '',
    category: '',
    address_city: '',
    notes: '',
    active: true,
  })

  const loadFornData = async () => {
    setLoadingForn(true)
    const data = await listFornecedores()
    setFornecedores(data)
    setLoadingForn(false)
  }

  useEffect(() => {
    if (currentTab === 'fornecedor') {
      loadFornData()
    }
  }, [currentTab])

  const openNewFornModal = () => {
    setEditingForn(null)
    setFornForm({
      trade_name: '',
      legal_name: '',
      cnpj: '',
      state_registration: '',
      contact_name: '',
      phone: '',
      email: '',
      category: 'Colchões e Acessórios',
      address_city: '',
      notes: '',
      active: true,
    })
    setModalFornOpen(true)
  }

  const openEditFornModal = (item: Fornecedor) => {
    setEditingForn(item)
    setFornForm({
      trade_name: item.trade_name || '',
      legal_name: item.legal_name || '',
      cnpj: item.cnpj || '',
      state_registration: item.state_registration || '',
      contact_name: item.contact_name || '',
      phone: item.phone || '',
      email: item.email || '',
      category: item.category || '',
      address_city: item.address_city || '',
      notes: item.notes || '',
      active: item.active,
    })
    setModalFornOpen(true)
  }

  const handleSaveFornecedor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fornForm.trade_name.trim()) {
      showToast({ type: 'error', text: 'Informe o Nome Fantasia do fornecedor.' })
      return
    }
    setSavingForn(true)
    await saveFornecedor({
      ...(editingForn ? { id: editingForn.id } : {}),
      ...fornForm,
    })
    setSavingForn(false)
    setModalFornOpen(false)
    await loadFornData()
    showToast({
      type: 'success',
      text: editingForn ? 'Fornecedor atualizado com sucesso!' : 'Fornecedor cadastrado com sucesso!',
    })
  }

  const handleToggleActiveForn = async (item: Fornecedor) => {
    await saveFornecedor({ ...item, active: !item.active })
    await loadFornData()
    showToast({
      type: 'success',
      text: `Fornecedor ${!item.active ? 'ativado' : 'desativado'} com sucesso!`,
    })
  }

  const handleDeleteForn = async (id: string) => {
    if (window.confirm('Tem certeza que deseja remover este fornecedor?')) {
      await deleteFornecedor(id)
      await loadFornData()
      showToast({ type: 'success', text: 'Fornecedor removido.' })
    }
  }

  const filteredFornecedores = fornecedores.filter((f) => {
    const q = searchForn.toLowerCase()
    return (
      f.trade_name.toLowerCase().includes(q) ||
      (f.cnpj && f.cnpj.includes(q)) ||
      (f.contact_name && f.contact_name.toLowerCase().includes(q)) ||
      (f.category && f.category.toLowerCase().includes(q))
    )
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 3. REPRESENTANTE STATE
  // ──────────────────────────────────────────────────────────────────────────
  const [representantes, setRepresentantes] = useState<Representante[]>([])
  const [loadingRep, setLoadingRep] = useState(false)
  const [searchRep, setSearchRep] = useState('')
  const [modalRepOpen, setModalRepOpen] = useState(false)
  const [editingRep, setEditingRep] = useState<Representante | null>(null)
  const [savingRep, setSavingRep] = useState(false)

  const [repForm, setRepForm] = useState<{
    code: string
    name: string
    role: RepresentanteRole
    cpf_cnpj: string
    commission_rate: number
    phone: string
    email: string
    region: string
    active: boolean
  }>({
    code: '',
    name: '',
    role: 'REPRESENTANTE',
    cpf_cnpj: '',
    commission_rate: 5.0,
    phone: '',
    email: '',
    region: '',
    active: true,
  })

  const loadRepData = async () => {
    setLoadingRep(true)
    const data = await listRepresentantes()
    setRepresentantes(data)
    setLoadingRep(false)
  }

  useEffect(() => {
    if (currentTab === 'representante') {
      loadRepData()
    }
  }, [currentTab])

  const openNewRepModal = () => {
    setEditingRep(null)
    const nextNum = representantes.length + 1
    const codeStr = `REP-${String(nextNum).padStart(3, '0')}`
    setRepForm({
      code: codeStr,
      name: '',
      role: 'REPRESENTANTE',
      cpf_cnpj: '',
      commission_rate: 5.0,
      phone: '',
      email: '',
      region: 'São Paulo - SP',
      active: true,
    })
    setModalRepOpen(true)
  }

  const openEditRepModal = (item: Representante) => {
    setEditingRep(item)
    setRepForm({
      code: item.code || '',
      name: item.name || '',
      role: item.role || 'REPRESENTANTE',
      cpf_cnpj: item.cpf_cnpj || '',
      commission_rate: item.commission_rate ?? 5.0,
      phone: item.phone || '',
      email: item.email || '',
      region: item.region || '',
      active: item.active,
    })
    setModalRepOpen(true)
  }

  const handleSaveRepresentante = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!repForm.name.trim()) {
      showToast({ type: 'error', text: 'Informe o nome do representante.' })
      return
    }
    setSavingRep(true)
    await saveRepresentante({
      ...(editingRep ? { id: editingRep.id } : {}),
      ...repForm,
    })
    setSavingRep(false)
    setModalRepOpen(false)
    await loadRepData()
    showToast({
      type: 'success',
      text: editingRep ? 'Cadastro atualizado com sucesso!' : 'Cadastro efetuado com sucesso!',
    })
  }

  const handleToggleActiveRep = async (item: Representante) => {
    await saveRepresentante({ ...item, active: !item.active })
    await loadRepData()
    showToast({
      type: 'success',
      text: `Cadastro ${!item.active ? 'ativado' : 'desativado'} com sucesso!`,
    })
  }

  const handleDeleteRep = async (id: string) => {
    if (window.confirm('Tem certeza que deseja remover este cadastro?')) {
      await deleteRepresentante(id)
      await loadRepData()
      showToast({ type: 'success', text: 'Cadastro removido.' })
    }
  }

  const filteredRepresentantes = representantes.filter((r) => {
    const q = searchRep.toLowerCase()
    return (
      r.name.toLowerCase().includes(q) ||
      (r.code && r.code.toLowerCase().includes(q)) ||
      (r.cpf_cnpj && r.cpf_cnpj.includes(q)) ||
      (r.region && r.region.toLowerCase().includes(q)) ||
      (r.role && r.role.toLowerCase().includes(q))
    )
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 4. FORMAS DE PAGAMENTO STATE
  // ──────────────────────────────────────────────────────────────────────────
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([])
  const [loadingPay, setLoadingPay] = useState(false)
  const [searchPay, setSearchPay] = useState('')
  const [modalPayOpen, setModalPayOpen] = useState(false)
  const [editingPay, setEditingPay] = useState<FormaPagamento | null>(null)
  const [savingPay, setSavingPay] = useState(false)

  const [payForm, setPayForm] = useState<{
    name: string
    category: FormaPagamento['category']
    max_installments: number
    fee_percentage: number
    days_to_receive: number
    active: boolean
  }>({
    name: '',
    category: 'PIX',
    max_installments: 1,
    fee_percentage: 0.0,
    days_to_receive: 0,
    active: true,
  })

  const loadPayData = async () => {
    setLoadingPay(true)
    const data = await listFormasPagamento()
    setFormasPagamento(data)
    setLoadingPay(false)
  }

  useEffect(() => {
    if (currentTab === 'formas_pagamento') {
      loadPayData()
    }
  }, [currentTab])

  const openNewPayModal = () => {
    setEditingPay(null)
    setPayForm({
      name: '',
      category: 'PIX',
      max_installments: 1,
      fee_percentage: 0.0,
      days_to_receive: 0,
      active: true,
    })
    setModalPayOpen(true)
  }

  const openEditPayModal = (item: FormaPagamento) => {
    setEditingPay(item)
    setPayForm({
      name: item.name,
      category: item.category,
      max_installments: item.max_installments,
      fee_percentage: item.fee_percentage,
      days_to_receive: item.days_to_receive,
      active: item.active,
    })
    setModalPayOpen(true)
  }

  const handleSaveFormaPagamento = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!payForm.name.trim()) {
      showToast({ type: 'error', text: 'Informe o nome da forma de pagamento.' })
      return
    }
    setSavingPay(true)
    await saveFormaPagamento({
      ...(editingPay ? { id: editingPay.id } : {}),
      ...payForm,
    })
    setSavingPay(false)
    setModalPayOpen(false)
    await loadPayData()
    showToast({
      type: 'success',
      text: editingPay ? 'Forma de pagamento atualizada!' : 'Forma de pagamento cadastrada!',
    })
  }

  const handleToggleActivePay = async (item: FormaPagamento) => {
    await saveFormaPagamento({ ...item, active: !item.active })
    await loadPayData()
    showToast({
      type: 'success',
      text: `Forma de pagamento ${!item.active ? 'ativada' : 'desativada'}!`,
    })
  }

  const handleDeletePay = async (id: string) => {
    if (window.confirm('Tem certeza que deseja remover esta forma de pagamento?')) {
      await deleteFormaPagamento(id)
      await loadPayData()
      showToast({ type: 'success', text: 'Forma de pagamento removida.' })
    }
  }

  const filteredFormas = formasPagamento.filter((p) => {
    const q = searchPay.toLowerCase()
    return p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
  })

  // ──────────────────────────────────────────────────────────────────────────
  // RENDER TABS LIST
  // ──────────────────────────────────────────────────────────────────────────
  const tabsList = [
    { id: 'empresa' as const, label: 'EMPRESA', icon: Building2, desc: 'Dados cadastrais & equipe' },
    { id: 'fornecedor' as const, label: 'FORNECEDOR', icon: Truck, desc: 'Gestão de fornecedores' },
    { id: 'representante' as const, label: 'REPRESENTANTE', icon: Briefcase, desc: 'Distribuidores & Representantes' },
    { id: 'formas_pagamento' as const, label: 'FORMAS DE PAGAMENTO', icon: CreditCard, desc: 'Condições & taxas' },
  ]

  return (
    <div
      className="min-h-screen font-sans pb-16"
      style={{ background: 'linear-gradient(135deg, #EEF5F9 0%, #F0F7EE 100%)' }}
    >
      {/* Background blobs */}
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

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Title Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight" style={{ color: '#1A2E1A' }}>
              Configurações do Sistema
            </h1>
            <p className="text-sm font-medium mt-1" style={{ color: '#4A6A4A' }}>
              Gerencie cadastros fundamentais da empresa, parceiros e parâmetros comerciais.
            </p>
          </div>
        </div>

        {/* ── TOP NAV BAR (4 OPTIONS) ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {tabsList.map((tab) => {
            const Icon = tab.icon
            const isActive = currentTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                className="flex items-center gap-3 p-4 rounded-2xl text-left transition-all relative overflow-hidden group shadow-xs"
                style={{
                  background: isActive ? '#0D6BAF' : '#FFFFFF',
                  color: isActive ? '#FFFFFF' : '#1A2E1A',
                  border: isActive ? '2px solid #0D6BAF' : '1px solid #C1D9EE',
                  boxShadow: isActive ? '0 10px 25px -5px rgba(13, 107, 175, 0.3)' : 'none',
                }}
              >
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
                  style={{
                    background: isActive ? 'rgba(255, 255, 255, 0.2)' : '#E8F1F8',
                    color: isActive ? '#FFFFFF' : '#0D6BAF',
                  }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black tracking-wider uppercase truncate">{tab.label}</p>
                  <p
                    className="text-[11px] font-medium truncate mt-0.5"
                    style={{ color: isActive ? 'rgba(255,255,255,0.8)' : '#6B7280' }}
                  >
                    {tab.desc}
                  </p>
                </div>
                {isActive && (
                  <div className="h-2 w-2 rounded-full bg-emerald-400 absolute top-3 right-3 shadow-sm" />
                )}
              </button>
            )
          })}
        </div>

        {/* ────────────────────────────────────────────────────────────────── */}
        {/* TAB 1: EMPRESA */}
        {/* ────────────────────────────────────────────────────────────────── */}
        {currentTab === 'empresa' && (
          <div className="space-y-6">
            <SectionCard
              icon={Building2}
              title="Dados Cadastrais da Empresa"
              subtitle="Informações oficiais exibidas em relatórios e impressões"
              accent="blue"
            >
              <form onSubmit={handleSaveCompany} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Nome Fantasia */}
                  <div>
                    <label className="block text-xs font-bold mb-1.5" style={{ color: '#0D6BAF' }}>
                      Nome Fantasia <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Bem Aviv Saúde e Longevidade"
                      value={company.tradeName}
                      onChange={(e) => setCompany({ ...company, tradeName: e.target.value })}
                      className="w-full rounded-xl px-4 py-2.5 text-sm font-medium outline-none transition"
                      style={{ border: '1px solid #C1D9EE', background: '#F5F9FC', color: '#1A2E1A' }}
                    />
                  </div>

                  {/* Razão Social */}
                  <div>
                    <label className="block text-xs font-bold mb-1.5" style={{ color: '#0D6BAF' }}>
                      Razão Social
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Bem Aviv Ltda."
                      value={company.legalName}
                      onChange={(e) => setCompany({ ...company, legalName: e.target.value })}
                      className="w-full rounded-xl px-4 py-2.5 text-sm font-medium outline-none transition"
                      style={{ border: '1px solid #C1D9EE', background: '#F5F9FC', color: '#1A2E1A' }}
                    />
                  </div>

                  {/* CNPJ */}
                  <div>
                    <label className="block text-xs font-bold mb-1.5" style={{ color: '#0D6BAF' }}>
                      CNPJ / Documento
                    </label>
                    <input
                      type="text"
                      placeholder="00.000.000/0001-00"
                      value={company.cnpj}
                      onChange={(e) => setCompany({ ...company, cnpj: maskCNPJ(e.target.value) })}
                      className="w-full rounded-xl px-4 py-2.5 text-sm font-medium outline-none transition"
                      style={{ border: '1px solid #C1D9EE', background: '#F5F9FC', color: '#1A2E1A' }}
                    />
                  </div>

                  {/* Inscrição Estadual */}
                  <div>
                    <label className="block text-xs font-bold mb-1.5" style={{ color: '#0D6BAF' }}>
                      Inscrição Estadual (I.E.)
                    </label>
                    <input
                      type="text"
                      placeholder="Isento ou nº da Inscrição"
                      value={company.stateRegistration}
                      onChange={(e) => setCompany({ ...company, stateRegistration: e.target.value })}
                      className="w-full rounded-xl px-4 py-2.5 text-sm font-medium outline-none transition"
                      style={{ border: '1px solid #C1D9EE', background: '#F5F9FC', color: '#1A2E1A' }}
                    />
                  </div>

                  {/* Telefone */}
                  <div>
                    <label className="block text-xs font-bold mb-1.5" style={{ color: '#0D6BAF' }}>
                      Telefone / WhatsApp
                    </label>
                    <input
                      type="text"
                      placeholder="(00) 00000-0000"
                      value={company.phone}
                      onChange={(e) => setCompany({ ...company, phone: maskPhone(e.target.value) })}
                      className="w-full rounded-xl px-4 py-2.5 text-sm font-medium outline-none transition"
                      style={{ border: '1px solid #C1D9EE', background: '#F5F9FC', color: '#1A2E1A' }}
                    />
                  </div>

                  {/* E-mail */}
                  <div>
                    <label className="block text-xs font-bold mb-1.5" style={{ color: '#0D6BAF' }}>
                      E-mail de Contato
                    </label>
                    <input
                      type="email"
                      placeholder="contato@empresa.com.br"
                      value={company.emailContact}
                      onChange={(e) => setCompany({ ...company, emailContact: e.target.value })}
                      className="w-full rounded-xl px-4 py-2.5 text-sm font-medium outline-none transition"
                      style={{ border: '1px solid #C1D9EE', background: '#F5F9FC', color: '#1A2E1A' }}
                    />
                  </div>

                  {/* Endereço */}
                  <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold mb-1.5" style={{ color: '#0D6BAF' }}>
                        Logradouro / Endereço
                      </label>
                      <input
                        type="text"
                        placeholder="Rua, Av, Número, Bairro"
                        value={company.addressStreet}
                        onChange={(e) => setCompany({ ...company, addressStreet: e.target.value })}
                        className="w-full rounded-xl px-4 py-2.5 text-sm font-medium outline-none transition"
                        style={{ border: '1px solid #C1D9EE', background: '#F5F9FC', color: '#1A2E1A' }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1.5" style={{ color: '#0D6BAF' }}>
                        Cidade / UF
                      </label>
                      <input
                        type="text"
                        placeholder="São Paulo - SP"
                        value={company.addressCity}
                        onChange={(e) => setCompany({ ...company, addressCity: e.target.value })}
                        className="w-full rounded-xl px-4 py-2.5 text-sm font-medium outline-none transition"
                        style={{ border: '1px solid #C1D9EE', background: '#F5F9FC', color: '#1A2E1A' }}
                      />
                    </div>
                  </div>

                  {/* Tipo Canal EKO'7 */}
                  <div className="md:col-span-2 bg-blue-50/50 p-4 rounded-xl border border-blue-100 space-y-2">
                    <label className="block text-xs font-bold" style={{ color: '#0D6BAF' }}>
                      Tipo de Atuação Comercial no Canal EKO'7
                    </label>
                    <div className="flex gap-6">
                      <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-800">
                        <input
                          type="radio"
                          name="companyKind"
                          checked={company.companyKind === 'DISTRIBUIDOR'}
                          onChange={() => setCompany({ ...company, companyKind: 'DISTRIBUIDOR' })}
                          className="accent-[#0D6BAF]"
                        />
                        DISTRIBUIDOR (Vendas diretas & Estoque)
                      </label>
                      <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-800">
                        <input
                          type="radio"
                          name="companyKind"
                          checked={company.companyKind === 'REPRESENTANTE'}
                          onChange={() => setCompany({ ...company, companyKind: 'REPRESENTANTE' })}
                          className="accent-[#0D6BAF]"
                        />
                        REPRESENTANTE (Comissionamento & Intermediação)
                      </label>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={savingCompany}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all shadow-md"
                    style={{ background: savingCompany ? '#78B2DF' : '#0D6BAF' }}
                  >
                    {savingCompany ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {savingCompany ? 'Salvando...' : 'Salvar Dados da Empresa'}
                  </button>
                </div>
              </form>
            </SectionCard>

            {/* Users list inside Empresa tab */}
            <SectionCard
              icon={Users}
              title="Usuários & Acessos do Sistema"
              subtitle={`${users.length} usuário(s) com permissão de acesso ao sistema`}
              accent="green"
            >
              <div className="space-y-3 mb-5">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition"
                    style={{ border: '1px solid #E8F5E5', background: '#F5FBF5' }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-10 w-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0"
                        style={{ background: '#EBF5E8', color: '#7DC344' }}
                      >
                        {u.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate" style={{ color: '#1A2E1A' }}>
                          {u.full_name}
                        </p>
                        <p className="text-xs font-medium" style={{ color: '#6A8A6A' }}>
                          @{u.username} {u.email && <span>· {u.email}</span>}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setConfirmDeleteUser(u.username)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition"
                      style={{ color: '#E53935', background: '#FEE8E8' }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remover
                    </button>
                  </div>
                ))}
              </div>

              {!inviteOpen ? (
                <button
                  onClick={() => setInviteOpen(true)}
                  className="flex items-center gap-2 w-full justify-center py-3 rounded-xl text-sm font-bold transition-all border-2 border-dashed"
                  style={{ color: '#7DC344', borderColor: '#C8E6C0', background: '#F0F7EE' }}
                >
                  <UserPlus className="h-4 w-4" />
                  Convidar / Cadastrar Novo Usuário
                </button>
              ) : (
                <form
                  onSubmit={handleInvite}
                  className="space-y-3 rounded-xl p-5"
                  style={{ background: '#F0F7EE', border: '1px solid #C8E6C0' }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-black uppercase tracking-wider" style={{ color: '#7DC344' }}>
                      Novo Usuário do Sistema
                    </p>
                    <button
                      type="button"
                      onClick={() => setInviteOpen(false)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      required
                      placeholder="Nome completo *"
                      value={invite.full_name}
                      onChange={(e) => setInvite({ ...invite, full_name: e.target.value })}
                      className="rounded-xl px-3.5 py-2.5 text-sm font-medium outline-none border border-emerald-200 bg-white"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Nome de usuário (login) *"
                      value={invite.username}
                      onChange={(e) => setInvite({ ...invite, username: e.target.value })}
                      className="rounded-xl px-3.5 py-2.5 text-sm font-medium outline-none border border-emerald-200 bg-white"
                    />
                    <input
                      type="email"
                      placeholder="E-mail (opcional)"
                      value={invite.email}
                      onChange={(e) => setInvite({ ...invite, email: e.target.value })}
                      className="rounded-xl px-3.5 py-2.5 text-sm font-medium outline-none border border-emerald-200 bg-white"
                    />
                    <div className="relative">
                      <input
                        type={showInvitePass ? 'text' : 'password'}
                        required
                        placeholder="Senha inicial *"
                        value={invite.password}
                        onChange={(e) => setInvite({ ...invite, password: e.target.value })}
                        className="w-full rounded-xl px-3.5 py-2.5 pr-10 text-sm font-medium outline-none border border-emerald-200 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowInvitePass(!showInvitePass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                      >
                        {showInvitePass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={inviting}
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all shadow-sm"
                    style={{ background: '#7DC344' }}
                  >
                    {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                    {inviting ? 'Criando acesso...' : 'Criar Acesso de Usuário'}
                  </button>
                </form>
              )}
            </SectionCard>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────────────── */}
        {/* TAB 2: FORNECEDOR */}
        {/* ────────────────────────────────────────────────────────────────── */}
        {currentTab === 'fornecedor' && (
          <div className="space-y-6">
            <SectionCard
              icon={Truck}
              title="Cadastro & Gestão de Fornecedores"
              subtitle="Gerencie fornecedores de produtos, insumos e logística"
              accent="blue"
            >
              {/* Header actions */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar por nome, CNPJ ou categoria..."
                    value={searchForn}
                    onChange={(e) => setSearchForn(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border border-slate-200 bg-slate-50 outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  onClick={openNewFornModal}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition shadow-sm w-full md:w-auto justify-center"
                  style={{ background: '#0D6BAF' }}
                >
                  <Plus className="h-4 w-4" />
                  Novo Fornecedor
                </button>
              </div>

              {/* List table */}
              {loadingForn ? (
                <div className="py-12 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600 mb-2" />
                  <p className="text-sm font-medium text-slate-500">Carregando fornecedores...</p>
                </div>
              ) : filteredFornecedores.length === 0 ? (
                <div className="py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <Truck className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-600">Nenhum fornecedor encontrado</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {searchForn ? 'Tente ajustar sua busca.' : 'Clique no botão acima para adicionar o primeiro fornecedor.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-black uppercase text-slate-500 tracking-wider">
                        <th className="p-3.5">Fornecedor / Razão</th>
                        <th className="p-3.5">CNPJ</th>
                        <th className="p-3.5">Categoria</th>
                        <th className="p-3.5">Contato / Tel</th>
                        <th className="p-3.5">Status</th>
                        <th className="p-3.5 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                      {filteredFornecedores.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition">
                          <td className="p-3.5">
                            <p className="font-bold text-slate-900 text-sm">{item.trade_name}</p>
                            {item.legal_name && <p className="text-[11px] text-slate-500">{item.legal_name}</p>}
                          </td>
                          <td className="p-3.5 font-mono text-slate-600">{item.cnpj || '—'}</td>
                          <td className="p-3.5">
                            <span className="inline-block bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md text-[11px] font-bold">
                              {item.category || 'Geral'}
                            </span>
                          </td>
                          <td className="p-3.5">
                            <p className="font-semibold text-slate-800">{item.contact_name || '—'}</p>
                            <p className="text-[11px] text-slate-500">{item.phone || item.email || '—'}</p>
                          </td>
                          <td className="p-3.5">
                            <button
                              onClick={() => handleToggleActiveForn(item)}
                              className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition ${
                                item.active
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-500 border border-slate-200'
                              }`}
                            >
                              {item.active ? 'Ativo' : 'Inativo'}
                            </button>
                          </td>
                          <td className="p-3.5 text-right space-x-2">
                            <button
                              onClick={() => openEditFornModal(item)}
                              className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition"
                              title="Editar"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteForn(item.id)}
                              className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition"
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────────────── */}
        {/* TAB 3: REPRESENTANTE */}
        {/* ────────────────────────────────────────────────────────────────── */}
        {currentTab === 'representante' && (
          <div className="space-y-6">
            <SectionCard
              icon={Briefcase}
              title="Cadastro de Distribuidores & Representantes"
              subtitle="Gerencie sua equipe comercial, perfil de atuação e comissões"
              accent="purple"
            >
              {/* Top stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="bg-purple-50/60 border border-purple-100 p-4 rounded-xl">
                  <p className="text-xs font-bold text-purple-700">Total de Cadastros</p>
                  <p className="text-2xl font-black text-purple-900 mt-1">{representantes.length}</p>
                </div>
                <div className="bg-blue-50/60 border border-blue-100 p-4 rounded-xl">
                  <p className="text-xs font-bold text-blue-700">Distribuidores</p>
                  <p className="text-2xl font-black text-blue-900 mt-1">
                    {representantes.filter((r) => r.role === 'DISTRIBUIDOR').length}
                  </p>
                </div>
                <div className="bg-emerald-50/60 border border-emerald-100 p-4 rounded-xl">
                  <p className="text-xs font-bold text-emerald-700">Representantes</p>
                  <p className="text-2xl font-black text-emerald-900 mt-1">
                    {representantes.filter((r) => r.role === 'REPRESENTANTE').length}
                  </p>
                </div>
              </div>

              {/* Header actions */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar por nome, tipo, código ou região..."
                    value={searchRep}
                    onChange={(e) => setSearchRep(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border border-slate-200 bg-slate-50 outline-none focus:border-purple-500"
                  />
                </div>
                <button
                  onClick={openNewRepModal}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition shadow-sm w-full md:w-auto justify-center"
                  style={{ background: '#7C3AED' }}
                >
                  <Plus className="h-4 w-4" />
                  Novo Cadastro
                </button>
              </div>

              {/* Table */}
              {loadingRep ? (
                <div className="py-12 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-purple-600 mb-2" />
                  <p className="text-sm font-medium text-slate-500">Carregando dados...</p>
                </div>
              ) : filteredRepresentantes.length === 0 ? (
                <div className="py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <Briefcase className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-600">Nenhum cadastro encontrado</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-black uppercase text-slate-500 tracking-wider">
                        <th className="p-3.5">Código / Nome</th>
                        <th className="p-3.5">Tipo / Função</th>
                        <th className="p-3.5">CPF / CNPJ</th>
                        <th className="p-3.5">Comissão (%)</th>
                        <th className="p-3.5">Região</th>
                        <th className="p-3.5">Status</th>
                        <th className="p-3.5 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                      {filteredRepresentantes.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition">
                          <td className="p-3.5">
                            <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded mr-2">
                              {item.code || 'REP'}
                            </span>
                            <span className="font-bold text-slate-900 text-sm">{item.name}</span>
                          </td>
                          <td className="p-3.5">
                            <span
                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider border shadow-2xs ${
                                item.role === 'DISTRIBUIDOR'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-purple-50 text-purple-700 border-purple-200'
                              }`}
                            >
                              <Tag className="h-3 w-3" />
                              {item.role === 'DISTRIBUIDOR' ? 'DISTRIBUIDOR' : 'REPRESENTANTE'}
                            </span>
                          </td>
                          <td className="p-3.5 font-mono text-slate-600">{item.cpf_cnpj || '—'}</td>
                          <td className="p-3.5">
                            <span className="inline-flex items-center gap-1 font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-lg">
                              <Percent className="h-3 w-3" />
                              {item.commission_rate}%
                            </span>
                          </td>
                          <td className="p-3.5 text-slate-600">{item.region || '—'}</td>
                          <td className="p-3.5">
                            <button
                              onClick={() => handleToggleActiveRep(item)}
                              className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition ${
                                item.active
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-500 border border-slate-200'
                              }`}
                            >
                              {item.active ? 'Ativo' : 'Inativo'}
                            </button>
                          </td>
                          <td className="p-3.5 text-right space-x-2">
                            <button
                              onClick={() => openEditRepModal(item)}
                              className="p-1.5 rounded-lg text-purple-600 hover:bg-purple-50 transition"
                              title="Editar"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteRep(item.id)}
                              className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition"
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────────────── */}
        {/* TAB 4: FORMAS DE PAGAMENTO */}
        {/* ────────────────────────────────────────────────────────────────── */}
        {currentTab === 'formas_pagamento' && (
          <div className="space-y-6">
            <SectionCard
              icon={CreditCard}
              title="Cadastro de Formas & Condições de Pagamento"
              subtitle="Defina formas de recebimento aceitas nas vendas, taxas e prazos de compensação"
              accent="amber"
            >
              {/* Header actions */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar forma de pagamento..."
                    value={searchPay}
                    onChange={(e) => setSearchPay(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border border-slate-200 bg-slate-50 outline-none focus:border-amber-500"
                  />
                </div>
                <button
                  onClick={openNewPayModal}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition shadow-sm w-full md:w-auto justify-center"
                  style={{ background: '#D97706' }}
                >
                  <Plus className="h-4 w-4" />
                  Nova Forma de Pagamento
                </button>
              </div>

              {/* Cards grid */}
              {loadingPay ? (
                <div className="py-12 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-amber-600 mb-2" />
                  <p className="text-sm font-medium text-slate-500">Carregando formas de pagamento...</p>
                </div>
              ) : filteredFormas.length === 0 ? (
                <div className="py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <CreditCard className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-600">Nenhuma forma de pagamento cadastrada</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredFormas.map((item) => {
                    const categoryColors = {
                      PIX: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
                      CREDIT_CARD: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
                      DEBIT_CARD: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
                      BOLETO: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
                      CASH: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
                      OTHER: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
                    }
                    const catStyle = categoryColors[item.category] || categoryColors.OTHER

                    return (
                      <div
                        key={item.id}
                        className={`p-5 rounded-2xl border transition-all shadow-xs relative flex flex-col justify-between ${
                          item.active ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-60'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}>
                              {item.category}
                            </span>
                            <button
                              onClick={() => handleToggleActivePay(item)}
                              className="text-slate-400 hover:text-slate-600 transition"
                              title={item.active ? 'Desativar' : 'Ativar'}
                            >
                              {item.active ? (
                                <ToggleRight className="h-6 w-6 text-emerald-600" />
                              ) : (
                                <ToggleLeft className="h-6 w-6 text-slate-300" />
                              )}
                            </button>
                          </div>

                          <h3 className="font-black text-slate-900 text-base">{item.name}</h3>

                          <div className="mt-4 space-y-2 text-xs text-slate-600">
                            <div className="flex justify-between">
                              <span className="text-slate-400 font-medium">Parcelamento Máx:</span>
                              <span className="font-bold text-slate-800">{item.max_installments}x</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400 font-medium">Taxa Adm (%):</span>
                              <span className="font-bold text-amber-600">{item.fee_percentage}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400 font-medium">Prazo Recebimento:</span>
                              <span className="font-bold text-slate-800">{item.days_to_receive} dia(s)</span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditPayModal(item)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 transition"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDeletePay(item.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 transition"
                          >
                            Excluir
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </SectionCard>
          </div>
        )}
      </div>

      {/* ────────────────────────────────────────────────────────────────── */}
      {/* MODAL: FORNECEDOR */}
      {/* ────────────────────────────────────────────────────────────────── */}
      {modalFornOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-xl w-full my-8 space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <Truck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {editingForn ? 'Editar Fornecedor' : 'Novo Fornecedor'}
                  </h3>
                  <p className="text-xs text-slate-500">Preencha os dados cadastrais do fornecedor</p>
                </div>
              </div>
              <button
                onClick={() => setModalFornOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFornecedor} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="md:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Nome Fantasia *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: EKO'7 Brasil"
                    value={fornForm.trade_name}
                    onChange={(e) => setFornForm({ ...fornForm, trade_name: e.target.value })}
                    className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-medium text-sm outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Razão Social</label>
                  <input
                    type="text"
                    placeholder="Ex: EKO'7 Indústria Ltda"
                    value={fornForm.legal_name}
                    onChange={(e) => setFornForm({ ...fornForm, legal_name: e.target.value })}
                    className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-medium text-sm outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">CNPJ</label>
                  <input
                    type="text"
                    placeholder="00.000.000/0001-00"
                    value={fornForm.cnpj}
                    onChange={(e) => setFornForm({ ...fornForm, cnpj: maskCNPJ(e.target.value) })}
                    className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-medium text-sm outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Categoria de Fornecimento</label>
                  <input
                    type="text"
                    placeholder="Ex: Colchões, Matéria Prima, Logística"
                    value={fornForm.category}
                    onChange={(e) => setFornForm({ ...fornForm, category: e.target.value })}
                    className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-medium text-sm outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Contato / Responsável</label>
                  <input
                    type="text"
                    placeholder="Nome do vendedor/contato"
                    value={fornForm.contact_name}
                    onChange={(e) => setFornForm({ ...fornForm, contact_name: e.target.value })}
                    className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-medium text-sm outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    placeholder="(00) 00000-0000"
                    value={fornForm.phone}
                    onChange={(e) => setFornForm({ ...fornForm, phone: maskPhone(e.target.value) })}
                    className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-medium text-sm outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    placeholder="contato@fornecedor.com"
                    value={fornForm.email}
                    onChange={(e) => setFornForm({ ...fornForm, email: e.target.value })}
                    className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-medium text-sm outline-none focus:border-blue-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Cidade / Estado</label>
                  <input
                    type="text"
                    placeholder="Chapecó - SC"
                    value={fornForm.address_city}
                    onChange={(e) => setFornForm({ ...fornForm, address_city: e.target.value })}
                    className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-medium text-sm outline-none focus:border-blue-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Observações</label>
                  <textarea
                    rows={2}
                    placeholder="Detalhes adicionais..."
                    value={fornForm.notes}
                    onChange={(e) => setFornForm({ ...fornForm, notes: e.target.value })}
                    className="w-full rounded-xl p-3 border border-slate-200 font-medium text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalFornOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingForn}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm"
                  style={{ background: '#0D6BAF' }}
                >
                  {savingForn ? 'Salvando...' : 'Salvar Fornecedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────── */}
      {/* MODAL: REPRESENTANTE */}
      {/* ────────────────────────────────────────────────────────────────── */}
      {modalRepOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-xl w-full my-8 space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                  <Briefcase className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {editingRep ? 'Editar Cadastro' : 'Novo Cadastro Comercial'}
                  </h3>
                  <p className="text-xs text-slate-500">Selecione a função (Distribuidor ou Representante) e dados de contato</p>
                </div>
              </div>
              <button
                onClick={() => setModalRepOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRepresentante} className="space-y-4">
              {/* TAG / ROLE SELECTOR */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider">
                  Tipo / Função no Canal (Tag Identificadora) *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRepForm({ ...repForm, role: 'DISTRIBUIDOR' })}
                    className={`flex items-center justify-center gap-2 p-3.5 rounded-2xl text-xs font-black uppercase transition border shadow-2xs ${
                      repForm.role === 'DISTRIBUIDOR'
                        ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-300'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Tag className="h-4 w-4" />
                    DISTRIBUIDOR
                  </button>

                  <button
                    type="button"
                    onClick={() => setRepForm({ ...repForm, role: 'REPRESENTANTE' })}
                    className={`flex items-center justify-center gap-2 p-3.5 rounded-2xl text-xs font-black uppercase transition border shadow-2xs ${
                      repForm.role === 'REPRESENTANTE'
                        ? 'bg-purple-600 text-white border-purple-600 ring-2 ring-purple-300'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Tag className="h-4 w-4" />
                    REPRESENTANTE
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Código de Identificação</label>
                  <input
                    type="text"
                    placeholder="Ex: REP-001"
                    value={repForm.code}
                    onChange={(e) => setRepForm({ ...repForm, code: e.target.value })}
                    className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-medium text-sm outline-none focus:border-purple-500 uppercase"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nome Completo / Razão Social *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Carlos Eduardo Santos"
                    value={repForm.name}
                    onChange={(e) => setRepForm({ ...repForm, name: e.target.value })}
                    className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-medium text-sm outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">CPF / CNPJ</label>
                  <input
                    type="text"
                    placeholder="000.000.000-00"
                    value={repForm.cpf_cnpj}
                    onChange={(e) => setRepForm({ ...repForm, cpf_cnpj: maskCPFCNPJ(e.target.value) })}
                    className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-medium text-sm outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Comissão (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={repForm.commission_rate}
                    onChange={(e) => setRepForm({ ...repForm, commission_rate: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-medium text-sm outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    placeholder="(00) 00000-0000"
                    value={repForm.phone}
                    onChange={(e) => setRepForm({ ...repForm, phone: maskPhone(e.target.value) })}
                    className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-medium text-sm outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    placeholder="contato@email.com"
                    value={repForm.email}
                    onChange={(e) => setRepForm({ ...repForm, email: e.target.value })}
                    className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-medium text-sm outline-none focus:border-purple-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Região / UF de Atuação</label>
                  <input
                    type="text"
                    placeholder="Ex: São Paulo - SP / Grande SP"
                    value={repForm.region}
                    onChange={(e) => setRepForm({ ...repForm, region: e.target.value })}
                    className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-medium text-sm outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalRepOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingRep}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm"
                  style={{ background: '#7C3AED' }}
                >
                  {savingRep ? 'Salvando...' : 'Salvar Cadastro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────── */}
      {/* MODAL: FORMA DE PAGAMENTO */}
      {/* ────────────────────────────────────────────────────────────────── */}
      {modalPayOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-lg w-full my-8 space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {editingPay ? 'Editar Forma de Pagamento' : 'Nova Forma de Pagamento'}
                  </h3>
                  <p className="text-xs text-slate-500">Parâmetros de recebimento e taxas</p>
                </div>
              </div>
              <button
                onClick={() => setModalPayOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFormaPagamento} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="md:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Nome da Forma de Pagamento *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Cartão de Crédito 12x"
                    value={payForm.name}
                    onChange={(e) => setPayForm({ ...payForm, name: e.target.value })}
                    className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-medium text-sm outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Categoria / Tipo</label>
                  <select
                    value={payForm.category}
                    onChange={(e) =>
                      setPayForm({ ...payForm, category: e.target.value as FormaPagamento['category'] })
                    }
                    className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-medium text-sm outline-none focus:border-amber-500 bg-white"
                  >
                    <option value="PIX">PIX</option>
                    <option value="CREDIT_CARD">Cartão de Crédito</option>
                    <option value="DEBIT_CARD">Cartão de Débito</option>
                    <option value="BOLETO">Boleto Bancário</option>
                    <option value="CASH">Dinheiro</option>
                    <option value="OTHER">Outros</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Parcelas Máximas</label>
                  <input
                    type="number"
                    min="1"
                    max="48"
                    value={payForm.max_installments}
                    onChange={(e) => setPayForm({ ...payForm, max_installments: parseInt(e.target.value) || 1 })}
                    className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-medium text-sm outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Taxa Administrativa (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={payForm.fee_percentage}
                    onChange={(e) => setPayForm({ ...payForm, fee_percentage: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-medium text-sm outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Prazo de Recebimento (Dias)</label>
                  <input
                    type="number"
                    min="0"
                    value={payForm.days_to_receive}
                    onChange={(e) => setPayForm({ ...payForm, days_to_receive: parseInt(e.target.value) || 0 })}
                    className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-medium text-sm outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalPayOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingPay}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm"
                  style={{ background: '#D97706' }}
                >
                  {savingPay ? 'Salvando...' : 'Salvar Forma de Pagamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

      {/* ── Confirm Delete User Modal ── */}
      {confirmDeleteUser && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-900">Remover usuário?</p>
                <p className="text-xs font-medium text-slate-500">@{confirmDeleteUser}</p>
              </div>
            </div>
            <p className="text-sm text-slate-600">Esta ação removerá o acesso deste usuário ao sistema.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteUser(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-slate-200 text-slate-600"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDeleteUser(confirmDeleteUser)}
                disabled={deletingUser}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600"
              >
                {deletingUser ? 'Removendo...' : 'Remover'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
