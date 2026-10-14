import { useUser } from '@clerk/clerk-react'
import {
  AlertTriangle,
  Calendar,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  MessageCircle,
  Plus,
  ShoppingBag,
  Users,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts'
import { SalesGoalsEditor } from '../components/bemAviv/SalesGoalsEditor'
import { useSupabase } from '../hooks/useSupabase'
import { useCompany } from '../context/CompanyContext'
import {
  effectiveAnnualGoalBrl,
  emptyMonthlyGoals,
  formatGoalMoneyInput,
  monthlyGoalsToDraft,
  parseGoalMoneyInput,
  parseMonthlyGoals,
  suggestMonthGoalFromHistory,
  sumYearToDateSold,
} from '../lib/salesGoals'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { cn } from '../lib/cn'
import { formatBRL } from '../lib/format'
import { buildWhatsappUrl } from '../lib/whatsapp'
import { dateInputToIso, formatDateOnly, todayInputDate, toInputDate } from '../lib/dates'
import {
  buildCriticalFollowupEntries,
  type ClientFollowupRow,
  fetchLatestFollowupsByClientIds,
} from '../lib/bemAvivClientFollowups'

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

const NO_CONTACT_ALERT_DAYS = 30
const EXCLUDED_FROM_CRITICAL_TIMELINE = new Set(['LEONARDO SILVA LEMOS', 'SUELEN JOAO ALVES'])
const EXCLUDED_FROM_FOLLOWUP_BY_CPF = new Set(['22112195867', '00742215903'])

const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

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
}

type FollowupHistoryRow = ClientFollowupRow

function includeInFollowupTimeline(c: ClientRow): boolean {
  const cpf = (c.cpf ?? '').replace(/\D/g, '')
  if (cpf && EXCLUDED_FROM_FOLLOWUP_BY_CPF.has(cpf)) return false
  if (!c.next_followup_at) return false
  const st = (c.next_followup_status ?? 'PENDENTE').toUpperCase()
  if (st === 'CANCELADO' || st === 'CONCLUIDO') return false
  return st === 'PENDENTE'
}

function toLocalDateKey(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0)
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
}

function monthKeyFromOrderDate(orderDate: string) {
  return orderDate.slice(0, 7)
}

function parseMonthKey(monthKey: string) {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date((y ?? 1970), (m ?? 1) - 1, 1, 12, 0, 0, 0)
}

function monthKeyFromDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function addMonthsToKey(monthKey: string, diff: number) {
  const d = parseMonthKey(monthKey)
  d.setMonth(d.getMonth() + diff)
  return monthKeyFromDate(d)
}

function formatYmd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function calendarCells(viewMonth: Date) {
  const first = startOfMonth(viewMonth)
  const last = endOfMonth(viewMonth)
  const lead = first.getDay()
  const daysInMonth = last.getDate()
  const cells: Array<{ date: Date | null; inMonth: boolean }> = []
  for (let i = 0; i < lead; i++) cells.push({ date: null, inMonth: false })
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day, 12, 0, 0, 0), inMonth: true })
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, inMonth: false })
  return cells
}

