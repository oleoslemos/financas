import { useUser } from '@clerk/clerk-react'
import { Pencil, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSupabase } from '../hooks/useSupabase'
import { monthLabel, parseISODate, toISODate } from '../lib/dates'
import { formatBRL, parseMoney } from '../lib/format'
import {
  CREDIT_CARD_INVOICE_CATEGORY_NAME,
  ensureCreditCardExpenseCategory,
} from '../lib/creditCardCategory'
import { addMonthsToDueDate, addMonthsToReferenceMonth, splitTotalAcrossInstallments } from '../lib/invoiceInstallments'
import { sumInvoiceItems, syncLinkedPayable } from '../lib/invoicePayableSync'
import { toUpperTrim } from '../lib/text'

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
  installment_group_id: string | null
  installment_number: number | null
  installment_count: number | null
}

type ItemAmountMode = 'total' | 'per_installment'

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

  const [ccCategoryId, setCcCategoryId] = useState<string | null>(null)

  const [itemForm, setItemForm] = useState({
    occurred_on: toISODate(new Date()),
    description: '',
    amount: '',
    category_id: '',
    parcel_count: '1',
    /** total = divide o valor informado; per_installment = repete o mesmo valor em cada parcela */
    amount_mode: 'total' as ItemAmountMode,
  })
  const [editingItem, setEditingItem] = useState<Item | null>(null)

  function statusPt(s: string | null) {
    if (!s) return '—'
    if (s === 'open') return 'ABERTO'
    if (s === 'paid') return 'PAGO'
    return s.toUpperCase()
  }

  const load = useCallback(async () => {
    if (!supabase || !user?.id || !invoiceId || !cardId) return
    setLoading(true)
    const ccCat = await ensureCreditCardExpenseCategory(supabase, user.id)
    setCcCategoryId(ccCat)
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
      const cardNm = (c as { name: string } | null)?.name ?? ''
      if (invoice?.payable_id && ccCat) {
        const r = await syncLinkedPayable(supabase, {
          invoiceId,
          payableId: invoice.payable_id,
          dueDate: invoice.due_date,
          cardName: cardNm,
          referenceMonthLabel: monthLabel(parseISODate(invoice.reference_month)),
          categoryId: ccCat,
        })
        if (r.skippedPaid) setWarnPaid(true)
      }
    }
    setLoading(false)
  }, [supabase, user?.id, invoiceId, cardId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!ccCategoryId || editingItem) return
    setItemForm((prev) => (prev.category_id ? prev : { ...prev, category_id: ccCategoryId }))
  }, [ccCategoryId, editingItem])

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
      categoryId: ccCategoryId,
    })
    if (r.skippedPaid) setWarnPaid(true)
  }, [supabase, invoiceId, user?.id, cardName, ccCategoryId])

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
          categoryId: ccCategoryId,
        })
        if (r.skippedPaid) setWarnPaid(true)
      }
      await load()
    }
  }

  async function submitItem(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !invoiceId || !inv || !user?.id || !cardId || itemsLocked) return
    const n = Math.max(1, parseInt(itemForm.parcel_count, 10) || 1)
    const baseDesc = toUpperTrim(itemForm.description)
    const baseAmount = parseMoney(itemForm.amount)
    const baseCategoryId = itemForm.category_id || ccCategoryId || null
    const base = {
      occurred_on: itemForm.occurred_on,
      description: baseDesc,
      amount: baseAmount,
      category_id: baseCategoryId,
    }
    if (editingItem) {
      const { error } = await supabase.from('credit_card_invoice_items').update(base).eq('id', editingItem.id)
      if (error) alert(error.message)
      else {
        setEditingItem(null)
        setItemForm({
          occurred_on: toISODate(new Date()),
          description: '',
          amount: '',
          category_id: ccCategoryId ?? '',
          parcel_count: '1',
          amount_mode: 'total',
        })
        await load()
        await runSyncInvoice()
      }
    } else {
      if (n === 1) {
        const singleGroupId = crypto.randomUUID()
        const { error } = await supabase.from('credit_card_invoice_items').insert({
          invoice_id: invoiceId,
          ...base,
          installment_group_id: singleGroupId,
          installment_number: 1,
          installment_count: 1,
        })
        if (error) {
          alert(error.message)
          return
        }
        setItemForm({
          occurred_on: toISODate(new Date()),
          description: '',
          amount: '',
          category_id: ccCategoryId ?? '',
          parcel_count: '1',
          amount_mode: 'total',
        })
        await load()
        await runSyncInvoice()
        return
      }

      const shareAmounts =
        itemForm.amount_mode === 'per_installment'
          ? Array.from({ length: n }, () => baseAmount)
          : splitTotalAcrossInstallments(baseAmount, n)
      const groupId = crypto.randomUUID()
      const touchedInvoiceIds: string[] = []

      for (let i = 0; i < n; i++) {
        const ref = addMonthsToReferenceMonth(inv.reference_month, i)
        const due = addMonthsToDueDate(inv.due_date, i)
        let targetInvoiceId = invoiceId

        if (i > 0) {
          const { data: found } = await supabase
            .from('credit_card_invoices')
            .select('id')
            .eq('user_id', user.id)
            .eq('credit_card_id', cardId)
            .eq('reference_month', ref)
            .maybeSingle()
          const foundId = (found as { id: string } | null)?.id
          if (foundId) {
            targetInvoiceId = foundId
          } else {
            const { data: created, error: createErr } = await supabase
              .from('credit_card_invoices')
              .insert({
                user_id: user.id,
                credit_card_id: cardId,
                reference_month: ref,
                due_date: due,
                status: 'open',
                payable_id: null,
                installment_group_id: null,
                installment_number: null,
                installment_count: null,
              })
              .select('id')
              .single()
            if (createErr) {
              alert(createErr.message)
              return
            }
            targetInvoiceId = (created as { id: string }).id
          }
        }

        const { error: itemErr } = await supabase.from('credit_card_invoice_items').insert({
          invoice_id: targetInvoiceId,
          occurred_on: itemForm.occurred_on,
          description: `${baseDesc} (PARCELA ${i + 1}/${n})`,
          amount: shareAmounts[i] ?? 0,
          category_id: baseCategoryId,
          installment_group_id: groupId,
          installment_number: i + 1,
          installment_count: n,
        })
        if (itemErr) {
          alert(itemErr.message)
          return
        }
        if (!touchedInvoiceIds.includes(targetInvoiceId)) touchedInvoiceIds.push(targetInvoiceId)
      }

      for (const iid of touchedInvoiceIds) {
        const { data: row } = await supabase
          .from('credit_card_invoices')
          .select('payable_id, due_date, reference_month')
          .eq('id', iid)
          .eq('user_id', user.id)
          .maybeSingle()
        const invRow = row as { payable_id: string | null; due_date: string; reference_month: string } | null
        if (!invRow?.payable_id) continue
        await syncLinkedPayable(supabase, {
          invoiceId: iid,
          payableId: invRow.payable_id,
          dueDate: invRow.due_date,
          cardName,
          referenceMonthLabel: monthLabel(parseISODate(invRow.reference_month)),
          categoryId: ccCategoryId,
        })
      }

      setItemForm({
        occurred_on: toISODate(new Date()),
        description: '',
        amount: '',
        category_id: ccCategoryId ?? '',
        parcel_count: '1',
        amount_mode: 'total',
      })
      await load()
    }
  }

  async function deleteItem(id: string) {
    if (!supabase || itemsLocked) return
    const item = items.find((x) => x.id === id)
    const msg = item?.installment_group_id
      ? 'Esta compra está parcelada. Excluir esta parcela removerá TODAS as parcelas desta compra. Continuar?'
      : 'Excluir item?'
    if (!confirm(msg)) return
    const q = supabase.from('credit_card_invoice_items').delete()
    const { error } = item?.installment_group_id
      ? await q.eq('installment_group_id', item.installment_group_id)
      : await q.eq('id', id)
    if (error) alert(error.message)
    else {
      await load()
      await runSyncInvoice()
    }
  }

  if (!supabase || !invoiceId || !cardId) return <p className="text-slate-600">…</p>
  if (loading && !inv) return <p className="text-slate-500">Carregando…</p>
  if (!inv) return <p className="text-red-600">Fatura não encontrada.</p>

  const total = items.reduce((s, x) => s + Number(x.amount), 0)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <Link to={`/cartoes/${cardId}`} className="text-sm text-sky-600 hover:underline">
          ← Faturas
        </Link>
        <h2 className="text-2xl font-semibold">
          Fatura {cardName} — {monthLabel(parseISODate(inv.reference_month))}
        </h2>
      </div>

      {warnPaid && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          A conta a pagar vinculada está <strong>paga</strong>: o valor não foi atualizado automaticamente.
        </p>
      )}

      {itemsLocked && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Itens bloqueados porque a conta a pagar vinculada está paga. Desvincule ou reabra a conta a pagar no fluxo
          “Pagar / Receber” para editar.
        </p>
      )}

      <form onSubmit={saveInvoiceMeta} className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
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
                const catForPayable =
                  ccCategoryId ?? (await ensureCreditCardExpenseCategory(supabase, user.id))
                if (catForPayable) setCcCategoryId(catForPayable)
                const total = await sumInvoiceItems(supabase, inv.id)
                const refLabel = monthLabel(parseISODate(inv.reference_month))
                const { data: created, error } = await supabase
                  .from('payables_receivables')
                  .insert({
                    user_id: user.id,
                    kind: 'payable',
                    amount: total,
                    due_date: dueDate,
                    description: `FATURA ${cardName} – ${refLabel}`,
                    status: 'open',
                    category_id: catForPayable,
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
          <label htmlFor="linkp" className="mb-0 cursor-pointer text-sm text-slate-700">
            Vincular conta a pagar (atualiza valor ao mudar itens)
          </label>
        </div>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <p className="text-lg font-medium text-slate-900">
          Total da fatura: <span className="text-sky-600">{formatBRL(total)}</span>
        </p>
        {inv.payable_id && (
          <p className="text-xs text-slate-600">CONTA A PAGAR: {inv.payable_id.slice(0, 8)}… — {statusPt(payableStatus)}</p>
        )}
      </div>

      <form onSubmit={submitItem} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2 sm:p-4">
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
          <label>VALOR</label>
          <input
            value={itemForm.amount}
            onChange={(e) => setItemForm({ ...itemForm, amount: e.target.value })}
            disabled={itemsLocked}
            required
          />
        </div>
        <div className="sm:col-span-2 flex flex-col gap-2">
          <span className="text-xs text-slate-600">O VALOR INFORMADO É:</span>
          <div className="flex flex-wrap gap-4">
            <label className="mb-0 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="item_amount_mode"
                className="h-4 w-4"
                checked={itemForm.amount_mode === 'total'}
                disabled={itemsLocked || !!editingItem}
                onChange={() => setItemForm({ ...itemForm, amount_mode: 'total' })}
              />
              TOTAL DA COMPRA (DIVIDIR PELA QUANTIDADE DE PARCELAS)
            </label>
            <label className="mb-0 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="item_amount_mode"
                className="h-4 w-4"
                checked={itemForm.amount_mode === 'per_installment'}
                disabled={itemsLocked || !!editingItem}
                onChange={() => setItemForm({ ...itemForm, amount_mode: 'per_installment' })}
              />
              VALOR DE CADA PARCELA (REPETIR EM TODAS AS PARCELAS)
            </label>
          </div>
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
          <label>Categoria (padrão: {CREDIT_CARD_INVOICE_CATEGORY_NAME})</label>
          <select
            value={itemForm.category_id}
            onChange={(e) => setItemForm({ ...itemForm, category_id: e.target.value })}
            disabled={itemsLocked}
          >
            <option value="">— (usa {CREDIT_CARD_INVOICE_CATEGORY_NAME})</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>QUANTIDADE DE PARCELAS</label>
          <input
            type="number"
            min={1}
            value={itemForm.parcel_count}
            onChange={(e) => setItemForm({ ...itemForm, parcel_count: e.target.value })}
            disabled={itemsLocked || !!editingItem}
            required
          />
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
                setItemForm({
                  occurred_on: toISODate(new Date()),
                  description: '',
                  amount: '',
                  category_id: ccCategoryId ?? '',
                  parcel_count: '1',
                  amount_mode: 'total',
                })
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
              <th>Parcela</th>
              <th>Categoria</th>
              <th>Valor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>{it.occurred_on}</td>
                <td>{it.description}</td>
                <td className="text-slate-600">
                  {`${it.installment_number ?? 1}/${it.installment_count ?? 1}`}
                </td>
                <td className="text-slate-600">
                  {cats.find((c) => c.id === it.category_id)?.name ?? (it.category_id ? '…' : '—')}
                </td>
                <td>{formatBRL(Number(it.amount))}</td>
                <td className="whitespace-nowrap">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      className="btn-ghost inline-flex h-9 w-9 items-center justify-center p-0"
                      title="EDITAR"
                      aria-label="EDITAR"
                      disabled={itemsLocked}
                      onClick={() => {
                        setEditingItem(it)
                        setItemForm({
                          occurred_on: it.occurred_on,
                          description: it.description,
                          amount: String(it.amount),
                          category_id: it.category_id ?? '',
                          parcel_count: String(it.installment_count ?? 1),
                          amount_mode: 'total',
                        })
                      }}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      className="btn-ghost inline-flex h-9 w-9 items-center justify-center p-0 text-red-600"
                      title="EXCLUIR"
                      aria-label="EXCLUIR"
                      disabled={itemsLocked}
                      onClick={() => deleteItem(it.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
