import { useUser } from '@clerk/clerk-react'
import { Building2, ChevronLeft, ChevronRight, Target, TrendingUp } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { FollowUpCRMGrid } from '../components/bemAviv/FollowUpCRMGrid'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Progress } from '../components/ui/Progress'
import { useSupabase } from '../hooks/useSupabase'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { cn } from '../lib/cn'
import { formatBRL } from '../lib/format'

const DISTRIBUTION_GOAL_BRL = 100_000

const WEEKDAYS_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

type ClientRow = {
  id: string
  full_name: string
  next_followup_at: string | null
  next_followup_status: string | null
  phone_1?: string | null
  phone_2?: string | null
  next_followup_note?: string | null
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

function formatYmd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y!, m! - 1, d!, 12, 0, 0, 0)
}

/** Dias do mês para grade (semana começa na segunda). */
function calendarCells(viewMonth: Date) {
  const first = startOfMonth(viewMonth)
  const last = endOfMonth(viewMonth)
  const lead = (first.getDay() + 6) % 7
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
  payload?: ReadonlyArray<{ payload?: { label: string; total: number } }>
}) {
  if (!active || !payload?.[0]?.payload) return null
  const p = payload[0].payload
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg ring-1 ring-slate-900/5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{p.label}</p>
      <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{formatBRL(p.total)}</p>
    </div>
  )
}