export function BemAvivHomePage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const navigate = useNavigate()
  const { activeCompanyId, activeCompany, loading: companyLoading } = useCompany()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const followupActorName = (user?.fullName || user?.primaryEmailAddress?.emailAddress || ownerUserId || 'USUÁRIO').trim().toUpperCase()

  const [loading, setLoading] = useState(true)
  const [totalSold, setTotalSold] = useState(0)
  const [soldOrdersCount, setSoldOrdersCount] = useState(0)
  const [openOrdersCount, setOpenOrdersCount] = useState(0)
  const [openOrdersAmount, setOpenOrdersAmount] = useState(0)
  const [monthlyTotals, setMonthlyTotals] = useState<Record<string, number>>({})
  const [monthlyOpenTotals, setMonthlyOpenTotals] = useState<Record<string, number>>({})
  const [monthlyOrderCounts, setMonthlyOrderCounts] = useState<Record<string, number>>({})
  const [monthlyOpenCounts, setMonthlyOpenCounts] = useState<Record<string, number>>({})
  const [monthlySoldAllTime, setMonthlySoldAllTime] = useState<Record<string, number>>({})
  
  const [goalYear, setGoalYear] = useState(() => new Date().getFullYear())
  const [currentDashMonth, setCurrentDashMonth] = useState(() => new Date().getMonth() + 1)
  
  const [annualGoalDraft, setAnnualGoalDraft] = useState('')
  const [monthlyGoalsDraft, setMonthlyGoalsDraft] = useState<Record<string, string>>(() =>
    monthlyGoalsToDraft(emptyMonthlyGoals()),
  )
  const [goalsLoading, setGoalsLoading] = useState(false)
  const [goalsSaving, setGoalsSaving] = useState(false)
  const [goalsMsg, setGoalsMsg] = useState<string | null>(null)
  const [isGoalsModalOpen, setIsGoalsModalOpen] = useState(false)

  const [clients, setClients] = useState<ClientRow[]>([])
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [scheduleModalClient, setScheduleModalClient] = useState<ClientRow | null>(null)
  const [scheduleForm, setScheduleForm] = useState({
    next_followup_at: '',
    summary: '',
    notes: '',
    contact_done: false,
  })
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleMsg, setScheduleMsg] = useState<string | null>(null)
  const [quickScheduleModalDay, setQuickScheduleModalDay] = useState<string | null>(null)
  const [clientSearchQuery, setClientSearchQuery] = useState('')
  const [historyModalClient, setHistoryModalClient] = useState<ClientRow | null>(null)
  const [historyModalRows, setHistoryModalRows] = useState<FollowupHistoryRow[]>([])
  const [historyModalLoading, setHistoryModalLoading] = useState(false)
  const [latestContactByClient, setLatestContactByClient] = useState<Record<string, ClientFollowupRow>>({})
  const [latestFollowupsReady, setLatestFollowupsReady] = useState(false)
  const [registerInlineOpen, setRegisterInlineOpen] = useState(false)
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null)
  const [registerInlineSaving, setRegisterInlineSaving] = useState(false)
  const [registerInlineForm, setRegisterInlineForm] = useState({
    contacted_at: todayInputDate(),
    channel: 'WHATSAPP',
    result: '',
    notes: '',
  })

  const load = useCallback(async () => {
    if (!supabase || !activeCompanyId) {
      setLoading(false)
      return
    }
    setLoading(true)

    const [ordersRes, clientsRes] = await Promise.all([
      supabase
        .from('bem_aviv_sales_orders')
        .select('order_date, total_amount, document_type, status, converted_order_id')
        .eq('company_id', activeCompanyId)
        .in('document_type', ['ORCAMENTO', 'PEDIDO'])
        .in('status', ['ABERTO', 'FINALIZADO', 'ENTREGA PENDENTE', 'ENTREGA PARCIAL', 'ENTREGUE', 'CANCELADO']),
      supabase
        .from('bem_aviv_clients')
        .select('id, full_name, cpf, last_contact_at, next_followup_at, next_followup_status, phone_1, phone_2, next_followup_note')
        .eq('company_id', activeCompanyId),
    ])

    if (ordersRes.error) console.error(ordersRes.error)
    if (clientsRes.error) console.error(clientsRes.error)

    const orders = (ordersRes.data ?? []) as Array<{
      order_date: string
      total_amount: number
      document_type: string
      status: string
      converted_order_id: string | null
    }>

    const soldStatuses = new Set(['FINALIZADO', 'ENTREGA PENDENTE', 'ENTREGA PARCIAL', 'ENTREGUE'])
    const now = new Date()

    let sum = 0
    let openCount = 0
    let openAmount = 0
    let soldCount = 0
    const byMonth: Record<string, number> = {}
    const byMonthOpen: Record<string, number> = {}
    const byMonthOrderCount: Record<string, number> = {}
    const byMonthOpenCount: Record<string, number> = {}
    const byMonthAllTime: Record<string, number> = {}

    for (const o of orders) {
      const docType = (o.document_type ?? '').toUpperCase()
      const st = (o.status ?? '').toUpperCase()
      const amt = Number(o.total_amount ?? 0)
      const dt = new Date(o.order_date)
      const inPeriod = !Number.isNaN(dt.getTime()) && dt <= now
      if (docType !== 'PEDIDO') continue
      const mk = monthKeyFromOrderDate(o.order_date || '')
      if (soldStatuses.has(st) && Number.isFinite(amt) && mk.length >= 7) {
        byMonthAllTime[mk] = (byMonthAllTime[mk] ?? 0) + amt
      }
      if (!inPeriod) continue
      if (st === 'ABERTO') {
        openCount += 1
        if (Number.isFinite(amt)) openAmount += amt
        if (mk.length >= 7 && Number.isFinite(amt)) {
          byMonthOpen[mk] = (byMonthOpen[mk] ?? 0) + amt
          byMonthOpenCount[mk] = (byMonthOpenCount[mk] ?? 0) + 1
        }
      }
      if (!soldStatuses.has(st)) continue
      if (!Number.isFinite(amt)) continue
      sum += amt
      soldCount += 1
      if (mk.length < 7) continue
      byMonth[mk] = (byMonth[mk] ?? 0) + amt
      byMonthOrderCount[mk] = (byMonthOrderCount[mk] ?? 0) + 1
    }
    setMonthlySoldAllTime(byMonthAllTime)
    setTotalSold(sum)
    setSoldOrdersCount(soldCount)
    setOpenOrdersCount(openCount)
    setOpenOrdersAmount(openAmount)
    setMonthlyTotals(byMonth)
    setMonthlyOpenTotals(byMonthOpen)
    setMonthlyOrderCounts(byMonthOrderCount)
    setMonthlyOpenCounts(byMonthOpenCount)

    setClients(((clientsRes.data ?? []) as ClientRow[]) ?? [])
    setLoading(false)
  }, [supabase, activeCompanyId])

  useEffect(() => {
    void load()
  }, [load])

  const loadGoals = useCallback(async () => {
    if (!supabase || !activeCompanyId) return
    setGoalsLoading(true)
    setGoalsMsg(null)
    const { data, error } = await supabase
      .from('company_sales_goals')
      .select('annual_goal, monthly_goals')
      .eq('company_id', activeCompanyId)
      .eq('year', goalYear)
      .maybeSingle()
    setGoalsLoading(false)
    if (error) {
      setGoalsMsg(error.message)
      setAnnualGoalDraft('')
      setMonthlyGoalsDraft(monthlyGoalsToDraft(emptyMonthlyGoals()))
      return
    }
    if (!data) {
      setAnnualGoalDraft('')
      setMonthlyGoalsDraft(monthlyGoalsToDraft(emptyMonthlyGoals()))
      return
    }
    const annual = Number((data as { annual_goal: number }).annual_goal ?? 0)
    setAnnualGoalDraft(annual > 0 ? formatGoalMoneyInput(annual) : '')
    const monthlyParsed = parseMonthlyGoals((data as { monthly_goals: unknown }).monthly_goals)
    setMonthlyGoalsDraft(monthlyGoalsToDraft(monthlyParsed))
  }, [supabase, activeCompanyId, goalYear])

  useEffect(() => {
    void loadGoals()
  }, [loadGoals])

  async function saveGoals() {
    if (!supabase || !activeCompanyId) return
    setGoalsSaving(true)
    setGoalsMsg(null)
    const annual_goal = parseGoalMoneyInput(annualGoalDraft)
    const monthly_goals: Record<string, number> = {}
    for (let m = 1; m <= 12; m++) {
      const key = String(m)
      monthly_goals[key] = parseGoalMoneyInput(monthlyGoalsDraft[key] ?? '')
    }
    const payload = {
      company_id: activeCompanyId,
      year: goalYear,
      annual_goal,
      monthly_goals,
      updated_at: new Date().toISOString(),
    }
    const { data: existing } = await supabase
      .from('company_sales_goals')
      .select('id')
      .eq('company_id', activeCompanyId)
      .eq('year', goalYear)
      .maybeSingle()
    const { error } = existing?.id
      ? await supabase.from('company_sales_goals').update(payload).eq('id', existing.id)
      : await supabase.from('company_sales_goals').insert(payload)
    setGoalsSaving(false)
    if (error) setGoalsMsg(error.message)
    else {
      setGoalsMsg('Metas salvas.')
      setTimeout(() => {
        setIsGoalsModalOpen(false)
        setGoalsMsg(null)
        void loadGoals()
      }, 800)
    }
  }

  function applySuggestionsAll() {
    const next = { ...monthlyGoalsDraft }
    for (let m = 1; m <= 12; m++) {
      const key = String(m)
      const suggestion = suggestMonthGoalFromHistory(m, monthlySoldAllTime, goalYear)
      if (suggestion != null) next[key] = formatGoalMoneyInput(suggestion)
    }
    setMonthlyGoalsDraft(next)
    setGoalsMsg('Sugestões aplicadas com base no histórico de vendas.')
  }

  const monthlyGoalsParsed = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(monthlyGoalsDraft).map(([k, v]) => [k, parseGoalMoneyInput(v)]),
      ),
    [monthlyGoalsDraft],
  )
  const annualGoalNum = useMemo(
    () =>
      effectiveAnnualGoalBrl(parseGoalMoneyInput(annualGoalDraft), monthlyGoalsParsed, activeCompany?.company_kind),
    [annualGoalDraft, monthlyGoalsParsed, activeCompany?.company_kind],
  )
  const yearToDateSold = useMemo(
    () => sumYearToDateSold(monthlySoldAllTime, goalYear),
    [monthlySoldAllTime, goalYear],
  )
  const soldForProgress = useMemo(
    () => yearToDateSold,
    [yearToDateSold],
  )

  // ── Calendário e datas do mês selecionado ──────────────────
  const now = new Date()
  const isCurrentYearAndMonth = goalYear === now.getFullYear() && currentDashMonth === now.getMonth() + 1
  
  // Total de dias no mês
  const totalDaysInMonth = useMemo(() => {
    return new Date(goalYear, currentDashMonth, 0).getDate()
  }, [goalYear, currentDashMonth])

  // Dia corrente considerado
  const currentDayInMonth = useMemo(() => {
    if (isCurrentYearAndMonth) return now.getDate()
    if (goalYear < now.getFullYear() || (goalYear === now.getFullYear() && currentDashMonth < now.getMonth() + 1)) {
      return totalDaysInMonth // mês já passou
    }
    return 1 // mês futuro
  }, [isCurrentYearAndMonth, goalYear, currentDashMonth, now, totalDaysInMonth])

  const remainingDaysInMonth = Math.max(1, totalDaysInMonth - currentDayInMonth)

  // ── Métricas do mês ────────────────────────────────────────
  const currentMonthKey = `${goalYear}-${String(currentDashMonth).padStart(2, '0')}`
  const prevMonthKey = addMonthsToKey(currentMonthKey, -1)

  const currentMonthSold = monthlyTotals[currentMonthKey] ?? 0
  const currentMonthOpenAmount = monthlyOpenTotals[currentMonthKey] ?? 0
  const currentMonthOrdersCount = monthlyOrderCounts[currentMonthKey] ?? 0
  const currentMonthGoal = monthlyGoalsParsed[String(currentDashMonth)] ?? 0
  
  const monthProgressPct = currentMonthGoal > 0 ? (currentMonthSold / currentMonthGoal) * 100 : 0
  const faltamValor = Math.max(0, currentMonthGoal - currentMonthSold)

  // Ramo de ritmo e projeções diárias
  const dailyRunRate = currentDayInMonth > 0 ? currentMonthSold / currentDayInMonth : 0
  const dailyNeeded = remainingDaysInMonth > 0 ? faltamValor / remainingDaysInMonth : 0
  const projectedAtCurrentRate = dailyRunRate * totalDaysInMonth
  const projectedPctOfGoal = currentMonthGoal > 0 ? (projectedAtCurrentRate / currentMonthGoal) * 100 : 0

  // Esperado até hoje se ritmo fosse linear
  const expectedPaceUntilToday = currentMonthGoal > 0 ? (currentMonthGoal / totalDaysInMonth) * currentDayInMonth : 0
  const pacePercentageOfDay = totalDaysInMonth > 0 ? (currentDayInMonth / totalDaysInMonth) * 100 : 0

  // Vendas vs mês anterior
  const prevMonthSold = monthlyTotals[prevMonthKey] ?? 0
  const monthVsLastMonthPct = prevMonthSold > 0 ? ((currentMonthSold - prevMonthSold) / prevMonthSold) * 100 : null

  // Ticket médio do mês e histórico
  const currentMonthAvgTicket = currentMonthOrdersCount > 0 ? currentMonthSold / currentMonthOrdersCount : 0
  const avgTicketHistorical = soldOrdersCount > 0 ? totalSold / soldOrdersCount : 0
  const avgTicketDiffPct = avgTicketHistorical > 0 ? ((currentMonthAvgTicket - avgTicketHistorical) / avgTicketHistorical) * 100 : null

  // Meta anual
  const annualProgressPct = annualGoalNum > 0 ? (soldForProgress / annualGoalNum) * 100 : 0
  const annualFaltam = Math.max(0, annualGoalNum - soldForProgress)
  const annualProjection = totalSold + openOrdersAmount
  const annualProjectionPct = annualGoalNum > 0 ? (annualProjection / annualGoalNum) * 100 : 0

  // Follow-ups e contatos
  const pendingWithDate = useMemo(() => clients.filter(includeInFollowupTimeline), [clients])

  useEffect(() => {
    if (!supabase || !activeCompanyId) {
      setLatestContactByClient({})
      setLatestFollowupsReady(true)
      return
    }
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
        const { latestContact } = await fetchLatestFollowupsByClientIds(supabase, activeCompanyId, ids)
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
  }, [clients, supabase, activeCompanyId])

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

  // Contagem para o calendário do mês visualizado
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

  // Meses cadastrados de meta
  const monthsWithGoalConfigured = useMemo(() => {
    const months = []
    for (let m = 1; m <= 12; m++) {
      if ((monthlyGoalsParsed[String(m)] ?? 0) > 0) {
        months.push(MONTH_NAMES[m - 1])
      }
    }
    return months
  }, [monthlyGoalsParsed])

  // ── Gráfico mês a mês (12 últimos meses) ────────────────────
  const chartMonths = useMemo(() => {
    const anchor = new Date(goalYear, currentDashMonth - 1, 1)
    const out: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1)
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return out
  }, [goalYear, currentDashMonth])

  const chartData = useMemo(() => {
    let maxVal = 0
    let maxKey = ''
    chartMonths.forEach((mk) => {
      const val = monthlyTotals[mk] ?? 0
      if (val > maxVal) {
        maxVal = val
        maxKey = mk
      }
    })

    return chartMonths.map((mk) => {
      const v = monthlyTotals[mk] ?? 0
      const [y, mo] = mk.split('-')
      const isSelectedMonth = mk === currentMonthKey
      const isBestMonth = mk === maxKey && maxVal > 0
      return {
        key: mk,
        label: `${mo}/${y?.slice(2)}`,
        totalConfirmed: v,
        isSelectedMonth,
        isBestMonth,
      }
    })
  }, [chartMonths, monthlyTotals, currentMonthKey])

  const cells = useMemo(() => calendarCells(calendarMonth), [calendarMonth])

  function shiftCalendarMonth(delta: number) {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1, 12, 0, 0, 0))
  }

  // Follow-up modal functions
  async function openHistoryModal(client: ClientRow) {
    if (!supabase || !ownerUserId || !activeCompanyId) return
    setHistoryModalClient(client)
    setEditingHistoryId(null)
    setRegisterInlineOpen(false)
    setRegisterInlineSaving(false)
    setRegisterInlineForm({
      contacted_at: todayInputDate(),
      channel: 'WHATSAPP',
      result: '',
      notes: '',
    })
    setHistoryModalRows([])
    setHistoryModalLoading(true)
    const { data, error } = await supabase
      .from('bem_aviv_client_followups')
      .select('id, client_id, contacted_at, channel, created_by_name, result, notes')
      .is('deleted_at', null)
      .eq('company_id', activeCompanyId)
      .eq('client_id', client.id)
      .order('contacted_at', { ascending: false })
      .limit(200)
    if (error) {
      setHistoryModalRows([])
      setHistoryModalLoading(false)
      return
    }
    setHistoryModalRows((data ?? []) as FollowupHistoryRow[])
    setHistoryModalLoading(false)
  }

  async function refetchHistoryModalRows(client: ClientRow): Promise<FollowupHistoryRow[]> {
    if (!supabase || !ownerUserId || !activeCompanyId) return []
    const { data, error } = await supabase
      .from('bem_aviv_client_followups')
      .select('id, client_id, contacted_at, channel, created_by_name, result, notes')
      .is('deleted_at', null)
      .eq('company_id', activeCompanyId)
      .eq('client_id', client.id)
      .order('contacted_at', { ascending: false })
      .limit(200)
    if (error) return []
    return (data ?? []) as FollowupHistoryRow[]
  }

  async function submitInlineFollowup(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId || !historyModalClient || !activeCompanyId) return
    if (!registerInlineForm.contacted_at) return

    setRegisterInlineSaving(true)
    const contactedAtIso = dateInputToIso(registerInlineForm.contacted_at)
    const followupUserId = ownerUserId.toUpperCase()

    if (editingHistoryId) {
      const { error: updateError } = await supabase
        .from('bem_aviv_client_followups')
        .update({
          contacted_at: contactedAtIso,
          channel: registerInlineForm.channel,
          created_by_name: followupActorName,
          updated_by_user_id: user?.id ?? null,
          updated_by_name: followupActorName,
          result: registerInlineForm.result || null,
          notes: registerInlineForm.notes || null,
        })
        .eq('id', editingHistoryId)
        .eq('company_id', activeCompanyId)

      if (updateError) {
        setRegisterInlineSaving(false)
        return
      }

      const rows = await refetchHistoryModalRows(historyModalClient)
      setHistoryModalRows(rows)
      const latestContact = rows.find((r) => r.channel !== 'AGENDAMENTO')
      if (latestContact) {
        await supabase
          .from('bem_aviv_clients')
          .update({ last_contact_at: latestContact.contacted_at })
          .eq('id', historyModalClient.id)
          .eq('company_id', activeCompanyId)
        setLatestContactByClient((prev) => ({ ...prev, [historyModalClient.id]: latestContact }))
        setClients((prev) =>
          prev.map((c) => (c.id === historyModalClient.id ? { ...c, last_contact_at: latestContact.contacted_at } : c)),
        )
      }

      setEditingHistoryId(null)
      setRegisterInlineOpen(false)
      setRegisterInlineForm({
        contacted_at: todayInputDate(),
        channel: 'WHATSAPP',
        result: '',
        notes: '',
      })
      setRegisterInlineSaving(false)
      return
    }

    const { error: insertError } = await supabase.from('bem_aviv_client_followups').insert({
      user_id: followupUserId,
      company_id: activeCompanyId,
      created_by_user_id: user?.id ?? null,
      created_by_name: followupActorName,
      client_id: historyModalClient.id,
      contacted_at: contactedAtIso,
      channel: registerInlineForm.channel,
      result: registerInlineForm.result || null,
      notes: registerInlineForm.notes || null,
    })

    if (insertError) {
      setRegisterInlineSaving(false)
      return
    }

    await supabase
      .from('bem_aviv_clients')
      .update({
        last_contact_at: contactedAtIso,
        next_followup_status: 'CONCLUIDO',
      })
      .eq('id', historyModalClient.id)
      .eq('company_id', activeCompanyId)

    setClients((prev) =>
      prev.map((c) =>
        c.id === historyModalClient.id ? { ...c, last_contact_at: contactedAtIso, next_followup_status: 'CONCLUIDO' } : c,
      ),
    )
    if (registerInlineForm.channel !== 'AGENDAMENTO') {
      setLatestContactByClient((prev) => ({
        ...prev,
        [historyModalClient.id]: {
          id: `tmp-${Date.now()}`,
          client_id: historyModalClient.id,
          contacted_at: contactedAtIso,
          channel: registerInlineForm.channel,
          created_by_name: followupActorName,
          result: registerInlineForm.result || null,
          notes: registerInlineForm.notes || null,
        },
      }))
    }

    await openHistoryModal(historyModalClient)
    setRegisterInlineSaving(false)
  }

  const clientMap = useMemo(() => {
    const map = new Map<string, ClientRow>()
    for (const c of clients) map.set(c.id, c)
    return map
  }, [clients])

  const selectedDayFormatted = useMemo(() => {
    if (!selectedDay) return ''
    const [y, m, d] = selectedDay.split('-').map(Number)
    if (!y || !m || !d) return selectedDay
    const dt = new Date(y, m - 1, d, 12, 0, 0)
    const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(dt)
    const weekdayCap = weekday.charAt(0).toUpperCase() + weekday.slice(1)
    return `${weekdayCap}, ${d} de ${MONTH_NAMES[m - 1]?.toLowerCase()} de ${y}`
  }, [selectedDay])

  const selectedDayClients = useMemo(() => {
    if (!selectedDay) return []
    return clients.filter((c) => {
      if (!c.next_followup_at) return false
      const st = (c.next_followup_status ?? 'PENDENTE').toUpperCase()
      if (st === 'CANCELADO') return false
      const key = toLocalDateKey(c.next_followup_at)
      return key === selectedDay
    })
  }, [clients, selectedDay])

  const filteredClientsForQuickSchedule = useMemo(() => {
    const q = clientSearchQuery.trim().toLowerCase()
    if (!q) return clients.slice(0, 40)
    return clients
      .filter((c) => c.full_name.toLowerCase().includes(q) || (c.phone_1 && c.phone_1.includes(q)) || (c.phone_2 && c.phone_2.includes(q)))
      .slice(0, 40)
  }, [clients, clientSearchQuery])

  function openDirectContactModal(client: ClientRow) {
    void openHistoryModal(client)
    setRegisterInlineOpen(true)
  }

  function openDirectScheduleModal(client: ClientRow, prefillDate?: string) {
    const parsed = splitFollowupNote(client.next_followup_note)
    const defaultDate = prefillDate || toInputDate(client.next_followup_at) || todayInputDate()
    setScheduleModalClient(client)
    setScheduleMsg(null)
    setScheduleForm({
      next_followup_at: defaultDate,
      summary: parsed.summary,
      notes: parsed.details,
      contact_done: false,
    })
  }

  async function submitScheduleForm(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !scheduleModalClient || !activeCompanyId) return
    if (!scheduleForm.next_followup_at) {
      setScheduleMsg('Selecione a data do agendamento.')
      return
    }
    setScheduleSaving(true)
    setScheduleMsg(null)

    const isoDate = dateInputToIso(scheduleForm.next_followup_at)
    const fullNote = composeFollowupNote(scheduleForm.summary, scheduleForm.notes)
    const nowIso = new Date().toISOString()

    const updateData: Record<string, unknown> = {
      next_followup_at: isoDate,
      next_followup_note: fullNote || null,
      next_followup_status: 'PENDENTE',
    }

    if (scheduleForm.contact_done) {
      updateData.last_contact_at = nowIso
    }

    const { error: clientErr } = await supabase
      .from('bem_aviv_clients')
      .update(updateData)
      .eq('id', scheduleModalClient.id)
      .eq('company_id', activeCompanyId)

    if (clientErr) {
      setScheduleMsg(clientErr.message)
      setScheduleSaving(false)
      return
    }

    if (scheduleForm.contact_done) {
      const followupUserId = ownerUserId ? ownerUserId.toUpperCase() : null
      await supabase.from('bem_aviv_client_followups').insert({
        user_id: followupUserId,
        company_id: activeCompanyId,
        created_by_user_id: user?.id ?? null,
        created_by_name: followupActorName,
        client_id: scheduleModalClient.id,
        contacted_at: nowIso,
        channel: 'WHATSAPP',
        result: scheduleForm.summary || 'Follow-up agendado com contato prévio',
        notes: scheduleForm.notes || null,
      })
    }

    setClients((prev) =>
      prev.map((c) =>
        c.id === scheduleModalClient.id
          ? {
              ...c,
              next_followup_at: isoDate,
              next_followup_note: fullNote || null,
              next_followup_status: 'PENDENTE',
              last_contact_at: scheduleForm.contact_done ? nowIso : c.last_contact_at,
            }
          : c,
      ),
    )

    setScheduleSaving(false)
    setScheduleModalClient(null)
    void load()
  }

  async function removeScheduledFollowup() {
    if (!supabase || !scheduleModalClient || !activeCompanyId) return
    if (!confirm('Deseja excluir o agendamento deste cliente?')) return
    setScheduleSaving(true)
    const { error } = await supabase
      .from('bem_aviv_clients')
      .update({
        next_followup_at: null,
        next_followup_note: null,
        next_followup_status: 'PENDENTE',
      })
      .eq('id', scheduleModalClient.id)
      .eq('company_id', activeCompanyId)

    setScheduleSaving(false)
    if (error) {
      setScheduleMsg(error.message)
      return
    }

    setClients((prev) =>
      prev.map((c) =>
        c.id === scheduleModalClient.id
          ? { ...c, next_followup_at: null, next_followup_note: null, next_followup_status: 'PENDENTE' }
          : c,
      ),
    )
    setScheduleModalClient(null)
    void load()
  }

  // Formatação do subtítulo da página
  const subtitleDate = useMemo(() => {
    const weekdayStr = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(now)
    const capitalizedWeekday = weekdayStr.charAt(0).toUpperCase() + weekdayStr.slice(1)
    const monthStr = MONTH_NAMES[currentDashMonth - 1]?.toLowerCase()
    return `${capitalizedWeekday}, ${currentDayInMonth} de ${monthStr} de ${goalYear} · dia ${currentDayInMonth} de ${totalDaysInMonth} do mês`
  }, [now, currentDayInMonth, currentDashMonth, goalYear, totalDaysInMonth])

  // Lista dos 4 primeiros para "Quem contatar primeiro"
  const topCriticalClients = useMemo(() => {
    return criticalTimelineClients.slice(0, 4)
  }, [criticalTimelineClients])

  const selectedMonthName = MONTH_NAMES[currentDashMonth - 1] ?? 'Mês'

  return (
    <div className="w-full min-w-0 max-w-7xl mx-auto space-y-6 text-slate-800 antialiased pb-12 font-sans">
      {/* ── HEADER SUPERIOR ───────────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-4 pt-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{"EKO'7 — Visão geral"}</h1>
          <p className="mt-0.5 text-xs text-slate-500 font-medium">
            {subtitleDate}
          </p>
        </div>

        {/* Seletores pill no topo direito */}
        <div className="flex items-center gap-2">
          <select
            value={currentDashMonth}
            onChange={(e) => setCurrentDashMonth(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-xs hover:border-slate-300 transition-all cursor-pointer outline-none"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i + 1} value={i + 1}>{name} de {goalYear}</option>
            ))}
          </select>
          <select
            value={goalYear}
            onChange={(e) => setGoalYear(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-xs hover:border-slate-300 transition-all cursor-pointer outline-none"
          >
            {[goalYear - 1, goalYear, goalYear + 1].map((y) => (
              <option key={y} value={y}>Ano {y}</option>
            ))}
          </select>
        </div>
      </header>

      {!supabase || !ownerUserId ? (
        <p className="text-sm text-slate-500 animate-pulse">Conectando ao Supabase…</p>
      ) : !activeCompanyId && companyLoading ? (
        <p className="text-sm text-slate-500 animate-pulse">Carregando empresa…</p>
      ) : !activeCompanyId ? (
        <p className="text-sm text-slate-500">Nenhuma empresa disponível para esta conta.</p>
      ) : loading ? (
        <p className="text-sm text-slate-400 animate-pulse">Carregando indicadores…</p>
      ) : (
        <>
          {/* ── SEÇÃO SUPERIOR: META DO MÊS + O QUE FAZER AGORA ─────── */}
          <section className="grid gap-6 lg:grid-cols-12 items-start">
            {/* CARD PRINCIPAL DE META MENSAL (8 COLS) */}
            <div className="lg:col-span-8 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-5">
              {/* Badges superiores */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-200/60 uppercase tracking-wide">
                  <AlertTriangle size={12} className="text-amber-600" />
                  {monthProgressPct < (pacePercentageOfDay * 0.7)
                    ? 'Atenção · Abaixo do ritmo'
                    : 'Acompanhamento de ritmo'}
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  Meta do mês: <strong className="text-slate-700">{formatBRL(currentMonthGoal)}</strong>
                </span>
              </div>

              {/* Título de status da meta */}
              <div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 leading-snug">
                  {currentMonthGoal > 0 && currentMonthSold >= currentMonthGoal ? (
                    `Parabéns! Meta de ${selectedMonthName} atingida!`
                  ) : (
                    `${selectedMonthName} está ${
                      monthProgressPct < (pacePercentageOfDay * 0.7) ? 'bem abaixo' : 'abaixo'
                    } da meta: faltam ${formatBRL(faltamValor)} em ${remainingDaysInMonth} dias.`
                  )}
                </h2>
                <p className="mt-1.5 text-xs text-slate-600 leading-relaxed font-normal">
                  Seria preciso vender <strong className="text-slate-900 font-semibold">{formatBRL(dailyNeeded)} por dia</strong> daqui até o fim do mês. O ritmo atual é de <strong className="text-slate-900 font-semibold">{formatBRL(dailyRunRate)} por dia</strong>.
                </p>
              </div>

              {/* Barra de Progresso com Marcador */}
              <div className="space-y-2 pt-1">
                <div className="flex items-baseline justify-between text-xs">
                  <div>
                    <span className="text-lg font-extrabold text-slate-900">{formatBRL(currentMonthSold)}</span>
                    <span className="text-slate-500 font-medium ml-1.5">
                      realizados · {monthProgressPct.toFixed(1)}% da meta
                    </span>
                  </div>
                  <span className="text-slate-500 font-medium text-xs">
                    Meta {formatBRL(currentMonthGoal)}
                  </span>
                </div>

                <div className="relative pt-6">
                  {/* Marcador flutuante "Esperado até hoje" */}
                  <div
                    className="absolute top-0 -translate-x-1/2 flex flex-col items-center pointer-events-none transition-all duration-300"
                    style={{ left: `${Math.min(94, Math.max(6, pacePercentageOfDay))}%` }}
                  >
                    <span className="rounded-full bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5 whitespace-nowrap shadow-xs">
                      Esperado até hoje · {formatBRL(expectedPaceUntilToday)}
                    </span>
                    <div className="w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-900" />
                  </div>

                  {/* Trilho da barra de progresso */}
                  <div className="relative h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#185FA5] rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, monthProgressPct)}%` }}
                    />
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 font-normal">
                  A linha escura mostra onde a meta deveria estar hoje, se as vendas fossem constantes até o dia {totalDaysInMonth}.
                </p>
              </div>

              {/* Mini cards de métricas (Faltam, Precisa vender, Se mantiver) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Faltam</p>
                  <p className="mt-1 text-base sm:text-lg font-bold text-slate-900 tabular-nums">
                    {formatBRL(faltamValor)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Precisa vender por dia</p>
                  <p className="mt-1 text-base sm:text-lg font-bold text-slate-900 tabular-nums">
                    {formatBRL(dailyNeeded)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Se mantiver o ritmo</p>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-base sm:text-lg font-bold text-slate-900 tabular-nums">
                      {formatBRL(projectedAtCurrentRate)}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      · {projectedPctOfGoal.toFixed(0)}% da meta
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* CARD "O QUE FAZER AGORA" (4 COLS) */}
            <div className="lg:col-span-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">O que fazer agora</h3>
                <p className="text-xs text-slate-400">Em ordem de prioridade</p>
              </div>

              {/* 1. Follow-ups atrasados */}
              <div className="rounded-xl border border-amber-200/70 bg-amber-50/40 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100/80 text-amber-800">
                    <Clock size={16} />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {criticalTimelineStats.overdue} follow-ups atrasados
                    </p>
                    <p className="text-xs text-slate-500">
                      {criticalTimelineStats.maxOverdueDays > 0
                        ? `O mais antigo está há ${criticalTimelineStats.maxOverdueDays} dias sem retorno.`
                        : 'Acompanhe contatos pendentes com urgência.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/bem-aviv/follow-up')}
                  className="w-full rounded-lg bg-[#0F3764] hover:bg-[#0c2c50] text-white py-2 text-xs font-bold transition-colors cursor-pointer shadow-xs"
                >
                  Ver atrasados
                </button>
              </div>

              {/* 2. Clientes sem nenhum contato */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-50 text-[#185FA5]">
                    <Users size={16} />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {criticalTimelineStats.noContact} clientes sem nenhum contato
                    </p>
                    <p className="text-xs text-slate-500">
                      Ainda não há registro de conversa com eles.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/bem-aviv/clientes')}
                  className="w-full rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 py-2 text-xs font-bold transition-colors cursor-pointer shadow-xs"
                >
                  Iniciar contatos
                </button>
              </div>

              {/* 3. Pedidos em aberto */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                    <ShoppingBag size={16} />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {openOrdersCount} pedidos em aberto · {formatBRL(openOrdersAmount)}
                    </p>
                    <p className="text-xs text-slate-500">
                      Ainda não foram finalizados nem entregues.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/bem-aviv/pedidos')}
                  className="w-full rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 py-2 text-xs font-bold transition-colors cursor-pointer shadow-xs"
                >
                  Ver pedidos em aberto
                </button>
              </div>
            </div>
          </section>

          {/* ── SEÇÃO INTERMEDIÁRIA: 4 KPI CARDS EM LINHA ──────────── */}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {/* 1. Vendas confirmadas no mês */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Vendas confirmadas no mês</p>
                <p className="mt-1 text-2xl font-extrabold text-slate-900 tabular-nums">
                  {formatBRL(currentMonthSold)}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 space-y-1">
                {monthVsLastMonthPct !== null && (
                  <p className={cn("text-xs font-semibold", monthVsLastMonthPct < 0 ? "text-rose-600" : "text-emerald-700")}>
                    {monthVsLastMonthPct < 0 ? '↘' : '↗'} {Math.abs(monthVsLastMonthPct).toFixed(1)}% {monthVsLastMonthPct < 0 ? 'abaixo do' : 'acima do'} mês anterior
                  </p>
                )}
                <p className="text-xs text-slate-400 font-medium">
                  {currentMonthOrdersCount} pedidos confirmados
                </p>
              </div>
            </div>

            {/* 2. Ticket médio do mês */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ticket médio do mês</p>
                <p className="mt-1 text-2xl font-extrabold text-slate-900 tabular-nums">
                  {formatBRL(currentMonthAvgTicket)}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 space-y-1">
                {avgTicketDiffPct !== null && (
                  <p className={cn("text-xs font-semibold", avgTicketDiffPct < 0 ? "text-rose-600" : "text-emerald-700")}>
                    {avgTicketDiffPct < 0 ? '↘' : '↗'} {Math.abs(avgTicketDiffPct).toFixed(0)}% {avgTicketDiffPct < 0 ? 'abaixo da' : 'acima da'} média histórica
                  </p>
                )}
                <p className="text-xs text-slate-400 font-medium">
                  Média do período: {formatBRL(avgTicketHistorical)} em {soldOrdersCount} pedidos
                </p>
              </div>
            </div>

            {/* 3. Em aberto no mês */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Em aberto no mês</p>
                <p className="mt-1 text-2xl font-extrabold text-slate-900 tabular-nums">
                  {formatBRL(currentMonthOpenAmount)}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 space-y-1">
                <p className="text-xs font-medium text-slate-600">
                  {currentMonthOpenAmount === 0
                    ? `Nenhum pedido em aberto em ${selectedMonthName.toLowerCase()}`
                    : `${monthlyOpenCounts[currentMonthKey] ?? 0} pedidos aguardando finalização`}
                </p>
                <p className="text-xs text-slate-400 font-medium">
                  No período todo: {openOrdersCount} pedidos · {formatBRL(openOrdersAmount)}
                </p>
              </div>
            </div>

            {/* 4. Clientes para contatar */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Clientes para contatar</p>
                <p className="mt-1 text-2xl font-extrabold text-slate-900 tabular-nums">
                  {criticalTimelineStats.total}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 space-y-1">
                <p className="text-xs font-semibold text-amber-800">
                  {criticalTimelineStats.overdue} atrasados + {criticalTimelineStats.noContact} sem contato
                </p>
                <p className="text-xs text-slate-400 font-medium">
                  {criticalTimelineStats.stale} sem retorno há 30+ dias
                </p>
              </div>
            </div>
          </section>

          {/* ── LINHA: META ANUAL + VENDAS MÊS A MÊS ────────────────── */}
          <section className="grid gap-6 md:grid-cols-2">
            {/* META ANUAL */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs flex flex-col justify-between">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Meta anual de {goalYear}</h3>
                  <p className="text-xs text-slate-500 font-normal mt-0.5">
                    Cumprido até agora x tempo que já passou do ano
                  </p>
                </div>

                {/* Valor e percentual */}
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-[#0F3764] tabular-nums">
                    {formatBRL(soldForProgress)}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    de {formatBRL(annualGoalNum)} · {annualProgressPct.toFixed(1)}%
                  </span>
                </div>

                {/* Barra de Progresso YTD com "Hoje" */}
                <div className="space-y-1 pt-3">
                  <div className="relative pt-5">
                    {/* Marcador de tempo decorrido do ano (78% do ano aprox em Outubro) */}
                    <div
                      className="absolute top-0 -translate-x-1/2 flex flex-col items-center pointer-events-none"
                      style={{
                        left: `${Math.min(92, Math.max(8, ((currentDashMonth - 1 + currentDayInMonth / totalDaysInMonth) / 12) * 100))}%`,
                      }}
                    >
                      <span className="rounded-full bg-slate-900 text-white text-[9px] font-bold px-2 py-0.5 whitespace-nowrap shadow-xs">
                        Hoje · {Math.round(((currentDashMonth - 1 + currentDayInMonth / totalDaysInMonth) / 12) * 100)}% do ano
                      </span>
                      <div className="w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-900" />
                    </div>

                    <div className="relative h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#185FA5] rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, annualProgressPct)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Mini cards Faltam e Projeção */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Faltam</p>
                    <p className="mt-1 text-sm font-bold text-slate-900 tabular-nums">
                      {formatBRL(annualFaltam)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Projeção do ano</p>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-sm font-bold text-slate-900 tabular-nums">
                        {formatBRL(annualProjection)}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">
                        · {annualProjectionPct.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Rodapé com botão Configurar Metas */}
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                <p className="text-[11px] text-slate-500 leading-snug">
                  {monthsWithGoalConfigured.length > 0 ? (
                    `Só ${monthsWithGoalConfigured.slice(0, 3).join(', ')} têm meta mensal cadastrada.`
                  ) : (
                    'Nenhuma meta mensal cadastrada ainda.'
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => setIsGoalsModalOpen(true)}
                  className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer shadow-xs shrink-0"
                >
                  Configurar metas
                </button>
              </div>
            </div>

            {/* VENDAS MÊS A MÊS (GRÁFICO) */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Vendas mês a mês</h3>
                <p className="text-xs text-slate-500 font-normal mt-0.5">
                  Pedidos confirmados. {selectedMonthName} está parcial (até o dia {currentDayInMonth}).
                </p>
              </div>

              <div className="h-[210px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 24, right: 4, left: 4, bottom: 4 }} barCategoryGap="16%">
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={{ stroke: '#e2e8f0' }}
                      interval={0}
                    />
                    <YAxis hide domain={[0, (dataMax: number) => Math.max(1, dataMax * 1.25)]} />
                    <Tooltip
                      formatter={(value: unknown) => [formatBRL(Number(value) || 0), 'Confirmado']}
                      labelFormatter={(label: unknown) => `Mês ${String(label ?? '')}`}
                      contentStyle={{ borderRadius: 8, fontSize: 12 }}
                    />
                    <Bar dataKey="totalConfirmed" radius={[4, 4, 0, 0]} maxBarSize={38}>
                      {chartData.map((entry) => (
                        <Cell
                          key={entry.key}
                          fill={entry.isSelectedMonth ? '#0F3764' : '#5285c5'}
                        />
                      ))}
                      <LabelList
                        dataKey="totalConfirmed"
                        content={(props) => {
                          const { x, y, width, index } = props as { x: number; y: number; width: number; index: number }
                          const entry = chartData[index]
                          if (!entry) return null
                          if (entry.isBestMonth) {
                            return (
                              <text x={x + width / 2} y={y - 8} textAnchor="middle" className="fill-slate-600 text-[10px] font-bold">
                                Melhor mês
                              </text>
                            )
                          }
                          if (entry.isSelectedMonth && entry.totalConfirmed > 0) {
                            return (
                              <text x={x + width / 2} y={y - 8} textAnchor="middle" className="fill-[#0F3764] text-[10px] font-extrabold">
                                {formatBRL(entry.totalConfirmed)}
                              </text>
                            )
                          }
                          return null
                        }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Legenda do gráfico */}
              <div className="flex items-center gap-4 text-[11px] text-slate-500 pt-3 border-t border-slate-100">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#5285c5]" />
                  Meses fechados
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#0F3764]" />
                  Mês atual (parcial)
                </span>
              </div>
            </div>
          </section>

          {/* ── SEÇÃO INFERIOR: QUEM CONTATAR PRIMEIRO + AGENDA ─────── */}
          <section className="grid gap-6 grid-cols-1 lg:grid-cols-2 items-start">
            {/* QUEM CONTATAR PRIMEIRO */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Quem contatar primeiro</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Os mais atrasados no topo. Mostrando {topCriticalClients.length} de {criticalTimelineStats.total}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/bem-aviv/follow-up')}
                  className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 text-xs font-bold transition-all cursor-pointer shadow-xs shrink-0"
                >
                  Ver todos os {criticalTimelineStats.total}
                </button>
              </div>

              {/* Lista dos contatos prioritários */}
              {topCriticalClients.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-400 font-medium">
                  Nenhum contato pendente no momento.
                </p>
              ) : (
                <div className="space-y-3">
                  {topCriticalClients.map(({ client, isOverdue, lastTouchIso }) => {
                    const fullClient = clientMap.get(client.id) || (client as ClientRow)
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
                            <p className="text-sm font-bold text-slate-900 truncate">{fullClient.full_name}</p>
                            {isOverdue && diffDays > 0 && (
                              <span className="rounded-md bg-amber-100/70 border border-amber-200/80 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                                Atrasado há {diffDays} dias
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {lastTouchIso ? `Último contato ${formatDateOnly(lastTouchIso)}` : 'Sem contato prévio'}
                            {fullClient.next_followup_at ? ` · Próximo previsto ${formatDateOnly(fullClient.next_followup_at)}` : ''}
                          </p>
                          {rawPhone && (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Tel: {formatPhone(rawPhone)}
                            </p>
                          )}
                        </div>

                        {/* Ações: WhatsApp, Registrar Contato, Agendamento */}
                        <div className="flex flex-wrap items-center gap-1.5 shrink-0 self-start sm:self-center">
                          {waUrl ? (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-50 hover:bg-emerald-100/80 text-emerald-800 px-2.5 py-1.5 text-xs font-bold transition-all shadow-2xs"
                              title="Abrir conversa no WhatsApp"
                            >
                              <MessageCircle size={13} className="text-emerald-600" />
                              <span className="hidden sm:inline">WhatsApp</span>
                            </a>
                          ) : (
                            <button
                              type="button"
                              disabled
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 text-slate-400 px-2 py-1.5 text-xs font-medium cursor-not-allowed opacity-60"
                              title="Cliente sem telefone cadastrado"
                            >
                              <MessageCircle size={13} />
                              <span className="hidden sm:inline">WhatsApp</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => openDirectContactModal(fullClient)}
                            className="rounded-lg bg-[#0F3764] hover:bg-[#0c2c50] text-white px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer shrink-0 shadow-xs"
                          >
                            Registrar contato
                          </button>

                          <button
                            type="button"
                            onClick={() => openDirectScheduleModal(fullClient)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-2.5 py-1.5 text-xs font-bold transition-colors cursor-pointer shrink-0 shadow-xs"
                            title="Agendar retorno"
                          >
                            <CalendarPlus size={13} className="text-slate-600" />
                            <span className="hidden sm:inline">Agendar</span>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* AGENDA DO MÊS */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Agenda de {selectedMonthName.toLowerCase()}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Follow-ups marcados no mês</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => shiftCalendarMonth(-1)}
                    className="p-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
                    aria-label="Mês anterior"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => shiftCalendarMonth(1)}
                    className="p-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
                    aria-label="Próximo mês"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              {/* Grade do Calendário */}
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
                        onClick={() => setSelectedDay((prev) => (prev === key ? null : key))}
                        className={cn(
                          'relative flex h-11 sm:h-13 flex-col items-center justify-between p-1 rounded-lg border text-xs font-semibold transition-all cursor-pointer',
                          isToday
                            ? 'bg-[#0F3764] text-white border-[#0F3764] shadow-xs'
                            : n > 0 && isPast
                              ? 'bg-[#FEF7D6] text-amber-950 border-[#F5E188] font-bold shadow-2xs hover:border-amber-400'
                              : n > 0
                                ? 'bg-[#EBF3FC] text-[#0F3764] border-[#CBE0F8] font-bold shadow-2xs hover:border-sky-400'
                                : 'border-slate-100 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/50',
                          isSelected && !isToday && 'ring-2 ring-[#0F3764] ring-offset-1',
                          isSelected && isToday && 'ring-2 ring-sky-400 ring-offset-1',
                        )}
                      >
                        <span className={cn('text-[11px] self-center', isToday ? 'text-white font-bold' : 'text-slate-800')}>
                          {cell.date.getDate()}
                        </span>
                        {isToday ? (
                          <span className="rounded bg-white/20 px-1 py-0.5 text-[8px] font-extrabold uppercase tracking-tight text-white">
                            HOJE
                          </span>
                        ) : n > 0 ? (
                          <span
                            className={cn(
                              'rounded px-1 py-0.5 text-[8px] leading-none text-center font-extrabold uppercase tracking-tight',
                              isPast ? 'text-amber-900 bg-amber-200/60' : 'text-[#0F3764] bg-sky-200/60',
                            )}
                          >
                            {n} {isPast ? 'PENDENTE' : 'FOLLOW-UP'}
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Legenda do calendário */}
              <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500 pt-2 border-t border-slate-100">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#0F3764]" />
                  Hoje
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#EBF3FC] border border-[#CBE0F8]" />
                  Follow-up marcado
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#FEF7D6] border border-[#F5E188]" />
                  Passou sem registro
                </span>
              </div>

              {/* ── RELAÇÃO DE CONTATOS DO DIA SELECIONADO ── */}
              {selectedDay && (
                <div className="mt-3 rounded-xl border border-slate-200/90 bg-slate-50/90 p-3.5 sm:p-4 space-y-3 transition-all animate-fadeIn">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200/70 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#0F3764] text-white">
                        <Calendar size={13} />
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">{selectedDayFormatted}</h4>
                        <p className="text-[10px] text-slate-500 font-medium">
                          {selectedDayClients.length === 0
                            ? 'Nenhum agendamento marcado para esta data'
                            : `${selectedDayClients.length} ${selectedDayClients.length === 1 ? 'cliente com retorno' : 'clientes com retorno'}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setQuickScheduleModalDay(selectedDay)
                          setClientSearchQuery('')
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 transition-colors shadow-2xs"
                        title="Agendar cliente para este dia"
                      >
                        <Plus size={12} />
                        <span>Novo</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedDay(null)}
                        className="rounded-md p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
                        title="Fechar relação do dia"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Lista de clientes do dia selecionado */}
                  {selectedDayClients.length === 0 ? (
                    <div className="py-4 text-center space-y-2">
                      <p className="text-xs text-slate-400 font-medium">
                        Nenhum follow-up registrado para {selectedDayFormatted}.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setQuickScheduleModalDay(selectedDay)
                          setClientSearchQuery('')
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 px-3 py-1.5 text-xs font-bold transition-all shadow-xs"
                      >
                        <CalendarPlus size={13} className="text-slate-600" />
                        Agendar cliente para esta data
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                      {selectedDayClients.map((client) => {
                        const parsed = splitFollowupNote(client.next_followup_note)
                        const phone = client.phone_1 || client.phone_2
                        const waUrl = buildWhatsappUrl(phone)
                        const isPast = selectedDay < formatYmd(now)
                        const isToday = selectedDay === formatYmd(now)
                        const isConcluido = client.next_followup_status === 'CONCLUIDO'

                        return (
                          <div
                            key={client.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-slate-200/80 bg-white shadow-2xs hover:border-slate-300 transition-colors"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-xs font-bold text-slate-900 truncate">{client.full_name}</p>
                                {isConcluido ? (
                                  <span className="rounded bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 text-[9px] font-bold">
                                    Concluído
                                  </span>
                                ) : isPast ? (
                                  <span className="rounded bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.2 text-[9px] font-bold">
                                    Pendente
                                  </span>
                                ) : isToday ? (
                                  <span className="rounded bg-sky-50 text-[#0F3764] border border-sky-200 px-1.5 py-0.2 text-[9px] font-bold">
                                    Hoje
                                  </span>
                                ) : (
                                  <span className="rounded bg-sky-50 text-sky-900 border border-sky-200 px-1.5 py-0.2 text-[9px] font-bold">
                                    Agendado
                                  </span>
                                )}
                              </div>
                              {parsed.summary && (
                                <p className="text-[11px] text-slate-700 font-semibold mt-1 line-clamp-1">
                                  🎯 {parsed.summary}
                                </p>
                              )}
                              {parsed.details && (
                                <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">
                                  {parsed.details}
                                </p>
                              )}
                              {phone && (
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  Tel: {formatPhone(phone)}
                                </p>
                              )}
                            </div>

                            {/* Ações da linha do dia */}
                            <div className="flex flex-wrap items-center gap-1.5 shrink-0 self-start sm:self-center">
                              {waUrl ? (
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 text-[11px] font-bold transition-colors shadow-2xs"
                                  title="Conversar no WhatsApp"
                                >
                                  <MessageCircle size={12} />
                                  <span>WhatsApp</span>
                                </a>
                              ) : (
                                <button
                                  type="button"
                                  disabled
                                  className="inline-flex items-center gap-1 rounded-md bg-slate-100 text-slate-400 px-2 py-1 text-[11px] font-medium cursor-not-allowed opacity-60"
                                  title="Sem telefone cadastrado"
                                >
                                  <MessageCircle size={12} />
                                  <span>WhatsApp</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => openDirectContactModal(client)}
                                className="rounded-md bg-[#0F3764] hover:bg-[#0c2c50] text-white px-2.5 py-1 text-[11px] font-bold transition-colors shadow-2xs"
                              >
                                Registrar
                              </button>
                              <button
                                type="button"
                                onClick={() => openDirectScheduleModal(client, selectedDay)}
                                className="rounded-md border border-slate-300 hover:bg-slate-100 text-slate-700 px-2 py-1 text-[11px] font-bold transition-colors"
                                title="Reagendar follow-up"
                              >
                                <CalendarPlus size={12} />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Botão Abrir agenda completa */}
              <button
                type="button"
                onClick={() => navigate('/bem-aviv/follow-up')}
                className="w-full rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 py-2 text-xs font-bold transition-all cursor-pointer shadow-xs"
              >
                Abrir agenda completa
              </button>
            </div>
          </section>
        </>
      )}

      {/* ── MODAL: HISTÓRICO DE CONTATOS / REGISTRAR ──────────────── */}
      {historyModalClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-xs">
          <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Histórico de contatos</h3>
                <p className="text-xs text-slate-500">{historyModalClient.full_name}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-[#0F3764] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0c2c50]"
                  onClick={() => setRegisterInlineOpen((v) => !v)}
                >
                  {registerInlineOpen ? 'Ocultar registro' : 'Novo contato'}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    setEditingHistoryId(null)
                    setHistoryModalClient(null)
                  }}
                >
                  Fechar
                </button>
              </div>
            </div>

            {registerInlineOpen && (
              <form onSubmit={submitInlineFollowup} className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-600">
                    Data
                    <input
                      type="date"
                      required
                      value={registerInlineForm.contacted_at}
                      onChange={(e) => setRegisterInlineForm((prev) => ({ ...prev, contacted_at: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Canal
                    <select
                      value={registerInlineForm.channel}
                      onChange={(e) => setRegisterInlineForm((prev) => ({ ...prev, channel: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium"
                    >
                      <option value="WHATSAPP">WHATSAPP</option>
                      <option value="LIGACAO">LIGAÇÃO</option>
                      <option value="EMAIL">E-MAIL</option>
                      <option value="OUTRO">OUTRO</option>
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                    Resumo do contato
                    <input
                      value={registerInlineForm.result}
                      onChange={(e) => setRegisterInlineForm((prev) => ({ ...prev, result: e.target.value }))}
                      placeholder="Ex: Cliente interessado, pediu orçamento do colchão"
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                    Observações detalhadas (opcional)
                    <textarea
                      rows={2}
                      value={registerInlineForm.notes}
                      onChange={(e) => setRegisterInlineForm((prev) => ({ ...prev, notes: e.target.value }))}
                      placeholder="Anotações sobre a conversa, dúvidas levantadas, etc."
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/60">
                  <button
                    type="button"
                    onClick={() => {
                      const c = historyModalClient
                      setHistoryModalClient(null)
                      openDirectScheduleModal(c)
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#185FA5] hover:underline cursor-pointer"
                  >
                    <CalendarPlus size={14} />
                    <span>Agendar próximo retorno após contato</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRegisterInlineOpen(false)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={registerInlineSaving}
                      className="rounded-lg bg-[#0F3764] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#0c2c50] disabled:opacity-60 shadow-xs cursor-pointer"
                    >
                      {registerInlineSaving ? 'Salvando...' : 'Salvar contato'}
                    </button>
                  </div>
                </div>
              </form>
            )}

            <div className="mt-4 max-h-[50vh] overflow-auto rounded-xl border border-slate-100">
              {historyModalLoading ? (
                <p className="p-4 text-xs text-slate-400">Carregando histórico...</p>
              ) : historyModalRows.length === 0 ? (
                <p className="p-4 text-xs text-slate-400 text-center">Nenhum contato registrado para este cliente.</p>
              ) : (
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Data</th>
                      <th className="px-3 py-2 text-left">Canal</th>
                      <th className="px-3 py-2 text-left">Resumo</th>
                      <th className="px-3 py-2 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historyModalRows.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2.5 text-slate-700">{formatDateOnly(r.contacted_at)}</td>
                        <td className="px-3 py-2.5 text-slate-700">{r.channel}</td>
                        <td className="px-3 py-2.5 text-slate-700">{r.result || '—'}</td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            className="font-bold text-[#185FA5] hover:underline"
                            onClick={() => {
                              setEditingHistoryId(r.id)
                              setRegisterInlineForm({
                                contacted_at: toInputDate(r.contacted_at),
                                channel: r.channel,
                                result: r.result ?? '',
                                notes: r.notes ?? '',
                              })
                              setRegisterInlineOpen(true)
                            }}
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: AGENDAMENTO DE FOLLOW-UP ───────────────────────── */}
      {scheduleModalClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Agendar Follow-up</h3>
                <p className="text-xs font-semibold text-[#185FA5] mt-0.5">{scheduleModalClient.full_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setScheduleModalClient(null)}
                className="rounded-lg border border-slate-300 bg-white p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
                title="Fechar"
              >
                <X size={16} />
              </button>
            </div>

            {scheduleMsg && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs font-medium text-amber-900">
                {scheduleMsg}
              </div>
            )}

            <form onSubmit={submitScheduleForm} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Data do próximo contato / retorno *
                </label>
                <input
                  type="date"
                  required
                  value={scheduleForm.next_followup_at}
                  onChange={(e) => setScheduleForm((prev) => ({ ...prev, next_followup_at: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-2xs outline-none focus:border-[#0F3764] focus:ring-1 focus:ring-[#0F3764]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Resumo / Objetivo do contato
                </label>
                <input
                  type="text"
                  placeholder="Ex: Retorno sobre orçamento do colchão, agendar visita..."
                  value={scheduleForm.summary}
                  onChange={(e) => setScheduleForm((prev) => ({ ...prev, summary: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-2xs outline-none focus:border-[#0F3764] focus:ring-1 focus:ring-[#0F3764]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Detalhes / Observações (opcional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Anotações importantes sobre preferências do cliente, valores combinados, etc."
                  value={scheduleForm.notes}
                  onChange={(e) => setScheduleForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-2xs outline-none focus:border-[#0F3764] focus:ring-1 focus:ring-[#0F3764]"
                />
              </div>

              <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={scheduleForm.contact_done}
                  onChange={(e) => setScheduleForm((prev) => ({ ...prev, contact_done: e.target.checked }))}
                  className="mt-0.5 rounded border-slate-300 text-[#0F3764] focus:ring-[#0F3764]"
                />
                <span className="text-xs text-slate-600 leading-snug">
                  <strong>Marcar que conversei com o cliente hoje</strong> (registra um novo toque no histórico com a data atual)
                </span>
              </label>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                {scheduleModalClient.next_followup_at ? (
                  <button
                    type="button"
                    disabled={scheduleSaving}
                    onClick={() => void removeScheduledFollowup()}
                    className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                  >
                    Excluir agendamento
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setScheduleModalClient(null)}
                    className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors shadow-2xs"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={scheduleSaving}
                    className="rounded-lg bg-[#0F3764] hover:bg-[#0c2c50] text-white px-4 py-1.5 text-xs font-bold transition-colors shadow-xs disabled:opacity-60 cursor-pointer"
                  >
                    {scheduleSaving ? 'Salvando...' : 'Salvar agendamento'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: SELECIONAR CLIENTE PARA O DIA ESPECÍFICO ───────── */}
      {quickScheduleModalDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Agendar cliente</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Para o dia <strong className="text-slate-800">{formatDateOnly(quickScheduleModalDay)}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuickScheduleModalDay(null)}
                className="rounded-lg border border-slate-300 bg-white p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
                title="Fechar"
              >
                <X size={16} />
              </button>
            </div>

            <div>
              <input
                type="text"
                autoFocus
                placeholder="Buscar cliente por nome ou telefone..."
                value={clientSearchQuery}
                onChange={(e) => setClientSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-2xs outline-none focus:border-[#0F3764] focus:ring-1 focus:ring-[#0F3764]"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 min-h-[200px] max-h-[340px] pr-1">
              {filteredClientsForQuickSchedule.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-8">
                  Nenhum cliente encontrado com esse termo.
                </p>
              ) : (
                filteredClientsForQuickSchedule.map((c) => {
                  const phone = c.phone_1 || c.phone_2
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        const targetDay = quickScheduleModalDay
                        setQuickScheduleModalDay(null)
                        openDirectScheduleModal(c, targetDay)
                      }}
                      className="w-full text-left p-2.5 rounded-lg border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-all flex items-center justify-between gap-2 group cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate group-hover:text-[#0F3764]">
                          {c.full_name}
                        </p>
                        {phone && (
                          <p className="text-[10px] text-slate-400">
                            {formatPhone(phone)}
                          </p>
                        )}
                      </div>
                      <span className="text-[11px] font-bold text-[#185FA5] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        Selecionar →
                      </span>
                    </button>
                  )
                })
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setQuickScheduleModalDay(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors shadow-2xs"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CONFIGURAR METAS ──────────────────────────────── */}
      {isGoalsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-xs">
          <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Configurar Metas de Vendas</h3>
                <p className="text-xs text-slate-500">
                  Defina a meta anual e as metas de cada mês para o ano selecionado.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                onClick={() => { setIsGoalsModalOpen(false); void loadGoals() }}
              >
                Fechar
              </button>
            </div>

            <SalesGoalsEditor
              companyKind={activeCompany?.company_kind}
              goalYear={goalYear}
              onGoalYearChange={setGoalYear}
              annualGoalDraft={annualGoalDraft}
              onAnnualGoalDraftChange={setAnnualGoalDraft}
              monthlyGoalsDraft={monthlyGoalsDraft}
              onMonthlyGoalDraftChange={(month, v) =>
                setMonthlyGoalsDraft((prev) => ({ ...prev, [month]: v }))
              }
              monthlySoldAllTime={monthlySoldAllTime}
              soldForProgress={soldForProgress}
              goalsLoading={goalsLoading}
              goalsSaving={goalsSaving}
              goalsMsg={goalsMsg}
              onSave={() => void saveGoals()}
              onApplySuggestionsAll={applySuggestionsAll}
            />
          </div>
        </div>
      )}
    </div>
  )
}
