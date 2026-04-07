import { useUser } from '@clerk/clerk-react'
import { FileText, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useSupabase } from '../hooks/useSupabase'
import { deleteCreditCardInvoiceOrGroup } from '../lib/invoiceInstallments'
import { toISODate } from '../lib/dates'
import { formatBRL } from '../lib/format'

type Inv = {
  id: string
  reference_month: string
  due_date: string
  status: string
  installment_group_id: string | null
  installment_number: number | null
  installment_count: number | null
}

export function CardInvoicesPage() {
  const { cardId } = useParams<{ cardId: string }>()
  const navigate = useNavigate()
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
  const [openDetailAfterCreate, setOpenDetailAfterCreate] = useState(true)
  /** Ordenação da competência: true = mais recente primeiro (AAAA-MM decrescente) */
  const [competenciaDesc, setCompetenciaDesc] = useState(true)
  const [totalByInvoice, setTotalByInvoice] = useState<Record<string, number>>({})

  function referenceMonthKey(iso: string): string {
    return iso.slice(0, 7)
  }

  async function load() {
    if (!supabase || !user?.id || !cardId) return
    setLoading(true)
    const { data: c } = await supabase.from('credit_cards').select('name').eq('id', cardId).eq('user_id', user.id).single()
    setCardName((c as { name: string } | null)?.name ?? '')
    const { data } = await supabase
      .from('credit_card_invoices')
      .select(
        'id, reference_month, due_date, status, installment_group_id, installment_number, installment_count',
      )
      .eq('credit_card_id', cardId)
      .eq('user_id', user.id)
    const list = (data as Inv[]) ?? []
    setRows(list)

    const ids = list.map((r) => r.id)
    const totals: Record<string, number> = {}
    if (ids.length > 0) {
      const { data: items } = await supabase.from('credit_card_invoice_items').select('invoice_id, amount').in('invoice_id', ids)
      for (const it of (items ?? []) as { invoice_id: string; amount: number }[]) {
        totals[it.invoice_id] = (totals[it.invoice_id] ?? 0) + Number(it.amount)
      }
    }
    setTotalByInvoice(totals)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, user?.id, cardId])

  const sortedRows = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      const ka = a.reference_month.slice(0, 10)
      const kb = b.reference_month.slice(0, 10)
      return competenciaDesc ? kb.localeCompare(ka) : ka.localeCompare(kb)
    })
    return copy
  }, [rows, competenciaDesc])

  async function createInvoice(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !user?.id || !cardId) return
    const reference_month = `${refMonth}-01`
    const { data: created, error } = await supabase
      .from('credit_card_invoices')
      .insert({
        user_id: user.id,
        credit_card_id: cardId,
        reference_month,
        due_date: dueDate,
        status: 'open',
      })
      .select('id')
      .single()
    if (error) alert(error.message)
    else {
      await load()
      if (openDetailAfterCreate && created && 'id' in created) {
        navigate(`/cartoes/${cardId}/faturas/${(created as { id: string }).id}`)
      }
    }
  }

  async function removeInv(id: string) {
    if (!supabase || !user?.id) return
    const row = rows.find((r) => r.id === id)
    const msg = row?.installment_group_id
      ? 'Excluir todas as parcelas deste parcelamento no cartão? (Contas a pagar em aberto vinculadas também serão removidas.)'
      : 'Excluir fatura e itens?'
    if (!confirm(msg)) return
    const r = await deleteCreditCardInvoiceOrGroup(supabase, user.id, id)
    if (r.error) alert(r.error)
    else load()
  }

  if (!supabase || !cardId) return <p className="text-slate-600">…</p>

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <Link to="/cartoes" className="text-sm text-sky-600 hover:underline">
          ← CARTÕES
        </Link>
        <h2 className="text-2xl font-semibold">FATURAS — {cardName || '…'}</h2>
      </div>

      <form onSubmit={createInvoice} className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label>MÊS DE REFERÊNCIA</label>
            <input type="month" value={refMonth} onChange={(e) => setRefMonth(e.target.value)} required />
          </div>
          <div>
            <label>VENCIMENTO</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary">
            NOVA FATURA
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="open-detail"
            type="checkbox"
            className="h-4 w-4"
            checked={openDetailAfterCreate}
            onChange={(e) => setOpenDetailAfterCreate(e.target.checked)}
          />
          <label htmlFor="open-detail" className="mb-0 cursor-pointer text-sm text-slate-700">
            APÓS CRIAR, ABRIR A FATURA PARA DETALHAR E LANÇAR DESPESAS
          </label>
        </div>
      </form>

      <div className="table-wrap">
        {loading ? (
          <p className="p-4 text-slate-500">Carregando…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th className="whitespace-nowrap">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-sky-700"
                    title="Ordenar por competência (AAAA-MM)"
                    onClick={() => setCompetenciaDesc((d) => !d)}
                  >
                    COMPETÊNCIA (AAAA-MM)
                    <span className="text-sky-600" aria-hidden>
                      {competenciaDesc ? '↓' : '↑'}
                    </span>
                  </button>
                </th>
                <th>VENCIMENTO</th>
                <th>VLR. FATURA</th>
                <th>STATUS</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono text-sm">{referenceMonthKey(r.reference_month)}</td>
                  <td>{r.due_date}</td>
                  <td className="text-slate-800">{formatBRL(totalByInvoice[r.id] ?? 0)}</td>
                  <td>{r.status === 'open' ? 'ABERTO' : r.status === 'paid' ? 'PAGO' : r.status.toUpperCase()}</td>
                  <td className="whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        className="btn-ghost inline-flex h-9 w-9 items-center justify-center p-0"
                        title="DETALHAR"
                        aria-label="DETALHAR"
                        onClick={() => navigate(`/cartoes/${cardId}/faturas/${r.id}`)}
                      >
                        <FileText size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn-ghost inline-flex h-9 w-9 items-center justify-center p-0 text-red-600"
                        title="EXCLUIR"
                        aria-label="EXCLUIR"
                        onClick={() => removeInv(r.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
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