export function BemAvivHomePage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const [loading, setLoading] = useState(true)
  const [totalSold, setTotalSold] = useState(0)
  const [monthlyTotals, setMonthlyTotals] = useState<Record<string, number>>({})
  const [clients, setClients] = useState<ClientRow[]>([])
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState(() => formatYmd(new Date()))

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId) {
      setLoading(false)
      return
    }
    setLoading(true)

    const [ordersRes, clientsRes] = await Promise.all([
      supabase
        .from('bem_aviv_sales_orders')
        .select('order_date, total_amount, document_type, status')
        .eq('user_id', ownerUserId)
        .eq('document_type', 'PEDIDO')
        .neq('status', 'CANCELADO'),
      supabase
        .from('bem_aviv_clients')
        .select('id, full_name, next_followup_at, next_followup_status, phone_1, phone_2, next_followup_note')
        .eq('user_id', ownerUserId),
    ])

    if (ordersRes.error) console.error(ordersRes.error)
    if (clientsRes.error) console.error(clientsRes.error)

    const orders = (ordersRes.data ?? []) as Array<{
      order_date: string
      total_amount: number
      document_type: string
      status: string
    }>

    let sum = 0
    const byMonth: Record<string, number> = {}
    for (const o of orders) {
      const amt = Number(o.total_amount ?? 0)
      if (!Number.isFinite(amt)) continue
      sum += amt
      const mk = monthKeyFromOrderDate(o.order_date || '')
      if (!mk || mk.length < 7) continue
      byMonth[mk] = (byMonth[mk] ?? 0) + amt
    }
    setTotalSold(sum)
    setMonthlyTotals(byMonth)

    setClients(((clientsRes.data ?? []) as ClientRow[]) ?? [])

    setLoading(false)
  }, [ownerUserId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const timelineClients = useMemo(() => {
    const pending = (c: ClientRow) => (c.next_followup_status ?? 'PENDENTE') === 'PENDENTE'
    return clients
      .filter((c) => c.next_followup_at && pending(c))
      .sort((a, b) => new Date(a.next_followup_at!).getTime() - new Date(b.next_followup_at!).getTime())
      .slice(0, 24)
  }, [clients])

  const pendingWithDate = useMemo(
    () => clients.filter((c) => c.next_followup_at && (c.next_followup_status ?? 'PENDENTE') === 'PENDENTE'),
    [clients],
  )

  const tasksForSelectedDay = useMemo(() => {
    return pendingWithDate
      .filter((c) => toLocalDateKey(c.next_followup_at!) === selectedDay)
      .sort((a, b) => new Date(a.next_followup_at!).getTime() - new Date(b.next_followup_at!).getTime())
  }, [pendingWithDate, selectedDay])

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
    const keys = Object.keys(monthlyTotals).sort()
    if (keys.length === 0) {
      const cur = new Date()
      const out: string[] = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date(cur.getFullYear(), cur.getMonth() - i, 1)
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        out.push(k)
      }
      return out
    }
    const min = keys[0]!
    const max = keys[keys.length - 1]!
    const start = new Date(min + '-01T12:00:00')
    const end = new Date(max + '-01T12:00:00')
    const out: string[] = []
    const d = new Date(start)
    while (d <= end) {
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      d.setMonth(d.getMonth() + 1)
    }
    return out.length > 12 ? out.slice(-12) : out
  }, [monthlyTotals])

  const progressPct = Math.min(100, DISTRIBUTION_GOAL_BRL > 0 ? (totalSold / DISTRIBUTION_GOAL_BRL) * 100 : 0)

  const chartData = useMemo(
    () =>
      chartMonths.map((mk) => {
        const v = monthlyTotals[mk] ?? 0
        const [y, mo] = mk.split('-')
        return {
          key: mk,
          label: `${mo}/${y?.slice(2)}`,
          total: v,
        }
      }),
    [chartMonths, monthlyTotals],
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
                  <p className="mt-1 text-xs text-slate-500">Referência para o período comercial.</p>
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
              <CardContent className="pt-0">
                <p className="font-hub text-2xl font-bold tracking-tight text-slate-900">{formatBRL(totalSold)}</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  Soma dos pedidos não cancelados (valor líquido do documento).
                </p>
              </CardContent>
            </Card>
          </section>

          <Card className="border-0 shadow-md ring-1 ring-slate-100/90">
            <CardHeader className="pb-2">
              <CardTitle className="font-hub text-base font-semibold text-slate-900">Resultado mês a mês (pedidos)</CardTitle>
              <p className="mt-1 text-xs text-slate-500">Valores por mês conforme data do pedido — passe o cursor sobre as barras.</p>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-[min(280px,42vh)] min-h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 12, right: 8, left: 4, bottom: 4 }} barCategoryGap="18%">
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={{ stroke: '#e2e8f0' }}
                      interval={0}
                      height={36}
                    />
                    <YAxis hide domain={[0, 'dataMax']} />
                    <Tooltip content={<MonthlyBarTooltip />} cursor={{ fill: 'rgba(24, 95, 165, 0.06)' }} />
                    <Bar dataKey="total" fill="#185FA5" radius={8} maxBarSize={56} activeBar={{ fill: '#144f8f', radius: 8 }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <FollowUpCRMGrid timelineClients={timelineClients} />

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
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
                  className="rounded-md border border-[#185FA5]/40 bg-[#E6F1FB] px-2.5 py-1 text-[11px] font-semibold text-[#185FA5] hover:bg-[#d4e8f8] sm:px-3 sm:py-1.5 sm:text-xs"
                >
                  Mês atual
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
              <div className="mx-auto w-full max-w-[260px] shrink-0 sm:max-w-[280px] lg:mx-0">
                <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold text-slate-500">
                  {WEEKDAYS_SHORT.map((w) => (
                    <div key={w} className="py-0.5">
                      {w}
                    </div>
                  ))}
                </div>
                <div className="mt-0.5 grid grid-cols-7 gap-0.5">
                  {cells.map((cell, idx) => {
                    if (!cell.date) {
                      return <div key={`e-${idx}`} className="aspect-square min-h-[1.85rem]" />
                    }
                    const key = formatYmd(cell.date)
                    const n = countByDayInViewMonth.get(key) ?? 0
                    const isSel = selectedDay === key
                    const isToday = formatYmd(new Date()) === key
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedDay(key)}
                        className={cn(
                          'relative flex aspect-square min-h-[1.85rem] flex-col items-center justify-center rounded-md border text-xs font-medium transition-colors sm:min-h-[2rem]',
                          isSel
                            ? 'border-[#185FA5] bg-[#E6F1FB] text-[#185FA5]'
                            : 'border-slate-200 bg-slate-50/80 text-slate-800 hover:border-slate-300 hover:bg-white',
                          isToday && !isSel && 'ring-1 ring-[#185FA5]/40',
                        )}
                      >
                        <span>{cell.date.getDate()}</span>
                        {n > 0 ? (
                          <span className="absolute bottom-0.5 right-0.5 flex h-3 min-w-[0.65rem] items-center justify-center rounded-full bg-[#185FA5] px-0.5 text-[8px] font-bold leading-none text-white sm:h-3.5 sm:text-[9px]">
                            {n}
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="min-w-0 flex-1 rounded-lg border border-slate-100 bg-slate-50/80 p-3 sm:p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Dia selecionado —{' '}
                  {selectedDay
                    ? new Intl.DateTimeFormat('pt-BR', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      }).format(parseYmd(selectedDay))
                    : '—'}
                </p>
                {tasksForSelectedDay.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-600">Nenhum follow-up pendente agendado para este dia.</p>
                ) : (
                  <ul className="mt-3 max-h-[min(420px,55vh)] divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                    {tasksForSelectedDay.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                        <span className="font-medium text-slate-900">{c.full_name}</span>
                        <span className="text-xs text-slate-500">{formatShortDateTime(c.next_followup_at)}</span>
                        <Link
                          to={`/bem-aviv/follow-up/agendar/${c.id}`}
                          className="text-xs font-semibold text-[#185FA5] hover:underline"
                        >
                          Abrir
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
