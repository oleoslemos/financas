import { useUser } from '@clerk/clerk-react'
import { CalendarDays, Landmark, Wallet } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSupabase } from '../hooks/useSupabase'
import { formatBRL } from '../lib/format'
import { toISODate } from '../lib/dates'

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

  const monthCurrent = selectedMonth
  const monthNext = nextMonthKey(selectedMonth)

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
                const scoped = openRows.filter((r) => r.bank_account_id === b.id)
                const impact = scoped.reduce((acc, r) => acc + (r.kind === 'receivable' ? Number(r.amount) : -Number(r.amount)), 0)
                const predicted = Number(b.initial_balance) + impact
                const selected = selectedBankId === b.id
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBankId(b.id)}
                    className={`w-full rounded-xl border p-4 text-left transition-colors ${
                      selected ? 'border-sky-600 bg-slate-900/80' : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-400">
                      <Landmark size={14} />
                      <span>{b.name}</span>
                    </div>
                    <div className="text-sm font-semibold text-white">SALDO ATUAL: {formatBRL(Number(b.initial_balance))}</div>
                    <div className="mt-1 text-[11px] text-slate-400">SALDO PREVISTO: {formatBRL(predicted)}</div>
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
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
                <h3 className="mb-2 text-xs font-semibold text-slate-300">CONTAS ABERTAS — {selectedMonth}</h3>
                <div className="space-y-2">
                  <p className="text-[11px] text-amber-300">A PAGAR</p>
                  {payCurrent.length === 0 ? (
                    <p className="text-[11px] text-slate-500">SEM REGISTROS</p>
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
                    <p className="text-[11px] text-slate-500">SEM REGISTROS</p>
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
                    <p className="text-[11px] text-slate-500">SEM REGISTROS</p>
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
                    <p className="text-[11px] text-slate-500">SEM REGISTROS</p>
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
    </div>
  )
}
