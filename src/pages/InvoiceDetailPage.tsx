import { useUser } from '@clerk/clerk-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSupabase } from '../hooks/useSupabase'
import { monthLabel, parseISODate, toISODate } from '../lib/dates'
import { formatBRL, parseMoney } from '../lib/format'
import { sumInvoiceItems, syncLinkedPayable } from '../lib/invoicePayableSync'

type Inv = {
  id: string
  credit_card_id: string
  reference_month: string
  due_date: string
  status: string
  payable_id: string | null
}

type Item = {
  id: string
  occurred_on: string
  description: string
  amount: number
  category_id: string | null
}

export function InvoiceDetailPage() {
  const { cardId, invoiceId } = useParams<{ cardId: string; invoiceId: string }>()
  const { user } = useUser()
  const supabase = useSupabase()
  const [cardName, setCardName] = useState('')
  const [inv, setInv] = useState<Inv | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [cats, setCats] = useState<{ id: string; name: string }[]>([])
  const [payableStatus, setPayableStatus] = useState<string | null>(null)
  const [linkPayable, setLinkPayable] = useState(false)
  const [dueDate, setDueDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [warnPaid, setWarnPaid] = useState(false)

  const [itemForm, setItemForm] = useState({
    occurred_on: toISODate(new Date()),
    description: '',
    amount: '',
    category_id: '',
  })
  const [editingItem, setEditingItem] = useState<Item | null>(null)

  const load = useCallback(async () => {
    if (!supabase || !user?.id || !invoiceId || !cardId) return
    setLoading(true)
    const [{ data: c }, { data: i }, { data: it }, { data: cat }] = await Promise.all([
      supabase.from('credit_cards').select('name').eq('id', cardId).eq('user_id', user.id).single(),
      supabase.from('credit_card_invoices').select('*').eq('id', invoiceId).eq('user_id', user.id).single(),
      supabase.from('credit_card_invoice_items').select('*').eq('invoice_id', invoiceId).order('occurred_on'),
      supabase.from('categories').select('id, name').eq('user_id', user.id).order('name'),
    ])
    setCardName((c as { name: string } | null)?.name ?? '')
    const invoice = i as Inv | null
    setInv(invoice)
    setItems((it as Item[]) ?? [])
    setCats((cat as { id: string; name: string }[]) ?? [])
    if (invoice) {
      setDueDate(invoice.due_date)
      setLinkPayable(!!invoice.payable_id)
      if (invoice.payable_id) {
        const { data: p } = await supabase
          .from('payables_receivables')
          .select('status')
          .eq('id', invoice.payable_id)
          .maybeSingle()
        setPayableStatus((p as { status: string } | null)?.status ?? null)
      } else {
        setPayableStatus(null)
      }
    }
    setLoading(false)
  }, [supabase, user?.id, invoiceId, cardId])

  useEffect(() => {
    load()
  }, [load])

  const itemsLocked = !!(inv?.payable_id && payableStatus === 'paid')

  /** Lê a fatura no banco e sincroniza total/vencimento na conta a pagar vinculada. */
  const runSyncInvoice = useCallback(async () => {
    if (!supabase || !invoiceId || !user?.id) return
    const { data: row } = await supabase
      .from('credit_card_invoices')
      .select('payable_id, due_date, reference_month')
      .eq('id', invoiceId)
      .eq('user_id', user.id)
      .maybeSingle()
    const invRow = row as { payable_id: string | null; due_date: string; reference_month: string } | null
    if (!invRow?.payable_id) return
    const refLabel = monthLabel(parseISODate(invRow.reference_month))
    const r = await syncLinkedPayable(supabase, {
      invoiceId,
      payableId: invRow.payable_id,
      dueDate: invRow.due_date,
      cardName,
      referenceMonthLabel: refLabel,
    })
    if (r.skippedPaid) setWarnPaid(true)
  }, [supabase, invoiceId, user?.id, cardName])

  async function saveInvoiceMeta(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !inv) return
    const { error } = await supabase.from('credit_card_invoices').update({ due_date: dueDate }).eq('id', inv.id)
    if (error) alert(error.message)
    else {
      if (inv.payable_id) {
        const refLabel = monthLabel(parseISODate(inv.reference_month))
        const r = await syncLinkedPayable(supabase, {
          invoiceId: inv.id,
          payableId: inv.payable_id,
          dueDate,
          cardName,
          referenceMonthLabel: refLabel,
        })
        if (r.skippedPaid) setWarnPaid(true)
      }
      await load()
    }
  }

  async function submitItem(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !invoiceId || itemsLocked) return
    const base = {
      occurred_on: itemForm.occurred_on,
      description: itemForm.description.trim(),
      amount: parseMoney(itemForm.amount),
      category_id: itemForm.category_id || null,
    }
    if (editingItem) {
      const { error } = await supabase.from('credit_card_invoice_items').update(base).eq('id', editingItem.id)
      if (error) alert(error.message)
      else {
        setEditingItem(null)
        setItemForm({ occurred_on: toISODate(new Date()), description: '', amount: '', category_id: '' })
        await load()
        await runSyncInvoice()
      }
    } else {
      const { error } = await supabase.from('credit_card_invoice_items').insert({ invoice_id: invoiceId, ...base })
      if (error) alert(error.message)
      else {
        setItemForm({ occurred_on: toISODate(new Date()), description: '', amount: '', category_id: '' })
        await load()
        await runSyncInvoice()
      }
    }
  }

  async function deleteItem(id: string) {
    if (!supabase || itemsLocked || !confirm('Excluir item?')) return
    const { error } = await supabase.from('credit_card_invoice_items').delete().eq('id', id)
    if (error) alert(error.message)
    else {
      await load()
      await runSyncInvoice()
    }
  }

  if (!supabase || !invoiceId || !cardId) return <p className="text-slate-400">…</p>
  if (loading && !inv) return <p className="text-slate-500">Carregando…</p>
  if (!inv) return <p className="text-red-400">Fatura não encontrada.</p>

  const total = items.reduce((s, x) => s + Number(x.amount), 0)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <Link to={`/cartoes/${cardId}`} className="text-sm text-sky-400 hover:underline">
          ← Faturas
        </Link>
        <h2 className="text-2xl font-semibold">
          Fatura {cardName} — {monthLabel(parseISODate(inv.reference_month))}
        </h2>
      </div>

      {warnPaid && (
        <p className="rounded-lg border border-amber-800 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
          A conta a pagar vinculada está <strong>paga</strong>: o valor não foi atualizado automaticamente.
        </p>
      )}

      {itemsLocked && (
        <p className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-300">
          Itens bloqueados porque a conta a pagar vinculada está paga. Desvincule ou reabra a conta a pagar no fluxo
          “Pagar / Receber” para editar.
        </p>
      )}

      <form onSubmit={saveInvoiceMeta} className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div>
          <label>Vencimento da fatura</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-secondary">
          Atualizar vencimento
        </button>
        <div className="flex items-center gap-2">
          <input
            id="linkp"
            type="checkbox"
            checked={linkPayable}
            disabled={itemsLocked}
            onChange={async (e) => {
              const v = e.target.checked
              if (itemsLocked) return
              if (!v && inv.payable_id) {
                const { error } = await supabase.from('credit_card_invoices').update({ payable_id: null }).eq('id', inv.id)
                if (error) alert(error.message)
                else {
                  setLinkPayable(false)
                  await load()
                }
                return
              }
              if (v && !inv.payable_id && user?.id) {
                const total = await sumInvoiceItems(supabase, inv.id)
                const refLabel = monthLabel(parseISODate(inv.reference_month))
                const { data: created, error } = await supabase
                  .from('payables_receivables')
                  .insert({
                    user_id: user.id,
                    kind: 'payable',
                    amount: total,
                    due_date: dueDate,
                    description: `Fatura ${cardName} – ${refLabel}`,
                    status: 'open',
                    category_id: null,
                    bank_account_id: null,
                    installment_group_id: null,
                    installment_number: null,
                    installment_count: null,
                  })
                  .select('id')
                  .single()
                if (error) {
                  alert(error.message)
                  setLinkPayable(false)
                  return
                }
                const pid = (created as { id: string }).id
                await supabase.from('credit_card_invoices').update({ payable_id: pid }).eq('id', inv.id)
                setLinkPayable(true)
                await load()
              }
            }}
            className="h-4 w-4"
          />
          <label htmlFor="linkp" className="mb-0 cursor-pointer text-sm text-slate-300">
            Vincular conta a pagar (atualiza valor ao mudar itens)
          </label>
        </div>
      </form>

      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
        <p className="text-lg font-medium text-white">
          Total da fatura: <span className="text-sky-300">{formatBRL(total)}</span>
        </p>
        {inv.payable_id && <p className="text-xs text-slate-500">Conta a pagar: {inv.payable_id.slice(0, 8)}… — {payableStatus}</p>}
      </div>

      <form onSubmit={submitItem} className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4 sm:grid-cols-2">
        <div>
          <label>Data</label>
          <input
            type="date"
            value={itemForm.occurred_on}
            onChange={(e) => setItemForm({ ...itemForm, occurred_on: e.target.value })}
            disabled={itemsLocked}
          />
        </div>
        <div>
          <label>Valor</label>
          <input
            value={itemForm.amount}
            onChange={(e) => setItemForm({ ...itemForm, amount: e.target.value })}
            disabled={itemsLocked}
            required
          />
        </div>
        <div className="sm:col-span-2">
          <label>Descrição</label>
          <input
            value={itemForm.description}
            onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
            disabled={itemsLocked}
          />
        </div>
        <div>
          <label>Categoria</label>
          <select
            value={itemForm.category_id}
            onChange={(e) => setItemForm({ ...itemForm, category_id: e.target.value })}
            disabled={itemsLocked}
          >
            <option value="">—</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" className="btn btn-primary" disabled={itemsLocked}>
            {editingItem ? 'Salvar item' : 'Adicionar item'}
          </button>
          {editingItem && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setEditingItem(null)
                setItemForm({ occurred_on: toISODate(new Date()), description: '', amount: '', category_id: '' })
              }}
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Descrição</th>
              <th>Valor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>{it.occurred_on}</td>
                <td>{it.description}</td>
                <td>{formatBRL(Number(it.amount))}</td>
                <td className="space-x-2 whitespace-nowrap">
                  <button
                    type="button"
                    className="btn-ghost text-sm"
                    disabled={itemsLocked}
                    onClick={() => {
                      setEditingItem(it)
                      setItemForm({
                        occurred_on: it.occurred_on,
                        description: it.description,
                        amount: String(it.amount),
                        category_id: it.category_id ?? '',
                      })
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="text-sm text-red-400 hover:underline"
                    disabled={itemsLocked}
                    onClick={() => deleteItem(it.id)}
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
