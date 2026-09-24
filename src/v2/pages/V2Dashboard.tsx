import { useEffect, useMemo, useState } from 'react'
import { useUser } from '../../hooks/useClerkCompat'
import { useSupabase } from '../../hooks/useSupabase'
import { resolveDataOwnerId } from '../../lib/dataOwner'
import { clerkEmailCandidates } from '../../lib/clerkEmails'
import { formatBRL } from '../../lib/format'
import { monthLabel, parseISODate, toISODate } from '../../lib/dates'
import { Link } from 'react-router-dom'
import {
  Landmark,
  TrendingUp,
  TrendingDown,
  CreditCard,
  CalendarDays,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  BarChart3,
  PieChart as PieChartIcon,
} from 'lucide-react'
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

const PIE_COLORS = ['#6366F1', '#38BDF8', '#34D399', '#FB923C', '#F43F5E', '#A855F7', '#FACC15', '#94A3B8']

export function V2Dashboard() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))

  const [banks, setBanks] = useState<Bank[]>([])
  const [openRows, setOpenRows] = useState<Row[]>([])
  const [paidMovements, setPaidMovements] = useState<PaidMovement[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [rangeMovements, setRangeMovements] = useState<Row[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string>(() => monthKey(new Date()))
  const [loading, setLoading] = useState(true)

  const [creditCards, setCreditCards] = useState<{ id: string; name: string }[]>([])
  const [ccFutureMonths] = useState<3 | 6 | 9 | 12>(3)
  const [ccKpiByMonth, setCcKpiByMonth] = useState<{ monthKey: string; label: string; total: number; isCurrent: boolean }[]>([])

  useEffect(() => {
    if (!supabase || !ownerUserId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const from = startOfMonthIso(selectedMonth)
      const until = endOfMonthIso(nextMonthKey(selectedMonth))

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
        supabase.from('categories').select('id, name, parent_id').eq('user_id', ownerUserId),
        supabase
          .from('payables_receivables')
          .select('id, description, amount, due_date, kind, bank_account_id, destination_bank_account_id, status, category_id')
          .eq('user_id', ownerUserId)
          .gte('due_date', chartFrom)
          .lte('due_date', chartUntil),
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

  // Credit Card KPIs
  useEffect(() => {
    if (!supabase || !ownerUserId) return
    let cancelled = false
    ;(async () => {
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
      const fromIso = startOfMonthIso(startKey)
      const toIso = endOfMonthIso(endKey)

      const { data: invoices } = await supabase
        .from('credit_card_invoices')
        .select('id, credit_card_id, reference_month')
        .eq('user_id', ownerUserId)
        .gte('reference_month', fromIso)
        .lte('reference_month', toIso)

      if (cancelled) return
      const invList = (invoices ?? []) as { id: string; credit_card_id: string; reference_month: string }[]
      const totalsByInvoice = new Map<string, number>()

      if (invList.length > 0) {
        const ids = invList.map((i) => i.id)
        const { data: items } = await supabase
          .from('credit_card_invoice_items')
          .select('invoice_id, amount')
          .in('invoice_id', ids)

        for (const it of (items ?? []) as { invoice_id: string; amount: number }[]) {
          const prev = totalsByInvoice.get(it.invoice_id) ?? 0
          totalsByInvoice.set(it.invoice_id, prev + Number(it.amount))
        }
      }

      const byMonthMap = new Map<string, number>()
      for (const inv of invList) {
        const mk = refMonthKey(inv.reference_month)
        const t = totalsByInvoice.get(inv.id) ?? 0
        byMonthMap.set(mk, (byMonthMap.get(mk) ?? 0) + t)
      }

      const kpiKeys = monthKeysInclusive(startKey, endKey)
      const rows = kpiKeys.map((mk) => ({
        monthKey: mk,
        label: monthLabel(parseISODate(`${mk}-01`)).toUpperCase(),
        total: byMonthMap.get(mk) ?? 0,
        isCurrent: mk === todayKey,
      }))

      if (!cancelled) setCcKpiByMonth(rows)
    })()

    return () => {
      cancelled = true
    }
  }, [supabase, ownerUserId, ccFutureMonths])

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

  const consolidatedBalance = useMemo(() => {
    let sum = 0
    banks.forEach((b) => {
      sum += currentBalanceByBankId.get(b.id) ?? 0
    })
    return sum
  }, [banks, currentBalanceByBankId])

  const currentMonthMovements = useMemo(() => {
    const from = startOfMonthIso(selectedMonth)
    const until = endOfMonthIso(selectedMonth)
    return rangeMovements.filter((m) => m.due_date >= from && m.due_date <= until)
  }, [rangeMovements, selectedMonth])

  const currentMonthIncomes = useMemo(() => {
    return currentMonthMovements
      .filter((m) => m.kind === 'receivable')
      .reduce((sum, m) => sum + Number(m.amount), 0)
  }, [currentMonthMovements])

  const currentMonthExpenses = useMemo(() => {
    return currentMonthMovements
      .filter((m) => m.kind === 'payable')
      .reduce((sum, m) => sum + Number(m.amount), 0)
  }, [currentMonthMovements])

  const currentMonthResult = useMemo(() => {
    return currentMonthIncomes - currentMonthExpenses
  }, [currentMonthIncomes, currentMonthExpenses])

  const currentCcExpensesTotal = useMemo(() => {
    const data = ccKpiByMonth.find((k) => k.monthKey === selectedMonth)
    return data ? data.total : 0
  }, [ccKpiByMonth, selectedMonth])

  const barChartData = useMemo(() => {
    const startKey = shiftMonthKey(selectedMonth, -4)
    const endKey = nextMonthKey(selectedMonth)
    const months = monthKeysInclusive(startKey, endKey)

    return months.map((mk) => {
      const monthMvs = rangeMovements.filter((m) => refMonthKey(m.due_date) === mk)
      const receitas = monthMvs
        .filter((m) => m.kind === 'receivable')
        .reduce((sum, m) => sum + Number(m.amount), 0)
      const despesas = monthMvs
        .filter((m) => m.kind === 'payable')
        .reduce((sum, m) => sum + Number(m.amount), 0)

      return {
        month: mk,
        label: monthLabel(parseISODate(`${mk}-01`)).toUpperCase(),
        Receitas: receitas,
        Despesas: despesas,
      }
    })
  }, [rangeMovements, selectedMonth])

  const pieChartData = useMemo(() => {
    const summaryMap = new Map<string, number>()
    const currentExpenses = currentMonthMovements.filter((m) => m.kind === 'payable')

    currentExpenses.forEach((exp) => {
      const cat = cats.find((c) => c.id === exp.category_id)
      const parentId = cat?.parent_id || cat?.id || 'other'
      const parentName = cats.find((c) => c.id === parentId)?.name || 'OUTROS'
      summaryMap.set(parentName, (summaryMap.get(parentName) ?? 0) + Number(exp.amount))
    })

    return Array.from(summaryMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [currentMonthMovements, cats])

  const openPayables = useMemo(() => {
    return openRows
      .filter((r) => r.kind === 'payable' && r.due_date.startsWith(selectedMonth))
      .slice(0, 5)
  }, [openRows, selectedMonth])

  const openReceivables = useMemo(() => {
    return openRows
      .filter((r) => r.kind === 'receivable' && r.due_date.startsWith(selectedMonth))
      .slice(0, 5)
  }, [openRows, selectedMonth])

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800/80 rounded-3xl p-6 shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              PAINEL V2 INTELIGENTE
            </span>
            <span className="text-xs text-slate-400">· Visão consolidada em tempo real</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Resumo Financeiro
          </h2>
        </div>

        <div className="flex items-center gap-3 bg-slate-900/90 border border-slate-700/60 rounded-2xl px-4 py-2.5 shadow-inner">
          <CalendarDays className="h-4 w-4 text-indigo-400" />
          <span className="text-xs font-bold text-slate-300">MÊS DE REFERÊNCIA:</span>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-white text-xs font-bold rounded-xl px-3 py-1 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 space-y-3">
          <div className="h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400 font-semibold">Carregando seus dados financeiros...</p>
        </div>
      ) : (
        <>
          {/* Main KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Consolidated Net Worth */}
            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/90 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-indigo-500/50 transition-all">
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl pointer-events-none group-hover:bg-indigo-500/20 transition-all" />
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Patrimônio Líquido</span>
                <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Landmark className="h-5 w-5" />
                </span>
              </div>
              <p className={`text-2xl font-black ${consolidatedBalance < 0 ? 'text-rose-400' : 'text-white'}`}>
                {formatBRL(consolidatedBalance)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1 font-medium">Soma de saldos em {banks.length} conta(s)</p>
            </div>

            {/* Operational Result */}
            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/90 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-emerald-500/50 transition-all">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Resultado do Mês</span>
                <span className={`p-2 rounded-xl border ${currentMonthResult >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                  {currentMonthResult >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                </span>
              </div>
              <p className={`text-2xl font-black ${currentMonthResult < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {formatBRL(currentMonthResult)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1 font-medium">Receitas - Despesas do mês</p>
            </div>

            {/* Monthly Incomes */}
            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/90 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-emerald-500/50 transition-all">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Receitas do Mês</span>
                <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <ArrowUpRight className="h-5 w-5" />
                </span>
              </div>
              <p className="text-2xl font-black text-white">{formatBRL(currentMonthIncomes)}</p>
              <p className="text-[11px] text-emerald-400 mt-1 font-medium">Total previsto/pago</p>
            </div>

            {/* Credit Card Expenses */}
            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/90 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-sky-500/50 transition-all">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Faturas no Cartão</span>
                <span className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  <CreditCard className="h-5 w-5" />
                </span>
              </div>
              <p className="text-2xl font-black text-white">{formatBRL(currentCcExpensesTotal)}</p>
              <p className="text-[11px] text-sky-400 mt-1 font-medium">{creditCards.length} cartão(ões) cadastrado(s)</p>
            </div>
          </div>

          {/* Accounts & Cashflow Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Bank Accounts Sidebar Card */}
            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/90 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Landmark className="h-5 w-5 text-indigo-400" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Contas Bancárias</h3>
                </div>
                <Link
                  to="/v2/contas-bancarias"
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                >
                  Gerenciar
                </Link>
              </div>

              {banks.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs">
                  Nenhuma conta ativa.{' '}
                  <Link to="/v2/contas-bancarias" className="text-indigo-400 underline">
                    Cadastrar agora
                  </Link>
                </div>
              ) : (
                <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                  {banks.map((b) => {
                    const balance = currentBalanceByBankId.get(b.id) ?? Number(b.initial_balance ?? 0)
                    return (
                      <div
                        key={b.id}
                        className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 hover:border-slate-700 transition"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-3 w-3 rounded-full border border-white/20"
                              style={{ backgroundColor: b.color || '#6366F1' }}
                            />
                            <span className="text-xs font-bold text-slate-200">{b.name}</span>
                          </div>
                        </div>
                        <p className={`text-base font-extrabold ${balance < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {formatBRL(balance)}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Cashflow Bar Chart */}
            <div className="lg:col-span-2 bg-slate-900/60 backdrop-blur-md border border-slate-800/90 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-indigo-400" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Evolução do Fluxo de Caixa</h3>
                </div>
              </div>

              <div className="h-[280px] w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barChartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#94A3B8', fontSize: 11 }} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(val) => `R$${val}`} tick={{ fill: '#94A3B8', fontSize: 11 }} />
                    <Tooltip
                      formatter={(val: any) => [formatBRL(Number(val)), '']}
                      contentStyle={{ background: '#0F172A', borderRadius: '12px', border: '1px solid #334155', color: '#fff' }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: 10, fontSize: '12px' }} />
                    <Bar dataKey="Receitas" fill="#34D399" radius={[6, 6, 0, 0]} maxBarSize={32} />
                    <Bar dataKey="Despesas" fill="#F43F5E" radius={[6, 6, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Category Breakdown & Pending Lists */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Category Expenses Pie */}
            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/90 rounded-3xl p-6 shadow-xl flex flex-col justify-between space-y-4">
              <div className="flex items-center gap-2">
                <PieChartIcon className="h-5 w-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Despesas por Categoria</h3>
              </div>

              {pieChartData.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">Sem despesas registradas no mês selecionado.</div>
              ) : (
                <div className="space-y-4">
                  <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={80}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {pieChartData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(val: any) => [formatBRL(Number(val)), '']} contentStyle={{ background: '#0F172A', borderRadius: '12px', border: '1px solid #334155', color: '#fff' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-300">
                    {pieChartData.slice(0, 6).map((entry, idx) => (
                      <div key={entry.name} className="flex items-center gap-2 min-w-0">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                        <span className="truncate text-slate-300 text-[11px]">{entry.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Open Payables List */}
            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/90 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Clock className="h-4 w-4 text-rose-400" />
                  <span>Despesas Pendentes</span>
                </h3>
                <Link to="/v2/fluxo" className="text-xs text-indigo-400 hover:underline font-semibold">Ver Todas</Link>
              </div>

              <div className="space-y-2 max-h-[260px] overflow-y-auto">
                {openPayables.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-8">Nenhuma despesa pendente neste mês.</p>
                ) : (
                  openPayables.map((item) => (
                    <div
                      key={item.id}
                      className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between text-xs"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="font-bold text-slate-200 truncate">{item.description}</p>
                        <p className="text-[10px] text-slate-400 font-mono">Venc: {item.due_date}</p>
                      </div>
                      <span className="font-extrabold text-rose-400 shrink-0">{formatBRL(Number(item.amount))}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Open Receivables List */}
            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/90 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span>Receitas a Receber</span>
                </h3>
                <Link to="/v2/fluxo" className="text-xs text-indigo-400 hover:underline font-semibold">Ver Todas</Link>
              </div>

              <div className="space-y-2 max-h-[260px] overflow-y-auto">
                {openReceivables.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-8">Nenhuma receita pendente neste mês.</p>
                ) : (
                  openReceivables.map((item) => (
                    <div
                      key={item.id}
                      className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between text-xs"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="font-bold text-slate-200 truncate">{item.description}</p>
                        <p className="text-[10px] text-slate-400 font-mono">Venc: {item.due_date}</p>
                      </div>
                      <span className="font-extrabold text-emerald-400 shrink-0">{formatBRL(Number(item.amount))}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
