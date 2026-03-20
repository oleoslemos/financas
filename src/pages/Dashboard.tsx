import { useUser } from '@clerk/clerk-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSupabase } from '../hooks/useSupabase'
import { formatBRL } from '../lib/format'
import { addMonths, toISODate } from '../lib/dates'

type Row = { id: string; description: string; amount: number; due_date: string; kind: string }

export function Dashboard() {
  const { user } = useUser()
  const supabase = useSupabase()
  const [banks, setBanks] = useState<{ name: string; initial_balance: number }[]>([])
  const [upcomingPay, setUpcomingPay] = useState<Row[]>([])
  const [upcomingRec, setUpcomingRec] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase || !user?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const until = toISODate(addMonths(new Date(), 1))
      const today = toISODate(new Date())

      const [b, p, r] = await Promise.all([
        supabase
          .from('bank_accounts')
          .select('name, initial_balance')
          .eq('user_id', user.id)
          .eq('is_active', true),
        supabase
          .from('payables_receivables')
          .select('id, description, amount, due_date, kind')
          .eq('user_id', user.id)
          .eq('kind', 'payable')
          .eq('status', 'open')
          .gte('due_date', today)
          .lte('due_date', until)
          .order('due_date', { ascending: true })
          .limit(8),
        supabase
          .from('payables_receivables')
          .select('id, description, amount, due_date, kind')
          .eq('user_id', user.id)
          .eq('kind', 'receivable')
          .eq('status', 'open')
          .gte('due_date', today)
          .lte('due_date', until)
          .order('due_date', { ascending: true })
          .limit(8),
      ])
      if (cancelled) return
      setBanks(b.data ?? [])
      setUpcomingPay((p.data as Row[]) ?? [])
      setUpcomingRec((r.data as Row[]) ?? [])
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, user?.id])

  if (!supabase) {
    return <p className="text-slate-400">Conectando ao banco…</p>
  }

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-2xl font-semibold text-white">Olá{user?.firstName ? `, ${user.firstName}` : ''}</h2>
        <p className="text-slate-400">Resumo e próximos vencimentos</p>
      </header>

      {loading ? (
        <p className="text-slate-500">Carregando…</p>
      ) : (
        <>
          <section>
            <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">Contas (saldo inicial)</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {banks.length === 0 ? (
                <p className="text-slate-500">
                  Nenhuma conta ativa.{' '}
                  <Link to="/contas-bancarias" className="text-sky-400 hover:underline">
                    Cadastrar
                  </Link>
                </p>
              ) : (
                banks.map((b) => (
                  <div key={b.name} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                    <div className="text-slate-400">{b.name}</div>
                    <div className="text-xl font-semibold text-white">{formatBRL(Number(b.initial_balance))}</div>
                  </div>
                ))
              )}
            </div>
          </section>

          <div className="grid gap-8 lg:grid-cols-2">
            <section>
              <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">A pagar (30 dias)</h3>
              <ul className="space-y-2">
                {upcomingPay.length === 0 ? (
                  <li className="text-slate-500">Nada a pagar nesse período.</li>
                ) : (
                  upcomingPay.map((x) => (
                    <li
                      key={x.id}
                      className="flex justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2"
                    >
                      <span className="truncate text-slate-300">{x.description || '—'}</span>
                      <span className="shrink-0 text-amber-200">{formatBRL(Number(x.amount))}</span>
                      <span className="shrink-0 text-slate-500">{x.due_date}</span>
                    </li>
                  ))
                )}
              </ul>
              <Link to="/fluxo?aba=pagar" className="mt-3 inline-block text-sm text-sky-400 hover:underline">
                Ver tudo
              </Link>
            </section>
            <section>
              <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">A receber (30 dias)</h3>
              <ul className="space-y-2">
                {upcomingRec.length === 0 ? (
                  <li className="text-slate-500">Nada a receber nesse período.</li>
                ) : (
                  upcomingRec.map((x) => (
                    <li
                      key={x.id}
                      className="flex justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2"
                    >
                      <span className="truncate text-slate-300">{x.description || '—'}</span>
                      <span className="shrink-0 text-emerald-300">{formatBRL(Number(x.amount))}</span>
                      <span className="shrink-0 text-slate-500">{x.due_date}</span>
                    </li>
                  ))
                )}
              </ul>
              <Link to="/fluxo?aba=receber" className="mt-3 inline-block text-sm text-sky-400 hover:underline">
                Ver tudo
              </Link>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
