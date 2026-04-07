import { useUser } from '@clerk/clerk-react'
import { CreditCard, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSupabase } from '../hooks/useSupabase'
import { formatBRL, parseMoney } from '../lib/format'
import { toUpperOrNull, toUpperTrim } from '../lib/text'

type Card = {
  id: string
  name: string
  brand: string | null
  closing_day: number
  due_day: number
  limit_amount: number | null
}

export function CreditCardsPage() {
  const { user } = useUser()
  const navigate = useNavigate()
  const supabase = useSupabase()
  const [rows, setRows] = useState<Card[]>([])
  const [openInvoiceValueByCard, setOpenInvoiceValueByCard] = useState<Record<string, number>>({})
  const [nextOpenInvoicesValueByCard, setNextOpenInvoicesValueByCard] = useState<Record<string, number>>({})
  const [openDueByCard, setOpenDueByCard] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    name: '',
    brand: '',
    closing_day: '10',
    due_day: '17',
    limit_amount: '',
  })
  const [editing, setEditing] = useState<Card | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  async function load() {
    if (!supabase || !user?.id) return
    setLoading(true)
    const { data } = await supabase.from('credit_cards').select('*').eq('user_id', user.id).order('name')
    const cards = (data as Card[]) ?? []
    setRows(cards)

    if (cards.length === 0) {
      setOpenInvoiceValueByCard({})
      setNextOpenInvoicesValueByCard({})
      setOpenDueByCard({})
      setLoading(false)
      return
    }

    const cardIds = cards.map((c) => c.id)
    const { data: invData } = await supabase
      .from('credit_card_invoices')
      .select('id, credit_card_id, reference_month, due_date, status')
      .eq('user_id', user.id)
      .in('credit_card_id', cardIds)

    const invoices = (invData ?? []) as Array<{
      id: string
      credit_card_id: string
      reference_month: string
      due_date: string
      status: 'open' | 'closed' | 'paid'
    }>
    if (invoices.length === 0) {
      setOpenInvoiceValueByCard({})
      setNextOpenInvoicesValueByCard({})
      setOpenDueByCard({})
      setLoading(false)
      return
    }

    const invoiceById = new Map<string, { credit_card_id: string; reference_month: string }>()
    for (const inv of invoices) invoiceById.set(inv.id, { credit_card_id: inv.credit_card_id, reference_month: inv.reference_month })

    const { data: itemData } = await supabase.from('credit_card_invoice_items').select('invoice_id, amount').in(
      'invoice_id',
      invoices.map((i) => i.id),
    )

    const openValueMap: Record<string, number> = {}
    const totalByInvoiceId: Record<string, number> = {}
    for (const it of ((itemData ?? []) as Array<{ invoice_id: string; amount: number }>)) {
      const inv = invoiceById.get(it.invoice_id)
      if (!inv) continue
      const amount = Number(it.amount) || 0
      totalByInvoiceId[it.invoice_id] = (totalByInvoiceId[it.invoice_id] ?? 0) + amount
    }
    const dueMap: Record<string, string> = {}
    const openInvoiceIdByCard: Record<string, string> = {}
    for (const inv of invoices) {
      if (inv.status !== 'open') continue
      const prev = dueMap[inv.credit_card_id]
      if (!prev || inv.due_date < prev) {
        dueMap[inv.credit_card_id] = inv.due_date
        openInvoiceIdByCard[inv.credit_card_id] = inv.id
      }
    }
    for (const cardId of Object.keys(openInvoiceIdByCard)) {
      const invId = openInvoiceIdByCard[cardId]
      openValueMap[cardId] = totalByInvoiceId[invId] ?? 0
    }
    const nextOpenMap: Record<string, number> = {}
    for (const inv of invoices) {
      if (inv.status !== 'open') continue
      const currentInvId = openInvoiceIdByCard[inv.credit_card_id]
      if (!currentInvId || inv.id === currentInvId) continue
      nextOpenMap[inv.credit_card_id] = (nextOpenMap[inv.credit_card_id] ?? 0) + (totalByInvoiceId[inv.id] ?? 0)
    }
    setOpenInvoiceValueByCard(openValueMap)
    setNextOpenInvoicesValueByCard(nextOpenMap)
    setOpenDueByCard(dueMap)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, user?.id])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !user?.id) return
    const payload = {
      user_id: user.id,
      name: toUpperTrim(form.name),
      brand: toUpperOrNull(form.brand),
      closing_day: Math.min(31, Math.max(1, parseInt(form.closing_day, 10) || 1)),
      due_day: Math.min(31, Math.max(1, parseInt(form.due_day, 10) || 1)),
      limit_amount: form.limit_amount ? parseMoney(form.limit_amount) : null,
    }
    if (editing) {
      const { error } = await supabase.from('credit_cards').update(payload).eq('id', editing.id)
      if (error) alert(error.message)
      else {
        setModalOpen(false)
        setEditing(null)
        reset()
        load()
      }
    } else {
      const { error } = await supabase.from('credit_cards').insert(payload)
      if (error) alert(error.message)
      else {
        setModalOpen(false)
        reset()
        load()
      }
    }
  }

  function reset() {
    setForm({ name: '', brand: '', closing_day: '10', due_day: '17', limit_amount: '' })
  }

  function openAddModal() {
    setEditing(null)
    reset()
    setModalOpen(true)
  }

  async function remove(id: string) {
    if (!supabase || !confirm('Excluir cartão e faturas?')) return
    const { error } = await supabase.from('credit_cards').delete().eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  function startEdit(c: Card) {
    setEditing(c)
    setForm({
      name: c.name,
      brand: c.brand ?? '',
      closing_day: String(c.closing_day),
      due_day: String(c.due_day),
      limit_amount: c.limit_amount != null ? String(c.limit_amount) : '',
    })
    setModalOpen(true)
  }

  if (!supabase) return <p className="text-slate-600">Conectando…</p>

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">CARTÕES DE CRÉDITO</h2>
        <button type="button" className="btn btn-primary text-sm" onClick={openAddModal}>
          ADICIONAR NOVO CARTÃO
        </button>
      </div>

      <div className="table-wrap">
        {loading ? (
          <p className="p-4 text-slate-500">Carregando…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>BANDEIRA</th>
                <th>NOME</th>
                <th>DT. VENCIMENTO</th>
                <th>VLR. FATURA</th>
                <th>VLR. PRÓXIMAS FATURAS</th>
                <th>LIMITE</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.brand || '—'}</td>
                  <td>{c.name}</td>
                  <td>{openDueByCard[c.id] ?? '—'}</td>
                  <td>{formatBRL(openInvoiceValueByCard[c.id] ?? 0)}</td>
                  <td>{formatBRL(nextOpenInvoicesValueByCard[c.id] ?? 0)}</td>
                  <td>{c.limit_amount != null ? formatBRL(Number(c.limit_amount)) : '—'}</td>
                  <td className="whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        className="btn-ghost inline-flex h-9 w-9 items-center justify-center p-0"
                        title="FATURAS"
                        aria-label="FATURAS"
                        onClick={() => navigate(`/cartoes/${c.id}`)}
                      >
                        <CreditCard size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn-ghost inline-flex h-9 w-9 items-center justify-center p-0"
                        title="EDITAR"
                        aria-label="EDITAR"
                        onClick={() => startEdit(c)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn-ghost inline-flex h-9 w-9 items-center justify-center p-0 text-red-600"
                        title="EXCLUIR"
                        aria-label="EXCLUIR"
                        onClick={() => remove(c.id)}
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

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 sm:p-4"
          role="presentation"
          onClick={() => {
            setModalOpen(false)
            setEditing(null)
            reset()
          }}
        >
          <div
            role="dialog"
            aria-labelledby="card-modal-title"
            className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="card-modal-title" className="text-lg font-medium text-slate-900">
              {editing ? 'EDITAR CARTÃO' : 'NOVO CARTÃO'}
            </h3>
            <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label>NOME</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label>BANDEIRA</label>
                <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              </div>
              <div>
                <label>DIA FECHAMENTO</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={form.closing_day}
                  onChange={(e) => setForm({ ...form, closing_day: e.target.value })}
                />
              </div>
              <div>
                <label>DIA VENCIMENTO</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={form.due_day}
                  onChange={(e) => setForm({ ...form, due_day: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <label>LIMITE (OPCIONAL)</label>
                <input value={form.limit_amount} onChange={(e) => setForm({ ...form, limit_amount: e.target.value })} />
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <button type="submit" className="btn btn-primary">
                  {editing ? 'SALVAR' : 'ADICIONAR'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setModalOpen(false)
                    setEditing(null)
                    reset()
                  }}
                >
                  CANCELAR
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
