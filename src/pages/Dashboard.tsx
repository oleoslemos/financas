import { useUser } from '@clerk/clerk-react'
import { CalendarDays, CreditCard, Landmark, TrendingUp, TrendingDown, ArrowUpRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { formatBRL } from '../lib/format'
import { monthLabel, parseISODate, toISODate } from '../lib/dates'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

type Row = {
  id: string
  description: string
  amount: number
  due_date: string
  kind: 'payable' | 'receivable' | 'transfer'
  bank_account_id: string | null
  destination_bank_account_id: string | null
  status: 'open' | 'paid'
  category_id: string | null
}

type Bank = { id: string; name: string; initial_balance: number; color: string | null }
type PaidMovement = { bank_account_id: string | null; destination_bank_account_id: string | null; amount: number; kind: 'payable' | 'receivable' | 'transfer' }
type Category = { id: string; name: string; parent_id: string | null }

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function startOfMonthIso(key: string): string {
  return `${key}-01`
}

function endOfMonthIso(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return toISODate(new Date(y, m, 0))
}

function nextMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return monthKey(new Date(y, m, 1))
}

function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  return monthKey(new Date(y, m - 1 + delta, 1))
}

function refMonthKey(isoDate: string): string {
  return isoDate.slice(0, 7)
}

function monthKeysInclusive(fromKey: string, toKey: string): string[] {
  const out: string[] = []
  let k = fromKey
  while (k <= toKey) {
    out.push(k)
    k = nextMonthKey(k)
  }
  return out
}

function rowSort(a: Row, b: Row) {
  return a.due_date.localeCompare(b.due_date) || a.description.localeCompare(b.description)
}

const PIE_COLORS = ['#185FA5', '#8B5CF6', '#10B981', '#F97316', '#EF4444', '#EC4899', '#EAB308', '#64748B']

