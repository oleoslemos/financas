import { useUser } from '@clerk/clerk-react'
import { CalendarDays, CreditCard, Landmark, Wallet } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
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
type PaidMovement = { bank_account_id: string | null; amount: number; kind: 'payable' | 'receivable' }

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
  const ownerUserId = resolveDataOwnerId(user?.id)
  const [banks, setBanks] = useState<Bank[]>([])
  const [openRows, setOpenRows] = useState<Row[]>([])
  const [paidMovements, setPaidMovements] = useState<PaidMovement[]>([])
  const [selectedBankId, setSelectedBankId] = useState<string>('ALL')
  const [selectedMonth, setSelectedMonth] = useState<string>(() => monthKey(new Date()))
  const [loading, setLoading] = useState(true)

  const [creditCards, setCreditCards] = useState<{ id: string; name: string }[]>([])
  /** Meses à frente do mês atual (além da base fixa: 3 meses anteriores + atual). */
  const [ccFutureMonths, setCcFutureMonths] = useState<3 | 6 | 9 | 12>(3)
  const [ccCardSeries, setCcCardSeries] = useState<
    {
      cardId: string
      name: string
      series: { monthKey: string; label: string; total: number; segment: 'passado' | 'atual' | 'futuro' }[]
    }[]
  >([])
  /** Totais agregados (todos os cartões) por competência: mês atual + próximos 6 meses. */
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

      const [b, pr, paid] = await Promise.all([
        supabase
          .from('bank_accounts')
          .select('id, name, initial_balance')
          .eq('user_id', ownerUserId)
          .eq('is_active', true),
        supabase
          .from('payables_receivables')
          .select('id, description, amount, due_date, kind, bank_account_id, status')
          .eq('user_id', ownerUserId)
          .eq('status', 'open')
          .gte('due_date', from)
          .lte('due_date', until)
          .order('due_date', { ascending: true })
        ,
        supabase
          .from('payables_receivables')
          .select('bank_account_id, amount, kind')
          .eq('user_id', ownerUserId)
          .eq('status', 'paid'),
      ])
      if (cancelled) return
      const banksData = (b.data as Bank[]) ?? []
      const rowsData = (pr.data as Row[]) ?? []
      setBanks(banksData)
      setOpenRows(rowsData)
      setPaidMovements(((paid.data ?? []) as PaidMovement[]) ?? [])
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
      if (!mv.bank_account_id) continue
      const cur = map.get(mv.bank_account_id) ?? 0
      const delta = mv.kind === 'receivable' ? Number(mv.amount) : -Number(mv.amount)
      map.set(mv.bank_account_id, cur + delta)
    }
    return map
  }, [banks, paidMovements])

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

  const ccKpiPeriodTotal = useMemo(() => ccKpiByMonth.reduce((s, r) => s + r.total, 0), [ccKpiByMonth])

  if (!supabase) {
    return <p className="text-slate-600">CONECTANDO AO BANCO…</p>
  }

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-xl font-semibold text-slate-900">OLÁ{user?.firstName ? `, ${user.firstName}` : ''}</h2>
        <p className="text-xs text-slate-600">SALDOS BANCÁRIOS E CONTAS ABERTAS</p>
      </header>

      {loading ? (
        <p className="text-slate-500">CARREGANDO…</p>
      ) : (
        <div className="grid w-full gap-4 sm:gap-6 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold tracking-wide text-slate-600">CONTAS BANCÁRIAS</h3>
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
                <Link to="/lsh/contas-bancarias" className="text-sky-600 hover:underline">
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
                    className={`w-full rounded-xl border bg-white p-3 text-left shadow-sm transition-colors sm:p-4 ${
                      selected ? 'border-sky-500 ring-1 ring-sky-200' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-500">
                      <Landmark size={14} />
                      <span>{b.name}</span>
                    </div>
                    <div className="text-sm font-semibold text-slate-900">
                      SALDO ATUAL: {formatBRL(currentBalanceByBankId.get(b.id) ?? Number(b.initial_balance ?? 0))}
                    </div>
                  </button>
                )
              })
            )}
          </section>

          <section className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-xs text-slate-600">
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
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <h3 className="mb-2 text-xs font-semibold text-slate-700">CONTAS ABERTAS — {selectedMonth}</h3>
                <div className="space-y-2">
                  <p className="text-[11px] font-medium text-amber-800">A PAGAR</p>
                  {payCurrent.length === 0 ? (
                    <p className="text-[11px] text-slate-500">
                      SEM REGISTROS
                      {selectedBankId !== 'ALL' ? ' NESTA CONTA.' : '.'}
                    </p>
                  ) : (
                    payCurrent.map((x) => (
                      <div
                        key={`p0-${x.id}`}
                        className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-1.5 text-xs"
                      >
                        <span className="min-w-0 flex-1 truncate text-slate-700">{x.description || '—'}</span>
                        <div className="flex shrink-0 items-center gap-2 tabular-nums">
                          <span className="text-amber-800">{formatBRL(Number(x.amount))}</span>
                          <span className="whitespace-nowrap text-slate-500">{x.due_date}</span>
                        </div>
                      </div>
                    ))
                  )}

                  <p className="pt-2 text-[11px] font-medium text-emerald-800">A RECEBER</p>
                  {recCurrent.length === 0 ? (
                    <p className="text-[11px] text-slate-500">
                      SEM REGISTROS
                      {selectedBankId !== 'ALL' ? ' NESTA CONTA.' : '.'}
                    </p>
                  ) : (
                    recCurrent.map((x) => (
                      <div
                        key={`r0-${x.id}`}
                        className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-1.5 text-xs"
                      >
                        <span className="min-w-0 flex-1 truncate text-slate-700">{x.description || '—'}</span>
                        <div className="flex shrink-0 items-center gap-2 tabular-nums">
                          <span className="text-emerald-700">{formatBRL(Number(x.amount))}</span>
                          <span className="whitespace-nowrap text-slate-500">{x.due_date}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <h3 className="mb-2 text-xs font-semibold text-slate-700">CONTAS ABERTAS — {monthNext}</h3>
                <div className="space-y-2">
                  <p className="text-[11px] font-medium text-amber-800">A PAGAR</p>
                  {payNext.length === 0 ? (
                    <p className="text-[11px] text-slate-500">
                      SEM REGISTROS
                      {selectedBankId !== 'ALL' ? ' NESTA CONTA.' : '.'}
                    </p>
                  ) : (
                    payNext.map((x) => (
                      <div
                        key={`p1-${x.id}`}
                        className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-1.5 text-xs"
                      >
                        <span className="min-w-0 flex-1 truncate text-slate-700">{x.description || '—'}</span>
                        <div className="flex shrink-0 items-center gap-2 tabular-nums">
                          <span className="text-amber-800">{formatBRL(Number(x.amount))}</span>
                          <span className="whitespace-nowrap text-slate-500">{x.due_date}</span>
                        </div>
                      </div>
                    ))
                  )}

                  <p className="pt-2 text-[11px] font-medium text-emerald-800">A RECEBER</p>
                  {recNext.length === 0 ? (
                    <p className="text-[11px] text-slate-500">
                      SEM REGISTROS
                      {selectedBankId !== 'ALL' ? ' NESTA CONTA.' : '.'}
                    </p>
                  ) : (
                    recNext.map((x) => (
                      <div
                        key={`r1-${x.id}`}
                        className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-1.5 text-xs"
                      >
                        <span className="min-w-0 flex-1 truncate text-slate-700">{x.description || '—'}</span>
                        <div className="flex shrink-0 items-center gap-2 tabular-nums">
                          <span className="text-emerald-700">{formatBRL(Number(x.amount))}</span>
                          <span className="whitespace-nowrap text-slate-500">{x.due_date}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <Link to="/lsh/fluxo" className="inline-flex items-center gap-2 text-xs text-sky-600 hover:underline">
              <Wallet size={14} />
              VER MOVIMENTOS COMPLETOS
            </Link>
          </section>
        </div>
      )}

      <section className="mt-8 space-y-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:mt-10 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
            <CreditCard size={16} className="text-sky-600" />
            <span>EVOLUÇÃO POR CARTÃO (TOTAL DA FATURA)</span>
          </div>
          <Link to="/lsh/cartoes" className="text-[11px] text-sky-600 hover:underline">
            GERENCIAR CARTÕES
          </Link>
        </div>
        <p className="text-[11px] text-slate-500">
          CADA CARD É UM CARTÃO: BASE DE 3 MESES ANTERIORES + MÊS ATUAL ({monthKey(new Date())}), DEPOIS MESES À FRENTE
          CONFORME O FILTRO. VALORES = SOMA DOS ITENS DA FATURA POR COMPETÊNCIA.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-[11px] text-slate-600">À FRENTE (EM CADA CARD)</label>
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
        </div>

        {ccLoading ? (
          <p className="text-xs text-slate-500">CARREGANDO EVOLUÇÃO…</p>
        ) : creditCards.length === 0 ? (
          <p className="text-xs text-slate-500">
            NENHUM CARTÃO CADASTRADO.{' '}
            <Link to="/lsh/cartoes" className="text-sky-600 hover:underline">
              CADASTRAR
            </Link>
          </p>
        ) : (
          <>
            <div className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-900">
                Total de todos os cartões por mês
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Mês atual e próximos 6 meses — soma das faturas por competência (todos os cartões)
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
                {ccKpiByMonth.map((row) => (
                  <div
                    key={row.monthKey}
                    className={`rounded-lg border px-2 py-2 sm:px-3 sm:py-2.5 ${
                      row.isCurrent ? 'border-sky-400 bg-white ring-1 ring-sky-200' : 'border-slate-200/80 bg-white/60'
                    }`}
                  >
                    {row.isCurrent ? (
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-700 sm:text-xs">
                        Mês atual
                      </p>
                    ) : null}
                    <p
                      className={`truncate font-semibold leading-tight ${row.isCurrent ? 'mt-0.5 text-sm text-sky-950 sm:text-base' : 'text-sm text-slate-800 sm:text-base'}`}
                      title={row.label}
                    >
                      {row.label.replace(' DE ', ' ')}
                    </p>
                    <p className="mt-1.5 text-base font-bold tabular-nums text-amber-900 sm:text-lg">{formatBRL(row.total)}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 border-t border-sky-200/80 pt-3 text-xs text-slate-600">
                Total no período (7 competências):{' '}
                <span className="font-semibold tabular-nums text-slate-900">{formatBRL(ccKpiPeriodTotal)}</span>
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {ccCardSeries.map((card) => {
                const maxBar = Math.max(1, ...card.series.map((s) => s.total))
                return (
                  <Link
                    key={card.cardId}
                    to={`/cartoes/${card.cardId}`}
                    className="flex flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:border-sky-300 hover:shadow-md sm:p-4"
                  >
                    <h4 className="mb-3 truncate text-sm font-semibold text-slate-900" title={card.name}>
                      {card.name}
                    </h4>
                    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
                      {card.series.map((row) => (
                        <div key={row.monthKey} className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-xs leading-snug sm:text-sm">
                            <span
                              className={
                                row.segment === 'atual'
                                  ? 'min-w-0 truncate font-semibold text-slate-900'
                                  : row.segment === 'futuro'
                                    ? 'min-w-0 truncate font-medium text-sky-800'
                                    : 'min-w-0 truncate text-slate-700'
                              }
                              title={row.label}
                            >
                              {row.segment === 'atual' ? 'ATUAL · ' : row.segment === 'futuro' ? '→ ' : ''}
                              {row.label.replace(' DE ', ' ')}
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums text-amber-900">
                              {formatBRL(row.total)}
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className={`h-full rounded-full transition-[width] ${
                                row.segment === 'futuro' ? 'bg-violet-500' : 'bg-sky-500'
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
          </>
        )}
      </section>
    </div>
  )
}
