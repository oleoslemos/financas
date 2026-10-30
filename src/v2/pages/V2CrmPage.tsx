import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { V2ClientDrawer } from '../components/V2ClientDrawer'
import { fetchClient, BemAvivClient } from '../services/v2ClientesService'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Calendar,
  User,
  Clock,
  Users,
  ShoppingBag,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  X,
  CalendarPlus,
  BarChart3,
  Search,
  UserCheck,
  Loader2,
  RotateCcw,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useCompany } from '../../context/CompanyContext'
import { getCurrentV2User } from '../services/v2AuthService'
import { formatarMoeda } from '../../modules/lib/money'
import { dateInputToIso, formatDateOnly, todayInputDate, toInputDate } from '../../lib/dates'
import { buildWhatsappUrl } from '../../lib/whatsapp'
import {
  buildCriticalFollowupEntries,
  type ClientFollowupRow,
  fetchLatestFollowupsByClientIds,
} from '../../lib/bemAvivClientFollowups'
import {
  CrmContato,
  fetchContatos,
  formatarDataHora,
} from '../services/v2CrmService'
import { V2ClientFollowupSheet } from '../components/V2ClientFollowupSheet'

// ─────────────────────────────────────────────────────────────────────────────
// Constantes e Helpers
// ─────────────────────────────────────────────────────────────────────────────

const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const NO_CONTACT_ALERT_DAYS = 30
const EXCLUDED_FROM_CRITICAL_TIMELINE = new Set(['LEONARDO SILVA LEMOS', 'SUELEN JOAO ALVES'])
const EXCLUDED_FROM_FOLLOWUP_BY_CPF = new Set(['22112195867', '00742215903'])

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function formatYmd(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toLocalDateKey(isoOrYmd: string): string {
  const s = isoOrYmd.trim()
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10)
  }
  const d = new Date(isoOrYmd)
  if (Number.isNaN(d.getTime())) return ''
  return formatYmd(d)
}

function splitFollowupNote(note?: string | null) {
  const raw = (note ?? '').trim()
  if (!raw) return { summary: '', details: '' }
  const marker = 'RESUMO:'
  if (raw.toUpperCase().startsWith(marker)) {
    const firstBreak = raw.indexOf('\n')
    if (firstBreak > -1) {
      return {
        summary: raw.slice(marker.length, firstBreak).trim(),
        details: raw.slice(firstBreak + 1).trim(),
      }
    }
    return { summary: raw.slice(marker.length).trim(), details: '' }
  }
  return { summary: '', details: raw }
}

function composeFollowupNote(summary: string, details: string) {
  const s = summary.trim()
  const d = details.trim()
  if (s && d) return `RESUMO: ${s}\n${d}`
  if (s) return `RESUMO: ${s}`
  return d
}