export function Dashboard() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  
  const [banks, setBanks] = useState<Bank[]>([])
  const [openRows, setOpenRows] = useState<Row[]>([])
  const [paidMovements, setPaidMovements] = useState<PaidMovement[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [rangeMovements, setRangeMovements] = useState<Row[]>([])
  
  const [selectedBankId, setSelectedBankId] = useState<string>('ALL')
  const [selectedMonth, setSelectedMonth] = useState<string>(() => monthKey(new Date()))
  const [loading, setLoading] = useState(true)

  const [creditCards, setCreditCards] = useState<{ id: string; name: string }[]>([])
  const [ccFutureMonths, setCcFutureMonths] = useState<3 | 6 | 9 | 12>(3)
  const [ccCardSeries, setCcCardSeries] = useState<
    {
      cardId: string
      name: string
      series: { monthKey: string; label: string; total: number; segment: 'passado' | 'atual' | 'futuro' }[]
    }[]
  >([])
  const [ccKpiByMonth, setCcKpiByMonth] = useState<
    { monthKey: string; label: string; total: number; isCurrent: boolean }[]
  >([])
  const [ccLoading, setCcLoading] = useState(true)

  useEffect(() => {
    if (!supabase || !ownerUserId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const from = startOfMonthIso(selectedMonth)
      const until = endOfMonthIso(nextMonthKey(selectedMonth))

      // Range de 6 meses para os gráficos (4 meses atrás até o próximo mês)
      const chartStartMonthKey = shiftMonthKey(selectedMonth, -4)
      const chartEndMonthKey = nextMonthKey(selectedMonth)
      const chartFrom = startOfMonthIso(chartStartMonthKey)
      const chartUntil = endOfMonthIso(chartEndMonthKey)

      const [b, pr, paid, categories, rangeData] = await Promise.all([
        supabase
          .from('bank_accounts')
          .select('id, name, initial_balance, color')
          .eq('user_id', ownerUserId)
          .eq('is_active', true),
        supabase
          .from('payables_receivables')
          .select('id, description, amount, due_date, kind, bank_account_id, destination_bank_account_id, status, category_id')
          .eq('user_id', ownerUserId)
          .eq('status', 'open')
          .gte('due_date', from)
          .lte('due_date', until)
          .order('due_date', { ascending: true }),
        supabase
          .from('payables_receivables')
          .select('bank_account_id, destination_bank_account_id, amount, kind')
          .eq('user_id', ownerUserId)
          .eq('status', 'paid'),
        supabase
          .from('categories')
          .select('id, name, parent_id')
          .eq('user_id', ownerUserId),
        supabase
          .from('payables_receivables')
          .select('id, description, amount, due_date, kind, bank_account_id, destination_bank_account_id, status, category_id')
          .eq('user_id', ownerUserId)
          .gte('due_date', chartFrom)
          .lte('due_date', chartUntil)
      ])
      
      if (cancelled) return
      setBanks((b.data as Bank[]) ?? [])
      setOpenRows((pr.data as Row[]) ?? [])
      setPaidMovements(((paid.data ?? []) as PaidMovement[]) ?? [])
      setCats((categories.data as Category[]) ?? [])
      setRangeMovements((rangeData.data as Row[]) ?? [])
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, ownerUserId, selectedMonth])

  const currentBalanceByBankId = useMemo(() => {
    const map = new Map<string, number>()
    for (const bank of banks) map.set(bank.id, Number(bank.initial_balance ?? 0))
    for (const mv of paidMovements) {
      if (mv.kind === 'transfer') {
        if (mv.bank_account_id) {
          const srcCur = map.get(mv.bank_account_id) ?? 0
          map.set(mv.bank_account_id, srcCur - Number(mv.amount))
        }
        if (mv.destination_bank_account_id) {
          const dstCur = map.get(mv.destination_bank_account_id) ?? 0
          map.set(mv.destination_bank_account_id, dstCur + Number(mv.amount))
        }
      } else {
        if (!mv.bank_account_id) continue
        const cur = map.get(mv.bank_account_id) ?? 0
        const delta = mv.kind === 'receivable' ? Number(mv.amount) : -Number(mv.amount)
        map.set(mv.bank_account_id, cur + delta)
      }
    }
    return map
  }, [banks, paidMovements])

  // Total consolidado (Patrimônio)
  const consolidatedBalance = useMemo(() => {
    let sum = 0
    banks.forEach(b => {
      sum += currentBalanceByBankId.get(b.id) ?? 0
    })
    return sum
  }, [banks, currentBalanceByBankId])

  // Movimentos do mês selecionado para KPIs de receitas/despesas operacionais
  const currentMonthMovements = useMemo(() => {
    const from = startOfMonthIso(selectedMonth)
    const until = endOfMonthIso(selectedMonth)
    // Precisamos de todas as transações (abertas ou pagas) desse mês
    return rangeMovements.filter(m => m.due_date >= from && m.due_date <= until)
  }, [rangeMovements, selectedMonth])

  const currentMonthIncomes = useMemo(() => {
    return currentMonthMovements
      .filter(m => m.kind === 'receivable')
      .reduce((sum, m) => sum + Number(m.amount), 0)
  }, [currentMonthMovements])

  const currentMonthExpenses = useMemo(() => {
    return currentMonthMovements
      .filter(m => m.kind === 'payable')
      .reduce((sum, m) => sum + Number(m.amount), 0)
  }, [currentMonthMovements])

  const currentMonthResult = useMemo(() => {
    return currentMonthIncomes - currentMonthExpenses
  }, [currentMonthIncomes, currentMonthExpenses])

  // Dados para o Gráfico de Barras (Fluxo de Caixa)
  const barChartData = useMemo(() => {
    const startKey = shiftMonthKey(selectedMonth, -4)
    const endKey = nextMonthKey(selectedMonth)
    const months = monthKeysInclusive(startKey, endKey)
    
    return months.map(mk => {
      const monthMvs = rangeMovements.filter(m => refMonthKey(m.due_date) === mk)
      
      const receitas = monthMvs
        .filter(m => m.kind === 'receivable')
        .reduce((sum, m) => sum + Number(m.amount), 0)
      
      const despesas = monthMvs
        .filter(m => m.kind === 'payable')
        .reduce((sum, m) => sum + Number(m.amount), 0)
      
      return {
        month: mk,
        label: monthLabel(parseISODate(`${mk}-01`)).toUpperCase(),
        Receitas: receitas,
        Despesas: despesas,
      }
    })
  }, [rangeMovements, selectedMonth])

  // Dados para o Gráfico de Donut (Despesas por Categoria Pai)
  const pieChartData = useMemo(() => {
    const summaryMap = new Map<string, number>()
    const currentExpenses = currentMonthMovements.filter(m => m.kind === 'payable')
    
    currentExpenses.forEach(exp => {
      const cat = cats.find(c => c.id === exp.category_id)
      const parentId = cat?.parent_id || cat?.id || 'other'
      const parentName = cats.find(c => c.id === parentId)?.name || 'OUTROS'
      
      summaryMap.set(parentName, (summaryMap.get(parentName) ?? 0) + Number(exp.amount))
    })

    return Array.from(summaryMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [currentMonthMovements, cats])

  useEffect(() => {
    if (!supabase || !ownerUserId) return
    let cancelled = false
    ;(async () => {
      setCcLoading(true)
      try {
        const { data: cards } = await supabase
          .from('credit_cards')
          .select('id, name')
          .eq('user_id', ownerUserId)
          .order('name')
        if (cancelled) return
        setCreditCards((cards as { id: string; name: string }[]) ?? [])

        const todayKey = monthKey(new Date())
        const startKey = shiftMonthKey(todayKey, -3)
        const endKey = shiftMonthKey(todayKey, ccFutureMonths)
        const kpiEndKey = shiftMonthKey(todayKey, 6)
        const fetchEndKey = endKey >= kpiEndKey ? endKey : kpiEndKey
        const fromIso = startOfMonthIso(startKey)
        const toIso = endOfMonthIso(fetchEndKey)

        const { data: invoices, error: invErr } = await supabase
          .from('credit_card_invoices')
          .select('id, credit_card_id, reference_month')
          .eq('user_id', ownerUserId)
          .gte('reference_month', fromIso)
          .lte('reference_month', toIso)
        if (invErr) console.error(invErr)
        if (cancelled) return

        const invList = (invoices ?? []) as { id: string; credit_card_id: string; reference_month: string }[]
        const totalsByInvoice = new Map<string, number>()
        for (const row of invList) totalsByInvoice.set(row.id, 0)

        if (invList.length > 0) {
          const ids = invList.map((i) => i.id)
          const { data: items, error: itErr } = await supabase
            .from('credit_card_invoice_items')
            .select('invoice_id, amount')
            .in('invoice_id', ids)
          if (cancelled) return
          if (itErr) console.error(itErr)
          for (const it of (items ?? []) as { invoice_id: string; amount: number }[]) {
            const prev = totalsByInvoice.get(it.invoice_id) ?? 0
            totalsByInvoice.set(it.invoice_id, prev + Number(it.amount))
          }
        }

        const cardList = (cards as { id: string; name: string }[]) ?? []
        const byCardMonth = new Map<string, Map<string, number>>()
        for (const c of cardList) byCardMonth.set(c.id, new Map())
        for (const inv of invList) {
          const mk = refMonthKey(inv.reference_month)
          const t = totalsByInvoice.get(inv.id) ?? 0
          const inner = byCardMonth.get(inv.credit_card_id)
          if (inner) inner.set(mk, (inner.get(mk) ?? 0) + t)
        }

        const displayKeys = monthKeysInclusive(startKey, endKey)
        const kpiKeys = monthKeysInclusive(todayKey, kpiEndKey)
        const kpiRows = kpiKeys.map((mk) => {
          let sum = 0
          for (const c of cardList) {
            sum += byCardMonth.get(c.id)?.get(mk) ?? 0
          }
          return {
            monthKey: mk,
            label: monthLabel(parseISODate(`${mk}-01`)).toUpperCase(),
            total: sum,
            isCurrent: mk === todayKey,
          }
        })

        if (cancelled) return
        setCcKpiByMonth(kpiRows)
        setCcCardSeries(
          cardList.map((c) => ({
            cardId: c.id,
            name: c.name,
            series: displayKeys.map((mk) => ({
              monthKey: mk,
              label: monthLabel(parseISODate(`${mk}-01`)).toUpperCase(),
              total: byCardMonth.get(c.id)?.get(mk) ?? 0,
              segment: mk < todayKey ? 'passado' : mk === todayKey ? 'atual' : 'futuro',
            })),
          })),
        )
      } finally {
        if (!cancelled) setCcLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, ownerUserId, ccFutureMonths])

  const monthCurrent = selectedMonth

  const rowsScoped = useMemo(
    () =>
      openRows.filter((r) => (selectedBankId === 'ALL' ? true : r.bank_account_id === selectedBankId || r.destination_bank_account_id === selectedBankId)),
    [openRows, selectedBankId],
  )

  const payCurrent = useMemo(
    () =>
      rowsScoped
        .filter((r) => r.kind === 'payable' && r.due_date >= startOfMonthIso(monthCurrent) && r.due_date <= endOfMonthIso(monthCurrent))
        .sort(rowSort),
    [rowsScoped, monthCurrent],
  )
  const recCurrent = useMemo(
    () =>
      rowsScoped
        .filter((r) => r.kind === 'receivable' && r.due_date >= startOfMonthIso(monthCurrent) && r.due_date <= endOfMonthIso(monthCurrent))
        .sort(rowSort),
    [rowsScoped, monthCurrent],
  )
  const ccKpiPeriodTotal = useMemo(() => ccKpiByMonth.reduce((s, r) => s + r.total, 0), [ccKpiByMonth])

  // Despesa total em faturas de cartões no mês selecionado
  const currentCcExpensesTotal = useMemo(() => {
    const data = ccKpiByMonth.find(k => k.monthKey === selectedMonth)
    return data ? data.total : 0
  }, [ccKpiByMonth, selectedMonth])

  if (!supabase) {
    return <p className="text-slate-600">CONECTANDO AO BANCO…</p>
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Painel Financeiro</h2>
          <p className="text-sm text-slate-500">Saldos consolidados, fluxo de caixa e análise de despesas.</p>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <CalendarDays size={16} className="text-[#185FA5]" />
            <span>MÊS BASE:</span>
          </div>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-36 rounded-xl border border-slate-200 px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
          />
        </div>
      </header>

      {loading ? (
        <p className="p-6 text-center text-sm text-slate-500">Carregando painel...</p>
      ) : (
        <div className="space-y-6">
          {/* Métricas Consolidadas */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Patrimônio Líquido */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
              <div className="rounded-xl bg-[#E6F1FB] p-3 text-[#185FA5] shrink-0">
                <Landmark size={24} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Patrimônio Líquido</p>
                <p className={`text-xl font-bold mt-0.5 ${consolidatedBalance < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                  {formatBRL(consolidatedBalance)}
                </p>
              </div>
            </div>

            {/* Resultado do Mês */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
              <div className={`rounded-xl p-3 shrink-0 ${currentMonthResult >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                {currentMonthResult >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Resultado Operacional</p>
                <p className={`text-xl font-bold mt-0.5 ${currentMonthResult < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                  {formatBRL(currentMonthResult)}
                </p>
              </div>
            </div>

            {/* Receitas Operacionais */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
              <div className="rounded-xl bg-emerald-50 text-emerald-600 p-3 shrink-0">
                <ArrowUpRight size={24} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Receitas do Mês</p>
                <p className="text-xl font-bold text-slate-800 mt-0.5">{formatBRL(currentMonthIncomes)}</p>
              </div>
            </div>

            {/* Despesas em Cartão */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
              <div className="rounded-xl bg-violet-50 text-violet-600 p-3 shrink-0">
                <CreditCard size={24} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Despesas no Cartão</p>
                <p className="text-xl font-bold text-slate-800 mt-0.5">{formatBRL(currentCcExpensesTotal)}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Contas Bancárias (Lista Lateral) */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Contas Bancárias</h3>
                <Button
                  type="button"
                  variant="secondary"
                  className={`h-[28px] text-[10px] font-semibold px-2.5 ${selectedBankId === 'ALL' ? 'bg-[#E6F1FB] text-[#185FA5] hover:bg-[#E6F1FB]/85 border-[#185FA5]/25' : 'bg-slate-50 text-slate-600 border-none'}`}
                  onClick={() => setSelectedBankId('ALL')}
                >
                  TODAS
                </Button>
              </div>

              {banks.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">
                  Nenhuma conta ativa.{' '}
                  <Link to="/lsh/contas-bancarias" className="text-sky-600 hover:underline">
                    Cadastrar
                  </Link>
                </p>
              ) : (
                <div className="space-y-2.5 overflow-y-auto max-h-[300px]">
                  {banks.map((b) => {
                    const selected = selectedBankId === b.id
                    const balance = currentBalanceByBankId.get(b.id) ?? Number(b.initial_balance ?? 0)
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setSelectedBankId((prev) => (prev === b.id ? 'ALL' : b.id))}
                        className={`w-full rounded-xl border p-3.5 text-left transition-all ${
                          selected
                            ? 'border-[#185FA5] bg-[#E6F1FB]/20 ring-1 ring-[#185FA5]/30'
                            : 'border-slate-100 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-200'
                        }`}
                      >
                        <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-500">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full ring-1 ring-black/5"
                              style={{ backgroundColor: b.color || '#64748B' }}
                            />
                            <span>{b.name}</span>
                          </div>
                        </div>
                        <div className="text-base font-bold text-slate-800 mt-1">
                          {formatBRL(balance)}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Gráfico de Fluxo de Caixa (BarChart) */}
            <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col gap-4">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Fluxo de Caixa Mensal</h3>
              <div className="h-[280px] w-full text-xs font-medium text-slate-500">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barChartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#64748B' }} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(val) => `R$ ${val}`} tick={{ fill: '#64748B' }} />
                    <Tooltip
                      formatter={(val: any) => [formatBRL(Number(val)), '']}
                      contentStyle={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: 10 }} />
                    <Bar dataKey="Receitas" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={30} />
                    <Bar dataKey="Despesas" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="sr-only">
                <h4>Resumo de Fluxo de Caixa Mensal</h4>
                <table>
                  <thead>
                    <tr>
                      <th>Mês</th>
                      <th>Receitas</th>
                      <th>Despesas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {barChartData.map((row) => (
                      <tr key={row.label}>
                        <td>{row.label}</td>
                        <td>{formatBRL(row.Receitas)}</td>
                        <td>{formatBRL(row.Despesas)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Gráfico de Pizza de Categorias (Donut) */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col gap-4">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Despesas por Categoria</h3>
              {pieChartData.length === 0 ? (
                <div className="flex-1 flex items-center justify-center py-12 text-slate-400 text-xs">
                  Nenhuma despesa registrada neste mês.
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                  <div className="h-[180px] w-full text-xs font-medium text-slate-500">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {pieChartData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(val: any) => [formatBRL(Number(val)), '']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-2 gap-2 w-full text-[11px] font-semibold text-slate-600">
                    {pieChartData.slice(0, 6).map((entry, idx) => (
                      <div key={entry.name} className="flex items-center gap-1.5 min-w-0">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                        <span className="truncate">{entry.name}</span>
                      </div>
                    ))}
                  </div>
                  <div className="sr-only">
                    <h4>Resumo de Despesas por Categoria</h4>
                    <table>
                      <thead>
                        <tr>
                          <th>Categoria</th>
                          <th>Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pieChartData.map((row) => (
                          <tr key={row.name}>
                            <td>{row.name}</td>
                            <td>{formatBRL(row.value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Contas Abertas do Mês Selecionado */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Despesas Abertas — {monthCurrent}</h3>
                <span className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-md">PAGAR</span>
              </div>
              <div className="space-y-2 overflow-y-auto max-h-[220px] flex-1">
                {payCurrent.length === 0 ? (
                  <p className="text-xs text-slate-400 py-8 text-center">Nenhuma despesa em aberto.</p>
                ) : (
                  payCurrent.map((x) => (
                    <div
                      key={`p0-${x.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-xs font-semibold"
                    >
                      <span className="min-w-0 flex-1 truncate text-slate-700">{x.description || '—'}</span>
                      <div className="flex shrink-0 items-center gap-2.5 tabular-nums">
                        <span className="text-red-600">{formatBRL(Number(x.amount))}</span>
                        <span className="text-slate-400 font-mono text-[10px]">{x.due_date}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Receitas Abertas do Mês Selecionado */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Receitas Abertas — {monthCurrent}</h3>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">RECEBER</span>
              </div>
              <div className="space-y-2 overflow-y-auto max-h-[220px] flex-1">
                {recCurrent.length === 0 ? (
                  <p className="text-xs text-slate-400 py-8 text-center">Nenhuma receita em aberto.</p>
                ) : (
                  recCurrent.map((x) => (
                    <div
                      key={`r0-${x.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-xs font-semibold"
                    >
                      <span className="min-w-0 flex-1 truncate text-slate-700">{x.description || '—'}</span>
                      <div className="flex shrink-0 items-center gap-2.5 tabular-nums">
                        <span className="text-emerald-700">{formatBRL(Number(x.amount))}</span>
                        <span className="text-slate-400 font-mono text-[10px]">{x.due_date}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Seção de Cartões de Crédito */}
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800 uppercase tracking-wide">
                <CreditCard size={18} className="text-[#185FA5]" />
                <span>Evolução por Cartão de Crédito</span>
              </div>
              <Link to="/lsh/cartoes" className="text-xs font-semibold text-sky-600 hover:underline">
                Gerenciar Cartões
              </Link>
            </div>
            
            <div className="flex flex-wrap items-end justify-between gap-4">
              <p className="text-xs text-slate-500 leading-normal max-w-xl">
                Valores calculados por competência da fatura (soma de itens por mês de referência). Exibe histórico de 3 meses e projeção futura de acordo com a seleção.
              </p>
              <div>
                <select
                  className="rounded-xl border border-slate-200 px-3.5 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
                  value={ccFutureMonths}
                  onChange={(e) => setCcFutureMonths(Number(e.target.value) as 3 | 6 | 9 | 12)}
                >
                  <option value={3}>Mais 3 Meses</option>
                  <option value={6}>Mais 6 Meses</option>
                  <option value={9}>Mais 9 Meses</option>
                  <option value={12}>Mais 12 Meses</option>
                </select>
              </div>
            </div>

            {ccLoading ? (
              <p className="text-xs text-slate-400 text-center py-6">Carregando evolução de cartões...</p>
            ) : creditCards.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                Nenhum cartão cadastrado.{' '}
                <Link to="/lsh/cartoes" className="text-sky-600 hover:underline">
                  Cadastrar
                </Link>
              </p>
            ) : (
              <div className="space-y-5">
                <div className="rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50/20 to-white p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-sky-900">
                    Soma de Todos os Cartões por Competência
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7 text-xs font-semibold">
                    {ccKpiByMonth.map((row) => (
                      <div
                        key={row.monthKey}
                        className={`rounded-xl border px-3.5 py-3 ${
                          row.isCurrent
                            ? 'border-sky-400 bg-white ring-1 ring-sky-200/50 shadow-sm'
                            : 'border-slate-100 bg-white/60'
                        }`}
                      >
                        {row.isCurrent && (
                          <span className="block text-[9px] font-bold uppercase tracking-wider text-sky-600 mb-0.5">
                            Mês Atual
                          </span>
                        )}
                        <p className="truncate text-slate-600 text-[11px] uppercase tracking-wide leading-tight">
                          {row.label.replace(' DE ', ' ')}
                        </p>
                        <p className="mt-2 text-base font-bold text-slate-800 tabular-nums">{formatBRL(row.total)}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3.5 border-t border-sky-100 pt-3 text-xs font-semibold text-slate-500">
                    Total Acumulado no Período Projetado:{' '}
                    <span className="font-bold tabular-nums text-slate-800">{formatBRL(ccKpiPeriodTotal)}</span>
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {ccCardSeries.map((card) => {
                    const maxBar = Math.max(1, ...card.series.map((s) => s.total))
                    return (
                      <Link
                        key={card.cardId}
                        to={`/lsh/cartoes/${card.cardId}`}
                        className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-[#185FA5] hover:shadow-md"
                      >
                        <h4 className="mb-4 truncate text-sm font-bold text-slate-800" title={card.name}>
                          {card.name}
                        </h4>
                        <div className="flex min-h-0 flex-1 flex-col gap-3">
                          {card.series.map((row) => (
                            <div key={row.monthKey} className="space-y-1">
                              <div className="flex items-center justify-between gap-2 text-xs font-semibold leading-none">
                                <span
                                  className={
                                    row.segment === 'atual'
                                      ? 'min-w-0 truncate text-slate-800'
                                      : row.segment === 'futuro'
                                        ? 'min-w-0 truncate text-sky-800 font-medium'
                                        : 'min-w-0 truncate text-slate-400 font-normal'
                                  }
                                  title={row.label}
                                >
                                  {row.segment === 'atual' ? 'ATUAL · ' : row.segment === 'futuro' ? '→ ' : ''}
                                  {row.label.replace(' DE ', ' ')}
                                </span>
                                <span className="shrink-0 text-slate-700 font-bold tabular-nums">
                                  {formatBRL(row.total)}
                                </span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className={`h-full rounded-full transition-[width] ${
                                    row.segment === 'futuro' ? 'bg-violet-400' : 'bg-[#185FA5]/80'
                                  }`}
                                  style={{ width: `${(row.total / maxBar) * 100}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
