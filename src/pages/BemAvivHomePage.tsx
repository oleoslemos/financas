import { useUser } from '@clerk/clerk-react'
import { Building2, ChevronLeft, ChevronRight, History, Target, TrendingUp } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Progress } from '../components/ui/Progress'
import { useSupabase } from '../hooks/useSupabase'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { cn } from '../lib/cn'
import { formatBRL } from '../lib/format'

const DISTRIBUTION_GOAL_BRL = 100_000
const NO_CONTACT_ALERT_DAYS = 30
const EXCLUDED_FROM_CRITICAL_TIMELINE = new Set(['LEONARDO SILVA LEMOS', 'SUELEN JOAO ALVES'])
const EXCLUDED_FROM_FOLLOWUP_BY_CPF = new Set(['22112195867', '00742215903'])

const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

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

type FollowupHistoryRow = {
  id: string
  client_id: string
  contacted_at: string
  channel: string
  created_by_name?: string | null
  result: string | null
  notes: string | null
}

type MetricsPeriod = 'TODO' | 'MES_ATUAL' | 'ULT_30' | 'ULT_90' | 'ULT_180' | 'ULT_365'

/** Timeline e calendário da home: só pendente com data agendada; exclui cancelado e concluído. */
function includeInFollowupTimeline(c: ClientRow): boolean {
  const cpf = (c.cpf ?? '').replace(/\D/g, '')
  if (cpf && EXCLUDED_FROM_FOLLOWUP_BY_CPF.has(cpf)) return false
  if (!c.next_followup_at) return false
  const st = (c.next_followup_status ?? 'PENDENTE').toUpperCase()
  if (st === 'CANCELADO' || st === 'CONCLUIDO') return false
  return st === 'PENDENTE'
}

function formatShortDateTime(iso: string | null) {
  if (!iso) return '—'
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(dt)
}

function toInputDateTimeLocal(value?: string | null) {
  if (!value) return ''
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return ''
  const tz = dt.getTimezoneOffset() * 60_000
  const local = new Date(dt.getTime() - tz)
  return local.toISOString().slice(0, 16)
}

/** Chave local YYYY-MM-DD para comparar com dia do calendário. */
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

/** Dias do mês para grade (semana começa no domingo). */
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

function MonthlyBarTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: ReadonlyArray<{
    payload?: {
      label: string
      total: number
      totalConfirmed: number
      projectionOpen: number
      totalProjected: number
      prevMonthTotal: number
      sameMonthLastYearTotal: number
      rolling12Total: number
      rolling12PrevTotal: number
      wowMonthAbs: number
      wowMonthPct: number | null
      yoyAbs: number
      yoyPct: number | null
      rollingAbs: number
      rollingPct: number | null
    }
  }>
}) {
  if (!active || !payload?.[0]?.payload) return null
  const p = payload[0].payload
  const fmtPct = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}%`)
  const deltaCls = (v: number) => (v >= 0 ? 'text-emerald-700' : 'text-rose-700')
  const deltaSign = (v: number) => (v >= 0 ? '+' : '')
  return (
    <div className="w-[min(92vw,430px)] rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 shadow-lg ring-1 ring-slate-900/5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{p.label}</p>
      <p className="mt-0.5 text-base font-bold tabular-nums text-slate-900">{formatBRL(p.total)}</p>
      <p className="mt-1 text-xs text-slate-600">
        Confirmado: <span className="font-semibold text-slate-800">{formatBRL(p.totalConfirmed)}</span> · Projeção (aberto):{' '}
        <span className="font-semibold text-slate-800">{formatBRL(p.projectionOpen)}</span>
      </p>
      <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs leading-snug">
        <p className="text-slate-600">
          Mês anterior:{' '}
          <span className="font-semibold text-slate-800">{formatBRL(p.prevMonthTotal)}</span>{' '}
          <span className={deltaCls(p.wowMonthAbs)}>
            ({deltaSign(p.wowMonthAbs)}
            {formatBRL(p.wowMonthAbs)} | {deltaSign(p.wowMonthAbs)}
            {fmtPct(p.wowMonthPct)})
          </span>
        </p>
        <p className="text-slate-600">
          Mesmo mês ano anterior:{' '}
          <span className="font-semibold text-slate-800">{formatBRL(p.sameMonthLastYearTotal)}</span>{' '}
          <span className={deltaCls(p.yoyAbs)}>
            ({deltaSign(p.yoyAbs)}
            {formatBRL(p.yoyAbs)} | {deltaSign(p.yoyAbs)}
            {fmtPct(p.yoyPct)})
          </span>
        </p>
        <p className="text-slate-600">
          Últimos 12m vs 12m anteriores:{' '}
          <span className="font-semibold text-slate-800">{formatBRL(p.rolling12Total)}</span>{' '}
          <span className="text-slate-500">(prev: {formatBRL(p.rolling12PrevTotal)})</span>{' '}
          <span className={deltaCls(p.rollingAbs)}>
            ({deltaSign(p.rollingAbs)}
            {formatBRL(p.rollingAbs)} | {deltaSign(p.rollingAbs)}
            {fmtPct(p.rollingPct)})
          </span>
        </p>
      </div>
    </div>
  )
}

export function BemAvivHomePage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const navigate = useNavigate()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const followupActorName = (user?.fullName || user?.primaryEmailAddress?.emailAddress || ownerUserId || 'USUÁRIO').trim().toUpperCase()
  const [loading, setLoading] = useState(true)
  const [totalSold, setTotalSold] = useState(0)
  const [soldOrdersCount, setSoldOrdersCount] = useState(0)
  const [openOrdersCount, setOpenOrdersCount] = useState(0)
  const [openOrdersAmount, setOpenOrdersAmount] = useState(0)
  const [metricsPeriod, setMetricsPeriod] = useState<MetricsPeriod>('TODO')
  const [monthlyTotals, setMonthlyTotals] = useState<Record<string, number>>({})
  const [monthlyOpenTotals, setMonthlyOpenTotals] = useState<Record<string, number>>({})
  const [clients, setClients] = useState<ClientRow[]>([])
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState<string | null>(() => formatYmd(new Date()))
  const [historyModalClient, setHistoryModalClient] = useState<ClientRow | null>(null)
  const [historyModalRows, setHistoryModalRows] = useState<FollowupHistoryRow[]>([])
  const [historyModalLoading, setHistoryModalLoading] = useState(false)
  const [latestHistoryByClient, setLatestHistoryByClient] = useState<Record<string, FollowupHistoryRow>>({})
  const [registerInlineOpen, setRegisterInlineOpen] = useState(false)
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null)
  const [registerInlineSaving, setRegisterInlineSaving] = useState(false)
  const [registerInlineForm, setRegisterInlineForm] = useState({
    contacted_at: toInputDateTimeLocal(new Date().toISOString()),
    channel: 'WHATSAPP',
    result: '',
    notes: '',
  })

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId) {
      setLoading(false)
      return
    }
    setLoading(true)

    const [ordersRes, clientsRes] = await Promise.all([
      supabase
        .from('bem_aviv_sales_orders')
        .select('order_date, total_amount, document_type, status, converted_order_id')
        .eq('user_id', ownerUserId)
        .in('document_type', ['ORCAMENTO', 'PEDIDO'])
        .in('status', ['ABERTO', 'FINALIZADO', 'ENTREGUE', 'CANCELADO']),
      supabase
        .from('bem_aviv_clients')
        .select('id, full_name, cpf, last_contact_at, next_followup_at, next_followup_status, phone_1, phone_2, next_followup_note')
        .eq('user_id', ownerUserId),
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

    const soldStatuses = new Set(['FINALIZADO', 'ENTREGUE'])
    const now = new Date()
    const periodStart = (() => {
      if (metricsPeriod === 'TODO') return null
      if (metricsPeriod === 'MES_ATUAL') return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
      if (metricsPeriod === 'ULT_30') return new Date(now.getTime() - 30 * 86_400_000)
      if (metricsPeriod === 'ULT_180') return new Date(now.getTime() - 180 * 86_400_000)
      if (metricsPeriod === 'ULT_365') return new Date(now.getTime() - 365 * 86_400_000)
      return new Date(now.getTime() - 90 * 86_400_000)
    })()
    let sum = 0
    let openCount = 0
    let openAmount = 0
    let soldCount = 0
    const byMonth: Record<string, number> = {}
    const byMonthOpen: Record<string, number> = {}
    for (const o of orders) {
      const docType = (o.document_type ?? '').toUpperCase()
      const st = (o.status ?? '').toUpperCase()
      const amt = Number(o.total_amount ?? 0)
      const dt = new Date(o.order_date)
      const inPeriod = !Number.isNaN(dt.getTime()) && (periodStart === null || (dt >= periodStart && dt <= now))
      if (docType !== 'PEDIDO') continue
      if (!inPeriod) continue
      if (st === 'ABERTO') {
        openCount += 1
        if (Number.isFinite(amt)) openAmount += amt
        const mk = monthKeyFromOrderDate(o.order_date || '')
        if (mk && mk.length >= 7 && Number.isFinite(amt)) byMonthOpen[mk] = (byMonthOpen[mk] ?? 0) + amt
      }
      if (!soldStatuses.has(st)) continue
      if (!Number.isFinite(amt)) continue
      sum += amt
      soldCount += 1
      const mk = monthKeyFromOrderDate(o.order_date || '')
      if (!mk || mk.length < 7) continue
      byMonth[mk] = (byMonth[mk] ?? 0) + amt
    }
    setTotalSold(sum)
    setSoldOrdersCount(soldCount)
    setOpenOrdersCount(openCount)
    setOpenOrdersAmount(openAmount)
    setMonthlyTotals(byMonth)
    setMonthlyOpenTotals(byMonthOpen)

    setClients(((clientsRes.data ?? []) as ClientRow[]) ?? [])

    setLoading(false)
  }, [ownerUserId, supabase, metricsPeriod])

  useEffect(() => {
    void load()
  }, [load])

  const pendingWithDate = useMemo(() => clients.filter(includeInFollowupTimeline), [clients])

  const tasksForSelectedDay = useMemo(() => {
    if (!selectedDay) return []
    return pendingWithDate
      .filter((c) => toLocalDateKey(c.next_followup_at!) === selectedDay)
      .sort((a, b) => new Date(a.next_followup_at!).getTime() - new Date(b.next_followup_at!).getTime())
  }, [pendingWithDate, selectedDay])

  const tasksForViewMonth = useMemo(() => {
    const y = calendarMonth.getFullYear()
    const m = calendarMonth.getMonth()
    return pendingWithDate
      .filter((c) => {
        const t = new Date(c.next_followup_at!)
        return t.getFullYear() === y && t.getMonth() === m
      })
      .sort((a, b) => new Date(a.next_followup_at!).getTime() - new Date(b.next_followup_at!).getTime())
  }, [pendingWithDate, calendarMonth])

  const agendaRows = selectedDay ? tasksForSelectedDay : tasksForViewMonth

  useEffect(() => {
    if (!supabase || !ownerUserId) return
    const ids = Array.from(new Set(clients.map((r) => r.id)))
    if (ids.length === 0) {
      setLatestHistoryByClient({})
      return
    }
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from('bem_aviv_client_followups')
        .select('id, client_id, contacted_at, channel, created_by_name, result, notes')
        .is('deleted_at', null)
        .eq('user_id', ownerUserId.toUpperCase())
        .in('client_id', ids)
        .order('contacted_at', { ascending: false })
      if (cancelled) return
      if (error) {
        setLatestHistoryByClient({})
        return
      }
      const rows = (data ?? []) as FollowupHistoryRow[]
      const map: Record<string, FollowupHistoryRow> = {}
      for (const r of rows) {
        if (!map[r.client_id]) map[r.client_id] = r
      }
      setLatestHistoryByClient(map)
    })()
    return () => {
      cancelled = true
    }
  }, [clients, ownerUserId, supabase])

  const criticalTimelineClients = useMemo(() => {
    const now = Date.now()
    const staleMs = NO_CONTACT_ALERT_DAYS * 86_400_000
    return clients
      .filter((c) => !EXCLUDED_FROM_CRITICAL_TIMELINE.has(c.full_name.trim().toUpperCase()))
      .filter((c) => {
        const cpf = (c.cpf ?? '').replace(/\D/g, '')
        return !cpf || !EXCLUDED_FROM_FOLLOWUP_BY_CPF.has(cpf)
      })
      .map((c) => {
        const latestHistory = latestHistoryByClient[c.id]
        const lastTouchIso = latestHistory?.contacted_at ?? c.last_contact_at ?? null
        const lastTouchMs = lastTouchIso ? new Date(lastTouchIso).getTime() : 0
        const isNoContact = !lastTouchMs
        const isNoContact30 = !!lastTouchMs && now - lastTouchMs >= staleMs
        const followupStatus = (c.next_followup_status ?? 'PENDENTE').toUpperCase()
        const nextFollowupMs = c.next_followup_at ? new Date(c.next_followup_at).getTime() : 0
        // Só é "atrasado" se a data já venceu e não houve contato após aquele agendamento.
        const isOverdue =
          !!nextFollowupMs &&
          nextFollowupMs < now &&
          followupStatus !== 'CANCELADO' &&
          (lastTouchMs === 0 || lastTouchMs <= nextFollowupMs)
        const reason = isOverdue
          ? 'Atrasado'
          : isNoContact
            ? 'Sem contato'
            : isNoContact30
              ? `Sem contato há ${NO_CONTACT_ALERT_DAYS}+ dias`
              : 'Atenção'
        return { client: c, isNoContact, isNoContact30, isOverdue, reason, lastTouchIso }
      })
      .filter((x) => {
        if (!x.isNoContact && !x.isNoContact30 && !x.isOverdue) return false
        const st = (x.client.next_followup_status ?? 'PENDENTE').toUpperCase()
        const nf = x.client.next_followup_at
        // Já há follow-up agendado no futuro: não entra na timeline crítica (aparece no calendário).
        if (nf && st !== 'CANCELADO' && st !== 'CONCLUIDO') {
          const nfMs = new Date(nf).getTime()
          if (nfMs >= now) return false
        }
        return true
      })
      .sort((a, b) => {
        const ta = a.client.next_followup_at ? new Date(a.client.next_followup_at).getTime() : Number.MAX_SAFE_INTEGER
        const tb = b.client.next_followup_at ? new Date(b.client.next_followup_at).getTime() : Number.MAX_SAFE_INTEGER
        if (ta !== tb) return ta - tb
        const la = a.lastTouchIso ? new Date(a.lastTouchIso).getTime() : 0
        const lb = b.lastTouchIso ? new Date(b.lastTouchIso).getTime() : 0
        return la - lb
      })
      .slice(0, 40)
  }, [clients, latestHistoryByClient])

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

  const chartMonths = useMemo(() => {
    const now = new Date()
    let anchor = new Date(now.getFullYear(), now.getMonth(), 1)
    const keys = Object.keys(monthlyTotals).sort()
    if (keys.length > 0) {
      const last = keys[keys.length - 1]!
      const [yy, mm] = last.split('-').map((v) => Number(v))
      if (Number.isFinite(yy) && Number.isFinite(mm) && mm >= 1 && mm <= 12) {
        const latestDataMonth = new Date(yy, mm - 1, 1)
        if (latestDataMonth > anchor) anchor = latestDataMonth
      }
    }
    const out: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1)
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return out
  }, [monthlyTotals])

  const progressPct = Math.min(100, DISTRIBUTION_GOAL_BRL > 0 ? (totalSold / DISTRIBUTION_GOAL_BRL) * 100 : 0)
  const avgTicket = soldOrdersCount > 0 ? totalSold / soldOrdersCount : 0
  const periodLabel =
    metricsPeriod === 'TODO'
      ? 'todo período'
      : metricsPeriod === 'MES_ATUAL'
      ? 'mês atual'
      : metricsPeriod === 'ULT_30'
        ? 'últimos 30 dias'
        : metricsPeriod === 'ULT_180'
          ? 'últimos 180 dias'
          : metricsPeriod === 'ULT_365'
            ? 'últimos 365 dias'
            : 'últimos 90 dias'

  const chartData = useMemo(
    () =>
      chartMonths.map((mk) => {
        const monthTotal = (k: string) => monthlyTotals[k] ?? 0
        const sumWindow = (endMonthKey: string, monthsBack: number) => {
          let sum = 0
          for (let i = monthsBack - 1; i >= 0; i--) {
            sum += monthTotal(addMonthsToKey(endMonthKey, -i))
          }
          return sum
        }

        const v = monthTotal(mk)
        const openV = monthlyOpenTotals[mk] ?? 0
        const projected = v + openV
        const prevMonthTotal = monthTotal(addMonthsToKey(mk, -1))
        const prevMonthOpen = monthlyOpenTotals[addMonthsToKey(mk, -1)] ?? 0
        const sameMonthLastYearTotal = monthTotal(addMonthsToKey(mk, -12))
        const sameMonthLastYearOpen = monthlyOpenTotals[addMonthsToKey(mk, -12)] ?? 0
        const rolling12Total = sumWindow(mk, 12) + chartMonths.slice(-12).reduce((acc, key) => acc + (monthlyOpenTotals[key] ?? 0), 0)
        const rolling12PrevTotal =
          sumWindow(addMonthsToKey(mk, -12), 12) +
          chartMonths.slice(-24, -12).reduce((acc, key) => acc + (monthlyOpenTotals[key] ?? 0), 0)
        const prevProjected = prevMonthTotal + prevMonthOpen
        const sameMonthLastYearProjected = sameMonthLastYearTotal + sameMonthLastYearOpen
        const wowMonthAbs = projected - prevProjected
        const yoyAbs = projected - sameMonthLastYearProjected
        const rollingAbs = rolling12Total - rolling12PrevTotal
        const pct = (cur: number, base: number) => (base === 0 ? null : ((cur - base) / base) * 100)
        const [y, mo] = mk.split('-')
        return {
          key: mk,
          label: `${mo}/${y?.slice(2)}`,
          total: projected,
          totalConfirmed: v,
          projectionOpen: openV,
          totalProjected: projected,
          prevMonthTotal: prevProjected,
          sameMonthLastYearTotal: sameMonthLastYearProjected,
          rolling12Total,
          rolling12PrevTotal,
          wowMonthAbs,
          wowMonthPct: pct(projected, prevProjected),
          yoyAbs,
          yoyPct: pct(projected, sameMonthLastYearProjected),
          rollingAbs,
          rollingPct: pct(rolling12Total, rolling12PrevTotal),
        }
      }),
    [chartMonths, monthlyTotals, monthlyOpenTotals],
  )

  const calendarTitle = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(calendarMonth)
  const cells = useMemo(() => calendarCells(calendarMonth), [calendarMonth])

  function shiftCalendarMonth(delta: number) {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1, 12, 0, 0, 0))
  }

  function goToCurrentMonth() {
    const now = new Date()
    setCalendarMonth(startOfMonth(now))
    setSelectedDay(formatYmd(now))
  }

  async function openHistoryModal(client: ClientRow) {
    if (!supabase || !ownerUserId) return
    setHistoryModalClient(client)
    setEditingHistoryId(null)
    setRegisterInlineOpen(false)
    setRegisterInlineSaving(false)
    setRegisterInlineForm({
      contacted_at: toInputDateTimeLocal(new Date().toISOString()),
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
      .eq('user_id', ownerUserId.toUpperCase())
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
    if (!supabase || !ownerUserId) return []
    const { data, error } = await supabase
      .from('bem_aviv_client_followups')
      .select('id, client_id, contacted_at, channel, created_by_name, result, notes')
      .is('deleted_at', null)
      .eq('user_id', ownerUserId.toUpperCase())
      .eq('client_id', client.id)
      .order('contacted_at', { ascending: false })
      .limit(200)
    if (error) return []
    return (data ?? []) as FollowupHistoryRow[]
  }

  async function submitInlineFollowup(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId || !historyModalClient) return
    if (!registerInlineForm.contacted_at) return

    setRegisterInlineSaving(true)
    const contactedAtIso = new Date(registerInlineForm.contacted_at).toISOString()
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

      if (updateError) {
        setRegisterInlineSaving(false)
        return
      }

      const rows = await refetchHistoryModalRows(historyModalClient)
      setHistoryModalRows(rows)
      const latest = rows[0]
      if (latest) {
        await supabase.from('bem_aviv_clients').update({ last_contact_at: latest.contacted_at }).eq('id', historyModalClient.id)
        setLatestHistoryByClient((prev) => ({ ...prev, [historyModalClient.id]: latest }))
        setClients((prev) =>
          prev.map((c) => (c.id === historyModalClient.id ? { ...c, last_contact_at: latest.contacted_at } : c)),
        )
      }

      setEditingHistoryId(null)
      setRegisterInlineOpen(false)
      setRegisterInlineForm({
        contacted_at: toInputDateTimeLocal(new Date().toISOString()),
        channel: 'WHATSAPP',
        result: '',
        notes: '',
      })
      setRegisterInlineSaving(false)
      return
    }

    const { error: insertError } = await supabase.from('bem_aviv_client_followups').insert({
      user_id: followupUserId,
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

    setClients((prev) =>
      prev.map((c) =>
        c.id === historyModalClient.id ? { ...c, last_contact_at: contactedAtIso, next_followup_status: 'CONCLUIDO' } : c,
      ),
    )
    setLatestHistoryByClient((prev) => ({
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

    await openHistoryModal(historyModalClient)
    setRegisterInlineSaving(false)
  }

  return (
    <div className="w-full min-w-0 max-w-none space-y-8 normal-case">
      <header className="flex flex-wrap items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 ring-1 ring-sky-200/60">
          <Building2 size={26} strokeWidth={1.75} aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Bem Aviv — Dashboard</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
            Meta de distribuição, vendas e prioridades de follow-up.
          </p>
        </div>
      </header>

      {!supabase || !ownerUserId ? (
        <p className="text-sm text-slate-600">Conectando ao Supabase…</p>
      ) : loading ? (
        <p className="text-sm text-slate-500">Carregando indicadores…</p>
      ) : (
        <>
          <section className="flex justify-end">
            <label className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Período métricas
              <select
                value={metricsPeriod}
                onChange={(e) => setMetricsPeriod(e.target.value as MetricsPeriod)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700"
              >
                <option value="TODO">Todo período</option>
                <option value="MES_ATUAL">Mês atual</option>
                <option value="ULT_30">Últimos 30 dias</option>
                <option value="ULT_90">Últimos 90 dias</option>
                <option value="ULT_180">Últimos 180 dias</option>
                <option value="ULT_365">Últimos 365 dias</option>
              </select>
            </label>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <Card className="border-0 shadow-md ring-1 ring-slate-100/90 transition-shadow hover:shadow-lg">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">Meta distribuição</CardTitle>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-50 text-[#185FA5] ring-1 ring-sky-100">
                  <Target size={18} aria-hidden />
                </span>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <div>
                  <p className="font-hub text-2xl font-bold tracking-tight text-slate-900">{formatBRL(DISTRIBUTION_GOAL_BRL)}</p>
                  <p className="mt-1 text-xs text-slate-500">Referência para o período comercial ({periodLabel}).</p>
                </div>
                <div className="border-t border-slate-100 pt-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Progresso da meta</span>
                    <span className="text-sm font-semibold tabular-nums text-[#185FA5]">{progressPct.toFixed(1)}%</span>
                  </div>
                  <Progress value={progressPct} className="h-2.5 bg-slate-100" />
                  <p className="mt-2 text-xs text-slate-500">
                    {totalSold >= DISTRIBUTION_GOAL_BRL ? (
                      <span className="font-medium text-emerald-700">Meta atingida.</span>
                    ) : (
                      <>
                        Faltam <strong className="font-semibold text-slate-700">{formatBRL(Math.max(0, DISTRIBUTION_GOAL_BRL - totalSold))}</strong> para a
                        meta.
                      </>
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-md ring-1 ring-slate-100/90 transition-shadow hover:shadow-lg">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total vendido (pedidos)</CardTitle>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                  <TrendingUp size={18} aria-hidden />
                </span>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                <p className="font-hub text-2xl font-bold tracking-tight text-slate-900">{formatBRL(totalSold)}</p>
                <p className="text-xs leading-relaxed text-slate-500">
                  Soma dos pedidos com status <strong className="font-semibold text-slate-700">Finalizado</strong> ou{' '}
                  <strong className="font-semibold text-slate-700">Entregue</strong> no período de {periodLabel} (valor líquido do documento).
                </p>
                <p className="border-t border-slate-100 pt-2 text-xs text-slate-600">
                  Pedidos em aberto (status Aberto):{' '}
                  <strong className="font-hub tabular-nums font-semibold text-slate-900">{openOrdersCount}</strong>{' '}
                  — Valor:{' '}
                  <strong className="font-hub tabular-nums font-semibold text-slate-900">{formatBRL(openOrdersAmount)}</strong>
                </p>
                <p className="text-xs text-slate-600">
                  Ticket médio (Finalizado/Entregue):{' '}
                  <strong className="font-hub tabular-nums font-semibold text-slate-900">{formatBRL(avgTicket)}</strong>
                </p>
                <p className="text-xs text-slate-600">
                  Projeção (confirmado + em aberto):{' '}
                  <strong className="font-hub tabular-nums font-semibold text-slate-900">{formatBRL(totalSold + openOrdersAmount)}</strong>
                </p>
              </CardContent>
            </Card>
          </section>

          <Card className="border-0 shadow-md ring-1 ring-slate-100/90">
            <CardHeader className="pb-2">
              <CardTitle className="font-hub text-base font-semibold text-slate-900">Resultado mês a mês (pedidos)</CardTitle>
              <p className="mt-1 text-xs text-slate-500">
                Base em pedidos por mês: confirmado (Finalizado/Entregue) + projeção de pedidos em aberto em tom mais claro.
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-[min(280px,42vh)] min-h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 30, right: 8, left: 4, bottom: 4 }} barCategoryGap="18%">
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 12, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={{ stroke: '#e2e8f0' }}
                      interval={0}
                      height={36}
                    />
                    <YAxis hide domain={[0, (dataMax: number) => Math.max(1, dataMax * 1.18)]} />
                    <Tooltip content={<MonthlyBarTooltip />} cursor={{ fill: 'rgba(24, 95, 165, 0.06)' }} />
                    <Bar dataKey="totalConfirmed" stackId="proj" fill="#185FA5" radius={[8, 8, 0, 0]} maxBarSize={56} />
                    <Bar dataKey="projectionOpen" stackId="proj" fill="#9fd4ff" radius={[8, 8, 0, 0]} maxBarSize={56}>
                      <LabelList
                        dataKey="totalProjected"
                        position="top"
                        offset={6}
                        className="fill-slate-600 text-xs font-semibold"
                        formatter={(value: unknown) => {
                          const n = Number(value ?? 0)
                          return n > 0 ? formatBRL(n) : ''
                        }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <section className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <h2 className="font-hub text-sm font-semibold text-slate-900">Agenda por dia</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => shiftCalendarMonth(-1)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    aria-label="Mês anterior"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="min-w-[8.5rem] text-center text-xs font-medium capitalize text-slate-800 sm:min-w-[9.5rem] sm:text-sm">
                    {calendarTitle}
                  </span>
                  <button
                    type="button"
                    onClick={() => shiftCalendarMonth(1)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    aria-label="Próximo mês"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={goToCurrentMonth}
                    className="rounded-md border border-[#185FA5]/40 bg-[#E6F1FB] px-2.5 py-1 text-[9px] font-semibold text-[#185FA5] hover:bg-[#d4e8f8] sm:px-3 sm:py-1.5 sm:text-xs"
                  >
                    Mês atual
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
                <div className="mx-auto w-full max-w-[300px] shrink-0 sm:max-w-[320px] lg:mx-0">
                  <div className="grid grid-cols-7 gap-0.5 text-center text-[8px] font-semibold text-slate-500">
                    {WEEKDAYS_SHORT.map((w) => (
                      <div key={w} className="py-1">
                        {w}
                      </div>
                    ))}
                  </div>
                  <div className="mt-0.5 grid grid-cols-7 gap-0.5">
                    {cells.map((cell, idx) => {
                      if (!cell.date) {
                        return <div key={`e-${idx}`} className="aspect-square min-h-[2.15rem]" />
                      }
                      const key = formatYmd(cell.date)
                      const n = countByDayInViewMonth.get(key) ?? 0
                      const isSel = selectedDay === key
                      const isToday = formatYmd(new Date()) === key
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setSelectedDay((prev) => (prev === key ? null : key))}
                          className={cn(
                            'relative flex aspect-square min-h-[2.15rem] flex-col items-center justify-center rounded-md border text-xs font-medium transition-colors sm:min-h-[2.3rem]',
                            isSel
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                              : 'border-slate-200 bg-slate-50/80 text-slate-800 hover:border-slate-300 hover:bg-white',
                            isToday && !isSel && 'ring-1 ring-[#185FA5]/40',
                          )}
                        >
                          <span>{cell.date.getDate()}</span>
                          {n > 0 ? (
                            <span className="absolute bottom-0.5 right-0.5 flex h-3 min-w-[0.65rem] items-center justify-center rounded-full bg-[#185FA5] px-0.5 text-[6px] font-bold leading-none text-white sm:h-3.5 sm:text-[7px]">
                              {n}
                            </span>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="min-w-0 flex-1 rounded-lg border border-slate-100 bg-slate-50/80 p-3 sm:p-4">
                  {agendaRows.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-600">
                      {selectedDay
                        ? 'Nenhum follow-up pendente agendado para este dia.'
                        : 'Nenhum follow-up pendente agendado para este mês.'}
                    </p>
                  ) : (
                    <ul className="mt-3 max-h-[min(420px,55vh)] divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                      {agendaRows.map((c) => (
                        <li key={c.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2.5 text-sm">
                        <span className="min-w-0 truncate font-medium text-slate-900">{c.full_name}</span>
                          <span className="text-right text-xs text-slate-500">{formatShortDateTime(c.next_followup_at)}</span>
                          <button
                            type="button"
                            onClick={() => void openHistoryModal(c)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-[#185FA5] hover:bg-sky-50"
                            title={`Visualizar histórico — ${c.full_name}`}
                            aria-label={`Visualizar histórico — ${c.full_name}`}
                          >
                            <History size={16} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <Card className="border-0 shadow-sm ring-1 ring-slate-100/90">
              <CardHeader className="pb-2">
                <CardTitle className="font-hub text-sm font-semibold text-slate-900">
                  Timeline crítica de follow-up
                </CardTitle>
                <p className="text-xs text-slate-500">
                  Atrasados, sem contato há {NO_CONTACT_ALERT_DAYS}+ dias e sem contato.
                </p>
              </CardHeader>
              <CardContent className="pt-0">
                {criticalTimelineClients.length === 0 ? (
                  <p className="py-4 text-sm text-slate-600">Nenhum cliente crítico no momento.</p>
                ) : (
                  <ul className="max-h-[min(520px,62vh)] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                    {criticalTimelineClients.map(({ client, reason, lastTouchIso }) => (
                      <li key={client.id} className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{client.full_name}</p>
                          <p className="text-xs text-slate-500">
                            {reason}
                            {client.next_followup_at ? ` • Próximo: ${formatShortDateTime(client.next_followup_at)}` : ''}
                            {lastTouchIso ? ` • Último contato: ${formatShortDateTime(lastTouchIso)}` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void openHistoryModal(client)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-[#185FA5] hover:bg-sky-50"
                          title={`Visualizar histórico — ${client.full_name}`}
                          aria-label={`Visualizar histórico — ${client.full_name}`}
                        >
                          <History size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}

      {historyModalClient ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-3">
          <div className="w-full max-w-5xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Histórico de contatos</h3>
                <p className="text-sm text-slate-500">{historyModalClient.full_name}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-md bg-[#185FA5] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#144f8f]"
                  onClick={() => {
                    if (registerInlineOpen && editingHistoryId) {
                      setEditingHistoryId(null)
                      setRegisterInlineForm({
                        contacted_at: toInputDateTimeLocal(new Date().toISOString()),
                        channel: 'WHATSAPP',
                        result: '',
                        notes: '',
                      })
                      return
                    }
                    setRegisterInlineOpen((prev) => {
                      const next = !prev
                      if (next) {
                        setEditingHistoryId(null)
                        setRegisterInlineForm({
                          contacted_at: toInputDateTimeLocal(new Date().toISOString()),
                          channel: 'WHATSAPP',
                          result: '',
                          notes: '',
                        })
                      } else {
                        setEditingHistoryId(null)
                      }
                      return next
                    })
                  }}
                >
                  {registerInlineOpen && editingHistoryId
                    ? 'Novo contato'
                    : registerInlineOpen && !editingHistoryId
                      ? 'Ocultar registro'
                      : 'Incluir novo follow-up'}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-sky-300 bg-white px-3 py-1.5 text-sm font-semibold text-sky-700 hover:bg-sky-50"
                  onClick={() => {
                    const clientId = historyModalClient.id
                    setEditingHistoryId(null)
                    setHistoryModalClient(null)
                    navigate(`/bem-aviv/follow-up/agendar/${clientId}`)
                  }}
                >
                  Agendar próximo follow-up
                </button>
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    setEditingHistoryId(null)
                    setHistoryModalClient(null)
                  }}
                >
                  Fechar
                </button>
              </div>
            </div>

            {registerInlineOpen ? (
              <form onSubmit={submitInlineFollowup} className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {editingHistoryId ? 'Editar contato' : 'Registrar novo contato'}
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-slate-600">
                    Data/Hora
                    <input
                      type="datetime-local"
                      required
                      value={registerInlineForm.contacted_at}
                      onChange={(e) => setRegisterInlineForm((prev) => ({ ...prev, contacted_at: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    Canal
                    <select
                      value={registerInlineForm.channel}
                      onChange={(e) => setRegisterInlineForm((prev) => ({ ...prev, channel: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    >
                      <option value="WHATSAPP">WHATSAPP</option>
                      <option value="LIGACAO">LIGAÇÃO</option>
                      <option value="EMAIL">E-MAIL</option>
                      <option value="OUTRO">OUTRO</option>
                    </select>
                  </label>
                  <label className="text-xs text-slate-600 sm:col-span-2">
                    Resumo
                    <input
                      value={registerInlineForm.result}
                      onChange={(e) => setRegisterInlineForm((prev) => ({ ...prev, result: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs text-slate-600 sm:col-span-2">
                    Detalhe
                    <textarea
                      rows={2}
                      value={registerInlineForm.notes}
                      onChange={(e) => setRegisterInlineForm((prev) => ({ ...prev, notes: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    disabled={registerInlineSaving}
                    className="rounded-md bg-[#185FA5] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#144f8f] disabled:opacity-60"
                  >
                    {registerInlineSaving ? 'Salvando...' : editingHistoryId ? 'Salvar edição' : 'Salvar contato'}
                  </button>
                  {editingHistoryId ? (
                    <button
                      type="button"
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => {
                        setEditingHistoryId(null)
                        setRegisterInlineOpen(false)
                        setRegisterInlineForm({
                          contacted_at: toInputDateTimeLocal(new Date().toISOString()),
                          channel: 'WHATSAPP',
                          result: '',
                          notes: '',
                        })
                      }}
                    >
                      Cancelar edição
                    </button>
                  ) : null}
                </div>
              </form>
            ) : null}

            <div className="mt-4 max-h-[65vh] overflow-auto rounded-lg border border-slate-200">
              {historyModalLoading ? (
                <p className="p-4 text-sm text-slate-500">Carregando histórico...</p>
              ) : historyModalRows.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">Nenhum contato registrado para este cliente.</p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Data/Hora</th>
                      <th className="px-3 py-2 text-left">Canal</th>
                      <th className="px-3 py-2 text-left">Usuário</th>
                      <th className="px-3 py-2 text-left">Resumo</th>
                      <th className="px-3 py-2 text-left">Detalhe</th>
                      <th className="px-3 py-2 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyModalRows.map((r) => (
                      <tr
                        key={r.id}
                        className={cn(
                          'border-t border-slate-100',
                          editingHistoryId === r.id && 'bg-sky-50/80',
                        )}
                      >
                        <td className="px-3 py-2 text-slate-700">{formatShortDateTime(r.contacted_at)}</td>
                        <td className="px-3 py-2 text-slate-700">{r.channel}</td>
                        <td className="px-3 py-2 text-slate-700">{r.created_by_name || '—'}</td>
                        <td className="px-3 py-2 text-slate-700">{r.result || '—'}</td>
                        <td className="px-3 py-2 text-slate-700">{r.notes || '—'}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            className="text-sm font-semibold text-[#185FA5] hover:underline"
                            onClick={() => {
                              setEditingHistoryId(r.id)
                              setRegisterInlineForm({
                                contacted_at: toInputDateTimeLocal(r.contacted_at),
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
      ) : null}
    </div>
  )
}
