import { useUser } from '@clerk/clerk-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSupabase } from '../hooks/useSupabase'
import { monthLabel, parseISODate, toISODate } from '../lib/dates'

type Inv = {
  id: string
  reference_month: string
  due_date: string
  status: string
}

export function CardInvoicesPage() {
  const { cardId } = useParams<{ cardId: string }>()
  const { user } = useUser()
  const supabase = useSupabase()
  const [cardName, setCardName] = useState('')
  const [rows, setRows] = useState<Inv[]>([])
  const [loading, setLoading] = useState(true)
  const [refMonth, setRefMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [dueDate, setDueDate] = useState(toISODate(new Date()))

  async function load() {
    if (!supabase || !user?.id || !cardId) return
    setLoading(true)
    const { data: c } = await supabase.from('credit_cards').select('name').eq('id', cardId).eq('user_id', user.id).single()
    setCardName((c as { name: string } | null)?.name ?? '')
    const { data } = await supabase
      .from('credit_card_invoices')
      .select('id, reference_month, due_date, status')
      .eq('credit_card_id', cardId)
      .eq('user_id', user.id)
      .order('reference_month', { ascending: false })
    setRows((data as Inv[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, user?.id, cardId])

  async function createInvoice(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !user?.id || !cardId) return
    const reference_month = `${refMonth}-01`
    const { error } = await supabase.from('credit_card_invoices').insert({
      user_id: user.id,
      credit_card_id: cardId,
      reference_month,
      due_date: dueDate,
      status: 'open',
    })
    if (error) alert(error.message)
    else load()
  }

  async function removeInv(id: string) {
    if (!supabase || !confirm('Excluir fatura e itens?')) return
    const { error } = await supabase.from('credit_card_invoices').delete().eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  if (!supabase || !cardId) return <p className="text-slate-400">…</p>

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <Link to="/cartoes" className="text-sm text-sky-400 hover:underline">
          ← Cartões
        </Link>
        <h2 className="text-2xl font-semibold">Faturas — {cardName || '…'}</h2>
      </div>

      <form onSubmit={createInvoice} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div>
          <label>Mês de referência</label>
          <input type="month" value={refMonth} onChange={(e) => setRefMonth(e.target.value)} required />
        </div>
        <div>
          <label>Vencimento</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
        </div>
        <button type="submit" className="btn btn-primary">
          Nova fatura
        </button>
      </form>

      <div className="table-wrap">
        {loading ? (
          <p className="p-4 text-slate-500">Carregando…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Competência</th>
                <th>Vencimento</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{monthLabel(parseISODate(r.reference_month))}</td>
                  <td>{r.due_date}</td>
                  <td>{r.status}</td>
                  <td className="space-x-2 whitespace-nowrap">
                    <Link to={`/cartoes/${cardId}/faturas/${r.id}`} className="text-sky-400 hover:underline">
                      Detalhar
                    </Link>
                    <button type="button" className="text-sm text-red-400 hover:underline" onClick={() => removeInv(r.id)}>
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
