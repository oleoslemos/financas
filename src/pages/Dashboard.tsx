import { useUser } from '@clerk/clerk-react'
import { CalendarDays, CreditCard, Landmark, Wallet } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSupabase } from '../hooks/useSupabase'
import { formatBRL } from '../lib/format'
import { monthLabel, parseISODate, toISODate } from '../lib/dates'

type Row = {
  id: string
  description: string
  amount: number
  due_date: string
  kind: 'payable' | 'receivable'
  bank_account_id: string | null
  status: 'open' | 'paid'
}

type Bank = { id: string; name: string; initial_balance: number }

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

/** Avança ou retrocede meses a partir de uma chave YYYY-MM. */
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

export function Dashboard() {
  const { user } = useUser()
  const supabase = useSupabase()
  const [banks, setBanks] = useState<Bank[]>([])
  const [openRows, setOpenRows] = useState<Row[]>([])
  const [selectedBankId, setSelectedBankId] = useState<string>('ALL')
  const [selectedMonth, setSelectedMonth] = useState<string>(() => monthKey(new Date()))
  const [loading, setLoading] = useState(true)

  const [creditCards, setCreditCards] = useState<{ id: string; name: string }[]>([])
  /** Meses à frente do mês atual (além da base fixa: 3 meses anteriores + atual). */
  const [ccFutureMonths, setCcFutureMonths] = useState<3 | 6 | 9 | 12>(3)
  const [ccFilterId, setCcFilterId] = useState<string>('ALL')
  const [ccSeries, setCcSeries] = useState<
    { monthKey: string; label: string; total: number; segment: 'passado' | 'atual' | 'futuro' }[]
  >([])
  const [ccLoading, setCcLoading] = useState(true)

  useEffect(() => {
    if (!supabase || !user?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const from = startOfMonthIso(selectedMonth)
      const until = endOfMonthIso(nextMonthKey(selectedMonth))

      const [b, pr] = await Promise.all([
        supabase
          .from('bank_accounts')
          .select('id, name, initial_balance')
          .eq('user_id', user.id)
          .eq('is_active', true),
        supabase
          .from('payables_receivables')
          .select('id, description, amount, due_date, kind, bank_account_id, status')
          .eq('user_id', user.id)
          .eq('status', 'open')
          .gte('due_date', from)
          .lte('due_date', until)
          .order('due_date', { ascending: true })
      ])
      if (cancelled) return
      const banksData = (b.data as Bank[]) ?? []
      const rowsData = (pr.data as Row[]) ?? []
      setBanks(banksData)
      setOpenRows(rowsData)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, user?.id, selectedMonth])

  useEffect(() => {
    if (!supabase || !user?.id) return
    let cancelled = false
    ;(async () => {
      setCcLoading(true)
      try {
        const { data: cards } = await supabase
          .from('credit_cards')
          .select('id, name')
          .eq('user_id', user.id)
          .order('name')
        if (cancelled) return
        setCreditCards((cards as { id: string; name: string }[]) ?? [])

        const todayKey = monthKey(new Date())
        const startKey = shiftMonthKey(todayKey, -3)
        const endKey = shiftMonthKey(todayKey, ccFutureMonths)
        const fromIso = startOfMonthIso(startKey)
        const toIso = endOfMonthIso(endKey)

        let invQuery = supabase
          .from('credit_card_invoices')
          .select('id, credit_card_id, reference_month')
          .eq('user_id', user.id)
          .gte('reference_month', fromIso)
          .lte('reference_month', toIso)
        if (ccFilterId !== 'ALL') invQuery = invQuery.eq('credit_card_id', ccFilterId)

        const { data: invoices, error: invErr } = await invQuery
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

        const totalsByMonth = new Map<string, number>()
        for (const inv of invList) {
          const mk = refMonthKey(inv.reference_month)
          const t = totalsByInvoice.get(inv.id) ?? 0
          totalsByMonth.set(mk, (totalsByMonth.get(mk) ?? 0) + t)
        }

        const keys = monthKeysInclusive(startKey, endKey)
        if (cancelled) return
        setCcSeries(
          keys.map((mk) => ({
            monthKey: mk,
            label: monthLabel(parseISODate(`${mk}-01`)).toUpperCase(),
            total: totalsByMonth.get(mk) ?? 0,
            segment: mk < todayKey ? 'passado' : mk === todayKey ? 'atual' : 'futuro',
          })),
        )
      } finally {
        if (!cancelled) setCcLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, user?.id, ccFutureMonths, ccFilterId])

  const monthCurrent = selectedMonth
  const monthNext = nextMonthKey(selectedMonth)
  const selectedBankName = selectedBankId === 'ALL' ? 'TODAS AS CONTAS' : banks.find((b) => b.id === selectedBankId)?.name ?? 'CONTA'

  const rowsScoped = useMemo(
    () =>
      openRows.filter((r) => (selectedBankId === 'ALL' ? true : r.bank_account_id === selectedBankId)),
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
  const payNext = useMemo(
    () =>
      rowsScoped
        .filter((r) => r.kind === 'payable' && r.due_date >= startOfMonthIso(monthNext) && r.due_date <= endOfMonthIso(monthNext))
        .sort(rowSort),
    [rowsScoped, monthNext],
  )
  const recNext = useMemo(
    () =>
      rowsScoped
        .filter((r) => r.kind === 'receivable' && r.due_date >= startOfMonthIso(monthNext) && r.due_date <= endOfMonthIso(monthNext))
        .sort(rowSort),
    [rowsScoped, monthNext],
  )

  const ccMaxTotal = useMemo(() => Math.max(1, ...ccSeries.map((s) => s.total)), [ccSeries])

  if (!supabase) {
    return <p className="text-slate-400">CONECTANDO AO BANCO…</p>
  }

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-xl font-semibold text-white">OLÁ{user?.firstName ? `, ${user.firstName}` : ''}</h2>
        <p className="text-xs text-slate-400">SALDOS BANCÁRIOS E CONTAS ABERTAS</p>
      </header>

      {loading ? (
        <p className="text-slate-500">CARREGANDO…</p>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold tracking-wide text-slate-400">CONTAS BANCÁRIAS</h3>
              <button
                type="button"
                className={`btn btn-secondary text-[11px] ${selectedBankId === 'ALL' ? 'ring-1 ring-sky-500/60' : ''}`}
                onClick={() => setSelectedBankId('ALL')}
              >
                TODAS
              </button>
            </div>

            {banks.length === 0 ? (
              <p className="text-xs text-slate-500">
                NENHUMA CONTA ATIVA.{' '}
                <Link to="/contas-bancarias" className="text-sky-400 hover:underline">
                  CADASTRAR
                </Link>
              </p>
            ) : (
              banks.map((b) => {
                const selected = selectedBankId === b.id
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBankId((prev) => (prev === b.id ? 'ALL' : b.id))}
                    className={`w-full rounded-xl border p-4 text-left transition-colors ${
                      selected ? 'border-sky-600 bg-slate-900/80' : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-400">
                      <Landmark size={14} />
                      <span>{b.name}</span>
                    </div>
                    <div className="text-sm font-semibold text-white">SALDO ATUAL: {formatBRL(Number(b.initial_balance))}</div>
                  </button>
                )
              })
            )}
          </section>

          <section className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
                <CalendarDays size={14} />
                <span>MÊS BASE</span>
              </div>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-44"
              />
              <div className="mt-2 text-[11px] text-slate-500">
                EXIBINDO: {selectedMonth} E {nextMonthKey(selectedMonth)}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                FILTRO DE CONTA: {selectedBankName}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
                <h3 className="mb-2 text-xs font-semibold text-slate-300">CONTAS ABERTAS — {selectedMonth}</h3>
                <div className="space-y-2">
                  <p className="text-[11px] text-amber-300">A PAGAR</p>
                  {payCurrent.length === 0 ? (
                    <p className="text-[11px] text-slate-500">
                      SEM REGISTROS
                      {selectedBankId !== 'ALL' ? ' NESTA CONTA.' : '.'}
                    </p>
                  ) : (
                    payCurrent.map((x) => (
                      <div key={`p0-${x.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 px-2 py-1.5 text-xs">
                        <span className="truncate text-slate-300">{x.description || '—'}</span>
                        <span className="text-amber-200">{formatBRL(Number(x.amount))}</span>
                        <span className="text-slate-500">{x.due_date}</span>
                      </div>
                    ))
                  )}

                  <p className="pt-2 text-[11px] text-emerald-300">A RECEBER</p>
                  {recCurrent.length === 0 ? (
                    <p className="text-[11px] text-slate-500">
                      SEM REGISTROS
                      {selectedBankId !== 'ALL' ? ' NESTA CONTA.' : '.'}
                    </p>
                  ) : (
                    recCurrent.map((x) => (
                      <div key={`r0-${x.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 px-2 py-1.5 text-xs">
                        <span className="truncate text-slate-300">{x.description || '—'}</span>
                        <span className="text-emerald-300">{formatBRL(Number(x.amount))}</span>
                        <span className="text-slate-500">{x.due_date}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
                <h3 className="mb-2 text-xs font-semibold text-slate-300">CONTAS ABERTAS — {monthNext}</h3>
                <div className="space-y-2">
                  <p className="text-[11px] text-amber-300">A PAGAR</p>
                  {payNext.length === 0 ? (
                    <p className="text-[11px] text-slate-500">
                      SEM REGISTROS
                      {selectedBankId !== 'ALL' ? ' NESTA CONTA.' : '.'}
                    </p>
                  ) : (
                    payNext.map((x) => (
                      <div key={`p1-${x.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 px-2 py-1.5 text-xs">
                        <span className="truncate text-slate-300">{x.description || '—'}</span>
                        <span className="text-amber-200">{formatBRL(Number(x.amount))}</span>
                        <span className="text-slate-500">{x.due_date}</span>
                      </div>
                    ))
                  )}

                  <p className="pt-2 text-[11px] text-emerald-300">A RECEBER</p>
                  {recNext.length === 0 ? (
                    <p className="text-[11px] text-slate-500">
                      SEM REGISTROS
                      {selectedBankId !== 'ALL' ? ' NESTA CONTA.' : '.'}
                    </p>
                  ) : (
                    recNext.map((x) => (
                      <div key={`r1-${x.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 px-2 py-1.5 text-xs">
                        <span className="truncate text-slate-300">{x.description || '—'}</span>
                        <span className="text-emerald-300">{formatBRL(Number(x.amount))}</span>
                        <span className="text-slate-500">{x.due_date}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <Link to="/fluxo" className="inline-flex items-center gap-2 text-xs text-sky-400 hover:underline">
              <Wallet size={14} />
              VER MOVIMENTOS COMPLETOS
            </Link>
          </section>
        </div>
      )}

      <section className="mt-10 space-y-4 rounded-xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <CreditCard size={16} className="text-sky-400" />
            <span>EVOLUÇÃO DO CARTÃO DE CRÉDITO (TOTAL DA FATURA)</span>
          </div>
          <Link to="/cartoes" className="text-[11px] text-sky-400 hover:underline">
            GERENCIAR CARTÕES
          </Link>
        </div>
        <p className="text-[11px] text-slate-500">
          BASE FIXA: 3 MESES ANTERIORES + MÊS ATUAL ({monthKey(new Date())}). EM SEGUIDA, MESES À FRENTE CONFORME O FILTRO.
          VALORES = SOMA DOS ITENS DA FATURA POR COMPETÊNCIA (FATURAS FUTURAS APARECEM SE JÁ EXISTIREM, EX.: PARCELADO).
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">À FRENTE</label>
            <select
              className="min-w-[200px]"
              value={ccFutureMonths}
              onChange={(e) => setCcFutureMonths(Number(e.target.value) as 3 | 6 | 9 | 12)}
            >
              <option value={3}>PRÓXIMOS 3 MESES</option>
              <option value={6}>PRÓXIMOS 6 MESES</option>
              <option value={9}>PRÓXIMOS 9 MESES</option>
              <option value={12}>PRÓXIMOS 12 MESES</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">CARTÃO</label>
            <select className="min-w-[200px]" value={ccFilterId} onChange={(e) => setCcFilterId(e.target.value)}>
              <option value="ALL">TODOS OS CARTÕES</option>
              {creditCards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {ccLoading ? (
          <p className="text-xs text-slate-500">CARREGANDO EVOLUÇÃO…</p>
        ) : creditCards.length === 0 ? (
          <p className="text-xs text-slate-500">
            NENHUM CARTÃO CADASTRADO.{' '}
            <Link to="/cartoes" className="text-sky-400 hover:underline">
              CADASTRAR
            </Link>
          </p>
        ) : (
          <div className="space-y-3">
            {ccSeries.map((row) => (
              <div key={row.monthKey} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span
                    className={
                      row.segment === 'atual'
                        ? 'font-medium text-white'
                        : row.segment === 'futuro'
                          ? 'text-sky-300'
                          : 'text-slate-400'
                    }
                  >
                    {row.label}
                    {row.segment === 'atual' ? ' — MÊS ATUAL' : row.segment === 'futuro' ? ' — À FRENTE' : ''}
                  </span>
                  <span className="font-medium text-amber-200">{formatBRL(row.total)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-[width] ${
                      row.segment === 'futuro' ? 'bg-violet-600/70' : 'bg-sky-600/80'
                    }`}
                    style={{ width: `${(row.total / ccMaxTotal) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