function formatPhone(v?: string | null) {
  const d = (v ?? '').replace(/\D/g, '')
  if (!d) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 11) return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(d.length - 4)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`
}

type ClientRow = {
  id: string
  full_name: string
  cpf?: string | null
  last_contact_at?: string | null
  next_followup_at: string | null
  next_followup_status: string | null
  phone_1?: string | null
  phone_2?: string | null
  next_followup_note?: string | null
  client_status?: string | null
  commercial_stage?: string | null
  company_id?: string | null
}

type CrmSubTab = 'visao-geral' | 'follow-up' | 'produtividade' | 'atividades'

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL: V2CrmPage
// ─────────────────────────────────────────────────────────────────────────────

export function V2CrmPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { activeCompanyId } = useCompany()
  const v2User = getCurrentV2User()
  const userName = v2User?.full_name || v2User?.username || 'Usuário'

  // Determinar aba ativa a partir da URL
  const currentTab: CrmSubTab = useMemo(() => {
    const path = location.pathname.toLowerCase()
    if (path.includes('/follow-up')) return 'follow-up'
    if (path.includes('/produtividade')) return 'produtividade'
    if (path.includes('/atividades')) return 'atividades'
    return 'visao-geral'
  }, [location.pathname])

  const handleSelectTab = (tab: CrmSubTab) => {
    if (tab === 'visao-geral') navigate('/v2/crm')
    else navigate(`/v2/crm/${tab}`)
  }

  // ── ESTADOS PRINCIPAIS DO CRM ──
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<ClientRow[]>([])
  const [latestContactByClient, setLatestContactByClient] = useState<Record<string, ClientFollowupRow>>({})
  const [latestFollowupsReady, setLatestFollowupsReady] = useState(false)

  // Pedidos em aberto para o card de métricas
  const [openOrdersCount, setOpenOrdersCount] = useState(0)
  const [openOrdersAmount, setOpenOrdersAmount] = useState(0)

  // Calendário
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()))
  // Dia selecionado na agenda: sempre inicia no dia de hoje
  const [selectedDay, setSelectedDay] = useState<string>(() => formatYmd(new Date()))

  // Modais de Agendamento e Contato
  const [scheduleModalClient, setScheduleModalClient] = useState<ClientRow | null>(null)
  const [scheduleForm, setScheduleForm] = useState({
    next_followup_at: '',
    summary: '',
    notes: '',
    contact_done: false,
  })
  const [scheduleSaving, setScheduleSaving] = useState(false)

  const [contactModalClient, setContactModalClient] = useState<ClientRow | null>(null)
  const [contactForm, setContactForm] = useState({
    contacted_at: todayInputDate(),
    channel: 'WHATSAPP',
    result: '',
    notes: '',
  })
  const [contactSaving, setContactSaving] = useState(false)
  const [selectedHistoryClient, setSelectedHistoryClient] = useState<ClientRow | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerClient, setDrawerClient] = useState<BemAvivClient | null>(null)
  const [loadingClientDrawer, setLoadingClientDrawer] = useState(false)

  const handleOpenClientDrawer = async (clientId: string) => {
    setLoadingClientDrawer(true)
    try {
      const res = await fetchClient(clientId)
      if (res.data) {
        setDrawerClient(res.data)
        setDrawerOpen(true)
      } else {
        alert('Não foi possível carregar os dados completos do cliente.')
      }
    } catch (err) {
      console.error('Erro ao abrir cadastro de cliente:', err)
    } finally {
      setLoadingClientDrawer(false)
    }
  }

  const handleClientDrawerSaved = (updated: BemAvivClient) => {
    setDrawerClient(updated)
    setClients((prev) =>
      prev.map((c) =>
        c.id === updated.id
          ? {
              ...c,
              full_name: updated.full_name,
              phone_1: updated.phone_1,
              phone_2: updated.phone_2,
              next_followup_at: updated.next_followup_at,
              next_followup_note: updated.next_followup_note,
              client_status: updated.client_status,
              commercial_stage: updated.commercial_stage,
            }
          : c
      )
    )
    void loadData()
  }

  // ── CARREGAMENTO DE DADOS (OLHANDO PARA AS MESMAS TABELAS DO SISTEMA) ──
  const loadData = useCallback(async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    const companyIdFinal = activeCompanyId || '10000000-0000-4000-8000-000000000001'
    setLoading(true)

    const [ordersRes, v2OrdersRes, clientsRes] = await Promise.all([
      supabase
        .from('bem_aviv_sales_orders')
        .select('order_date, total_amount, document_type, status')
        .eq('company_id', companyIdFinal)
        .in('document_type', ['ORCAMENTO', 'PEDIDO'])
        .in('status', ['ABERTO', 'FINALIZADO', 'ENTREGA PENDENTE', 'ENTREGA PARCIAL', 'ENTREGUE', 'CANCELADO']),
      supabase
        .from('v2_pedidos_venda')
        .select('id, status, total'),
      supabase
        .from('bem_aviv_clients')
        .select('id, full_name, cpf, last_contact_at, next_followup_at, next_followup_status, phone_1, phone_2, next_followup_note, client_status, commercial_stage, company_id')
        .eq('company_id', companyIdFinal),
    ])

    // Calcular pedidos em aberto (V2 + legado V1)
    let openCount = 0
    let openAmount = 0

    // V2 Pedidos de Venda
    const v2Orders = (v2OrdersRes.data ?? []) as Array<{
      id: string
      status: string
      total: number
    }>
    for (const vo of v2Orders) {
      const st = (vo.status ?? '').toLowerCase()
      if (st !== 'entregue' && st !== 'cancelado') {
        openCount += 1
        openAmount += Number(vo.total || 0)
      }
    }

    // Legado V1 (apenas pedidos em aberto)
    const orders = (ordersRes.data ?? []) as Array<{
      total_amount: number
      document_type: string
      status: string
    }>
    for (const o of orders) {
      const docType = (o.document_type ?? '').toUpperCase()
      const st = (o.status ?? '').toUpperCase()
      const amt = Number(o.total_amount ?? 0)
      if (docType === 'PEDIDO' && st === 'ABERTO') {
        openCount += 1
        if (Number.isFinite(amt)) openAmount += amt
      }
    }
    setOpenOrdersCount(openCount)
    setOpenOrdersAmount(openAmount)

    const loadedClients = ((clientsRes.data ?? []) as ClientRow[]) ?? []
    setClients(loadedClients)
    setLoading(false)
  }, [activeCompanyId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Buscar últimos follow-ups dos clientes
  useEffect(() => {
    if (!supabase) {
      setLatestContactByClient({})
      setLatestFollowupsReady(true)
      return
    }
    const companyIdFinal = activeCompanyId || '10000000-0000-4000-8000-000000000001'
    const ids = Array.from(new Set(clients.map((r) => r.id)))
    if (ids.length === 0) {
      setLatestContactByClient({})
      setLatestFollowupsReady(true)
      return
    }
    let cancelled = false
    setLatestFollowupsReady(false)
    void (async () => {
      try {
        const { latestContact } = await fetchLatestFollowupsByClientIds(supabase, companyIdFinal, ids)
        if (cancelled) return
        setLatestContactByClient(latestContact)
      } catch {
        if (!cancelled) setLatestContactByClient({})
      } finally {
        if (!cancelled) setLatestFollowupsReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [clients, activeCompanyId])

  // ── CÁLCULO DOS FOLLOW-UPS CRÍTICOS ──
  const criticalTimelineClients = useMemo(() => {
    if (!latestFollowupsReady) return []
    return buildCriticalFollowupEntries(clients, latestContactByClient, {
      staleDays: NO_CONTACT_ALERT_DAYS,
      excludeNames: EXCLUDED_FROM_CRITICAL_TIMELINE,
      excludeCpfs: EXCLUDED_FROM_FOLLOWUP_BY_CPF,
    })
  }, [clients, latestContactByClient, latestFollowupsReady])

  const criticalTimelineStats = useMemo(() => {
    let overdue = 0
    let noContact = 0
    let stale = 0
    let maxOverdueDays = 0
    const nowTime = Date.now()

    for (const row of criticalTimelineClients) {
      if (row.isOverdue) {
        overdue++
        if (row.client.next_followup_at) {
          const diffDays = Math.floor((nowTime - new Date(row.client.next_followup_at).getTime()) / 86_400_000)
          if (diffDays > maxOverdueDays) maxOverdueDays = diffDays
        }
      } else if (row.isNoContact) {
        noContact++
      } else if (row.isStaleContact) {
        stale++
      }
    }
    return { overdue, noContact, stale, total: criticalTimelineClients.length, maxOverdueDays }
  }, [criticalTimelineClients])

  // Follow-ups com data para o calendário
  const pendingWithDate = useMemo(() => {
    return clients.filter((c) => {
      if (!c.next_followup_at) return false
      const st = (c.next_followup_status ?? 'PENDENTE').toUpperCase()
      return st === 'PENDENTE'
    })
  }, [clients])

  // Contagem por dia no mês selecionado
  const countByDayInViewMonth = useMemo(() => {
    const y = calendarMonth.getFullYear()
    const m = calendarMonth.getMonth()
    const counts = new Map<string, number>()
    for (const c of pendingWithDate) {
      const t = new Date(c.next_followup_at!)
      if (t.getFullYear() !== y || t.getMonth() !== m) continue
      const key = toLocalDateKey(c.next_followup_at!)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [pendingWithDate, calendarMonth])

  // Células do calendário
  const cells = useMemo(() => {
    const y = calendarMonth.getFullYear()
    const m = calendarMonth.getMonth()
    const first = new Date(y, m, 1)
    const pad = first.getDay()
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    const arr: Array<{ date: Date | null }> = []
    for (let i = 0; i < pad; i++) arr.push({ date: null })
    for (let d = 1; d <= daysInMonth; d++) arr.push({ date: new Date(y, m, d) })
    return arr
  }, [calendarMonth])

  const shiftCalendarMonth = (delta: number) => {
    setCalendarMonth((prev) => {
      const next = new Date(prev.getFullYear(), prev.getMonth() + delta, 1)
      return next
    })
  }

  // ── CONTATOS DO DIA SELECIONADO NA AGENDA ──
  const selectedDayClients = useMemo(() => {
    if (!selectedDay) return []
    return pendingWithDate.filter((c) => toLocalDateKey(c.next_followup_at!) === selectedDay)
  }, [selectedDay, pendingWithDate])

  const selectedDayClientIds = useMemo(() => {
    return new Set(selectedDayClients.map((c) => c.id))
  }, [selectedDayClients])

  // ── REQUISITO CRÍTICO: QUEM CONTATAR PRIMEIRO ──
  // "na lista quem contatar primeiro, manter a lista excluindo a lista do dia que aparece debaixo da agenda"
  const topCriticalClients = useMemo(() => {
    const filtered = criticalTimelineClients.filter(
      ({ client }) => !selectedDayClientIds.has(client.id)
    )
    return filtered.slice(0, 4)
  }, [criticalTimelineClients, selectedDayClientIds])

  // Formatação do subtítulo da página de visão geral
  const now = useMemo(() => new Date(), [])
  const subtitleDate = useMemo(() => {
    const weekdayStr = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(now)
    const capitalizedWeekday = weekdayStr.charAt(0).toUpperCase() + weekdayStr.slice(1)
    const monthStr = MONTH_NAMES[now.getMonth()]?.toLowerCase()
    return `${capitalizedWeekday}, ${now.getDate()} de ${monthStr} de ${now.getFullYear()}`
  }, [now])

  const selectedMonthName = MONTH_NAMES[calendarMonth.getMonth()] ?? 'Mês'

  // Formatação do dia selecionado
  const selectedDayFormatted = useMemo(() => {
    if (!selectedDay) return ''
    const parts = selectedDay.split('-')
    if (parts.length === 3) {
      const day = parts[2]
      const mIdx = Number(parts[1]) - 1
      const year = parts[0]
      const isToday = selectedDay === formatYmd(now)
      return `${day} de ${MONTH_NAMES[mIdx]?.toLowerCase()} de ${year}${isToday ? ' (Hoje)' : ''}`
    }
    return selectedDay
  }, [selectedDay, now])

  // ── AÇÕES DE MODAIS (REGISTRAR CONTATO & AGENDAR) ──
  const openScheduleModal = (client: ClientRow) => {
    const parsed = splitFollowupNote(client.next_followup_note)
    setScheduleForm({
      next_followup_at: client.next_followup_at ? toInputDate(client.next_followup_at) : todayInputDate(),
      summary: parsed.summary,
      notes: parsed.details,
      contact_done: false,
    })
    setScheduleModalClient(client)
  }

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase || !scheduleModalClient) return
    if (!scheduleForm.next_followup_at) {
      alert('Informe a data do agendamento.')
      return
    }

    setScheduleSaving(true)
    const companyIdFinal = activeCompanyId || scheduleModalClient.company_id || '10000000-0000-4000-8000-000000000001'
    const userIdFinal = v2User?.id || v2User?.username || 'v2_user'
    const isoDate = dateInputToIso(scheduleForm.next_followup_at)
    const fullNote = composeFollowupNote(scheduleForm.summary, scheduleForm.notes)
    const nowIso = new Date().toISOString()

    const { error } = await supabase
      .from('bem_aviv_clients')
      .update({
        next_followup_at: isoDate,
        next_followup_note: fullNote || null,
        next_followup_status: 'PENDENTE',
        last_contact_at: scheduleForm.contact_done ? nowIso : scheduleModalClient.last_contact_at,
      })
      .eq('id', scheduleModalClient.id)

    if (error) {
      alert(`Erro ao agendar: ${error.message}`)
      setScheduleSaving(false)
      return
    }

    // Registrar o agendamento no histórico de follow-ups
    await supabase.from('bem_aviv_client_followups').insert({
      user_id: userIdFinal,
      company_id: companyIdFinal,
      created_by_name: userName,
      client_id: scheduleModalClient.id,
      contacted_at: isoDate,
      channel: 'AGENDAMENTO',
      result: scheduleForm.summary ? `STATUS:PENDENTE | ${scheduleForm.summary}` : 'STATUS:PENDENTE',
      notes: scheduleForm.notes || null,
    })

    // Se marcou que realizou contato prévio, salvar também em bem_aviv_client_followups
    if (scheduleForm.contact_done) {
      await supabase.from('bem_aviv_client_followups').insert({
        user_id: userIdFinal,
        company_id: companyIdFinal,
        created_by_name: userName,
        client_id: scheduleModalClient.id,
        contacted_at: nowIso,
        channel: 'WHATSAPP',
        result: scheduleForm.summary || 'Follow-up agendado com contato prévio',
        notes: scheduleForm.notes || null,
      })
    }

    setScheduleSaving(false)
    setScheduleModalClient(null)
    void loadData()
  }

  const openContactModal = (client: ClientRow) => {
    setContactForm({
      contacted_at: todayInputDate(),
      channel: 'WHATSAPP',
      result: '',
      notes: '',
    })
    setContactModalClient(client)
  }

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase || !contactModalClient) return
    if (!contactForm.contacted_at) {
      alert('Por favor, informe a data do contato.')
      return
    }

    setContactSaving(true)
    const companyIdFinal = activeCompanyId || contactModalClient.company_id || '10000000-0000-4000-8000-000000000001'
    const userIdFinal = v2User?.id || v2User?.username || 'v2_user'
    const contactedAtIso = dateInputToIso(contactForm.contacted_at)

    const { error: insertError } = await supabase.from('bem_aviv_client_followups').insert({
      user_id: userIdFinal,
      company_id: companyIdFinal,
      created_by_name: userName,
      client_id: contactModalClient.id,
      contacted_at: contactedAtIso,
      channel: contactForm.channel,
      result: contactForm.result || null,
      notes: contactForm.notes || null,
    })

    if (insertError) {
      console.error('Erro ao inserir follow-up:', insertError)
      alert(`Erro ao salvar contato: ${insertError.message}`)
      setContactSaving(false)
      return
    }

    // Sincronizar também com crm_contato_v2 para manter ambos os modelos alinhados
    try {
      const tipoCrm = (['ligacao', 'whatsapp', 'email', 'visita', 'reuniao'].includes(contactForm.channel.toLowerCase())
        ? contactForm.channel.toLowerCase()
        : 'outro') as any

      await supabase.from('crm_contato_v2').insert({
        cliente_id: contactModalClient.id,
        company_id: companyIdFinal,
        tipo: tipoCrm,
        direcao: 'realizado',
        assunto: contactForm.result?.trim() || 'Contato Realizado',
        descricao: contactForm.notes?.trim() || null,
        resultado: contactForm.result?.trim() || null,
        ocorrido_em: contactedAtIso,
        responsavel_id: userIdFinal,
        criado_por: userName,
      })
    } catch (e) {
      console.warn('Sync crm_contato_v2:', e)
    }

    // Atualizar o cliente
    const { error: updClientErr } = await supabase
      .from('bem_aviv_clients')
      .update({
        last_contact_at: contactedAtIso,
        next_followup_status: 'CONCLUIDO',
      })
      .eq('id', contactModalClient.id)

    if (updClientErr) {
      console.warn('Aviso ao atualizar status do cliente:', updClientErr.message)
    }

    setContactSaving(false)
    setContactModalClient(null)
    void loadData()
  }

  // ── ESTILOS DAS ABAS SUBMENU ──
  const subTabsConfig: {
    key: CrmSubTab
    label: string
    icon: React.ComponentType<{ size?: number; className?: string }>
  }[] = [
    { key: 'visao-geral', label: 'Visão Geral', icon: UserCheck },
    { key: 'follow-up', label: 'Follow-up', icon: CalendarPlus },
    { key: 'produtividade', label: 'Produtividade', icon: BarChart3 },
    { key: 'atividades', label: 'Atividades V2', icon: Clock },
  ]

  return (
    <div className="min-h-full flex flex-col font-sans" style={{ background: '#F0F7EE' }}>
      {/* ── BARRA SUPERIOR DE SUBMENUS DO CRM (REQUISITO: SUBMENUS DENTRO DE CRM NA V2) ── */}
      <div className="bg-white border-b border-slate-200/90 px-4 sm:px-8 pt-4 pb-0 sticky top-0 z-30 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
              <span className="h-8 w-8 rounded-xl bg-[#0D6BAF] text-white inline-flex items-center justify-center text-sm shadow-xs">
                <UserCheck size={18} />
              </span>
              CRM & Follow-up
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Gestão de relacionamento, agenda e contatos estratégicos
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading}
              title="Recarregar e sincronizar dados do CRM"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition shadow-2xs cursor-pointer disabled:opacity-50"
            >
              <RotateCcw size={13} className={loading ? 'animate-spin text-[#0D6BAF]' : 'text-slate-500'} />
              <span>Sincronizar</span>
            </button>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider hidden sm:inline">
              Ambiente V2
            </span>
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </div>

        {/* Abas de Navegação dos Submenus */}
        <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto scrollbar-none border-t border-slate-100 pt-1">
          {subTabsConfig.map(({ key, label, icon: Icon }) => {
            const isActive = currentTab === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleSelectTab(key)}
                className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'border-[#0D6BAF] text-[#0D6BAF] bg-sky-50/50 rounded-t-lg'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-t-lg'
                }`}
              >
                <Icon size={14} className={isActive ? 'text-[#0D6BAF]' : 'text-slate-400'} />
                <span>{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── CONTEÚDO PRINCIPAL BASEADO NA ABA SELECIONADA ── */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 size={32} className="animate-spin text-[#0D6BAF]" />
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Carregando dados do CRM...
            </p>
          </div>
        ) : (
          <>
            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* ABA 1: VISÃO GERAL (EXATAMENTE O LAYOUT APRESENTADO NA IMAGEM)   */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            {currentTab === 'visao-geral' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Header da Visão Geral */}
            <div>
              <h2 className="text-2xl font-black tracking-tight text-slate-900">Visão geral</h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">{subtitleDate}</p>
            </div>

            {/* ── SEÇÃO: O QUE FAZER AGORA (EM ORDEM DE PRIORIDADE) ── */}
            <div className="space-y-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">O que fazer agora</h3>
                <p className="text-xs text-slate-400">Em ordem de prioridade</p>
              </div>

              {/* 3 Cards de Prioridade lado a lado */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Follow-ups Atrasados */}
                <div className="rounded-2xl border-2 border-amber-200/80 bg-amber-50/40 p-5 shadow-xs flex flex-col justify-between space-y-4">
                  <div className="flex items-start gap-3.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 border border-amber-200 shadow-2xs">
                      <Clock size={18} />
                    </span>
                    <div>
                      <h4 className="text-base font-extrabold text-slate-900">
                        {criticalTimelineStats.overdue} follow-ups atrasados
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                        {criticalTimelineStats.maxOverdueDays > 0
                          ? `O mais antigo está há ${criticalTimelineStats.maxOverdueDays} dias sem retorno.`
                          : 'Acompanhe contatos pendentes com urgência.'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSelectTab('follow-up')}
                    className="w-full rounded-xl bg-[#0D6BAF] hover:bg-[#095287] text-white py-2.5 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs active:scale-95"
                  >
                    Ver Atrasados
                  </button>
                </div>

                {/* 2. Clientes Sem Nenhum Contato */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between space-y-4">
                  <div className="flex items-start gap-3.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-[#0D6BAF] border border-sky-100 shadow-2xs">
                      <Users size={18} />
                    </span>
                    <div>
                      <h4 className="text-base font-extrabold text-slate-900">
                        {criticalTimelineStats.noContact} clientes sem nenhum contato
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                        Ainda não há registro de conversa com eles.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSelectTab('follow-up')}
                    className="w-full rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 py-2.5 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs active:scale-95"
                  >
                    Iniciar Contatos
                  </button>
                </div>

                {/* 3. Pedidos em Aberto */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between space-y-4">
                  <div className="flex items-start gap-3.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs">
                      <ShoppingBag size={18} />
                    </span>
                    <div>
                      <h4 className="text-base font-extrabold text-slate-900">
                        {openOrdersCount} pedidos em aberto · {formatarMoeda(openOrdersAmount)}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                        Ainda não foram finalizados nem entregues.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate('/v2/propostas-vendas')}
                    className="w-full rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 py-2.5 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs active:scale-95"
                  >
                    Ver Pedidos em Aberto
                  </button>
                </div>
              </div>
            </div>

            {/* ── SEÇÃO DA AGENDA: CALENDÁRIO (ESQUERDA) + REGISTROS DO DIA (DIREITA) EM TELAS MAIORES ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              {/* ── CARD 1: AGENDA DE {selectedMonthName.toUpperCase()} (CALENDÁRIO) ── */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs space-y-4 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Agenda de {selectedMonthName.toLowerCase()}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">Follow-ups marcados no mês</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => shiftCalendarMonth(-1)}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
                        title="Mês anterior"
                      >
                        <ChevronLeft size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => shiftCalendarMonth(1)}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
                        title="Próximo mês"
                      >
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Grade do Calendário Mensal */}
                  <div className="w-full">
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 pb-1">
                      {WEEKDAYS_SHORT.map((w) => (
                        <div key={w}>{w}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1 pt-1">
                      {cells.map((cell, idx) => {
                        if (!cell.date) {
                          return <div key={`empty-${idx}`} className="h-11 sm:h-12" />
                        }
                        const key = formatYmd(cell.date)
                        const n = countByDayInViewMonth.get(key) ?? 0
                        const todayKey = formatYmd(now)
                        const isToday = todayKey === key
                        const isPast = key < todayKey
                        const isSelected = selectedDay === key

                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setSelectedDay(key)}
                            className={`relative flex h-11 sm:h-13 flex-col items-center justify-between p-1 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                              isToday
                                ? 'bg-[#0D6BAF] text-white border-[#0D6BAF] shadow-xs'
                                : n > 0 && isPast
                                ? 'bg-amber-50 text-amber-950 border-amber-200 font-bold shadow-2xs hover:border-amber-400'
                                : n > 0
                                ? 'bg-sky-50 text-[#0D6BAF] border-sky-200 font-bold shadow-2xs hover:border-sky-400'
                                : 'border-slate-100 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/50'
                            } ${isSelected && !isToday ? 'ring-2 ring-[#0D6BAF] ring-offset-1' : ''} ${
                              isSelected && isToday ? 'ring-2 ring-sky-400 ring-offset-1' : ''
                            }`}
                          >
                            <span
                              className={`text-[11px] self-center ${
                                isToday ? 'text-white font-bold' : 'text-slate-800'
                              }`}
                            >
                              {cell.date.getDate()}
                            </span>
                            {isToday ? (
                              <span className="rounded bg-white/20 px-1 py-0.5 text-[8px] font-extrabold uppercase tracking-tight text-white">
                                Hoje
                              </span>
                            ) : n > 0 ? (
                              <span
                                className={`rounded px-1 py-0.5 text-[8px] leading-none text-center font-extrabold uppercase tracking-tight ${
                                  isPast ? 'text-amber-900 bg-amber-200/60' : 'text-[#0D6BAF] bg-sky-200/60'
                                }`}
                              >
                                {n} {isPast ? 'pend.' : 'follow-up'}
                              </span>
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Legenda do Calendário */}
                <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500 pt-3 border-t border-slate-100">
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#0D6BAF]" />
                    Hoje
                  </span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="w-2.5 h-2.5 rounded-sm bg-sky-100 border border-sky-300" />
                    Follow-up marcado
                  </span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="w-2.5 h-2.5 rounded-sm bg-amber-100 border border-amber-300" />
                    Passou sem registro
                  </span>
                </div>
              </div>

              {/* ── CARD 2: RELAÇÃO DE CONTATOS DO DIA SELECIONADO (AO LADO DO CALENDÁRIO EM TELAS MAIORES) ── */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0D6BAF] text-white shadow-2xs">
                        <Calendar size={16} />
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{selectedDayFormatted}</h4>
                        <p className="text-xs text-slate-500 font-medium">
                          {selectedDayClients.length === 0
                            ? 'Nenhum agendamento para este dia'
                            : `${selectedDayClients.length} ${
                                selectedDayClients.length === 1 ? 'cliente com retorno' : 'clientes com retorno'
                              }`}
                        </p>
                      </div>
                    </div>
                  </div>

                  {selectedDayClients.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-400 font-medium">
                      Nenhum contato marcado para esta data.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                      {selectedDayClients.map((client) => {
                        const parsed = splitFollowupNote(client.next_followup_note)
                        const phone = client.phone_1 || client.phone_2
                        const waUrl = buildWhatsappUrl(phone)

                        return (
                          <div
                            key={client.id}
                            className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-2 hover:border-slate-300 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => void handleOpenClientDrawer(client.id)}
                                className="text-left text-xs font-bold text-slate-900 hover:text-[#0D6BAF] hover:underline truncate cursor-pointer transition"
                                title="Visualizar e editar cadastro do cliente"
                              >
                                {client.full_name}
                              </button>
                              {phone && (
                                <span className="text-[10px] font-semibold text-slate-400 shrink-0">
                                  {formatPhone(phone)}
                                </span>
                              )}
                            </div>

                            {parsed.summary && (
                              <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                {parsed.summary}
                              </p>
                            )}

                            {/* Ações */}
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              {waUrl && (
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 px-2 py-1 text-[11px] font-bold transition shadow-2xs"
                                >
                                  <MessageCircle size={12} className="text-emerald-600" />
                                  <span>WhatsApp</span>
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => openContactModal(client)}
                                className="rounded-lg bg-[#0D6BAF] hover:bg-[#095287] text-white px-2.5 py-1 text-[11px] font-bold transition cursor-pointer shadow-2xs"
                              >
                                Registrar Contato
                              </button>
                              <button
                                type="button"
                                onClick={() => openScheduleModal(client)}
                                className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-2 py-1 text-[11px] font-bold transition cursor-pointer shadow-2xs"
                              >
                                Agendar
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleOpenClientDrawer(client.id)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-2 py-1 text-[11px] font-bold transition cursor-pointer shadow-2xs"
                                title="Visualizar e editar cadastro completo"
                              >
                                <User size={12} className="text-slate-500" />
                                <span>Cadastro</span>
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Botão Abrir Agenda Completa */}
                <button
                  type="button"
                  onClick={() => handleSelectTab('follow-up')}
                  className="w-full rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 py-2.5 text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-xs active:scale-95 mt-3"
                >
                  Abrir Agenda Completa
                </button>
              </div>
            </div>

            {/* ── SEÇÃO QUEM CONTATAR PRIMEIRO (LOGO ABAIXO DO CALENDÁRIO) ── */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Quem contatar primeiro</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Os mais atrasados no topo. Mostrando {topCriticalClients.length} de{' '}
                    {criticalTimelineStats.total}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectTab('follow-up')}
                  className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 text-xs font-bold transition-all cursor-pointer shadow-xs shrink-0"
                >
                  Ver todos os {criticalTimelineStats.total}
                </button>
              </div>

              {/* Lista dos mais atrasados */}
              {topCriticalClients.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-400 font-medium">
                  Nenhum outro contato atrasado pendente no momento.
                </p>
              ) : (
                <div className="space-y-3">
                  {topCriticalClients.map(({ client, isOverdue, lastTouchIso }) => {
                    const fullClient = clients.find((c) => c.id === client.id) || (client as ClientRow)
                    const rawPhone = fullClient.phone_1 || fullClient.phone_2
                    const waUrl = buildWhatsappUrl(rawPhone)
                    const diffDays = fullClient.next_followup_at
                      ? Math.floor((Date.now() - new Date(fullClient.next_followup_at).getTime()) / 86_400_000)
                      : 0

                    return (
                      <div
                        key={client.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleOpenClientDrawer(client.id)}
                              className="text-left text-sm font-bold text-slate-900 hover:text-[#0D6BAF] hover:underline truncate cursor-pointer transition"
                              title="Visualizar e editar cadastro completo"
                            >
                              {fullClient.full_name}
                            </button>
                            {isOverdue && diffDays > 0 && (
                              <span className="rounded-md bg-amber-100/70 border border-amber-200/80 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                                Atrasado há {diffDays} dias
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {lastTouchIso
                              ? `Último contato ${formatDateOnly(lastTouchIso)}`
                              : 'Sem contato prévio'}{' '}
                            · Próximo previsto {formatDateOnly(fullClient.next_followup_at)}
                          </p>
                          {rawPhone && (
                            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                              Tel: {formatPhone(rawPhone)}
                            </p>
                          )}
                        </div>

                        {/* Ações */}
                        <div className="flex items-center gap-2 shrink-0">
                          {waUrl ? (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 px-2.5 py-1.5 text-xs font-bold transition shadow-2xs"
                              title="Abrir no WhatsApp"
                            >
                              <MessageCircle size={13} className="text-emerald-600" />
                              <span className="hidden sm:inline">WhatsApp</span>
                            </a>
                          ) : (
                            <button
                              type="button"
                              disabled
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 text-slate-400 px-2 py-1.5 text-xs font-medium cursor-not-allowed opacity-60"
                            >
                              <MessageCircle size={13} />
                              <span className="hidden sm:inline">WhatsApp</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => openContactModal(fullClient)}
                            className="rounded-lg bg-[#0D6BAF] hover:bg-[#095287] text-white px-3 py-1.5 text-xs font-bold transition cursor-pointer shrink-0 shadow-xs active:scale-95"
                          >
                            Registrar contato
                          </button>

                          <button
                            type="button"
                            onClick={() => openScheduleModal(fullClient)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-2.5 py-1.5 text-xs font-bold transition cursor-pointer shrink-0 shadow-xs active:scale-95"
                            title="Agendar retorno"
                          >
                            <CalendarPlus size={13} className="text-slate-600" />
                            <span className="hidden sm:inline">Agendar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleOpenClientDrawer(client.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-2.5 py-1.5 text-xs font-bold transition cursor-pointer shrink-0 shadow-xs active:scale-95"
                            title="Visualizar e editar cadastro completo do cliente"
                          >
                            <User size={13} className="text-slate-500" />
                            <span className="hidden sm:inline">Cadastro</span>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* ABA 2: FOLLOW-UP (GESTÃO COMPLETA DE CLIENTES E RETORNOS)            */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        {currentTab === 'follow-up' && (
          <FollowupTabContent
            clients={clients}
            onSelectClient={setSelectedHistoryClient}
            onOpenClientDrawer={(id) => void handleOpenClientDrawer(id)}
          />
        )}

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* ABA 3: PRODUTIVIDADE (RELATÓRIOS E CONVERSÃO COMERCIAL)             */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        {currentTab === 'produtividade' && <ProdutividadeTabContent />}

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* ABA 4: ATIVIDADES V2 (MODELO DE LINHA DO TEMPO E ATIVIDADES DA V2)   */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        {currentTab === 'atividades' && <AtividadesTabContent />}
          </>
        )}
      </div>

      {/* ── MODAL DE AGENDAR FOLLOW-UP ── */}
      {scheduleModalClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Agendar Retorno / Follow-up</h3>
                <p className="text-xs text-slate-500 font-medium">{scheduleModalClient.full_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setScheduleModalClient(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Data do Agendamento</label>
                <input
                  type="date"
                  required
                  value={scheduleForm.next_followup_at}
                  onChange={(e) => setScheduleForm((prev) => ({ ...prev, next_followup_at: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium outline-none focus:border-[#0D6BAF]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Resumo / Assunto</label>
                <input
                  type="text"
                  placeholder="Ex: Retorno de orçamento, dúvidas colchão..."
                  value={scheduleForm.summary}
                  onChange={(e) => setScheduleForm((prev) => ({ ...prev, summary: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium outline-none focus:border-[#0D6BAF]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Observações detalhadas</label>
                <textarea
                  rows={3}
                  placeholder="Detalhes adicionais sobre a conversa..."
                  value={scheduleForm.notes}
                  onChange={(e) => setScheduleForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium outline-none focus:border-[#0D6BAF]"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={scheduleForm.contact_done}
                  onChange={(e) => setScheduleForm((prev) => ({ ...prev, contact_done: e.target.checked }))}
                  className="rounded text-[#0D6BAF] focus:ring-[#0D6BAF]"
                />
                <span className="text-xs font-semibold text-slate-700">
                  Registrar que houve contato com o cliente hoje
                </span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setScheduleModalClient(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={scheduleSaving}
                  className="px-5 py-2 rounded-xl bg-[#0D6BAF] hover:bg-[#095287] text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {scheduleSaving ? 'Salvando...' : 'Salvar Agendamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL DE REGISTRAR CONTATO ── */}
      {contactModalClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Registrar Contato Realizado</h3>
                <p className="text-xs text-slate-500 font-medium">{contactModalClient.full_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setContactModalClient(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveContact} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Data do Contato</label>
                  <input
                    type="date"
                    required
                    value={contactForm.contacted_at}
                    onChange={(e) => setContactForm((prev) => ({ ...prev, contacted_at: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium outline-none focus:border-[#0D6BAF]"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Canal</label>
                  <select
                    value={contactForm.channel}
                    onChange={(e) => setContactForm((prev) => ({ ...prev, channel: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium outline-none focus:border-[#0D6BAF] bg-white cursor-pointer"
                  >
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="LIGACAO">Ligação</option>
                    <option value="VISITA">Visita Presencial</option>
                    <option value="EMAIL">E-mail</option>
                    <option value="OUTRO">Outro</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Resumo do Contato</label>
                <input
                  type="text"
                  placeholder="Ex: Apresentou interesse na linha Eko'7..."
                  value={contactForm.result}
                  onChange={(e) => setContactForm((prev) => ({ ...prev, result: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium outline-none focus:border-[#0D6BAF]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Notas / Detalhes</label>
                <textarea
                  rows={3}
                  placeholder="Detalhes sobre a conversa, objeções ou próximos passos..."
                  value={contactForm.notes}
                  onChange={(e) => setContactForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium outline-none focus:border-[#0D6BAF]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setContactModalClient(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={contactSaving}
                  className="px-5 py-2 rounded-xl bg-[#0D6BAF] hover:bg-[#095287] text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {contactSaving ? 'Gravando...' : 'Salvar Contato'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
            {/* Indicador de carregamento dos dados do cliente */}
      {loadingClientDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-xs">
          <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-3 shadow-xl border border-slate-200">
            <Loader2 className="animate-spin text-[#0D6BAF]" size={20} />
            <span className="text-xs font-bold text-slate-700">Carregando dados do cliente...</span>
          </div>
        </div>
      )}

      {/* ── GAVETA DE VISUALIZAÇÃO E EDIÇÃO DO CLIENTE NO CRM ── */}
      <V2ClientDrawer
        open={drawerOpen}
        client={drawerClient}
        companyId={activeCompanyId}
        onClose={() => setDrawerOpen(false)}
        onSaved={handleClientDrawerSaved}
        onOpenClient={(newId) => void handleOpenClientDrawer(newId)}
      />
{/* ── MODAL FICHA DE HISTÓRICO DE FOLLOW-UP DO CLIENTE ── */}
      {selectedHistoryClient && (
        <V2ClientFollowupSheet
          client={selectedHistoryClient}
          companyId={activeCompanyId || selectedHistoryClient.company_id || '10000000-0000-4000-8000-000000000001'}
          isModal
          onClose={() => setSelectedHistoryClient(null)}
          onClientUpdated={() => {
            void loadData()
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-ABA 2: FOLLOW-UP (GESTÃO COMPLETA DE CLIENTES E FILTROS)
// ─────────────────────────────────────────────────────────────────────────────

function FollowupTabContent({
  clients,
  onSelectClient,
  onOpenClientDrawer,
}: {
  clients: ClientRow[]
  onSelectClient: (client: ClientRow) => void
  onOpenClientDrawer?: (clientId: string) => void
}) {
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'TODOS' | 'VENCIDOS' | 'HOJE' | 'PROXIMOS_7' | 'SEM_AGENDAMENTO'>('TODOS')

  const todayKey = formatYmd(new Date())

  const clientesFiltrados = useMemo(() => {
    return clients.filter((c) => {
      // Busca por texto
      if (busca.trim()) {
        const q = busca.toLowerCase()
        const matchName = c.full_name.toLowerCase().includes(q)
        const matchDoc = (c.cpf || '').includes(q)
        const matchNote = (c.next_followup_note || '').toLowerCase().includes(q)
        if (!matchName && !matchDoc && !matchNote) return false
      }

      // Filtro de data / agendamento
      if (filtroStatus === 'SEM_AGENDAMENTO') {
        return !c.next_followup_at
      }

      if (filtroStatus === 'VENCIDOS') {
        if (!c.next_followup_at) return false
        const k = toLocalDateKey(c.next_followup_at)
        return k < todayKey && (c.next_followup_status ?? 'PENDENTE') === 'PENDENTE'
      }

      if (filtroStatus === 'HOJE') {
        if (!c.next_followup_at) return false
        const k = toLocalDateKey(c.next_followup_at)
        return k === todayKey
      }

      if (filtroStatus === 'PROXIMOS_7') {
        if (!c.next_followup_at) return false
        const diff = Math.floor((new Date(c.next_followup_at).getTime() - Date.now()) / 86_400_000)
        return diff >= 0 && diff <= 7
      }

      return true
    })
  }, [clients, busca, filtroStatus, todayKey])

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Barra de Filtros e Busca */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Filtro:</span>
            {[
              { key: 'TODOS', label: 'Todos' },
              { key: 'VENCIDOS', label: 'Atrasados / Vencidos' },
              { key: 'HOJE', label: 'Hoje' },
              { key: 'PROXIMOS_7', label: 'Próximos 7 dias' },
              { key: 'SEM_AGENDAMENTO', label: 'Sem Agendamento' },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFiltroStatus(key as typeof filtroStatus)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  filtroStatus === key
                    ? 'bg-[#0D6BAF] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative min-w-[240px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar cliente por nome ou CPF..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-1.5 text-xs font-medium outline-none focus:border-[#0D6BAF]"
            />
          </div>
        </div>
      </div>

      {/* Tabela de Clientes em Follow-up */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 min-w-[700px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold uppercase text-[10px]">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-3 py-3">Telefone</th>
                <th className="px-3 py-3">Último Contato</th>
                <th className="px-3 py-3">Próximo Follow-up</th>
                <th className="px-3 py-3">Assunto / Observação</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clientesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-400">
                    Nenhum cliente encontrado neste filtro.
                  </td>
                </tr>
              ) : (
                clientesFiltrados.map((client) => {
                  const rawPhone = client.phone_1 || client.phone_2
                  const waUrl = buildWhatsappUrl(rawPhone)
                  const parsed = splitFollowupNote(client.next_followup_note)
                  const isOverdue =
                    client.next_followup_at &&
                    toLocalDateKey(client.next_followup_at) < todayKey &&
                    (client.next_followup_status ?? 'PENDENTE') === 'PENDENTE'

                  return (
                    <tr key={client.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-900">
                        <button
                          type="button"
                          onClick={() => onSelectClient(client)}
                          className="text-left font-bold text-slate-900 hover:text-[#0D6BAF] hover:underline cursor-pointer transition-colors"
                          title="Clique para abrir histórico e follow-up"
                        >
                          {client.full_name}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-slate-500 font-medium">{formatPhone(rawPhone) || '—'}</td>
                      <td className="px-3 py-3 text-slate-600">
                        {client.last_contact_at ? formatDateOnly(client.last_contact_at) : 'Sem contato'}
                      </td>
                      <td className="px-3 py-3">
                        {client.next_followup_at ? (
                          <span
                            className={`inline-flex items-center gap-1 font-bold ${
                              isOverdue ? 'text-amber-800' : 'text-slate-800'
                            }`}
                          >
                            {formatDateOnly(client.next_followup_at)}
                            {isOverdue && (
                              <span className="rounded bg-amber-100 text-amber-900 px-1 py-0.2 text-[9px]">
                                Atrasado
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-400">Não agendado</span>
                        )}
                      </td>
                      <td className="px-3 py-3 max-w-xs truncate text-slate-500">
                        {parsed.summary || parsed.details || '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {onOpenClientDrawer && (
                            <button
                              type="button"
                              onClick={() => onOpenClientDrawer(client.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-2.5 py-1.5 text-xs font-bold transition shadow-2xs cursor-pointer active:scale-95"
                              title="Visualizar e editar cadastro completo"
                            >
                              <User size={13} className="text-slate-500" />
                              <span className="hidden sm:inline">Cadastro</span>
                            </button>
                          )}
                          {waUrl ? (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-400/40 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition shadow-2xs font-bold text-xs"
                              title="Abrir WhatsApp"
                            >
                              <MessageCircle size={14} className="text-emerald-600" />
                              <span className="hidden sm:inline">WhatsApp</span>
                            </a>
                          ) : (
                            <span className="text-[11px] text-slate-300 italic">Sem WhatsApp</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-ABA 3: PRODUTIVIDADE COMERCIAL
// ─────────────────────────────────────────────────────────────────────────────

function ProdutividadeTabContent() {
  const { activeCompanyId } = useCompany()
  const [loading, setLoading] = useState(true)
  const [totalContatos, setTotalContatos] = useState(0)
  const [porCanal, setPorCanal] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!supabase || !activeCompanyId) return
    setLoading(true)
    void (async () => {
      const { data } = await supabase
        .from('bem_aviv_client_followups')
        .select('channel, contacted_at')
        .eq('company_id', activeCompanyId)
        .is('deleted_at', null)

      const rows = data || []
      setTotalContatos(rows.length)
      const counts: Record<string, number> = {}
      for (const r of rows) {
        const ch = r.channel || 'OUTRO'
        counts[ch] = (counts[ch] || 0) + 1
      }
      setPorCanal(counts)
      setLoading(false)
    })()
  }, [activeCompanyId])

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total de Contatos</span>
          <h3 className="text-3xl font-black text-slate-900 mt-1 tabular-nums">{totalContatos}</h3>
          <p className="text-xs text-slate-500 mt-1">Interações registradas com clientes</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Canal Mais Utilizado</span>
          <h3 className="text-xl font-black text-[#0D6BAF] mt-1 uppercase">
            {Object.keys(porCanal).length > 0 ? Object.entries(porCanal).sort((a, b) => b[1] - a[1])[0][0] : '—'}
          </h3>
          <p className="text-xs text-slate-500 mt-1">Preferência de contato</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Eficiência de Retorno</span>
          <h3 className="text-xl font-black text-emerald-600 mt-1">Alta</h3>
          <p className="text-xs text-slate-500 mt-1">Acompanhamento contínuo de prospecção</p>
        </div>
      </div>

      {/* Distribuição por canais */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-4">
        <h4 className="text-sm font-bold text-slate-900">Volume de Atendimento por Canal</h4>
        {loading ? (
          <p className="text-xs text-slate-400">Carregando métricas...</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(porCanal).map(([canal, qtd]) => {
              const pct = totalContatos > 0 ? (qtd / totalContatos) * 100 : 0
              return (
                <div key={canal} className="space-y-1">
                  <div className="flex justify-between text-xs font-bold text-slate-700">
                    <span>{canal}</span>
                    <span>{qtd} contatos ({pct.toFixed(0)}%)</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#0D6BAF] rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-ABA 4: ATIVIDADES V2 (HISTÓRICO E LINHA DO TEMPO)
// ─────────────────────────────────────────────────────────────────────────────

function AtividadesTabContent() {
  const [contatos, setContatos] = useState<CrmContato[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchContatos()
      .then(setContatos)
      .catch(() => setContatos([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-bold text-slate-900">Linha do Tempo de Atividades V2</h4>
            <p className="text-xs text-slate-500">Histórico detalhado de ligações, reuniões, visitas e mensagens</p>
          </div>
          <span className="text-xs font-bold text-slate-400">{contatos.length} atividades</span>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 size={24} className="animate-spin text-[#0D6BAF]" />
          </div>
        ) : contatos.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">Nenhuma atividade registrada na linha do tempo V2.</p>
        ) : (
          <div className="space-y-3">
            {contatos.map((c) => (
              <div key={c.id} className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">{c.cliente_nome || 'Cliente'}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-[#0D6BAF]">
                      {c.tipo}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-slate-700 mt-1">{c.assunto}</p>
                  {c.descricao && <p className="text-[11px] text-slate-500 mt-0.5">{c.descricao}</p>}
                </div>
                <span className="text-[10px] text-slate-400 font-medium shrink-0">
                  {formatarDataHora(c.ocorrido_em)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
