import { useUser } from '@clerk/clerk-react'
import { Pencil, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { monthLabel, parseISODate, toISODate } from '../lib/dates'
import { formatBRL, parseMoney } from '../lib/format'
import {
  CREDIT_CARD_INVOICE_CATEGORY_NAME,
  ensureCreditCardExpenseCategory,
} from '../lib/creditCardCategory'
import { addMonthsToDueDate, addMonthsToReferenceMonth, splitTotalAcrossInstallments } from '../lib/invoiceInstallments'
import { ensureInvoicePayableLinked, syncLinkedPayable } from '../lib/invoicePayableSync'
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

type InvoiceNavRow = { id: string; competenciaKey: string }

function refMonthDisplay(iso: string) {
  return iso.slice(0, 7)
}

export function InvoiceDetailPage() {
  const { cardId, invoiceId } = useParams<{ cardId: string; invoiceId: string }>()
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id)
  const [cardName, setCardName] = useState('')
  const [inv, setInv] = useState<Inv | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [cats, setCats] = useState<{ id: string; name: string }[]>([])
  const [payableStatus, setPayableStatus] = useState<string | null>(null)
  const [dueDate, setDueDate] = useState('')
  const [invoiceNav, setInvoiceNav] = useState<{ prev: InvoiceNavRow[]; next: InvoiceNavRow[] }>({
    prev: [],
    next: [],
  })
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
    if (!supabase || !ownerUserId || !invoiceId || !cardId) return
    setLoading(true)
    const ccCat = await ensureCreditCardExpenseCategory(supabase, ownerUserId)
    setCcCategoryId(ccCat)
    const [{ data: c }, { data: i }, { data: it }, { data: cat }] = await Promise.all([
      supabase.from('credit_cards').select('name').eq('id', cardId).eq('user_id', ownerUserId).single(),
      supabase.from('credit_card_invoices').select('*').eq('id', invoiceId).eq('user_id', ownerUserId).single(),
      supabase.from('credit_card_invoice_items').select('*').eq('invoice_id', invoiceId).order('occurred_on'),
      supabase.from('categories').select('id, name').eq('user_id', ownerUserId).order('name'),
    ])
    const cardNm = (c as { name: string } | null)?.name ?? ''
    setCardName(cardNm)
    let invoice = i as Inv | null
    setItems((it as Item[]) ?? [])
    setCats((cat as { id: string; name: string }[]) ?? [])
    if (invoice) {
      setDueDate(invoice.due_date)
      if (ownerUserId) {
        const linked = await ensureInvoicePayableLinked(supabase, {
          userId: ownerUserId,
          invoiceId: invoice.id,
          dueDate: invoice.due_date,
          referenceMonth: invoice.reference_month,
          payableId: invoice.payable_id,
          cardName: cardNm,
          categoryId: ccCat,
        })
        if (!invoice.payable_id && linked) invoice = { ...invoice, payable_id: linked }
      }
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
      if (invoice.payable_id && ccCat) {
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
      const { data: sib } = await supabase
        .from('credit_card_invoices')
        .select('id, reference_month')
        .eq('credit_card_id', cardId)
        .eq('user_id', ownerUserId)
      const sorted = ((sib ?? []) as { id: string; reference_month: string }[]).sort((a, b) =>
        a.reference_month.localeCompare(b.reference_month),
      )
      const ix = sorted.findIndex((row) => row.id === invoiceId)
      const prevRows =
        ix > 0 ? sorted.slice(Math.max(0, ix - 3), ix) : []
      const nextRows =
        ix >= 0 && ix < sorted.length - 1 ? sorted.slice(ix + 1, Math.min(sorted.length, ix + 1 + 12)) : []
      setInvoiceNav({
        prev: prevRows.map((row) => ({ id: row.id, competenciaKey: refMonthDisplay(row.reference_month) })),
        next: nextRows.map((row) => ({ id: row.id, competenciaKey: refMonthDisplay(row.reference_month) })),
      })
    } else {
      setInvoiceNav({ prev: [], next: [] })
    }
    setInv(invoice)
    setLoading(false)
  }, [supabase, ownerUserId, invoiceId, cardId])

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
    if (!supabase || !invoiceId || !ownerUserId) return
    const { data: row } = await supabase
      .from('credit_card_invoices')
      .select('payable_id, due_date, reference_month')
      .eq('id', invoiceId)
      .eq('user_id', ownerUserId)
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
  }, [supabase, invoiceId, ownerUserId, cardName, ccCategoryId])

  const syncPayablesForInvoiceIds = useCallback(
    async (ids: string[]) => {
      if (!supabase || !ownerUserId) return
      const unique = [...new Set(ids)]
      for (const iid of unique) {
        const { data: row } = await supabase
          .from('credit_card_invoices')
          .select('payable_id, due_date, reference_month')
          .eq('id', iid)
          .eq('user_id', ownerUserId)
          .maybeSingle()
        const invRow = row as { payable_id: string | null; due_date: string; reference_month: string } | null
        if (!invRow) continue
        const effPayable = await ensureInvoicePayableLinked(supabase, {
          userId: ownerUserId,
          invoiceId: iid,
          dueDate: invRow.due_date,
          referenceMonth: invRow.reference_month,
          payableId: invRow.payable_id,
          cardName,
          categoryId: ccCategoryId,
        })
        const pid = effPayable ?? invRow.payable_id
        if (!pid) continue
        const r = await syncLinkedPayable(supabase, {
          invoiceId: iid,
          payableId: pid,
          dueDate: invRow.due_date,
          cardName,
          referenceMonthLabel: monthLabel(parseISODate(invRow.reference_month)),
          categoryId: ccCategoryId,
        })
        if (r.skippedPaid) setWarnPaid(true)
      }
    },
    [supabase, ownerUserId, cardName, ccCategoryId],
  )

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
    if (!supabase || !invoiceId || !inv || !ownerUserId || !cardId || itemsLocked) return
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
      if (error) {
        alert(error.message)
        return
      }
      const extraInvoiceIds: string[] = []
      const gid = editingItem.installment_group_id
      const curNum = editingItem.installment_number
      const nParc = editingItem.installment_count
      if (gid != null && curNum != null && nParc != null && nParc > 1) {
        const { data: sibs, error: sibErr } = await supabase
          .from('credit_card_invoice_items')
          .select('id, invoice_id, installment_number')
          .eq('installment_group_id', gid)
          .gt('installment_number', curNum)
        if (sibErr) console.error(sibErr)
        else if (sibs?.length) {
          const invIds = [...new Set(sibs.map((s) => s.invoice_id))]
          const { data: invs } = await supabase
            .from('credit_card_invoices')
            .select('id, status')
            .in('id', invIds)
            .eq('user_id', ownerUserId)
          const openSet = new Set(
            ((invs ?? []) as { id: string; status: string }[])
              .filter((invRow) => invRow.status === 'open')
              .map((invRow) => invRow.id),
          )
          const targets = (sibs as { id: string; invoice_id: string }[]).filter((s) => openSet.has(s.invoice_id))
          if (targets.length) {
            const patchIds = targets.map((t) => t.id)
            const { error: batchErr } = await supabase
              .from('credit_card_invoice_items')
              .update({ amount: baseAmount })
              .in('id', patchIds)
            if (batchErr) alert(batchErr.message)
            else extraInvoiceIds.push(...targets.map((t) => t.invoice_id))
          }
        }
      }
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
      await syncPayablesForInvoiceIds([...new Set([invoiceId, ...extraInvoiceIds])])
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
            .eq('user_id', ownerUserId)
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
                user_id: ownerUserId,
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
          .eq('user_id', ownerUserId)
          .maybeSingle()
        const invRow = row as { payable_id: string | null; due_date: string; reference_month: string } | null
        if (!invRow) continue
        const effPayable = await ensureInvoicePayableLinked(supabase, {
          userId: ownerUserId,
          invoiceId: iid,
          dueDate: invRow.due_date,
          referenceMonth: invRow.reference_month,
          payableId: invRow.payable_id,
          cardName,
          categoryId: ccCategoryId,
        })
        const pid = effPayable ?? invRow.payable_id
        if (!pid) continue
        await syncLinkedPayable(supabase, {
          invoiceId: iid,
          payableId: pid,
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
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <h2 className="text-2xl font-semibold">
            Fatura {cardName} — {monthLabel(parseISODate(inv.reference_month))}
          </h2>
        </div>
        <nav
          className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm sm:p-4"
          aria-label="Navegação da fatura"
        >
          <div className="flex flex-wrap gap-3">
            <Link to="/lsh/cartoes" className="font-medium text-sky-600 hover:underline">
              ← CARTÕES
            </Link>
            <Link to={`/lsh/cartoes/${cardId}`} className="font-medium text-sky-600 hover:underline">
              FATURAS DESTE CARTÃO
            </Link>
          </div>
          {invoiceNav.prev.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                Até 3 faturas anteriores
              </p>
              <div className="flex flex-wrap gap-2">
                {invoiceNav.prev.map((row) => (
                  <Link
                    key={row.id}
                    to={`/lsh/cartoes/${cardId}/faturas/${row.id}`}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sky-700 hover:bg-slate-100"
                  >
                    {row.competenciaKey}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {invoiceNav.next.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                Até 12 faturas seguintes
              </p>
              <div className="flex flex-wrap gap-2">
                {invoiceNav.next.map((row) => (
                  <Link
                    key={row.id}
                    to={`/lsh/cartoes/${cardId}/faturas/${row.id}`}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sky-700 hover:bg-slate-100"
                  >
                    {row.competenciaKey}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </nav>
      </div>

      {warnPaid && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          A conta a pagar vinculada está <strong>paga</strong>: o valor não foi atualizado automaticamente.
        </p>
      )}

      {itemsLocked && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Itens bloqueados porque a conta a pagar vinculada está paga. Reabra a conta a pagar no fluxo “Pagar /
          Receber” para editar.
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
        <p className="mb-0 max-w-xl text-xs text-slate-600">
          Esta fatura mantém conta a pagar vinculada automaticamente; o valor é atualizado quando os itens mudam
          (exceto se a conta já estiver paga).
        </p>
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
